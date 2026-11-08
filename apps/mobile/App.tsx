import { validatedApiUrl, regionEndpoints } from './src/lib/config';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Svg, { Circle } from 'react-native-svg';
import {
  Bill,
  demoState,
  Entry,
  Goal,
  id,
  initialState,
  Kind,
  Message,
  money,
  monthLabel,
  State,
  summary,
  today,
  trajectory,
  validDate,
  addMonths,
} from './src/finance';
import {
  CURRENCIES,
  convertMinor,
  decimals,
  displayAmount,
  freshQuote,
  parseAmount,
  rateFor,
  supportedCurrency,
  units,
} from './src/currency';
import { useExchangeRates } from './src/hooks/use-exchange-rates';
import { CurrencyPicker } from './src/components/currency-picker';
import { load, persist, removeLegacyProviderKey } from './src/storage';
import { chat, ChatResult } from './src/api';
import { useReceipts } from './src/hooks/use-receipts';
import { ReceiptScanner } from './src/components/receipt-scanner';
import { receiptEntry } from './src/receipts';
import {
  Button,
  C,
  Card,
  Empty,
  Field,
  Icon,
  IconName,
  Label,
  Pill,
  Progress,
  styles as u,
} from './src/components/ui';

import { useAuth } from './src/hooks/use-auth';
import { AuthScreen } from './src/components/auth-screen';
import { Session, signOut, sendVerification, getAccessToken } from './src/lib/auth';
import { Slot, usePathname, useRouter } from 'expo-router';
import { PageContext, routes, Tab } from './src/page-context';
type Form = {
  type: 'entry' | 'bill' | 'goal' | 'plan';
  existing?: string;
  receiptId?: string;
  title: string;
  amount: string;
  date: string;
  kind: Kind;
  category: string;
  goalId: string;
  recurring: boolean;
  initial: string;
  emoji: string;
  percent: string;
  currency: string;
  exchangeRate: string;
};
const tabs: { name: Tab; icon: IconName }[] = [
  { name: 'Overview', icon: 'grid-outline' },
  { name: 'Activity', icon: 'swap-horizontal-outline' },
  { name: 'Plan', icon: 'pie-chart-outline' },
  { name: 'AI planner', icon: 'sparkles-outline' },
  { name: 'Tools', icon: 'scan-outline' },
  { name: 'Settings', icon: 'settings-outline' },
];
const categories = [
  'Food & drinks',
  'Groceries',
  'Transport',
  'Shopping',
  'Health',
  'Entertainment',
  'Other',
];
const errorText = (e: unknown) =>
  e instanceof Error ? e.message : 'Something went wrong. Please retry.';
