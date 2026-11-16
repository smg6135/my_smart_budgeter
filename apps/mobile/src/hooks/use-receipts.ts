import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { request, ScanResult } from '../api';
import { id, State } from '../finance';
import { recognizeReceipt, deviceOcrAvailable } from '../lib/native-receipt-ocr';
import { processReceipt, type ReceiptEngine } from '../receipt-processor';
import {
  ReceiptFile,
  ReceiptJob,
  RECEIPT_LIMIT,
  RECEIPT_MAX_BYTES,
  RECEIPT_MIME_TYPES,
  receiptMime,
  runReceiptQueue,
} from '../receipts';
const message = (e: unknown) => (e instanceof Error ? e.message : 'Receipt failed. Retry.');
async function fileData(file: ReceiptFile) {
  if ((file.size || 0) > RECEIPT_MAX_BYTES) throw new Error('File exceeds 8 MB.');
  if (!RECEIPT_MIME_TYPES.includes(file.mime))
    throw new Error('Use JPG, PNG, WEBP, HEIC, HEIF or PDF.');
  if (Platform.OS === 'web') {
    const blob = await (await fetch(file.uri)).blob();
    if (blob.size > RECEIPT_MAX_BYTES) throw new Error('File exceeds 8 MB.');
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = () => reject(new Error('Cannot read file.'));
      reader.readAsDataURL(blob);
    });
  }
  const nativeFile = new File(file.uri);
  if (nativeFile.size > RECEIPT_MAX_BYTES) throw new Error('File exceeds 8 MB.');
  return nativeFile.base64();
}
export function useReceipts(state: State | null, notify: (text: string) => void) {
  const [jobs, setJobs] = useState<ReceiptJob[]>([]),
    [processing, setProcessing] = useState(false);
  const active = useRef(false),
    mounted = useRef(true),
    generation = useRef(0),
    picking = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const patch = (jobId: string, update: Partial<ReceiptJob>) =>
    setJobs((old) => old.map((j) => (j.id === jobId ? { ...j, ...update } : j)));
  async function choose(camera = false) {
    if (active.current || picking.current) return;
    picking.current = true;
    try {
      let files: ReceiptFile[] = [];
      if (jobs.length >= RECEIPT_LIMIT)
        throw new Error(`Maximum ${RECEIPT_LIMIT} receipts. Clear saved files first.`);
      if (camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) throw new Error('Allow camera access to scan receipts.');
      }
      if (Platform.OS === 'web' && !camera) {
        // Browser file inputs preserve HEIC files with generic MIME types.
        const result = await DocumentPicker.getDocumentAsync({
          type: RECEIPT_MIME_TYPES.filter((mime) => mime.startsWith('image/')),
          multiple: true,
        });
        if (result.canceled) return;
        files = result.assets.map((asset) => ({
          id: id(),
          uri: asset.uri,
          name: asset.name,
          mime: receiptMime(asset.name, asset.mimeType),
          size: asset.size,
        }));
      } else {
        const result = camera
          ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              allowsMultipleSelection: true,
              selectionLimit: RECEIPT_LIMIT - jobs.length,
              orderedSelection: true,
              preferredAssetRepresentationMode:
                ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
            });
        if (result.canceled) return;
        files = result.assets.map((asset) => ({
          id: id(),
          uri: asset.uri,
          name: asset.fileName || 'Receipt photo.jpg',
          mime: receiptMime(asset.fileName || asset.uri, asset.mimeType) || 'image/jpeg',
          size: asset.fileSize,
        }));
      }
      if (files.length + jobs.length > RECEIPT_LIMIT)
        throw new Error(`Maximum ${RECEIPT_LIMIT} receipts. Clear saved files first.`);
      setJobs((old) => [...old, ...files.map((file) => ({ ...file, status: 'pending' as const }))]);
    } catch (e) {
      notify(message(e));
    } finally {
      picking.current = false;
    }
  }
  async function process(
    jobId?: string,
    engine: ReceiptEngine = Platform.OS === 'ios' ? 'device' : 'cloud',
  ) {
    if (active.current || !state) return;
    const pending = jobs.filter((j) =>
      jobId
        ? j.id === jobId && ['pending', 'error', 'ready'].includes(j.status)
        : j.status === 'pending',
    );
    if (!pending.length) return;
    const epoch = ++generation.current;
    active.current = true;
    setProcessing(true);
    await runReceiptQueue(pending, async (job) => {
      if (!mounted.current || generation.current !== epoch) return;
      patch(job.id, { status: 'processing', error: undefined });
      try {
        const output = await processReceipt(job, engine, {
          recognize: recognizeReceipt,
          cloud: async (file) => {
            const data = await fileData(file);
            if (!mounted.current || generation.current !== epoch)
              throw new Error('Scan cancelled.');
            return request<ScanResult>(state, '/v1/receipts/scan', {
              data,
              mime: file.mime,
              mode: pending.length > 1 ? 'bulk' : 'single',
            });
          },
        });
        if (mounted.current && generation.current === epoch)
          patch(job.id, { status: 'ready', ...output, reviewError: undefined });
      } catch (e) {
        if (mounted.current && generation.current === epoch)
          patch(job.id, { status: job.result ? 'ready' : 'error', error: message(e) });
      }
    });
    if (generation.current === epoch) {
      active.current = false;
      if (mounted.current) setProcessing(false);
    }
  }
  return {
    jobs,
    deviceOcr: Platform.OS === 'ios',
    deviceOcrAvailable,
    processing,
    choose,
    process,
    patch,
    markSaved: (ids: string[]) =>
      setJobs((old) =>
        old.map((j) =>
          ids.includes(j.id)
            ? { ...j, status: 'saved' as const, error: undefined, reviewError: undefined }
            : j,
        ),
      ),
    remove: (jobId: string) => {
      if (!active.current) setJobs((old) => old.filter((j) => j.id !== jobId));
    },
    clear: (force = false) => {
      if (!active.current || force) {
        generation.current++;
        active.current = false;
        setProcessing(false);
        setJobs([]);
      }
    },
  };
}
