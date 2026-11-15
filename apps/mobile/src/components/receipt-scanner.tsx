import { Alert, Platform, Text, View } from 'react-native';
import { useState } from 'react';
import { Button, C, Card, styles as u, Pill } from './ui';
import { money } from '../finance';
import { supportedCurrency } from '../currency';
import type { useReceipts } from '../hooks/use-receipts';
type Batch = ReturnType<typeof useReceipts>;
export function ReceiptScanner({
  batch,
  review,
  saveAll,
}: {
  batch: Batch;
  review: (id: string) => void;
  saveAll: () => void;
}) {
  const [showText, setShowText] = useState<Record<string, boolean>>({});
  const cloudScan = (id: string) =>
    Alert.alert('Cloud OCR', 'Upload this receipt for cloud OCR?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Upload', onPress: () => void batch.process(id, 'cloud') },
    ]);
  const ready = batch.jobs.filter((j) => j.status === 'ready'),
    pending = batch.jobs.filter((j) => j.status === 'pending');
  const completed = batch.jobs.filter((j) => !['pending', 'processing'].includes(j.status)).length;
  return (
    <Card>
      <View style={u.between}>
        <Text style={u.h2}>Receipt scanner</Text>
        {batch.jobs.length > 0 && (
          <Pill>
            {completed}/{batch.jobs.length} processed
          </Pill>
        )}
      </View>
      <Text style={u.body}>20 files · 8 MB each · JPG, PNG, WEBP, HEIC/HEIF, PDF</Text>
      <View style={u.row}>
        <Button
          icon="cloud-upload-outline"
          disabled={batch.processing}
          onPress={() => void batch.choose()}
        >
          Upload receipts
        </Button>
        {Platform.OS !== 'web' && (
          <Button
            secondary
            icon="camera-outline"
            disabled={batch.processing}
            onPress={() => void batch.choose(true)}
          >
            Camera
          </Button>
        )}
      </View>
      {batch.jobs.length > 0 && (
        <View style={u.row}>
          <Button
            disabled={batch.processing || pending.length === 0}
            onPress={() => void batch.process()}
          >
            {batch.processing ? 'Processing…' : `Process receipts (${pending.length})`}
          </Button>
          <Button
            secondary
            disabled={batch.processing || ready.length === 0}
            onPress={saveAll}
          >{`Save ready (${ready.length})`}</Button>
          <Button secondary disabled={batch.processing} onPress={() => batch.clear()}>
            Clear queue
          </Button>
        </View>
      )}
      <Text style={u.body}>
        {batch.deviceOcr
          ? 'On-device OCR · Review before saving.'
          : 'Cloud OCR · Review before saving.'}
      </Text>
      {batch.deviceOcr && !batch.deviceOcrAvailable && (
        <Text style={u.body}>Install a new iOS build for on-device OCR.</Text>
      )}
      {batch.jobs.map((job) => (
        <View
          key={job.id}
          testID="receipt-row"
          style={{
            gap: 10,
            minWidth: 0,
            paddingVertical: 14,
            borderTopWidth: 1,
            borderColor: C.line,
          }}
        >
          <View style={u.between}>
            <Text style={[u.h2, { fontSize: 15 }]}>{job.name}</Text>
            <Pill tone={job.status === 'error' ? 'red' : 'neutral'}>
              {job.status === 'ready'
                ? 'Review'
                : job.status === 'pending'
                  ? 'Queued'
                  : job.status === 'processing'
                    ? 'Processing'
                    : job.status === 'saved'
                      ? 'Saved'
                      : 'Failed'}
            </Pill>
          </View>
          {job.result && (
            <>
              <Text style={u.body}>{job.result.merchant || 'Merchant needed'}</Text>
              <Text style={u.body}>
                {job.result.amount > 0 && supportedCurrency(job.result.currency)
                  ? money(
                      Math.round(
                        job.result.amount *
                          (['JPY', 'KRW', 'VND'].includes(job.result.currency) ? 1 : 100),
                      ),
                      job.result.currency,
                      true,
                    )
                  : 'Review amount / currency'}{' '}
                · {job.result.date || 'Date needed'}
              </Text>
              {!!job.engine && (
                <Text style={u.body}>{job.engine === 'device' ? 'On-device' : 'Cloud'}</Text>
              )}
              {!!job.result.notes && <Text style={u.body}>{job.result.notes}</Text>}
            </>
          )}
          {!!job.recognizedText && showText[job.id] && (
            <Text selectable style={u.body}>
              {job.recognizedText}
            </Text>
          )}
          {!!(job.error || job.reviewError) && (
            <Text accessibilityRole="alert" style={[u.body, { color: C.red }]}>
              {job.error || job.reviewError}
            </Text>
          )}
          <View style={u.row}>
            {batch.deviceOcr && job.status === 'error' && (
              <Button
                small
                secondary
                disabled={batch.processing}
                accessibilityLabel={`Enter ${job.name} manually`}
                onPress={() => review(job.id)}
              >
                Enter manually
              </Button>
            )}
            {batch.deviceOcr && ['pending', 'ready', 'error'].includes(job.status) && (
              <Button
                small
                secondary
                disabled={batch.processing}
                accessibilityLabel={`Use cloud OCR for ${job.name}`}
                onPress={() => cloudScan(job.id)}
              >
                Use cloud OCR
              </Button>
            )}
            {!!job.recognizedText && (
              <Button
                small
                secondary
                accessibilityLabel={`Show receipt text for ${job.name}`}
                onPress={() => setShowText((old) => ({ ...old, [job.id]: !old[job.id] }))}
              >
                {showText[job.id] ? 'Hide text' : 'Show text'}
              </Button>
            )}
            {job.status === 'ready' && (
              <Button
                small
                secondary
                accessibilityLabel={`Review ${job.name}`}
                onPress={() => review(job.id)}
              >
                Review
              </Button>
            )}
            {job.status === 'error' && (
              <Button
                small
                secondary
                disabled={batch.processing}
                onPress={() => void batch.process(job.id)}
                accessibilityLabel={`Retry ${job.name}`}
              >
                Retry
              </Button>
            )}
            <Button
              small
              secondary
              disabled={batch.processing}
              onPress={() => batch.remove(job.id)}
              accessibilityLabel={`Remove ${job.name}`}
            >
              Remove
            </Button>
          </View>
        </View>
      ))}
    </Card>
  );
}