function AppContent({ session }: { session: Session }) {
  const { width, fontScale } = useWindowDimensions(),
    wide = width >= 1100 && fontScale < 1.4,
    columns = width >= 900 && fontScale < 1.25,
    compact = width < 420 || fontScale > 1.15;
  const pathname = usePathname(),
    router = useRouter();
  const tab = (Object.keys(routes) as Tab[]).find((k) => routes[k] === pathname) || 'Overview';
  function setTab(next: Tab) {
    router.navigate(routes[next] as never);
  }
  const [s, setS] = useState<State | null>(null),
    [fatal, setFatal] = useState(''),
    [form, setForm] = useState<Form | null>(null),
    [formError, setFormError] = useState(''),
    [notice, setNotice] = useState(''),
    [storageError, setStorageError] = useState('');
  const [confirm, setConfirm] = useState<{
      title: string;
      body: string;
      action: () => void;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [chatInput, setChatInput] = useState(''),
    [proposal, setProposal] = useState<(ChatResult & { currency: string }) | null>(null),
    [sources, setSources] = useState<ChatResult['sources']>([]),
    [filter, setFilter] = useState('All'),
    [search, setSearch] = useState(''),
    [url, setUrl] = useState(''),
    [checking, setChecking] = useState(false),
    [scanNote, setScanNote] = useState('');
  const receipts = useReceipts(s, setNotice);
  const queue = useRef(Promise.resolve()),
    chatScroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  useEffect(() => {
    load(session.uid)
      .then((data) => {
        setS(data);
        setUrl(data.apiUrl);
      })
      .catch((e) => setFatal(errorText(e)));
    void removeLegacyProviderKey();
  }, [session.uid]);
  useEffect(() => {
    if (!s) return;
    const snapshot = s;
    queue.current = queue.current
      .catch(() => {})
      .then(() => persist(snapshot, session.uid))
      .then(() => setStorageError(''))
      .catch((e) =>
        setStorageError(
          'Could not save on this device. Keep the app open and retry from Settings. ' +
            errorText(e),
        ),
      );
  }, [s, session.uid]);
  const fx = useExchangeRates(s?.apiUrl, s?.currency, (quote) =>
    update((old) => ({ ...old, fx: quote })),
  );
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 4500);
    return () => clearTimeout(t);
  }, [notice]);
  function update(fn: (old: State) => State) {
    setS((old) => (old ? fn(old) : old));
  }
  function open(type: Form['type'], preset: Partial<Form> = {}) {
    setFormError('');
    setForm({
      type,
      title: '',
      amount: '',
      date: type === 'goal' ? addMonths(3) : today(),
      kind: 'expense',
      category: categories[0],
      goalId: s?.goals[0]?.id || '',
      recurring: true,
      initial: '0',
      emoji: '🌱',
      percent: String(s?.savePercent ?? 30),
      currency: s?.currency || 'SGD',
      exchangeRate: '',
      ...preset,
    });
  }
  if (fatal)
    return (
      <SafeAreaView style={st.loading}>
        <Text style={u.h2}>Your local data is preserved</Text>
        <Text style={u.body}>{fatal}</Text>
        <Text style={u.body}>Close and reopen the app. No data has been overwritten.</Text>
        <Button secondary onPress={() => void signOut().catch((e) => setFatal(errorText(e)))}>
          Sign out
        </Button>
      </SafeAreaView>
    );
  if (!s)
    return (
      <View style={st.loading}>
        <ActivityIndicator color={C.green} />
        <Text style={u.body}>Loading…</Text>
      </View>
    );
  const state = s,
    m = summary(s),
    t = trajectory(s),
    fmt = (n: number) => displayAmount(n, s.currency, s.displayCurrency || s.currency, s.fx);
  const budgetMoney = (n: number) => money(n, s.currency, true);
  const foreignEntry = !!form && form.type === 'entry' && form.currency !== s.currency;
  const autoRate = form ? rateFor(s.fx, s.currency, form.currency) : undefined;
  const selectedRate = form?.exchangeRate.trim()
    ? Number(form.exchangeRate)
    : autoRate
      ? 1 / autoRate
      : undefined;
  function saveForm() {
    if (!form) return;
    try {
      const f = form,
        amount = parseAmount(f.amount, f.type === 'entry' ? f.currency : state.currency);
      if (f.type !== 'plan' && amount <= 0) throw new Error('Amount must be greater than zero.');
      if (f.type !== 'plan' && !f.title.trim()) throw new Error('Enter a name.');
      if (f.type !== 'plan' && !validDate(f.date))
        throw new Error('Use a valid date in YYYY-MM-DD format.');
      if (f.type === 'entry' && f.date > today())
        throw new Error('Activity cannot be future-dated. Add a planned outgoing instead.');
      if (f.type === 'goal' && f.date <= today()) throw new Error('Choose a future deadline.');
      if (f.type === 'entry') {
        if (f.kind === 'saving' && !state.goals.some((g) => g.id === f.goalId))
          throw new Error('Create or select a savings goal first.');
        let booked = amount,
          original: Entry['original'];
        const existing = state.entries.find((e) => e.id === f.existing);
        if (f.currency !== state.currency) {
          if (!supportedCurrency(f.currency))
            throw new Error('Choose a supported expense currency.');
          if (
            existing?.original &&
            f.currency === existing.original.currency &&
            amount === existing.original.amount &&
            (!f.exchangeRate.trim() || Number(f.exchangeRate) === existing.original.rate)
          ) {
            booked = existing.amount;
            original = existing.original;
          } else {
            const market = rateFor(state.fx, state.currency, f.currency);
            const explicit = !!f.exchangeRate.trim();
            if (!explicit && (!market || !freshQuote(state.fx)))
              throw new Error(
                'Refresh exchange rates or enter the rate charged by your bank before saving.',
              );
            const rate = explicit ? Number(f.exchangeRate) : 1 / market!;
            booked = convertMinor(amount, f.currency, state.currency, rate);
            if (booked <= 0)
              throw new Error('Converted amount is below the smallest budget currency unit.');
            original = {
              amount,
              currency: f.currency,
              rate,
              fetchedAt: explicit ? new Date().toISOString() : state.fx!.fetchedAt,
              source: explicit ? 'Manual' : state.fx!.source,
            };
          }
        }
        const entry: Entry = {
          id: f.existing || (f.receiptId ? `receipt-${f.receiptId}` : id()),
          title: f.title.trim(),
          amount: booked,
          ...(original ? { original } : {}),
          date: f.date,
          kind: f.kind,
          category:
            f.kind === 'saving' ? 'Savings' : f.kind === 'income' ? 'Extra income' : f.category,
          ...(f.kind === 'saving' ? { goalId: f.goalId } : {}),
        };
        update((old) => ({
          ...old,
          entries: f.existing
            ? old.entries.map((e) => (e.id === f.existing ? entry : e))
            : old.entries.some((e) => e.id === entry.id)
              ? old.entries
              : [entry, ...old.entries],
        }));
      }
      if (f.type === 'bill') {
        const bill: Bill = {
          id: f.existing || id(),
          title: f.title.trim(),
          amount,
          date: f.date,
          recurring: f.recurring,
        };
        update((old) => ({
          ...old,
          bills: f.existing
            ? old.bills.map((b) => (b.id === f.existing ? bill : b))
            : [...old.bills, bill],
        }));
      }
      if (f.type === 'goal') {
        const initial = parseAmount(f.initial, state.currency);
        if (initial > amount) throw new Error('Already saved must be no more than the target.');
        const goal: Goal = {
          id: f.existing || id(),
          title: f.title.trim(),
          target: amount,
          initial,
          deadline: f.date,
          emoji: f.emoji || '🌱',
        };
        update((old) => ({
          ...old,
          goals: f.existing
            ? old.goals.map((g) => (g.id === f.existing ? goal : g))
            : [...old.goals, goal],
        }));
      }
      if (f.type === 'plan') {
        const percent = Number(f.percent);
        if (!Number.isInteger(percent) || percent < 0 || percent > 100)
          throw new Error('Savings percentage must be a whole number from 0 to 100.');
        update((old) => ({ ...old, income: amount, savePercent: percent }));
      }
      if (f.receiptId) {
        const scanned = receipts.jobs.find((job) => job.id === f.receiptId)?.result;
        if (scanned)
          receipts.patch(f.receiptId, {
            result: {
              ...scanned,
              merchant: f.title.trim(),
              amount: Number(f.amount),
              currency: f.currency,
              date: f.date,
              category: f.category,
            },
          });
        receipts.markSaved([f.receiptId]);
      }
      setForm(null);
      setScanNote('');
      setNotice('Saved.');
    } catch (e) {
      setFormError(errorText(e));
    }
  }
  function remove(type: 'entry' | 'goal' | 'bill', itemId: string) {
    setConfirm({
      title: 'Delete this ' + type + '?',
      body:
        type === 'goal'
          ? 'Its savings history stays in Activity. The money will no longer be attached to a goal.'
          : type === 'bill'
            ? 'Existing payments stay in Activity and become ordinary spending.'
            : 'Your totals will be recalculated immediately.',
      action: () => {
        update((old) =>
          type === 'entry'
            ? { ...old, entries: old.entries.filter((e) => e.id !== itemId) }
            : type === 'goal'
              ? {
                  ...old,
                  goals: old.goals.filter((g) => g.id !== itemId),
                  entries: old.entries.map((e) =>
                    e.goalId === itemId ? { ...e, goalId: undefined } : e,
                  ),
                }
              : {
                  ...old,
                  bills: old.bills.filter((b) => b.id !== itemId),
                  entries: old.entries.map((e) =>
                    e.billId === itemId ? { ...e, billId: undefined } : e,
                  ),
                },
        );
        setNotice('Deleted.');
      },
    });
  }
  async function send(text = chatInput) {
    if (busy || !text.trim()) return;
    const messages: Message[] = [...state.messages, { role: 'user', content: text.trim() }];
    setBusy(true);
    setNotice('');
    setChatInput('');
    setProposal(null);
    update((old) => ({ ...old, messages }));
    try {
      const result = await chat(state, messages);
      update((old) => ({
        ...old,
        messages: [...messages, { role: 'assistant', content: result.message }],
      }));
      setProposal({ ...result, currency: state.currency });
      setSources(result.sources);
    } catch (e) {
      setNotice(errorText(e));
      setChatInput(text);
      update((old) => ({ ...old, messages: old.messages.slice(0, -1) }));
    } finally {
      setBusy(false);
    }
  }
  function reviewReceipt(jobId: string) {
    const job = receipts.jobs.find((j) => j.id === jobId);
    if (!job?.result || job.status !== 'ready') return;
    const r = job.result;
    setScanNote(r.notes);
    open('entry', {
      receiptId: jobId,
      title: r.merchant,
      amount: (() => {
        try {
          parseAmount(String(r.amount), r.currency);
          return r.amount.toFixed(decimals(r.currency));
        } catch {
          return String(r.amount);
        }
      })(),
      currency: r.currency,
      date: r.date,
      category: r.category,
    });
  }
  function saveReceipts() {
    const entries: Entry[] = [],
      saved: string[] = [];
    for (const job of receipts.jobs.filter((j) => j.status === 'ready')) {
      try {
        entries.push(receiptEntry(job, state));
        saved.push(job.id);
      } catch (e) {
        receipts.patch(job.id, { reviewError: errorText(e) });
      }
    }
    if (entries.length) {
      update((old) => ({
        ...old,
        entries: [
          ...entries.filter((e) => !old.entries.some((x) => x.id === e.id)),
          ...old.entries,
        ],
      }));
      receipts.markSaved(saved);
      setNotice(`${saved.length} receipts saved.`);
    }
  }
  function editEntry(e: Entry) {
    if (e.billId) {
      setNotice('To correct a reserved bill payment, delete it and mark the bill paid again.');
      return;
    }
    open('entry', {
      existing: e.id,
      title: e.title,
      amount: (
        (e.original?.amount ?? e.amount) / units(e.original?.currency || state.currency)
      ).toFixed(decimals(e.original?.currency || state.currency)),
      currency: e.original?.currency || state.currency,
      exchangeRate: e.original ? String(e.original.rate) : '',
      date: e.date,
      kind: e.kind,
      category: e.category,
      goalId: e.goalId || state.goals[0]?.id || '',
    });
  }
  const heading = (title: string, action?: React.ReactNode) => (
    <View
      style={[
        u.between,
        {
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          flexDirection: columns ? 'row' : 'column',
          marginBottom: 26,
        },
      ]}
    >
      <View
        style={{
          gap: 8,
          flex: columns ? 1 : undefined,
          minWidth: 0,
          width: columns ? undefined : '100%',
        }}
      >
        <Text accessibilityRole="header" style={u.h1}>
          {title}
        </Text>
      </View>
      {action}
    </View>
  );
  const entryRow = (e: Entry) => (
    <View key={e.id} style={[u.between, st.entry]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Edit ${e.title}`}
        onPress={() => editEntry(e)}
        style={[u.row, { flex: 1, minWidth: 150, flexShrink: 1 }]}
      >
        <View
          style={[
            st.entryIcon,
            {
              backgroundColor:
                e.kind === 'saving' ? C.mint : e.kind === 'income' ? '#F1F0D9' : C.bg,
            },
          ]}
        >
          <Icon
            name={
              e.kind === 'saving'
                ? 'leaf-outline'
                : e.kind === 'income'
                  ? 'arrow-down-outline'
                  : e.category === 'Food & drinks'
                    ? 'cafe-outline'
                    : e.category === 'Groceries'
                      ? 'basket-outline'
                      : e.category === 'Transport'
                        ? 'train-outline'
                        : 'bag-handle-outline'
            }
            size={19}
            color={C.green}
          />
        </View>
        <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
          <Text style={st.entryTitle}>{e.title}</Text>
          <Text style={st.entryMeta}>
            {e.billId ? 'Reserved bill' : e.category} · {e.date.slice(5)}
            {e.original
              ? `\n${money(e.original.amount, e.original.currency, true)} · saved at ${e.original.rate.toPrecision(6)} ${state.currency}/${e.original.currency}`
              : ''}
          </Text>
        </View>
      </Pressable>
      <Text
        style={{ fontSize: 14, fontWeight: '600', color: e.kind === 'income' ? C.green : C.ink }}
      >
        {e.kind === 'income' ? '+' : e.kind === 'saving' ? '↗ ' : '−'}
        {fmt(e.amount)}
      </Text>
      {tab === 'Activity' && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Delete ${e.title}`}
          hitSlop={8}
          onPress={() => remove('entry', e.id)}
        >
          <Icon name="close-outline" size={18} color={C.muted} />
        </Pressable>
      )}
    </View>
  );
  const goalCard = (g: ReturnType<typeof trajectory>['rows'][number], compact = false) => (
    <Card key={g.id} style={compact ? { flex: columns ? 1 : undefined, minWidth: 0 } : undefined}>
      <View style={u.between}>
        <View style={st.emoji}>
          <Text style={{ fontSize: 23 }}>{g.emoji}</Text>
        </View>
        <Pill tone={g.onTrack ? 'green' : 'red'}>
          {g.remaining === 0
            ? 'Reached!'
            : g.overdue
              ? 'Past deadline'
              : g.onTrack
                ? 'On track'
                : 'Behind target'}
        </Pill>
      </View>
      <View style={{ gap: 7 }}>
        <Text style={u.h2}>{g.title}</Text>
        <Text style={u.body}>
          By{' '}
          {new Date(g.deadline + 'T12:00:00').toLocaleDateString('en-SG', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}
        </Text>
      </View>
      <View style={{ gap: 11 }}>
        <View style={u.between}>
          <Text style={{ fontSize: 20, color: C.ink, fontWeight: '500' }}>{fmt(g.saved)}</Text>
          <Text style={u.body}>/ {fmt(g.target)}</Text>
        </View>
        <Progress value={(g.saved / g.target) * 100} />
      </View>
      {!compact && (
        <>
          <Text style={u.body}>
            Needs {fmt(g.required)}/month · {fmt(g.allocation)} available this month
            {g.remaining > 0 ? `\nProjected by deadline: ${fmt(g.projected)}` : ''}
          </Text>
          <View style={[u.row, { flexWrap: 'wrap' }]}>
            <Button
              small
              onPress={() =>
                open('entry', {
                  kind: 'saving',
                  goalId: g.id,
                  title: `Savings for ${g.title}`,
                  category: 'Savings',
                })
              }
              icon="add"
            >
              Add savings
            </Button>
            <Button
              small
              secondary
              onPress={() =>
                open('goal', {
                  existing: g.id,
                  title: g.title,
                  amount: String(g.target / units(state.currency)),
                  initial: String(g.initial / units(state.currency)),
                  date: g.deadline,
                  emoji: g.emoji,
                })
              }
            >
              Edit
            </Button>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Delete ${g.title}`}
              onPress={() => remove('goal', g.id)}
            >
              <Icon name="trash-outline" size={18} color={C.muted} />
            </Pressable>
          </View>
        </>
      )}
    </Card>
  );
  function overview() {
    return (
      <>
        {heading(
          'Overview',
          <View style={st.month}>
            <Icon name="calendar-outline" size={16} />
            <Text style={{ color: C.ink, fontSize: 12 }}>{monthLabel()}</Text>
          </View>,
        )}
        {!s!.income && (
          <Card style={{ backgroundColor: C.mint, marginBottom: 20 }}>
            <Text style={u.h2}>Set monthly income</Text>
            <Text style={u.body}>Set income, bills and savings percentage.</Text>
            <View style={[u.row, { flexWrap: 'wrap' }]}>
              <Button onPress={() => open('plan', { amount: '', percent: '30' })}>
                Set budget
              </Button>
              <Button
                secondary
                onPress={() =>
                  setConfirm({
                    title: 'Try a sample budget?',
                    body: 'This replaces the current local budget with editable sample data.',
                    action: () => {
                      setS({
                        ...demoState(),
                        apiUrl: state.apiUrl,
                        fx: state.fx?.base === 'SGD' ? state.fx : undefined,
                        displayCurrency: state.displayCurrency,
                      });
                      setNotice('Demo loaded.');
                    },
                  })
                }
              >
                Try demo
              </Button>
            </View>
          </Card>
        )}
        <View style={[st.grid, { flexDirection: columns ? 'row' : 'column' }]}>
          <View style={{ flex: columns ? 1.8 : undefined, gap: 20, minWidth: 0 }}>
            <View style={st.hero}>
              <View style={u.between}>
                <Text style={[u.caption, { color: '#BAD0BD' }]}>REMAINING THIS MONTH</Text>
              </View>
              <Text style={[st.heroAmount, { fontSize: compact ? 36 : 49 }]}>
                {fmt(m.remaining)}
              </Text>
              <Text style={{ color: '#C2D5C5', fontSize: 13, lineHeight: 21 }}>
                {m.remaining < 0 ? 'Over budget.' : 'After bills and savings.'}
              </Text>
              <View style={st.heroLine} />
              <View style={u.between}>
                <View style={{ gap: 5 }}>
                  <Text style={{ fontSize: 20, color: '#fff', fontWeight: '500' }}>
                    {fmt(m.daily)}
                    <Text style={{ fontSize: 12, color: '#BAD0BD' }}> / day</Text>
                  </Text>
                  <Text style={{ fontSize: 11, color: '#BAD0BD' }}>
                    {m.days} days left, including today
                  </Text>
                </View>
                <Button secondary icon="add" onPress={() => open('entry')}>
                  Add expense
                </Button>
              </View>
            </View>
            <View
              style={[
                u.row,
                { alignItems: 'stretch', gap: 12, flexDirection: compact ? 'column' : 'row' },
              ]}
            >
              {[
                {
                  label: 'MONTHLY INCOME',
                  value: m.income,
                  icon: 'arrow-down-outline' as IconName,
                  color: C.green,
                },
                {
                  label: 'SPENT SO FAR',
                  value: m.spending + m.paid,
                  icon: 'arrow-up-outline' as IconName,
                  color: C.gold,
                },
                {
                  label: 'SAVED THIS MONTH',
                  value: m.saved,
                  icon: 'leaf-outline' as IconName,
                  color: C.green,
                },
              ].map((x) => (
                <Card key={x.label} style={{ flex: compact ? undefined : 1, padding: 18, gap: 12 }}>
                  <Icon name={x.icon} color={x.color} size={19} />
                  <Text style={[u.caption, { fontSize: 8, letterSpacing: 0.8 }]}>{x.label}</Text>
                  <Text
                    style={{
                      fontSize: columns ? 21 : 17,
                      fontWeight: '500',
                      color: C.ink,
                      letterSpacing: -0.5,
                    }}
                  >
                    {fmt(x.value)}
                  </Text>
                </Card>
              ))}
            </View>
            <Card>
              <View style={u.between}>
                <Text style={u.h2}>Recent activity</Text>
                <Pressable accessibilityRole="button" onPress={() => setTab('Activity')}>
                  <Text style={st.textLink}>All activity ↗</Text>
                </Pressable>
              </View>
              {s!.entries.length ? (
                s!.entries
                  .filter((e) => e.date <= today())
                  .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
                  .slice(0, 4)
                  .map(entryRow)
              ) : (
                <Empty
                  title="No activity"
                  body="Add an expense or income."
                  action="Add your first entry"
                  onPress={() => open('entry')}
                />
              )}
            </Card>
          </View>
          <View style={{ flex: columns ? 1 : undefined, gap: 20, minWidth: 0 }}>
            <Card>
              <View style={u.between}>
                <Text style={u.h2}>Allocation</Text>
                <Icon name="pie-chart-outline" color={C.muted} size={18} />
              </View>
              <View style={{ alignItems: 'center', justifyContent: 'center', height: 173 }}>
                <Svg width={176} height={176} viewBox="0 0 176 176">
                  <Circle cx="88" cy="88" r="66" stroke={C.line} strokeWidth="17" fill="none" />
                  {m.income > 0 &&
                    [
                      { v: m.fixed, c: '#B8C8B4', offset: 0 },
                      { v: m.spendingBudget, c: C.ink, offset: m.fixed },
                      { v: m.savingsBudget, c: '#B8D883', offset: m.fixed + m.spendingBudget },
                    ].map((a, i) => (
                      <Circle
                        key={i}
                        cx="88"
                        cy="88"
                        r="66"
                        stroke={a.c}
                        strokeWidth="17"
                        fill="none"
                        strokeDasharray={`${Math.min(1, a.v / m.income) * 414.69} 414.69`}
                        strokeDashoffset={(-a.offset / m.income) * 414.69}
                        transform="rotate(-90 88 88)"
                      />
                    ))}
                </Svg>
                <View
                  style={{
                    position: 'absolute',
                    width: 100,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                  }}
                >
                  <Text style={{ fontSize: 28, color: C.ink, fontWeight: '500' }}>
                    {s!.savePercent}%
                  </Text>
                </View>
              </View>
              <Text style={[u.body, { textAlign: 'center' }]}>Savings allocation</Text>
              {[
                { title: 'Essentials', amount: m.fixed, color: '#B8C8B4' },
                { title: 'Spending', amount: m.spendingBudget, color: C.ink },
                { title: 'Savings', amount: m.savingsBudget, color: '#B8D883' },
              ].map((a) => (
                <View key={a.title} style={u.between}>
                  <View style={[u.row, { gap: 8 }]}>
                    <View
                      style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: a.color }}
                    />
                    <Text style={u.body}>{a.title}</Text>
                  </View>
                  <Text style={{ fontSize: 12, color: C.ink, fontWeight: '600' }}>
                    {fmt(a.amount)}
                  </Text>
                </View>
              ))}
              <Button small secondary onPress={() => setTab('Plan')}>
                Edit allocation
              </Button>
            </Card>
          </View>
        </View>
        <View style={[u.between, { marginTop: 30, marginBottom: 16 }]}>
          <View style={{ gap: 5 }}>
            <Text style={u.h2}>Savings goals</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={() => setTab('Plan')}>
            <Text style={st.textLink}>All goals ↗</Text>
          </Pressable>
        </View>
        <View style={[st.grid, { flexDirection: columns ? 'row' : 'column' }]}>
          {t.rows.length ? (
            t.rows.slice(0, 2).map((g) => goalCard(g, true))
          ) : (
            <Card style={{ flex: columns ? 1 : undefined }}>
              <Empty
                title="No savings goals"
                body="Set a target and deadline."
                action="Create a goal"
                onPress={() => open('goal')}
              />
            </Card>
          )}
        </View>
      </>
    );
  }
  function activity() {
    const entries = s!.entries
      .filter(
        (e) =>
          (filter === 'All' || e.kind === filter) &&
          (e.title + ' ' + e.category).toLowerCase().includes(search.toLowerCase()),
      )
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    return (
      <>
        {heading(
          'Activity',
          <Button icon="add" onPress={() => open('entry')}>
            Add an entry
          </Button>,
        )}
        <Card>
          <Field
            label="Search activity"
            value={search}
            onChangeText={setSearch}
            placeholder="Search entries"
          />
          <View style={[u.row, { flexWrap: 'wrap' }]}>
            {['All', 'expense', 'income', 'saving'].map((f) => (
              <Pressable
                key={f}
                accessibilityRole="button"
                onPress={() => setFilter(f)}
                style={[st.chip, filter === f && st.activeChip]}
              >
                <Text style={[st.chipText, filter === f && { color: C.green }]}>
                  {f === 'All'
                    ? 'All activity'
                    : f === 'saving'
                      ? 'Savings'
                      : f === 'income'
                        ? 'Extra income'
                        : 'Expenses'}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={u.body}>Log extra income only. Tap entries to edit.</Text>
          {entries.length ? (
            entries.map(entryRow)
          ) : (
            <Empty title="No matching entries" body="Change your search or add an entry." />
          )}
        </Card>
      </>
    );
  }
  function plan() {
    return (
      <>
        {heading(
          'Plan & goals',
          <View style={u.row}>
            <Button
              icon="create-outline"
              onPress={() =>
                open('plan', {
                  amount: String(s!.income / units(state.currency)),
                  percent: String(s!.savePercent),
                })
              }
            >
              Edit plan
            </Button>
            <Button secondary icon="add" onPress={() => open('goal')}>
              New savings goal
            </Button>
          </View>,
        )}
        {m.overcommitted && (
          <View style={st.warning}>
            <Text style={{ color: C.red }}>Bills exceed income by {fmt(m.fixed - m.income)}.</Text>
          </View>
        )}
        <View style={[st.grid, { flexDirection: columns ? 'row' : 'column' }]}>
          <Card style={{ flex: columns ? 1 : undefined }}>
            <Text style={u.caption}>INCOME</Text>
            <Text style={u.h2}>Monthly take-home income</Text>
            <Text style={u.amount}>{fmt(s!.income)}</Text>
            <Text style={u.body}>Extra income is added from Activity.</Text>
            <View style={u.divider} />
            <View style={u.between}>
              <Text style={u.body}>Income including extras</Text>
              <Text style={st.bold}>{fmt(m.income)}</Text>
            </View>
            <View style={u.between}>
              <Text style={u.body}>Reserved essentials</Text>
              <Text style={st.bold}>−{fmt(m.fixed)}</Text>
            </View>
            <View style={u.between}>
              <Text style={st.bold}>Flexible income</Text>
              <Text style={st.bold}>{fmt(m.disposable)}</Text>
            </View>
          </Card>
          <Card style={{ flex: columns ? 1 : undefined, backgroundColor: C.mint }}>
            <Text style={u.caption}>AFTER BILLS</Text>
            <Text style={u.h2}>Spending / savings</Text>
            <View
              style={{ height: 16, flexDirection: 'row', borderRadius: 20, overflow: 'hidden' }}
            >
              <View
                style={{ flex: Math.max(0.001, 100 - s!.savePercent), backgroundColor: C.ink }}
              />
              <View style={{ flex: Math.max(0.001, s!.savePercent), backgroundColor: '#B8D883' }} />
            </View>
            <View style={u.between}>
              <Text style={st.bold}>{100 - s!.savePercent}% spending</Text>
              <Text style={st.bold}>{s!.savePercent}% savings</Text>
            </View>
            <View style={u.between}>
              <Text style={u.amount}>{fmt(m.spendingBudget)}</Text>
              <Text style={u.amount}>{fmt(m.savingsBudget)}</Text>
            </View>
            <Text style={u.body}>Extra savings reduce remaining spending.</Text>
          </Card>
        </View>
        <View style={[u.between, { marginTop: 30, marginBottom: 16 }]}>
          <Text style={u.h2}>Planned outgoings</Text>
          <Button small secondary icon="add" onPress={() => open('bill')}>
            Add outgoing
          </Button>
        </View>
        <Card>
          {s!.bills.length ? (
            s!.bills.map((b) => {
              const applicable = m.bills.some((x) => x.id === b.id),
                paid = m.entries.some((e) => e.billId === b.id);
              return (
                <View key={b.id} style={[st.entry, { gap: 12 }]}>
                  <View style={u.between}>
                    <View style={{ flex: 1, gap: 5 }}>
                      <Text style={st.bold}>{b.title}</Text>
                      <Text style={u.body}>
                        {b.recurring ? 'Monthly from' : 'One-time on'} {b.date}
                      </Text>
                    </View>
                    <Text style={st.bold}>{fmt(b.amount)}</Text>
                  </View>
                  <View style={[u.row, { flexWrap: 'wrap' }]}>
                    <Pill tone={!applicable ? 'neutral' : paid ? 'green' : 'neutral'}>
                      {!applicable
                        ? 'Outside this month'
                        : paid
                          ? 'Paid this month'
                          : 'Reserved this month'}
                    </Pill>
                    {applicable && !paid && (
                      <Button
                        small
                        secondary
                        onPress={() => {
                          update((old) => ({
                            ...old,
                            entries: [
                              {
                                id: id(),
                                kind: 'expense',
                                amount: b.amount,
                                title: b.title,
                                category: 'Bills',
                                date: today(),
                                billId: b.id,
                              },
                              ...old.entries,
                            ],
                          }));
                          setNotice('Bill paid.');
                        }}
                      >
                        Mark paid
                      </Button>
                    )}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${b.title}`}
                      onPress={() =>
                        open('bill', {
                          existing: b.id,
                          title: b.title,
                          amount: String(b.amount / units(state.currency)),
                          date: b.date,
                          recurring: b.recurring,
                        })
                      }
                    >
                      <Icon name="create-outline" size={18} color={C.muted} />
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${b.title}`}
                      onPress={() => remove('bill', b.id)}
                    >
                      <Icon name="trash-outline" size={18} color={C.muted} />
                    </Pressable>
                  </View>
                </View>
              );
            })
          ) : (
            <Empty
              title="No planned outgoings"
              body="Add bills or one-time payments."
              action="Add an outgoing"
              onPress={() => open('bill')}
            />
          )}
        </Card>
        <Text style={[u.body, { marginTop: 16 }]}>
          Mark reserved bills paid here to avoid double-counting.
        </Text>
        {goals()}
      </>
    );
  }
  function goals() {
    return (
      <>
        <View style={{ marginTop: 28, marginBottom: 16 }}>
          <Text style={u.h2}>Savings goals</Text>
        </View>
        {t.rows.length > 0 && (
          <Card style={{ backgroundColor: t.feasible ? C.mint : C.pink, marginBottom: 24 }}>
            <View style={u.row}>
              <Icon
                name={t.feasible ? 'leaf-outline' : 'alert-circle-outline'}
                color={t.feasible ? C.green : C.red}
              />
              <Text style={u.h2}>
                {t.required === 0
                  ? 'Targets funded'
                  : !t.feasible
                    ? 'Insufficient income'
                    : t.percent > s!.savePercent
                      ? 'Increase savings'
                      : 'Targets covered'}
              </Text>
            </View>
            <Text style={u.body}>
              Required: {fmt(t.required)}/month. Available: {fmt(t.available)}.{' '}
              {t.feasible
                ? `Required savings: ${t.percent}%.`
                : 'Targets exceed income. Reduce targets or extend deadlines.'}
            </Text>
            {t.feasible && t.percent > s!.savePercent && (
              <Button
                small
                onPress={() => {
                  update((old) => ({ ...old, savePercent: t.percent }));
                  setNotice('Allocation updated.');
                }}
              >
                Set savings to {t.percent}%
              </Button>
            )}
          </Card>
        )}
        <View style={{ gap: 20 }}>
          {t.rows.length ? (
            t.rows.map((g) => goalCard(g))
          ) : (
            <Card>
              <Empty
                title="No savings goals"
                body="Set a target and deadline."
                action="Create your first goal"
                onPress={() => open('goal')}
              />
            </Card>
          )}
        </View>
        <Card style={{ marginTop: 20, backgroundColor: '#F0F2EB' }}>
          <Text style={u.h2}>Calculation</Text>
          <Text style={u.body}>
            Monthly target = remaining amount ÷ months left. Goals share available savings.
            Estimates exclude interest.
          </Text>
        </Card>
      </>
    );
  }
  function planner() {
    return (
      <>
        {heading('AI planner')}
        <Card style={{ padding: columns ? 28 : 18 }}>
          <View style={u.between}>
            <View style={u.row}>
              <View style={st.entryIcon}>
                <Icon name="sparkles-outline" color={C.green} />
              </View>
              <View>
                <Text style={u.body}>
                  {s!.research ? 'Web research enabled' : 'Estimates only · web research off'}
                </Text>
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear conversation"
              disabled={busy}
              onPress={() =>
                setConfirm({
                  title: 'Clear chat?',
                  body: 'The current chat will be removed from this device. Saved goals stay in your budget.',
                  action: () => {
                    update((old) => ({ ...old, messages: [] }));
                    setProposal(null);
                    setSources([]);
                  },
                })
              }
            >
              <Icon name="refresh-outline" size={20} color={C.muted} />
            </Pressable>
          </View>
          <Text style={u.body}>Chat is sent to OpenAI. API charges apply.</Text>
          <View style={u.divider} />
          <ScrollView
            ref={chatScroll}
            onContentSizeChange={() => chatScroll.current?.scrollToEnd({ animated: true })}
            style={{ maxHeight: 480 }}
            contentContainerStyle={{ gap: 16, paddingVertical: 8 }}
          >
            {s!.messages.length ? (
              s!.messages.map((msg, i) => (
                <View key={i} style={[st.bubble, msg.role === 'user' && st.userBubble]}>
                  <Text
                    style={[
                      u.caption,
                      { fontSize: 9, color: msg.role === 'user' ? '#C9DDCB' : C.green },
                    ]}
                  >
                    {msg.role === 'user' ? 'YOU' : 'AI'}
                  </Text>
                  <Text
                    selectable
                    style={{
                      fontSize: 14,
                      lineHeight: 23,
                      color: msg.role === 'user' ? '#fff' : C.ink,
                    }}
                  >
                    {msg.content}
                  </Text>
                </View>
              ))
            ) : (
              <View style={{ alignItems: 'center', paddingVertical: 24, gap: 16 }}>
                <Icon name="sparkles-outline" size={36} color={C.green} />
                <Text style={[u.h1, { fontSize: 29, textAlign: 'center' }]}>
                  Plan a purchase or trip
                </Text>

                <View style={[u.row, { flexWrap: 'wrap', justifyContent: 'center' }]}>
                  {['A trip to Hong Kong', 'A new TV for my home'].map((text) => (
                    <Button
                      small
                      secondary
                      key={text}
                      onPress={() => send(`I want to plan for ${text.toLowerCase()}.`)}
                      disabled={busy}
                    >
                      {text} ↗
                    </Button>
                  ))}
                </View>
              </View>
            )}
            {busy && (
              <View style={u.row}>
                <ActivityIndicator size="small" color={C.green} />
                <Text style={u.body}>Calculating…</Text>
              </View>
            )}
          </ScrollView>
          {sources.length > 0 && (
            <View style={{ gap: 8 }}>
              <Label>Research sources</Label>
              {sources.map((source, i) => (
                <Pressable
                  key={i}
                  accessibilityRole="link"
                  onPress={() => Linking.openURL(source.url)}
                >
                  <Text style={st.textLink}>{source.title} ↗</Text>
                </Pressable>
              ))}
            </View>
          )}
          {proposal?.proposal && (
            <Card style={{ backgroundColor: C.mint }}>
              <Text style={u.h2}>
                {proposal.proposal.emoji} {proposal.proposal.title}
              </Text>
              <Text style={u.amount}>
                {money(
                  Math.round(proposal.proposal.amount * units(proposal.currency)),
                  proposal.currency,
                )}
              </Text>
              {proposal.proposal.breakdown.map((line, i) => (
                <Text key={i} style={u.body}>
                  • {line}
                </Text>
              ))}
              <Button
                disabled={proposal.currency !== s!.currency}
                onPress={() => {
                  const p = proposal.proposal!;
                  open('goal', {
                    title: p.title,
                    amount: p.amount.toFixed(decimals(state.currency)),
                    date: p.deadline,
                    emoji: p.emoji,
                  });
                }}
              >
                Review & add savings goal
              </Button>
            </Card>
          )}
          <View style={[u.row, { alignItems: 'flex-end' }]}>
            <TextInput
              accessibilityLabel="Message your planner"
              multiline
              style={[u.input, { flex: 1, minHeight: 54, maxHeight: 130 }]}
              value={chatInput}
              onChangeText={setChatInput}
              placeholder="Describe a purchase or trip"
              placeholderTextColor={C.muted}
              maxLength={6000}
            />
            <Button disabled={busy || !chatInput.trim()} icon="arrow-up" onPress={() => send()}>
              Send
            </Button>
          </View>
        </Card>
      </>
    );
  }
  function tools() {
    return (
      <>
        {heading('Tools')}
        <View style={[st.grid, { flexDirection: columns ? 'row' : 'column' }]}>
          <View style={{ flex: columns ? 1 : undefined, minWidth: 0 }}>
            <ReceiptScanner batch={receipts} review={reviewReceipt} saveAll={saveReceipts} />
          </View>
          <Card style={{ flex: columns ? 1 : undefined, backgroundColor: C.mint }}>
            <View style={st.toolIcon}>
              <Icon name="sunny-outline" size={30} color={C.green} />
            </View>
            <Text style={u.h2}>Daily allowance</Text>
            <Text style={[u.h1, { fontSize: 44 }]}>{fmt(m.daily)}</Text>
            <Text style={u.body}>/ day · {m.days} days left</Text>
            <Text style={u.body}>Remaining spending ÷ days left.</Text>
            <View style={u.divider} />
            <Text style={u.h2}>Recurring bills</Text>
            <Text style={u.body}>
              {s!.bills.filter((b) => b.recurring).length} monthly commitments ·{' '}
              {fmt(s!.bills.filter((b) => b.recurring).reduce((a, b) => a + b.amount, 0) * 12)} a
              year.
            </Text>
            <Button secondary onPress={() => setTab('Plan')}>
              Review recurring outgoings
            </Button>
          </Card>
        </View>
      </>
    );
  }
  async function saveSettings() {
    try {
      update((old) => ({ ...old, apiUrl: validatedApiUrl(url) }));
      setNotice('Settings saved.');
    } catch (e) {
      setNotice(errorText(e));
    }
  }
  async function checkServer() {
    setChecking(true);
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url.replace(/\/$/, '') + '/health', {
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok || data.status !== 'ok') throw new Error('Server is not ready.');
      setNotice('Backend connected · device-only storage.');
    } catch {
      setNotice('Cannot reach this backend. Check its URL, Wi-Fi, and CORS configuration.');
    } finally {
      clearTimeout(timer);
      setChecking(false);
    }
  }
  function settings() {
    return (
      <>
        {heading('Settings')}
        <View style={{ gap: 20 }}>
          <Card>
            <Text style={u.h2}>Account</Text>
            <Text style={u.body}>{session.email}</Text>
            <Button
              secondary
              onPress={() =>
                void queue.current.finally(() => signOut()).catch((e) => setNotice(errorText(e)))
              }
            >
              Sign out
            </Button>
            <View style={u.row}>
              <Button
                small
                secondary
                onPress={() =>
                  void sendVerification()
                    .then(() => setNotice('Verification email sent.'))
                    .catch((e) => setNotice(errorText(e)))
                }
              >
                Verify email
              </Button>
              <Button
                small
                secondary
                onPress={() =>
                  void getAccessToken(true)
                    .then(() => setNotice('Session refreshed.'))
                    .catch((e) => setNotice(errorText(e)))
                }
              >
                Refresh session
              </Button>
            </View>
            <Text style={u.h2}>Service region</Text>
            <View style={u.row}>
              {Object.entries(regionEndpoints)
                .filter(([, v]) => !!v)
                .map(([region, endpoint]) => (
                  <Button
                    key={region}
                    small
                    secondary
                    onPress={() => {
                      setUrl(endpoint!);
                      update((old) => ({ ...old, apiUrl: validatedApiUrl(endpoint!) }));
                    }}
                  >
                    {region}
                  </Button>
                ))}
            </View>
            <Text style={u.h2}>AI mode</Text>
            <View style={u.row}>
              {(['planning', 'conversation'] as const).map((aiMode) => (
                <Button
                  key={aiMode}
                  small
                  secondary
                  onPress={() => update((old) => ({ ...old, aiMode }))}
                >
                  {aiMode === 'planning' ? 'Planning' : 'Conversation'}
                </Button>
              ))}
            </View>
            {__DEV__ && (
              <Field
                label="Backend URL"
                value={url}
                onChangeText={setUrl}
                keyboardType="url"
                placeholder="http://192.168.1.10:8000"
              />
            )}
            <View style={u.between}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={st.bold}>Research prices on the web</Text>
              </View>
              <Switch
                accessibilityLabel="Research prices on the web"
                value={s!.research}
                onValueChange={(research) => update((old) => ({ ...old, research }))}
                trackColor={{ true: C.green, false: C.line }}
              />
            </View>
            <View style={[u.row, { flexWrap: 'wrap' }]}>
              <Button onPress={saveSettings}>Save connection</Button>
              <Button secondary disabled={checking} onPress={checkServer}>
                {checking ? 'Checking…' : 'Test backend'}
              </Button>
            </View>
          </Card>
          <Card>
            <Text style={u.h2}>Currencies</Text>
            <Text style={u.body}>Budget: {state.currency}. Reports use the display currency.</Text>
            <CurrencyPicker
              label="Display currency"
              value={state.displayCurrency || state.currency}
              onChange={(displayCurrency) => update((old) => ({ ...old, displayCurrency }))}
            />
            <Text style={u.body}>
              {state.fx?.base === state.currency
                ? `${state.fx.source} market estimates · fetched ${new Date(state.fx.fetchedAt).toLocaleString()}`
                : 'No exchange rates saved yet.'}
            </Text>
            {!!fx.error && (
              <Text accessibilityRole="alert" style={st.error}>
                {fx.error}
              </Text>
            )}
            <Button secondary disabled={fx.loading} onPress={() => void fx.refresh()}>
              {fx.loading ? 'Refreshing rates…' : 'Refresh rates'}
            </Button>
            <Text style={u.body}>
              Refreshes every 60s. Estimated rates; fees excluded. Saved conversions stay fixed.
            </Text>
            {!(state.income || state.entries.length || state.bills.length || state.goals.length) ? (
              <CurrencyPicker
                label="Budget currency"
                value={state.currency}
                onChange={(currency) =>
                  update((old) => ({ ...old, currency, displayCurrency: currency, fx: undefined }))
                }
              />
            ) : (
              <Text style={u.body}>Budget currency: {state.currency} (fixed).</Text>
            )}
          </Card>
          <Card>
            <Text style={u.h2}>Local data</Text>
            <Text style={u.body}>
              Stored on this device. No cloud backup. Uninstalling or clearing storage may delete
              data.
            </Text>
            {!!storageError && (
              <Button secondary onPress={() => update((old) => ({ ...old }))}>
                Retry saving local data
              </Button>
            )}
            <Button
              secondary
              onPress={() =>
                setConfirm({
                  title: 'Reset this device’s budget?',
                  body: 'This permanently removes local activity, goals, bills, conversations, on this account. It cannot be undone.',
                  action: () => {
                    void queue.current
                      .catch(() => {})
                      .then(() => {
                        receipts.clear(true);
                        setS({ ...initialState, apiUrl: state.apiUrl, aiMode: state.aiMode });
                        setProposal(null);
                        setSources([]);
                        setTab('Overview');
                      })
                      .catch((e) => setNotice(errorText(e)));
                  },
                })
              }
            >
              Reset all local data
            </Button>
          </Card>
        </View>
      </>
    );
  }
  const renderPage = (page: Tab) =>
    page === 'Overview'
      ? overview()
      : page === 'Activity'
        ? activity()
        : page === 'Plan'
          ? plan()
          : page === 'AI planner'
            ? planner()
            : page === 'Tools'
              ? tools()
              : settings();
  return (
    <SafeAreaView style={st.safe} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar style="dark" />
      <View style={st.shell}>
        {wide && (
          <View style={st.sidebar}>
            <View style={st.brand}>
              <View style={st.logo}>
                <Icon name="wallet-outline" color="#D8EDAE" size={25} />
              </View>
              <Text style={st.brandText}>Budget</Text>
            </View>

            <View style={{ gap: 5 }}>
              {tabs.map((nav) => (
                <Pressable
                  key={nav.name}
                  accessibilityRole="button"
                  accessibilityLabel={nav.name}
                  onPress={() => setTab(nav.name)}
                  style={[st.navItem, tab === nav.name && st.navActive]}
                >
                  <Icon name={nav.icon} size={19} color={tab === nav.name ? C.green : C.muted} />
                  <Text
                    style={[st.navText, tab === nav.name && { color: C.green, fontWeight: '600' }]}
                  >
                    {nav.name}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={{ flex: 1 }} />
            <Text style={[u.body, { padding: 12 }]}>Local storage · {s.currency}</Text>
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          {!wide && (
            <View style={st.mobileHeader}>
              <View style={u.row}>
                <Icon name="wallet-outline" color={C.green} size={23} />
                <Text style={[st.brandText, { fontSize: 25 }]}>Budget</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open settings"
                onPress={() => setTab('Settings')}
              >
                <Icon name="settings-outline" color={C.green} />
              </Pressable>
            </View>
          )}
          {!!storageError && (
            <View style={st.warning}>
              <Text accessibilityRole="alert" style={{ color: C.red, fontSize: 12 }}>
                {storageError}
              </Text>
            </View>
          )}
          <ScrollView
            key={tab}
            testID="page-scroll"
            style={{ flex: 1 }}
            contentContainerStyle={{
              padding: wide ? 32 : 16,
              paddingTop: wide ? 38 : 18,
              paddingBottom: 38,
            }}
          >
            <View style={{ maxWidth: 1100, minWidth: 0, width: '100%', alignSelf: 'center' }}>
              <View style={[u.row, { flexWrap: 'wrap', marginBottom: 20 }]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Change display currency"
                  onPress={() => setTab('Settings')}
                  style={st.chip}
                >
                  <Text style={st.chipText}>
                    Viewing {state.displayCurrency || state.currency} · Budget {state.currency} ⌄
                  </Text>
                </Pressable>
                <Text style={u.body}>
                  {(state.displayCurrency || state.currency) !== state.currency &&
                  !rateFor(state.fx, state.currency, state.displayCurrency!)
                    ? `Rate unavailable · totals shown in ${state.currency}`
                    : state.fx
                      ? `${fx.error || !freshQuote(state.fx) ? 'Cached' : 'Live estimate'} · fetched ${new Date(state.fx.fetchedAt).toLocaleTimeString()}`
                      : fx.loading
                        ? 'Fetching live rates…'
                        : 'Rates unavailable · budget currency only'}
                </Text>
              </View>
              <PageContext.Provider value={renderPage}>
                <Slot />
              </PageContext.Provider>
            </View>
          </ScrollView>
          {!wide && (
            <View
              style={{
                minHeight: 70,
                paddingVertical: 10,
                flexShrink: 0,
                flexDirection: 'row',
                borderTopWidth: 1,
                borderColor: C.line,
                backgroundColor: C.paper,
                alignItems: 'center',
              }}
            >
              {tabs
                .filter((nav) => nav.name !== 'Settings')
                .map((nav) => (
                  <Pressable
                    key={nav.name}
                    accessibilityRole="button"
                    accessibilityLabel={nav.name}
                    onPress={() => setTab(nav.name)}
                    style={{
                      flex: 1,
                      minHeight: 48,
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 5,
                      paddingHorizontal: 3,
                    }}
                  >
                    <Icon
                      name={nav.icon}
                      size={21}
                      color={tab === nav.name ? C.green : '#9AA29C'}
                    />
                    <Text style={{ fontSize: 9, color: tab === nav.name ? C.green : C.muted }}>
                      {nav.name === 'Plan'
                        ? 'Plan'
                        : nav.name === 'AI planner'
                          ? 'Planner'
                          : nav.name}
                    </Text>
                  </Pressable>
                ))}
            </View>
          )}
        </View>
      </View>
      {!!notice && (
        <Pressable accessibilityRole="alert" onPress={() => setNotice('')} style={st.toast}>
          <Text style={{ fontSize: 13, color: '#fff', lineHeight: 20, flex: 1 }}>{notice}</Text>
          <Icon name="close-outline" color="#fff" size={18} />
        </Pressable>
      )}
      <Modal
        visible={!!form}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setForm(null);
          setScanNote('');
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={st.overlay}
        >
          <View style={st.modal} testID="budget-modal">
            <View
              style={[
                u.between,
                {
                  padding: compact ? 16 : 24,
                  paddingBottom: 4,
                  flexWrap: 'nowrap',
                  alignItems: 'flex-start',
                },
              ]}
            >
              <Text style={u.h2}>
                {form?.existing ? 'Edit' : form?.type === 'plan' ? 'Set up' : 'Add'}{' '}
                {form?.type === 'entry'
                  ? 'an entry'
                  : form?.type === 'bill'
                    ? 'an outgoing'
                    : form?.type === 'goal'
                      ? 'a savings goal'
                      : 'your monthly plan'}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close form"
                onPress={() => {
                  setForm(null);
                  setScanNote('');
                }}
                hitSlop={10}
              >
                <Icon name="close" />
              </Pressable>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ padding: compact ? 16 : 24, gap: 16 }}
            >
              {form && (
                <>
                  {!!scanNote && <Text style={u.body}>Receipt review: {scanNote}</Text>}
                  {form.type === 'entry' && (
                    <View style={[u.row, { flexWrap: 'wrap' }]}>
                      {(['expense', 'income', 'saving'] as Kind[]).map((kind) => (
                        <Pressable
                          accessibilityRole="button"
                          key={kind}
                          style={[st.chip, form.kind === kind && st.activeChip]}
                          onPress={() => setForm({ ...form, kind })}
                        >
                          <Text style={st.chipText}>
                            {kind === 'saving'
                              ? 'Savings'
                              : kind === 'income'
                                ? 'Income'
                                : 'Expense'}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                  {form.type !== 'plan' && (
                    <Field
                      label="Name"
                      value={form.title}
                      onChangeText={(title) => setForm({ ...form, title })}
                      placeholder={form.type === 'goal' ? 'Goal name' : 'Entry name'}
                    />
                  )}
                  {form.type === 'entry' && (
                    <CurrencyPicker
                      label="Entry currency"
                      value={form.currency}
                      onChange={(currency) => setForm({ ...form, currency, exchangeRate: '' })}
                    />
                  )}
                  <Text style={u.body}>
                    Currency: {form.type === 'entry' ? form.currency : state.currency}
                  </Text>
                  <Field
                    label={
                      form.type === 'plan'
                        ? 'Monthly take-home income'
                        : form.type === 'goal'
                          ? 'Target amount'
                          : 'Amount'
                    }
                    value={form.amount}
                    onChangeText={(amount) => setForm({ ...form, amount })}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                  />
                  {foreignEntry && (
                    <Card style={{ padding: 16, backgroundColor: C.mint }}>
                      <Text style={u.h2}>Review the conversion</Text>
                      <Text style={u.body}>
                        {selectedRate && Number.isFinite(selectedRate) && selectedRate > 0
                          ? `1 ${form.currency} = ${selectedRate.toPrecision(7)} ${state.currency}`
                          : 'No rate available yet.'}
                      </Text>
                      <Text style={u.body}>
                        {form.exchangeRate.trim()
                          ? 'Saved or entered rate.'
                          : freshQuote(state.fx)
                            ? `${state.fx!.source} estimate · fetched ${new Date(state.fx!.fetchedAt).toLocaleTimeString()}`
                            : 'Rates expired. Refresh or enter a rate.'}
                      </Text>
                      <Field
                        label={`Exchange rate (${state.currency} per 1 ${form.currency}, optional)`}
                        value={form.exchangeRate}
                        onChangeText={(exchangeRate) => setForm({ ...form, exchangeRate })}
                        keyboardType="decimal-pad"
                        placeholder="Use the current estimate"
                      />
                      <Button
                        small
                        secondary
                        disabled={fx.loading}
                        onPress={() => void fx.refresh()}
                      >
                        {fx.loading ? 'Refreshing rates…' : 'Refresh exchange rate'}
                      </Button>
                      {(() => {
                        try {
                          if (!selectedRate) return null;
                          const amount = convertMinor(
                            parseAmount(form.amount, form.currency),
                            form.currency,
                            state.currency,
                            selectedRate,
                          );
                          return <Text style={st.bold}>Budget impact: {budgetMoney(amount)}</Text>;
                        } catch {
                          return null;
                        }
                      })()}
                      <Text style={u.body}>Rate locks on save. Add bank fees separately.</Text>
                    </Card>
                  )}
                  {form.type !== 'plan' && (
                    <Field
                      label={form.type === 'goal' ? 'Deadline (YYYY-MM-DD)' : 'Date (YYYY-MM-DD)'}
                      value={form.date}
                      onChangeText={(date) => setForm({ ...form, date })}
                      placeholder="YYYY-MM-DD"
                    />
                  )}
                  {form.type === 'entry' && form.kind === 'expense' && (
                    <>
                      <Label>Category</Label>
                      <View style={[u.row, { flexWrap: 'wrap' }]}>
                        {categories.map((category) => (
                          <Pressable
                            key={category}
                            accessibilityRole="button"
                            style={[st.chip, form.category === category && st.activeChip]}
                            onPress={() => setForm({ ...form, category })}
                          >
                            <Text style={st.chipText}>{category}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </>
                  )}
                  {form.type === 'entry' && form.kind === 'saving' && (
                    <>
                      <Label>Savings goal</Label>
                      <View style={{ gap: 8 }}>
                        {s.goals.length ? (
                          s.goals.map((g) => (
                            <Pressable
                              key={g.id}
                              accessibilityRole="button"
                              style={[st.chip, form.goalId === g.id && st.activeChip]}
                              onPress={() => setForm({ ...form, goalId: g.id })}
                            >
                              <Text style={st.chipText}>
                                {g.emoji} {g.title}
                              </Text>
                            </Pressable>
                          ))
                        ) : (
                          <Text style={u.body}>
                            Create a savings goal before adding a contribution.
                          </Text>
                        )}
                      </View>
                    </>
                  )}
                  {form.type === 'bill' && (
                    <View style={u.between}>
                      <Text style={st.bold}>Repeat every month</Text>
                      <Switch
                        accessibilityLabel="Repeat every month"
                        value={form.recurring}
                        onValueChange={(recurring) => setForm({ ...form, recurring })}
                        trackColor={{ true: C.green }}
                      />
                    </View>
                  )}
                  {form.type === 'goal' && (
                    <>
                      <Field
                        label="Starting savings"
                        value={form.initial}
                        onChangeText={(initial) => setForm({ ...form, initial })}
                        keyboardType="decimal-pad"
                      />
                      <Field
                        label="Goal emoji"
                        value={form.emoji}
                        onChangeText={(emoji) => setForm({ ...form, emoji })}
                      />
                    </>
                  )}
                  {form.type === 'plan' && (
                    <>
                      <Field
                        label="Savings percentage (0–100)"
                        value={form.percent}
                        onChangeText={(percent) => setForm({ ...form, percent })}
                        keyboardType="decimal-pad"
                      />
                      <Text style={u.body}>Applied after bills. The rest funds spending.</Text>
                    </>
                  )}
                  {!!formError && (
                    <Text
                      accessibilityRole="alert"
                      style={{ color: C.red, fontSize: 13, lineHeight: 20 }}
                    >
                      {formError}
                    </Text>
                  )}
                  <Button
                    onPress={() => {
                      saveForm();
                    }}
                  >
                    {form.type === 'plan'
                      ? 'Save budget plan'
                      : form.type === 'goal'
                        ? 'Save goal'
                        : form.type === 'bill'
                          ? 'Save outgoing'
                          : 'Save entry'}
                  </Button>
                </>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <Modal
        visible={!!confirm}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirm(null)}
      >
        <View style={st.overlay}>
          <Card style={{ maxWidth: 430, width: '100%', padding: 26 }}>
            <Text style={u.h2}>{confirm?.title}</Text>
            <Text style={u.body}>{confirm?.body}</Text>
            <View style={[u.row, { justifyContent: 'flex-end' }]}>
              <Button secondary onPress={() => setConfirm(null)}>
                Cancel
              </Button>
              <Button
                onPress={() => {
                  confirm?.action();
                  setConfirm(null);
                }}
              >
                Continue
              </Button>
            </View>
          </Card>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
export default function App() {
  const auth = useAuth();
  return (
    <SafeAreaProvider>
      {auth.loading ? (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <ActivityIndicator />
        </View>
      ) : auth.session ? (
        <AppContent key={auth.session.uid} session={auth.session} />
      ) : (
        <AuthScreen />
      )}
    </SafeAreaProvider>
  );
}
const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  shell: { flex: 1, flexDirection: 'row' },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 18,
    padding: 30,
    backgroundColor: C.bg,
  },
  sidebar: {
    width: 224,
    padding: 18,
    paddingTop: 32,
    borderRightWidth: 1,
    borderColor: C.line,
    backgroundColor: '#FCFCF9',
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    padding: 14,
    paddingTop: 0,
    paddingBottom: 30,
  },
  logo: {
    width: 39,
    height: 43,
    borderRadius: 13,
    backgroundColor: C.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: {
    fontSize: 24,
    letterSpacing: -0.5,
    fontWeight: '600',
    color: C.ink,
  },
  navItem: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
  },
  navActive: { backgroundColor: C.mint },
  navText: { fontSize: 12, color: C.muted },
  newTag: {
    backgroundColor: '#D9E9C9',
    paddingHorizontal: 5,
    paddingVertical: 3,
    borderRadius: 4,
    marginLeft: 'auto',
  },
  sidebarNote: { backgroundColor: '#EEF2E9', padding: 16, borderRadius: 16, gap: 11 },
  avatar: {
    width: 33,
    height: 33,
    borderRadius: 20,
    backgroundColor: C.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileHeader: {
    minHeight: 62,
    flexShrink: 0,
    paddingVertical: 12,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderColor: C.line,
    backgroundColor: '#FCFCF9',
  },
  grid: { gap: 20, alignItems: 'stretch' },
  month: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: '#fff',
    marginTop: 22,
  },
  hero: { backgroundColor: C.ink, borderRadius: 23, padding: 25, gap: 15, minWidth: 0 },
  heroBadge: { flexDirection: 'row', flexShrink: 1, gap: 5, alignItems: 'center' },
  heroAmount: { fontSize: 49, fontWeight: '400', color: '#fff', letterSpacing: -2.4, marginTop: 8 },
  heroLine: { height: 1, backgroundColor: '#466052', marginVertical: 3 },
  entry: { paddingVertical: 12, borderBottomWidth: 1, borderColor: '#F0F2EC' },
  entryIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.mint,
  },
  entryTitle: { fontSize: 13, lineHeight: 20, fontWeight: '500', color: C.ink, flexShrink: 1 },
  entryMeta: { fontSize: 10, lineHeight: 16, color: C.muted, flexShrink: 1 },
  textLink: { fontSize: 11, fontWeight: '600', color: C.green, lineHeight: 18 },
  emoji: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bold: { fontSize: 13, lineHeight: 20, fontWeight: '600', color: C.ink, flexShrink: 1 },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.line,
  },
  activeChip: { backgroundColor: C.mint, borderColor: '#B5D1BA' },
  chipText: { fontSize: 12, lineHeight: 18, color: C.ink, flexShrink: 1 },
  error: { fontSize: 13, lineHeight: 21, color: C.red },
  warning: { padding: 16, borderRadius: 12, backgroundColor: C.pink, marginBottom: 16 },
  bubble: {
    alignSelf: 'flex-start',
    maxWidth: '94%',
    padding: 18,
    gap: 9,
    borderRadius: 16,
    backgroundColor: C.bg,
  },
  userBubble: { alignSelf: 'flex-end', backgroundColor: C.ink },
  toolIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: C.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'rgba(21,40,29,.42)',
  },
  modal: {
    backgroundColor: C.paper,
    borderRadius: 24,
    width: '100%',
    maxWidth: 500,
    maxHeight: '90%',
    overflow: 'hidden',
  },
  toast: {
    position: 'absolute',
    bottom: 94,
    alignSelf: 'center',
    maxWidth: 540,
    width: '90%',
    borderRadius: 15,
    padding: 18,
    backgroundColor: C.ink,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    ...Platform.select({
      web: { boxShadow: '0 8px 30px #0002' } as any,
      default: { elevation: 8 },
    }),
  },
});
