import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useEffect, useRef, type ComponentRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, C, Card, Field, Icon, Label, styles as u } from './ui';
import { money, State } from '../finance';
import { receiptDraft, receiptEntry } from '../receipts';
import { parseAmount, supportedCurrency } from '../currency';
import { receiptCategories } from '../receipt-audit';
import { CurrencyPicker } from './currency-picker';
import { Select } from './select';
import type { useReceipts } from '../hooks/use-receipts';
type Batch = ReturnType<typeof useReceipts>;
export function ReceiptScanner({
  batch,
  state,
  saveAll,
  undo,
}: {
  batch: Batch;
  state: State;
  saveAll: () => void;
  undo?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const editorScroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const positions = useRef<Record<string, number>>({});
  const focused = useRef<string | null>(null);
  const unresolved = batch.jobs.filter((job) => ['ready', 'error'].includes(job.status));
  const added = batch.jobs.filter((job) => job.status === 'saved');
  const duplicates = batch.jobs.filter((job) => job.status === 'duplicate').length;
  const done = batch.jobs.filter((job) => !['pending', 'processing'].includes(job.status)).length;
  const reviewOpen = !!unresolved.length && !batch.processing && batch.reviewRequested;
  useEffect(() => {
    if (!reviewOpen) {
      Keyboard.dismiss();
      focused.current = null;
    }
  }, [reviewOpen]);
  function keepFocusedVisible() {
    const key = focused.current;
    if (!key) return;
    const jobId = key.split(':')[0];
    requestAnimationFrame(() =>
      editorScroll.current?.scrollTo({
        y: Math.max(0, (positions.current[jobId] || 0) + (positions.current[key] || 0) - 12),
        animated: true,
      }),
    );
  }
  const focus = (key: string) => {
    focused.current = key;
    keepFocusedVisible();
  };
  const close = () => {
    Keyboard.dismiss();
    focused.current = null;
    batch.closeReview();
  };
  const valid = unresolved.filter((job) => {
    try {
      receiptEntry(job, state);
      return job.status === 'ready';
    } catch {
      return false;
    }
  }).length;
  const amountLabel = (job: Batch['jobs'][number]) => {
    const draft = job.draft || receiptDraft(job.result);
    try {
      return money(parseAmount(draft.amount, draft.currency), draft.currency, true);
    } catch {
      return '';
    }
  };
  if (!batch.deviceOcrAvailable)
    return (
      <Card>
        <Text style={u.h2}>Receipts</Text>
        <Text style={u.body}>
          On-device scanning is available in the iOS app. Add entries manually here.
        </Text>
      </Card>
    );
  return (
    <Card>
      <Text style={u.h2}>Receipts</Text>
      <View style={[u.row, { alignItems: 'stretch' }]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Button
            icon="images-outline"
            accessibilityLabel="Upload receipts"
            disabled={batch.processing}
            onPress={() => void batch.choose()}
          >
            Photos
          </Button>
        </View>
        {Platform.OS !== 'web' && (
          <View style={{ flex: 1, minWidth: 0 }}>
            <Button
              secondary
              icon="camera-outline"
              disabled={batch.processing}
              onPress={() => void batch.choose(true)}
            >
              Camera
            </Button>
          </View>
        )}
      </View>
      <Text style={u.body}>On-device OCR → AI classification · Up to 20 photos</Text>
      {batch.processing && (
        <View style={u.row}>
          <ActivityIndicator color={C.green} />
          <Text accessibilityRole="progressbar" style={u.body}>
            Analyzing {done}/{batch.jobs.length}…
          </Text>
        </View>
      )}
      {!!added.length && (
        <View style={u.between}>
          <Text style={u.h2}>
            Added {added.length} expense{added.length === 1 ? '' : 's'}
          </Text>
          {undo && (
            <Button small secondary onPress={undo}>
              Undo
            </Button>
          )}
        </View>
      )}
      {!batch.processing && !!unresolved.length && (
        <Button secondary onPress={() => batch.openReview()}>
          Fix details ({unresolved.length})
        </Button>
      )}
      {!!duplicates && (
        <Text style={u.body}>
          {duplicates} duplicate photo{duplicates === 1 ? '' : 's'} skipped
        </Text>
      )}
      {!batch.processing &&
        added.map((job) => (
          <View key={job.id} testID="added-receipt" style={u.between}>
            <Text style={[u.body, { flex: 1 }]}>{job.draft?.merchant || job.result?.merchant}</Text>
            <Text style={u.body}>{amountLabel(job)}</Text>
          </View>
        ))}
      <Modal
        visible={reviewOpen && !batch.processing}
        transparent
        animationType={Platform.OS === 'web' ? 'none' : 'fade'}
        onRequestClose={close}
      >
        <KeyboardAvoidingView
          behavior="padding"
          enabled={Platform.OS !== 'web'}
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 16,
            paddingTop: Math.max(insets.top, 16),
            paddingBottom: Math.max(insets.bottom, 12),
            backgroundColor: 'rgba(21,40,29,.42)',
          }}
        >
          <View
            testID="receipt-review"
            style={{
              width: '100%',
              maxWidth: 560,
              maxHeight: '100%',
              minHeight: 0,
              backgroundColor: C.paper,
              borderRadius: 22,
              overflow: 'hidden',
            }}
          >
            <View style={[u.between, { padding: 16, flexShrink: 0 }]}>
              <Text style={u.h2}>
                Check {unresolved.length} receipt{unresolved.length === 1 ? '' : 's'}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close receipt details"
                onPress={close}
                style={{
                  minWidth: 44,
                  minHeight: 44,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name="close" />
              </Pressable>
            </View>
            <ScrollView
              ref={editorScroll}
              keyboardShouldPersistTaps="handled"
              onLayout={keepFocusedVisible}
              style={{ flexShrink: 1, minHeight: 0 }}
              contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 16 }}
            >
              {unresolved.map((job) => {
                const draft = job.draft || receiptDraft(job.result);
                let error =
                  job.reviewError ||
                  job.error ||
                  (job.audit?.status !== 'classified' ? job.audit?.reason : '');
                if (job.status !== 'error') {
                  try {
                    receiptEntry(job, state);
                  } catch (e) {
                    error = e instanceof Error ? e.message : 'Check the details.';
                  }
                }
                return (
                  <View
                    key={job.id}
                    testID="receipt-row"
                    onLayout={(event) => {
                      positions.current[job.id] = event.nativeEvent.layout.y;
                    }}
                    style={{
                      gap: 14,
                      padding: 16,
                      borderWidth: 1,
                      borderColor: C.line,
                      borderRadius: 16,
                      minWidth: 0,
                    }}
                  >
                    <View style={[u.between, { flexWrap: 'nowrap' }]}>
                      <Text style={[u.h2, { fontSize: 15, flex: 1 }]}>{job.name}</Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Discard ${job.name}`}
                        disabled={batch.processing}
                        onPress={() => batch.remove(job.id)}
                        style={{
                          minWidth: 44,
                          minHeight: 44,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Icon name="close-outline" color={C.muted} />
                      </Pressable>
                    </View>
                    {!!error && (
                      <Text accessibilityRole="alert" style={[u.body, { color: C.red }]}>
                        {error}
                      </Text>
                    )}
                    {job.status === 'error' ? (
                      <View style={u.row}>
                        <Button
                          small
                          secondary
                          accessibilityLabel={`Retry ${job.name}`}
                          onPress={() => {
                            close();
                            void batch.process(job.id);
                          }}
                        >
                          Retry
                        </Button>
                        <Button
                          small
                          secondary
                          accessibilityLabel={`Enter ${job.name} manually`}
                          onPress={() => batch.patchDraft(job.id, {})}
                        >
                          Enter details
                        </Button>
                      </View>
                    ) : (
                      <>
                        <View
                          onLayout={(event) => {
                            positions.current[job.id + ':merchant'] = event.nativeEvent.layout.y;
                          }}
                        >
                          <Field
                            label="Merchant"
                            accessibilityLabel={`${job.name} merchant`}
                            value={draft.merchant}
                            onFocus={() => focus(job.id + ':merchant')}
                            onChangeText={(merchant) => batch.patchDraft(job.id, { merchant })}
                          />
                        </View>
                        <View
                          onLayout={(event) => {
                            positions.current[job.id + ':amount'] = event.nativeEvent.layout.y;
                          }}
                          style={{ flexDirection: 'row', gap: 12 }}
                        >
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Field
                              label="Amount"
                              accessibilityLabel={`${job.name} amount`}
                              value={draft.amount}
                              keyboardType="decimal-pad"
                              onFocus={() => focus(job.id + ':amount')}
                              onChangeText={(amount) => batch.patchDraft(job.id, { amount })}
                            />
                          </View>
                          <View style={{ width: 100, gap: 8 }}>
                            <Label>Currency</Label>
                            <CurrencyPicker
                              compact
                              label={`${job.name} currency`}
                              value={draft.currency}
                              currencies={[
                                ...new Set([
                                  ...(state.preferredCurrencies || [state.currency]),
                                  ...(supportedCurrency(draft.currency) ? [draft.currency] : []),
                                ]),
                              ]}
                              onChange={(currency) =>
                                batch.patchDraft(job.id, { currency, exchangeRate: '' })
                              }
                            />
                          </View>
                        </View>
                        <View
                          onLayout={(event) => {
                            positions.current[job.id + ':date'] = event.nativeEvent.layout.y;
                          }}
                        >
                          <Field
                            label="Date"
                            accessibilityLabel={`${job.name} date`}
                            placeholder="YYYY-MM-DD"
                            value={draft.date}
                            onFocus={() => focus(job.id + ':date')}
                            onChangeText={(date) => batch.patchDraft(job.id, { date })}
                          />
                        </View>
                        <Select
                          label="Category"
                          value={draft.category}
                          options={receiptCategories.map((value) => ({ value, label: value }))}
                          onChange={(category) => batch.patchDraft(job.id, { category })}
                        />
                        {!!draft.currency && draft.currency !== state.currency && (
                          <View
                            onLayout={(event) => {
                              positions.current[job.id + ':rate'] = event.nativeEvent.layout.y;
                            }}
                          >
                            <Field
                              label={`${state.currency} per ${draft.currency}`}
                              accessibilityLabel={`${job.name} exchange rate`}
                              value={draft.exchangeRate}
                              placeholder="Current rate"
                              keyboardType="decimal-pad"
                              onFocus={() => focus(job.id + ':rate')}
                              onChangeText={(exchangeRate) =>
                                batch.patchDraft(job.id, { exchangeRate })
                              }
                            />
                          </View>
                        )}
                      </>
                    )}
                  </View>
                );
              })}
            </ScrollView>
            <View style={{ padding: 16, paddingTop: 8, gap: 10, flexShrink: 0 }}>
              <Button
                disabled={!valid || valid !== unresolved.length || batch.processing}
                onPress={() => {
                  close();
                  saveAll();
                }}
              >
                Add expenses ({valid})
              </Button>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Card>
  );
}
