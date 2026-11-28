import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import type { CaptureStatus } from '../../modules/pocket-transaction-capture';
import type { State } from '../finance';
import { CURRENCIES } from '../currency';
import { activeCategories } from '../classification';
import { useEntryClassification } from '../hooks/use-entry-classification';
import { openCaptureSettings } from '../lib/transaction-capture';
import {
  addCapturedExpense,
  captureCandidates,
  captureEdit,
  combineCaptures,
  entryCaptureAmount,
  parseCaptureEvent,
  receiveCaptures,
  receiveSingleCapture,
  resolveCapture,
  type CaptureEdit,
  type CaptureRecord,
} from '../transaction-capture';
import { shortcutTemplate } from '../shortcut-capture';
import { Button, C, Card, Field, styles as u } from './ui';
import { Select } from './select';

export function PurchaseCapture({
  state,
  status,
  update,
  notify,
  aiAvailable,
}: {
  state: State;
  status: CaptureStatus;
  update: (fn: (s: State) => State) => void;
  notify: (message: string) => void;
  aiAvailable: boolean;
}) {
  const [editing, setEditing] = useState<{
    record: CaptureRecord;
    fields: CaptureEdit;
    categoryEdited: boolean;
  } | null>(null);
  const [error, setError] = useState('');
  const [existing, setExisting] = useState('');
  const [help, setHelp] = useState<'shortcut' | 'paste' | null>(null);
  const [text, setText] = useState('');
  const [time, setTime] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = (state.captures || []).filter((r) => r.status === 'pending');
  const categories = activeCategories(state);
  const packages = state.captureSettings?.packages || [];
  const suggestions = editing
    ? captureCandidates(state, { ...editing.record, ...editing.fields })
    : [];
  useEntryClassification(
    editing?.fields.merchant,
    !!editing && !editing.categoryEdited && aiAvailable,
    (category, merchant) =>
      setEditing((old) =>
        old && !old.categoryEdited && old.fields.merchant === merchant
          ? { ...old, fields: { ...old.fields, category } }
          : old,
      ),
    categories,
  );
  function patch(fields: Partial<CaptureEdit>) {
    setEditing((old) =>
      old
        ? {
            ...old,
            fields: { ...old.fields, ...fields },
            categoryEdited: old.categoryEdited || fields.category !== undefined,
          }
        : old,
    );
  }
  function commit(action: (s: State) => State, message: string) {
    // Validate against the displayed state, then revalidate in the functional update.
    try {
      action(state);
      update((old) => {
        try {
          return action(old);
        } catch {
          return old;
        }
      });
      setEditing(null);
      setExisting('');
      setError('');
      notify(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Check the purchase details.');
    }
  }
  async function paste() {
    if (busy) return;
    setBusy(true);
    try {
      if (
        !text.trim() ||
        text.length > 1600 ||
        !/^\d{4}-\d{2}-\d{2}T/.test(time) ||
        !Number.isFinite(Date.parse(time))
      )
        throw new Error('Enter the alert text and its ISO timestamp.');
      const digest = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        JSON.stringify([text.trim(), time]),
      );
      const event = {
        id: `manual:${digest}`,
        provider: 'Pasted alert',
        text: text.trim(),
        receivedAt: time,
      };
      if (!parseCaptureEvent(event))
        throw new Error(
          'This is not a purchase alert. Security codes and declined-payment alerts are not imported.',
        );
      receiveSingleCapture(state, event);
      update((old) => receiveCaptures(old, [event]));
      setText('');
      setHelp(null);
      setError('');
      notify('Purchase alert ready for review.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Cannot import this alert.');
    } finally {
      setBusy(false);
    }
  }
  const wrap = (visible: boolean, close: () => void, children: React.ReactNode) => (
    <Modal
      visible={visible}
      animationType={Platform.OS === 'web' ? 'none' : 'slide'}
      onRequestClose={close}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: C.paper }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              padding: 20,
              gap: 16,
              maxWidth: 700,
              width: '100%',
              alignSelf: 'center',
            }}
          >
            {children}
            {!!error && (
              <Text accessibilityRole="alert" style={{ color: C.red }}>
                {error}
              </Text>
            )}
            <Button secondary onPress={close}>
              Close purchase capture
            </Button>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
  return (
    <>
      <Card>
        <Text style={u.h2}>Purchase alerts</Text>
        {Platform.OS === 'android' ? (
          <>
            {!status.available ? (
              <Text style={u.body}>Update the app to capture notifications.</Text>
            ) : (
              <>
                <Text style={u.body}>Selected apps only · Current budget</Text>
                {status.apps.map((app) => (
                  <View
                    key={app.packageName}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}
                  >
                    <Text style={[u.body, { flex: 1 }]}>{app.label}</Text>
                    <Switch
                      accessibilityLabel={`Capture ${app.label}`}
                      value={packages.includes(app.packageName)}
                      onValueChange={(enabled) =>
                        update((old) => ({
                          ...old,
                          captureSettings: {
                            packages: enabled
                              ? [
                                  ...new Set([
                                    ...(old.captureSettings?.packages || []),
                                    app.packageName,
                                  ]),
                                ]
                              : (old.captureSettings?.packages || []).filter(
                                  (p) => p !== app.packageName,
                                ),
                          },
                        }))
                      }
                    />
                  </View>
                ))}
                {!status.apps.length && (
                  <Text style={u.body}>No supported bank or wallet apps were found.</Text>
                )}
                <Button
                  secondary
                  onPress={() =>
                    void openCaptureSettings().catch(() =>
                      notify('Cannot open notification settings.'),
                    )
                  }
                >
                  {status.granted ? 'Manage notification access' : 'Allow notification access'}
                </Button>
              </>
            )}
          </>
        ) : (
          <Text style={u.body}>
            {Platform.OS === 'ios'
              ? 'iPhone: Wallet Shortcuts or paste only.'
              : 'Notification capture requires Android.'}
          </Text>
        )}
        {!!status.error && (
          <Text accessibilityRole="alert" style={{ color: C.red }}>
            {status.error}
          </Text>
        )}
        {status.dropped > 0 && (
          <Text accessibilityRole="alert" style={{ color: C.red }}>
            Inbox full. Some alerts were missed.
          </Text>
        )}
        <Button
          secondary
          onPress={() => {
            setError('');
            setTime(new Date().toISOString());
            setHelp('paste');
          }}
        >
          Paste a purchase alert
        </Button>
        <Button
          secondary
          onPress={() => {
            setError('');
            setHelp('shortcut');
          }}
        >
          iPhone Shortcuts setup
        </Button>
        <Text style={u.body}>
          {pending.length
            ? `${pending.length} alert${pending.length === 1 ? '' : 's'} to review`
            : 'No purchase alerts to review.'}
        </Text>
        {pending.slice(0, 20).map((record) => (
          <View
            key={record.id}
            style={{ gap: 6, paddingVertical: 10, borderTopWidth: 1, borderColor: C.line }}
          >
            <Text style={u.h2}>{record.merchant || 'Purchase details needed'}</Text>
            <Text style={u.body}>
              {record.amount || '?'} {record.currency || 'currency needed'} ·{' '}
              {record.providers.join(' + ')}
            </Text>
            {captureCandidates(state, record).length > 0 && (
              <Text style={u.body}>Possible duplicate</Text>
            )}
            <Button
              secondary
              onPress={() => {
                setError('');
                setExisting('');
                setEditing({ record, fields: captureEdit(record), categoryEdited: false });
              }}
            >
              Review {record.merchant || record.providers[0]}
            </Button>
          </View>
        ))}
        {pending.length > 20 && <Text style={u.body}>Review these alerts to see the rest.</Text>}
      </Card>
      {wrap(
        help !== null,
        () => {
          setHelp(null);
          setError('');
          setText('');
        },
        help === 'shortcut' ? (
          <>
            <Text style={u.h2}>iPhone Shortcuts setup</Text>
            <Text style={u.body}>
              Shortcuts → Transaction → Wallet card → Open URLs. Fill and URL-encode the fields
              below.
            </Text>
            <Text style={u.body}>
              Imports may require unlocking. Wallet taps are not settled charges.
            </Text>
            <Text style={u.body}>Use the purchase time in ISO 8601 with a time zone.</Text>
            <TextInput
              accessibilityLabel="Shortcut URL template"
              multiline
              editable={false}
              selectTextOnFocus
              value={shortcutTemplate}
              style={[u.input, { minHeight: 120, fontSize: 13 }]}
            />
            <Text style={u.body}>Optional: card (last 4 digits), reference.</Text>
          </>
        ) : (
          <>
            <Text style={u.h2}>Paste a purchase alert</Text>
            <Text style={u.body}>Exclude passwords, OTPs and full card numbers.</Text>
            <Field label="Purchase alert text" value={text} onChangeText={setText} multiline />
            <Field label="Alert timestamp (ISO 8601)" value={time} onChangeText={setTime} />
            <Button disabled={busy || !text.trim()} onPress={() => void paste()}>
              Prepare purchase draft
            </Button>
          </>
        ),
      )}
      {wrap(
        editing !== null,
        () => {
          setEditing(null);
          setExisting('');
          setError('');
        },
        editing && (
          <>
            <Text style={u.h2}>Review purchase alert</Text>
            <Text style={u.body}>
              {editing.record.providers.join(' + ')} · Alert time{' '}
              {new Date(editing.record.occurredAt).toLocaleString()}
            </Text>
            {!!editing.record.cardLast4 && (
              <Text style={u.body}>
                Card ending {editing.record.cardLast4} · Wallet digits may differ
              </Text>
            )}
            {editing.record.kind === 'refund' && (
              <Text style={u.body}>Refund/reversal: edit the original purchase.</Text>
            )}
            <Field
              label="Purchase merchant"
              value={editing.fields.merchant}
              onChangeText={(merchant) => patch({ merchant })}
            />
            <Field
              label="Purchase amount"
              value={editing.fields.amount}
              onChangeText={(amount) => patch({ amount })}
              keyboardType="decimal-pad"
            />
            <Select
              label="Purchase currency"
              value={editing.fields.currency}
              options={CURRENCIES.map((value) => ({ value, label: value }))}
              onChange={(currency) => patch({ currency })}
            />
            <Field
              label="Purchase date (YYYY-MM-DD)"
              value={editing.fields.date}
              onChangeText={(date) => patch({ date })}
            />
            <Select
              label="Purchase category"
              value={editing.fields.category}
              options={categories.map((value) => ({ value, label: value }))}
              onChange={(category) => patch({ category })}
            />
            {!!suggestions.length && <Text style={u.h2}>Possible matches</Text>}
            {suggestions.map((match) => (
              <View key={`${match.type}:${match.id}`} style={{ gap: 8 }}>
                <Text style={u.body}>
                  {match.title}: {match.reason}
                </Text>
                <Button
                  secondary
                  onPress={() =>
                    match.type === 'entry'
                      ? commit(
                          (old) => resolveCapture(old, editing.record.id, match.id),
                          'Alert linked. Existing amount and category kept.',
                        )
                      : commit(
                          (old) => combineCaptures(old, editing.record.id, match.id),
                          'Alerts combined. Review the remaining draft before saving.',
                        )
                  }
                >
                  {match.type === 'entry'
                    ? `Link existing purchase ${match.title}`
                    : `Same purchase as alert ${match.title}`}
                </Button>
              </View>
            ))}
            {!!state.entries.some((e) => e.kind === 'expense') && (
              <>
                <Select
                  label="Existing expense"
                  value={existing}
                  options={state.entries
                    .filter((e) => e.kind === 'expense')
                    .slice(0, 100)
                    .map((e) => ({
                      value: e.id,
                      label: `${e.title} · ${entryCaptureAmount(e, state.currency)} · ${e.date}`,
                    }))}
                  onChange={setExisting}
                />
                {!!existing && (
                  <Button
                    secondary
                    onPress={() =>
                      commit(
                        (old) => resolveCapture(old, editing.record.id, existing),
                        'Alert linked. Existing expense kept.',
                      )
                    }
                  >
                    Link selected expense
                  </Button>
                )}
              </>
            )}
            <Button
              disabled={editing.record.kind === 'refund'}
              onPress={() =>
                commit(
                  (old) => addCapturedExpense(old, editing.record.id, editing.fields),
                  'Expense added. Linked alerts will not add another expense.',
                )
              }
            >
              {suggestions.length ? 'Add as a separate purchase' : 'Add reviewed expense'}
            </Button>
            <Button
              secondary
              onPress={() =>
                commit((old) => resolveCapture(old, editing.record.id), 'Alert ignored.')
              }
            >
              Ignore purchase alert
            </Button>
          </>
        ),
      )}
    </>
  );
}
