import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
import { id, State } from '../finance';
import { recognizeReceipt, deviceOcrAvailable } from '../lib/native-receipt-ocr';
import { activeCategories } from '../classification';
import { classifyReceipt } from '../lib/device-ai';
import { receiptForeground } from '../lib/receipt-foreground';
import { processReceipt } from '../receipt-processor';
import {
  ReceiptFile,
  ReceiptJob,
  ReceiptDraft,
  receiptDraft,
  RECEIPT_LIMIT,
  RECEIPT_MAX_BYTES,
  RECEIPT_MIME_TYPES,
  receiptMime,
  runReceiptQueue,
  receiptFingerprints,
} from '../receipts';
const message = (e: unknown) => (e instanceof Error ? e.message : 'Receipt failed. Retry.');
async function fileData(file: ReceiptFile) {
  if ((file.size || 0) > RECEIPT_MAX_BYTES) throw new Error('File exceeds 8 MB.');
  if (!RECEIPT_MIME_TYPES.includes(file.mime)) throw new Error('Unsupported receipt format.');
  if (Platform.OS === 'web') {
    const blob = await (await fetch(file.uri)).blob();
    if (blob.size > RECEIPT_MAX_BYTES) throw new Error('File exceeds 8 MB.');
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = () => reject(new Error('Cannot read file.'));
      reader.readAsDataURL(blob);
    });
  }
  const fileOnDevice = new File(file.uri);
  if (fileOnDevice.size > RECEIPT_MAX_BYTES) throw new Error('File exceeds 8 MB.');
  return fileOnDevice.base64();
}
async function receiptFingerprint(file: ReceiptFile) {
  const data = await fileData(file);
  // Preserve existing fingerprints; insecure LAN browsers can still scan.
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, data)
    .then((value) => 'b64sha256:' + value)
    .catch(() => undefined);
}
export function useReceipts(
  state: State | null,
  notify: (text: string) => void,
  onAnalyzed: (jobs: ReceiptJob[]) => void,
) {
  const [jobs, setJobs] = useState<ReceiptJob[]>([]),
    [processing, setProcessing] = useState(false),
    [completedBatch, setCompletedBatch] = useState(0),
    [dismissedBatch, setDismissedBatch] = useState(0);
  const jobsRef = useRef<ReceiptJob[]>([]),
    stateRef = useRef(state),
    completedRef = useRef(onAnalyzed);
  useLayoutEffect(() => {
    stateRef.current = state;
    completedRef.current = onAnalyzed;
  }, [state, onAnalyzed]);
  const active = useRef(false),
    mounted = useRef(true),
    generation = useRef(0),
    picking = useRef(false),
    cancellation = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    const lifecycle = generation;
    return () => {
      cancellation.current?.abort();
      mounted.current = false;
      lifecycle.current++;
    };
  }, []);
  function change(fn: (old: ReceiptJob[]) => ReceiptJob[]) {
    if (!mounted.current) return;
    jobsRef.current = fn(jobsRef.current);
    setJobs(jobsRef.current);
  }
  const patch = (jobId: string, update: Partial<ReceiptJob>) =>
    change((old) => old.map((j) => (j.id === jobId ? { ...j, ...update } : j)));
  async function analyze(targets: ReceiptJob[]) {
    if (active.current || !stateRef.current || !targets.length) return;
    const epoch = ++generation.current,
      targetIds = new Set(targets.map((j) => j.id));
    const seen = new Set(
      [
        ...stateRef.current.entries.flatMap(receiptFingerprints),
        ...jobsRef.current
          .filter((j) => !targetIds.has(j.id) && j.status !== 'duplicate')
          .map((j) => j.fingerprint),
      ].filter(Boolean),
    );
    const controller = new AbortController();
    cancellation.current = controller;
    const foreground = () => receiptForeground(controller.signal);
    active.current = true;
    setProcessing(true);
    try {
      await runReceiptQueue(
        targets,
        async (job) => {
          if (!mounted.current || generation.current !== epoch) return;
          patch(job.id, { status: 'processing', error: undefined, reviewError: undefined });
          try {
            await foreground();
            // Keep the base64 buffer out of the OCR/model async frame.
            const fingerprint = await receiptFingerprint(job);
            if (!mounted.current || generation.current !== epoch) return;
            if (fingerprint && seen.has(fingerprint)) {
              patch(job.id, { status: 'duplicate', fingerprint });
              return;
            }
            if (fingerprint) seen.add(fingerprint);
            const output = await processReceipt(job, {
              recognize: async (uri) => {
                await foreground();
                patch(job.id, { stage: 'ocr' });
                return recognizeReceipt(uri);
              },
              classify: async (document, draft) => {
                await foreground();
                return classifyReceipt(document, draft, activeCategories(stateRef.current!), (stage) => {
                  if (mounted.current && generation.current === epoch) patch(job.id, { stage });
                });
              },
            });
            if (mounted.current && generation.current === epoch)
              patch(job.id, {
                status: 'ready',
                ...output,
                fingerprint,
                draft: receiptDraft(output.result),
              });
          } catch (e) {
            if (mounted.current && generation.current === epoch)
              patch(job.id, {
                status: job.result ? 'ready' : 'error',
                error: message(e),
                needsReview: true,
              });
          }
        },
        1,
      );
      if (mounted.current && generation.current === epoch) {
        await foreground();
        if (!mounted.current || generation.current !== epoch) return;
        completedRef.current(jobsRef.current.filter((j) => targetIds.has(j.id)));
        setCompletedBatch((old) => old + 1);
      }
    } catch (e) {
      if (mounted.current) notify(message(e));
    } finally {
      if (generation.current === epoch) {
        active.current = false;
        if (mounted.current) setProcessing(false);
      }
    }
  }
  async function choose(camera = false) {
    if (active.current || picking.current) return;
    picking.current = true;
    try {
      const unresolved = jobsRef.current.filter((j) => !['saved', 'duplicate'].includes(j.status));
      if (unresolved.length >= RECEIPT_LIMIT)
        throw new Error(`Finish or discard the ${RECEIPT_LIMIT} open receipts first.`);
      let files: ReceiptFile[];
      if (camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) throw new Error('Allow camera access to scan receipts.');
      }
      if (Platform.OS === 'web' && !camera) {
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
              selectionLimit: RECEIPT_LIMIT - unresolved.length,
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
      if (files.length + unresolved.length > RECEIPT_LIMIT)
        throw new Error(`Maximum ${RECEIPT_LIMIT} receipts at a time.`);
      if (!mounted.current) return;
      const selected: ReceiptJob[] = files.map((file) => ({ ...file, status: 'pending' }));
      change(() => [...unresolved, ...selected]);
      await analyze(selected);
    } catch (e) {
      if (mounted.current) notify(message(e));
    } finally {
      picking.current = false;
    }
  }
  async function process(jobId?: string) {
    const targets = jobsRef.current.filter((j) =>
      jobId
        ? j.id === jobId && ['pending', 'error', 'ready'].includes(j.status)
        : j.status === 'pending',
    );
    await analyze(targets);
  }
  return {
    jobs,
    deviceOcr: Platform.OS === 'ios' || Platform.OS === 'android',
    deviceOcrAvailable,
    processing,
    completedBatch,
    reviewRequested: completedBatch > dismissedBatch,
    openReview: () => setDismissedBatch(completedBatch - 1),
    closeReview: () => setDismissedBatch(completedBatch),
    choose,
    process,
    patch,
    patchDraft: (jobId: string, values: Partial<ReceiptDraft>) =>
      change((old) =>
        old.map((j) =>
          j.id === jobId
            ? {
                ...j,
                draft: { ...(j.draft || receiptDraft(j.result)), ...values },
                status: 'ready',
                needsReview: true,
                error: undefined,
                reviewError: undefined,
              }
            : j,
        ),
      ),
    markSaved: (ids: string[]) =>
      change((old) =>
        old.map((j) =>
          ids.includes(j.id)
            ? { ...j, status: 'saved', error: undefined, reviewError: undefined }
            : j,
        ),
      ),
    markDuplicate: (ids: string[]) =>
      change((old) => old.map((j) => (ids.includes(j.id) ? { ...j, status: 'duplicate' } : j))),
    restore: (items: ReceiptJob[]) =>
      change((old) => [
        ...old.filter((j) => !items.some((item) => item.id === j.id)),
        ...items.map((j) => ({ ...j, status: 'ready' as const, needsReview: true })),
      ]),
    remove: (jobId: string) => {
      if (!active.current) change((old) => old.filter((j) => j.id !== jobId));
    },
    clear: (force = false) => {
      if (!active.current || force) {
        cancellation.current?.abort();
        generation.current++;
        active.current = false;
        setProcessing(false);
        change(() => []);
      }
    },
  };
}
