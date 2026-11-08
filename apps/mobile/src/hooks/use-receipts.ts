import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { request, ScanResult } from '../api';
import { id, State } from '../finance';
import {
  ReceiptFile,
  ReceiptJob,
  RECEIPT_LIMIT,
  RECEIPT_MAX_BYTES,
  runReceiptQueue,
} from '../receipts';
const message = (e: unknown) => (e instanceof Error ? e.message : 'Receipt failed. Retry.');
const accepted = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
function mimeFor(name: string, mime?: string) {
  if (mime === 'image/jpg') return 'image/jpeg';
  return (
    (mime && accepted.includes(mime) ? mime : undefined) ||
    {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      pdf: 'application/pdf',
    }[name.split('.').pop()?.toLowerCase() || ''] ||
    ''
  );
}
async function fileData(file: ReceiptFile) {
  if ((file.size || 0) > RECEIPT_MAX_BYTES) throw new Error('File exceeds 8 MB.');
  if (!accepted.includes(file.mime)) throw new Error('Use JPG, PNG, WEBP or PDF.');
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
      if (camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) throw new Error('Allow camera access to scan receipts.');
        const result = await ImagePicker.launchCameraAsync({ quality: 0.75 });
        if (result.canceled) return;
        const photo = result.assets[0];
        files = [
          {
            id: id(),
            uri: photo.uri,
            name: photo.fileName || 'Receipt photo.jpg',
            mime: photo.mimeType || 'image/jpeg',
            size: photo.fileSize,
          },
        ];
      } else {
        const result = await DocumentPicker.getDocumentAsync({
          type: accepted,
          multiple: true,
          copyToCacheDirectory: true,
        });
        if (result.canceled) return;
        files = result.assets.map((asset) => ({
          id: id(),
          uri: asset.uri,
          name: asset.name,
          mime: mimeFor(asset.name, asset.mimeType),
          size: asset.size,
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
  async function process(jobId?: string) {
    if (active.current || !state) return;
    const pending = jobs.filter((j) =>
      jobId ? j.id === jobId && j.status === 'error' : j.status === 'pending',
    );
    if (!pending.length) return;
    const epoch = ++generation.current;
    active.current = true;
    setProcessing(true);
    await runReceiptQueue(pending, async (job) => {
      if (!mounted.current || generation.current !== epoch) return;
      patch(job.id, { status: 'processing', error: undefined });
      try {
        const data = await fileData(job);
        const result = await request<ScanResult>(state, '/v1/receipts/scan', {
          data,
          mime: job.mime,
          mode: pending.length > 1 ? 'bulk' : 'single',
        });
        if (mounted.current && generation.current === epoch)
          patch(job.id, { status: 'ready', result, reviewError: undefined });
      } catch (e) {
        if (mounted.current && generation.current === epoch)
          patch(job.id, { status: 'error', error: message(e) });
      }
    });
    if (generation.current === epoch) {
      active.current = false;
      if (mounted.current) setProcessing(false);
    }
  }
  return {
    jobs,
    processing,
    choose,
    process,
    patch,
    markSaved: (ids: string[]) =>
      setJobs((old) =>
        old.map((j) =>
          ids.includes(j.id) ? { ...j, status: 'saved' as const, reviewError: undefined } : j,
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
