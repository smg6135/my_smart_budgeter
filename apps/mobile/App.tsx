import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
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
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import {
  Bill,
  BudgetPlan,
  Entry,
  Goal,
  id,
  initialState,
  Kind,
  Message,
  money,
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
import { useKeyboardVisible } from './src/hooks/use-keyboard-visible';
import { useExchangeRates } from './src/hooks/use-exchange-rates';
import {
  addPlan,
  editPlan,
  migratePlans,
  planAtDate,
  projectPlan,
  setPlanStatus,
} from './src/plans';
import { Select } from './src/components/select';
import { BudgetCalendar } from './src/components/budget-calendar';
import { CurrencyPicker } from './src/components/currency-picker';
import { load, persist, removeLegacyProviderKey } from './src/storage';
import { ChatResult } from './src/api';
import { chatOnDevice } from './src/lib/device-ai';
import { useDeviceAi } from './src/hooks/use-device-ai';
import { useEntryClassification } from './src/hooks/use-entry-classification';
import { expenseCategories } from './src/classification';
import { useReceipts } from './src/hooks/use-receipts';
import { ReceiptScanner } from './src/components/receipt-scanner';
import { prepareReceiptImport, undoReceiptImport, ReceiptJob } from './src/receipts';
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
import { Session, signOut, authConfigured } from './src/lib/auth';
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
  categoryEdited: boolean;
  goalId: string;
  recurring: boolean;
  initial: string;
  emoji: string;
  percent: string;
  currency: string;
  exchangeRate: string;
  planId: string;
  activate: boolean;
};
const tabs: { name: Tab; icon: IconName }[] = [
  { name: 'Overview', icon: 'grid-outline' },
  { name: 'Activity', icon: 'swap-horizontal-outline' },
  { name: 'Plan', icon: 'pie-chart-outline' },
  { name: 'AI planner', icon: 'sparkles-outline' },
  { name: 'Tools', icon: 'scan-outline' },
  { name: 'Settings', icon: 'settings-outline' },
];
const categories = [...expenseCategories];
const errorText = (e: unknown) =>
  e instanceof Error ? e.message : 'Something went wrong. Please retry.';
function AppContent({ session, onSignIn }: { session: Session; onSignIn?: () => void }) {
  const { width, fontScale } = useWindowDimensions(),
    wide = width >= 1100 && fontScale < 1.4,
    columns = width >= 900 && fontScale < 1.25,
    compact = width < 420 || fontScale > 1.15;
  const localBudget = !!onSignIn;
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  const pathname = usePathname(),
    router = useRouter();
  const tab = (Object.keys(routes) as Tab[]).find((k) => routes[k] === pathname) || 'Overview';
  function setTab(next: Tab) {
    if (next === 'Plan') setSelectedPlanId(null);
    Keyboard.dismiss();
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
    [chatInputHeight, setChatInputHeight] = useState(54),
    [chatAvailableHeight, setChatAvailableHeight] = useState(0),
    [proposal, setProposal] = useState<(ChatResult & { currency: string }) | null>(null),
    [sources, setSources] = useState<ChatResult['sources']>([]),
    [filters, setFilters] = useState({ kind: 'All', category: 'All', from: '', to: '' }),
    [draftFilters, setDraftFilters] = useState({ kind: 'All', category: 'All', from: '', to: '' }),
    [selectedDate, setSelectedDate] = useState(today()),
    [selectedPlanId, setSelectedPlanId] = useState<string | null>(null),
    [addingCurrency, setAddingCurrency] = useState(false),
    [scanNote, setScanNote] = useState('');
  const [receiptUndo, setReceiptUndo] = useState<{ entries: Entry[]; jobs: ReceiptJob[] } | null>(
    null,
  );
  const receipts = useReceipts(s, setNotice, (jobs) => addReceiptJobs(jobs, true));
  const deviceAi = useDeviceAi();
  const entryClassification = useEntryClassification(
    form?.title,
    !!form &&
      form.type === 'entry' &&
      form.kind === 'expense' &&
      !form.categoryEdited &&
      deviceAi.available,
    (category, title) =>
      setForm((old) =>
        old &&
        old.type === 'entry' &&
        old.kind === 'expense' &&
        !old.categoryEdited &&
        old.title === title
          ? { ...old, category }
          : old,
      ),
  );
  const queue = useRef(Promise.resolve()),
    chatScroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  useEffect(() => {
    load(session.uid, localBudget)
      .then((data) => {
        setS(data);
      })
      .catch((e) => setFatal(errorText(e)));
    void removeLegacyProviderKey();
  }, [session.uid, localBudget]);
  useEffect(() => {
    if (!s) return;
    const snapshot = s;
    queue.current = queue.current
      .catch(() => {})
      .then(() => persist(snapshot, session.uid, localBudget))
      .then(() => setStorageError(''))
      .catch((e) =>
        setStorageError(
          'Could not save on this device. Keep the app open and retry from Settings. ' +
            errorText(e),
        ),
      );
  }, [s, session.uid, localBudget]);
  const fx = useExchangeRates(s?.currency, (quote) => update((old) => ({ ...old, fx: quote })));
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 4500);
    return () => clearTimeout(t);
  }, [notice]);
  function update(fn: (old: State) => State) {
    setS((old) => (old ? fn(old) : old));
  }
  function open(type: Form['type'], preset: Partial<Form> = {}) {
    Keyboard.dismiss();
    setFormError('');
    setForm({
      type,
      title: '',
      amount: '',
      date: type === 'goal' ? addMonths(3) : today(),
      kind: 'expense',
      category: 'Other',
      categoryEdited: !!preset.existing || !!preset.category,
      goalId: s?.goals[0]?.id || '',
      recurring: true,
      initial: '0',
      emoji: '🌱',
      percent: String(s?.savePercent ?? 30),
      currency: s?.displayCurrency || s?.currency || 'SGD',
      exchangeRate: '',
      planId:
        selectedPlanId && tab === 'Plan'
          ? selectedPlanId
          : s?.plans?.find((p) => p.status === 'active')?.id || '',
      activate: false,
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
  const selectedPlan = s.plans?.find((p) => p.id === selectedPlanId);
  const state = projectPlan(s, tab === 'Plan' && selectedPlan ? selectedPlan : undefined),
    m = summary(state),
    t = trajectory(state),
    fmt = (n: number) => displayAmount(n, s.currency, s.displayCurrency || s.currency, s.fx);
  const budgetMoney = (n: number) => money(n, s.currency, true);
  const foreignEntry =
    !!form &&
    form.type === 'entry' &&
    supportedCurrency(form.currency) &&
    form.currency !== s.currency;
  const autoRate = form ? rateFor(s.fx, s.currency, form.currency) : undefined;
  const selectedRate = form?.exchangeRate.trim()
    ? Number(form.exchangeRate)
    : autoRate
      ? 1 / autoRate
      : undefined;
  function changePlan(
    change: (plan: BudgetPlan) => BudgetPlan,
    planId = form?.planId ||
      (tab === 'Plan' ? selectedPlanId : undefined) ||
      s?.plans?.find((p) => p.status === 'active')?.id,
  ) {
    if (!planId) {
      setNotice('Create a plan first.');
      return;
    }
    update((old) => editPlan(old, planId, change));
  }
  function saveForm() {
    if (!form) return;
    try {
      const f = {
          ...form,
          date: form.type === 'entry' && !form.existing && !form.receiptId ? today() : form.date,
        },
        amount = parseAmount(f.amount, f.type === 'entry' ? f.currency : state.currency);
      if (f.type !== 'plan' && amount <= 0) throw new Error('Amount must be greater than zero.');
      if (f.type !== 'entry' && !f.title.trim()) throw new Error('Enter a name.');
      if ((f.type === 'goal' || f.type === 'bill') && !f.planId)
        throw new Error('Create or activate a plan first.');
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
          title:
            f.title.trim() ||
            (f.kind === 'expense' ? f.category : f.kind === 'income' ? 'Income' : 'Savings'),
          amount: booked,
          ...(original ? { original } : {}),
          ...(existing?.receiptFingerprint
            ? { receiptFingerprint: existing.receiptFingerprint }
            : {}),
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
        changePlan((old) => ({
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
        changePlan((old) => ({
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
        if (f.planId)
          changePlan(
            (old) => ({ ...old, name: f.title.trim(), income: amount, savePercent: percent }),
            f.planId,
          );
        else {
          const next = addPlan(state, f.title.trim(), amount, percent);
          const created = next.plans![next.plans!.length - 1];
          setS(f.activate ? setPlanStatus(next, created.id, 'active') : next);
          setSelectedPlanId(created.id);
        }
      }
      if (f.receiptId) {
        const scanned = receipts.jobs.find((job) => job.id === f.receiptId)?.result;
        receipts.patch(f.receiptId, {
          result: {
            notes: scanned?.notes || '',
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
        if (type === 'entry')
          update((old) => ({ ...old, entries: old.entries.filter((e) => e.id !== itemId) }));
        else
          changePlan((old) => ({
            ...old,
            ...(type === 'goal'
              ? { goals: old.goals.filter((g) => g.id !== itemId) }
              : { bills: old.bills.filter((b) => b.id !== itemId) }),
          }));
        setNotice('Deleted.');
      },
    });
  }
  async function send(text = chatInput) {
    if (busy || !text.trim()) return;
    if (!deviceAi.available) {
      setNotice(deviceAi.reason || 'On-device AI is unavailable.');
      return;
    }
    const messages: Message[] = [...state.messages, { role: 'user', content: text.trim() }];
    setBusy(true);
    setNotice('');
    setChatInput('');
    setChatInputHeight(54);
    setProposal(null);
    update((old) => ({ ...old, messages }));
    try {
      const result = await chatOnDevice(messages, state.currency);
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
  function addReceiptJobs(jobs: ReceiptJob[], automatic = false) {
    if (!s) return;
    const prepared = prepareReceiptImport(jobs, s, automatic);
    for (const [jobId, reviewError] of Object.entries(prepared.errors)) {
      receipts.patch(jobId, { reviewError, needsReview: true });
    }
    receipts.markDuplicate(prepared.duplicates);
    if (!prepared.entries.length) return;
    update((old) => ({
      ...old,
      entries: [
        ...prepared.entries.filter(
          (entry) =>
            !old.entries.some(
              (existing) =>
                existing.id === entry.id ||
                (!!entry.receiptFingerprint &&
                  existing.receiptFingerprint === entry.receiptFingerprint),
            ),
        ),
        ...old.entries,
      ],
    }));
    receipts.markSaved(prepared.saved);
    setReceiptUndo({
      entries: prepared.entries,
      jobs: jobs.filter((job) => prepared.saved.includes(job.id)),
    });
    setNotice(
      `Added ${prepared.entries.length} expense${prepared.entries.length === 1 ? '' : 's'}.`,
    );
  }
  function saveReceipts() {
    addReceiptJobs(receipts.jobs);
  }
  function undoReceipts() {
    if (!s || !receiptUndo) return;
    const undone = undoReceiptImport(s, receiptUndo.entries);
    setS(undone.state);
    receipts.closeReview();
    receipts.restore(
      receiptUndo.jobs.filter((job) => undone.removed.includes(`receipt-${job.id}`)),
    );
    setReceiptUndo(null);
    setNotice(undone.removed.length ? 'Receipt expenses removed.' : 'Edited expenses kept.');
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
              disabled={selectedPlan?.status !== 'active'}
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
    const historical = selectedDate < today();
    const viewState = historical ? planAtDate(s!, selectedDate) : projectPlan(s!);
    const totals = summary(viewState, selectedDate);
    const active = historical
      ? [...(s!.planHistory || [])].reverse().find((p) => p.from <= selectedDate)?.plan
      : s!.plans?.find((p) => p.status === 'active');
    const dayEntries = totals.entries.filter((e) => e.date === selectedDate);
    const stat = (value: number) => {
      const label = fmt(value);
      if (label.length <= 11) return label;
      const currency = state.displayCurrency || state.currency;
      const rate = rateFor(state.fx, state.currency, currency);
      const target = rate === undefined ? state.currency : currency;
      return new Intl.NumberFormat('en-SG', {
        style: 'currency',
        currency: target,
        notation: 'compact',
        maximumFractionDigits: 1,
      }).format(
        (rate === undefined ? value : convertMinor(value, state.currency, target, rate)) /
          units(target),
      );
    };
    const allocationCard = (
      <Card>
        <Text style={u.h2}>Allocation</Text>
        {[
          { label: 'Bills', amount: totals.fixed },
          { label: 'Spending', amount: totals.spendingBudget },
          { label: 'Savings', amount: totals.savingsBudget },
        ].map((item) => (
          <View key={item.label} style={{ gap: 8 }}>
            <View style={u.between}>
              <Text style={u.body}>{item.label}</Text>
              <Text style={st.bold}>{fmt(item.amount)}</Text>
            </View>
            <Progress value={totals.income ? (item.amount / totals.income) * 100 : 0} />
          </View>
        ))}
      </Card>
    );
    return (
      <>
        {heading('Overview')}
        {(state.displayCurrency || state.currency) !== state.currency &&
          !rateFor(state.fx, state.currency, state.displayCurrency!) && (
            <Text style={[u.body, { marginBottom: 16 }]}>
              Rate unavailable · totals shown in {state.currency}
            </Text>
          )}
        {!s!.plans?.some((p) => p.status === 'active') && !historical && (
          <Card style={{ backgroundColor: C.mint, marginBottom: 16 }}>
            <Text style={u.h2}>Monthly income</Text>
            <Button
              onPress={() =>
                open('plan', {
                  title: 'Monthly budget',
                  amount: '',
                  percent: '30',
                  planId: '',
                  activate: true,
                })
              }
            >
              Set budget
            </Button>
          </Card>
        )}
        <View style={[st.grid, { flexDirection: columns ? 'row' : 'column' }]}>
          <View style={{ flex: columns ? 1.4 : undefined, gap: 16, minWidth: 0 }}>
            <View style={st.hero}>
              <Text style={[u.caption, { color: '#BAD0BD', letterSpacing: 1 }]}>
                {historical ? 'MONTH SUMMARY' : 'REMAINING THIS MONTH'}
              </Text>
              <Text
                style={[
                  st.heroAmount,
                  { fontSize: compact ? 34 : 44, lineHeight: compact ? 46 : 58 },
                ]}
              >
                {fmt(totals.remaining)}
              </Text>
              <Text style={{ color: '#C2D5C5', fontSize: 12, lineHeight: 18 }}>
                {active?.name || 'No active plan'} · {state.displayCurrency || state.currency}
              </Text>
              {!historical && (
                <>
                  <View style={st.heroLine} />
                  <Text style={{ color: '#BAD0BD', fontSize: 12, lineHeight: 18 }}>
                    Daily allowance
                  </Text>
                  <Text
                    testID="daily-allowance"
                    style={{ color: '#fff', fontSize: 26, lineHeight: 36, flexShrink: 1 }}
                  >
                    {fmt(totals.daily)}
                    <Text style={{ fontSize: 12 }}> / day</Text>
                  </Text>
                  <Text style={{ color: '#BAD0BD', fontSize: 11, lineHeight: 17 }}>
                    {totals.days} days left
                  </Text>
                </>
              )}
            </View>
            <View
              testID="overview-statistics"
              style={{ flexDirection: 'row', gap: 8, alignItems: 'stretch' }}
            >
              {[
                { label: 'Income', value: totals.income },
                { label: 'Spent', value: totals.spending + totals.paid },
                { label: 'Saved', value: totals.saved },
              ].map((item) => (
                <Card key={item.label} style={{ flex: 1, padding: compact ? 10 : 16, gap: 8 }}>
                  <Text style={[u.body, { fontSize: 11 }]}>{item.label}</Text>
                  <Text
                    accessibilityLabel={`${item.label} ${fmt(item.value)}`}
                    style={{
                      color: C.ink,
                      fontSize: compact ? 14 : 19,
                      lineHeight: compact ? 22 : 28,
                      fontWeight: '600',
                      flexShrink: 1,
                    }}
                  >
                    {stat(item.value)}
                  </Text>
                </Card>
              ))}
            </View>
            {columns && allocationCard}
          </View>
          <View style={{ flex: columns ? 1 : undefined, gap: 16, minWidth: 0 }}>
            <BudgetCalendar date={selectedDate} onChange={setSelectedDate} entries={s!.entries} />
            <Card>
              <Text style={u.h2}>
                {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-SG', {
                  day: 'numeric',
                  month: 'long',
                })}
              </Text>
              <View style={u.between}>
                <Text style={u.body}>Spent</Text>
                <Text style={st.bold}>
                  {fmt(
                    dayEntries
                      .filter((e) => e.kind === 'expense')
                      .reduce((sum, e) => sum + e.amount, 0),
                  )}
                </Text>
              </View>
              {dayEntries.length ? (
                dayEntries.map(entryRow)
              ) : (
                <Text style={u.body}>No entries</Text>
              )}
            </Card>
            {!columns && allocationCard}
          </View>
        </View>
      </>
    );
  }
  function activity() {
    const entries = s!.entries
      .filter(
        (e) =>
          (filters.kind === 'All' || e.kind === filters.kind) &&
          (filters.category === 'All' || e.category === filters.category) &&
          (!filters.from || e.date >= filters.from) &&
          (!filters.to || e.date <= filters.to),
      )
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    return (
      <>
        {heading(
          'Activity',
          <Button icon="add" accessibilityLabel="Add an entry" onPress={() => open('entry')}>
            Entry
          </Button>,
        )}
        <Card>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Select
                label="Type"
                value={draftFilters.kind}
                onChange={(kind) => setDraftFilters({ ...draftFilters, kind })}
                options={[
                  { value: 'All', label: 'All' },
                  { value: 'expense', label: 'Expense' },
                  { value: 'income', label: 'Income' },
                  { value: 'saving', label: 'Savings' },
                ]}
              />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Select
                label="Category filter"
                value={draftFilters.category}
                onChange={(category) => setDraftFilters({ ...draftFilters, category })}
                options={['All', ...categories, 'Savings', 'Extra income', 'Bills'].map(
                  (value) => ({ value, label: value }),
                )}
              />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Field
                label="From date"
                value={draftFilters.from}
                onChangeText={(from) => setDraftFilters({ ...draftFilters, from })}
                placeholder="YYYY-MM-DD"
              />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Field
                label="To date"
                value={draftFilters.to}
                onChangeText={(to) => setDraftFilters({ ...draftFilters, to })}
                placeholder="YYYY-MM-DD"
              />
            </View>
          </View>
          <Button
            secondary
            onPress={() => {
              if (
                (draftFilters.from && !validDate(draftFilters.from)) ||
                (draftFilters.to && !validDate(draftFilters.to)) ||
                (draftFilters.from && draftFilters.to && draftFilters.from > draftFilters.to)
              ) {
                setNotice('Enter a valid date range.');
                return;
              }
              setFilters({ ...draftFilters });
            }}
          >
            Apply filters
          </Button>
          {entries.length ? entries.map(entryRow) : <Text style={u.body}>No entries</Text>}
        </Card>
      </>
    );
  }
  function plan() {
    if (!selectedPlan)
      return (
        <>
          {heading(
            'Plan & goals',
            <Button
              icon="add"
              onPress={() =>
                open('plan', { title: 'New plan', amount: '', percent: '30', planId: '' })
              }
            >
              New plan
            </Button>,
          )}
          <Card>
            {s!.plans?.length ? (
              s!.plans.map((item) => (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Open plan ${item.name}`}
                  onPress={() => setSelectedPlanId(item.id)}
                  style={{
                    paddingVertical: 16,
                    borderBottomWidth: 1,
                    borderColor: C.line,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                    <Text style={u.h2}>{item.name}</Text>
                    <Text style={u.body}>{fmt(item.income)} / month</Text>
                  </View>
                  <Pill tone={item.status === 'active' ? 'green' : 'neutral'}>
                    {item.status === 'active'
                      ? 'Active'
                      : item.status === 'draft'
                        ? 'Draft'
                        : 'Inactive'}
                  </Pill>
                  <Icon name="chevron-forward" size={18} color={C.muted} />
                </Pressable>
              ))
            ) : (
              <Text style={u.body}>No plans</Text>
            )}
          </Card>
        </>
      );
    return (
      <>
        {heading(
          selectedPlan.name,
          <View style={u.row}>
            <Button
              icon="create-outline"
              onPress={() =>
                open('plan', {
                  existing: selectedPlan.id,
                  title: selectedPlan.name,
                  amount: String(state.income / units(state.currency)),
                  percent: String(state.savePercent),
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
        <View style={[u.between, { marginBottom: 20 }]}>
          <Button small secondary onPress={() => setSelectedPlanId(null)}>
            All plans
          </Button>
          <View style={u.row}>
            <Pill tone={selectedPlan.status === 'active' ? 'green' : 'neutral'}>
              {selectedPlan.status === 'active'
                ? 'Active'
                : selectedPlan.status === 'draft'
                  ? 'Draft'
                  : 'Inactive'}
            </Pill>
            <Button
              small
              secondary
              onPress={() =>
                update((old) =>
                  setPlanStatus(
                    old,
                    selectedPlan.id,
                    selectedPlan.status === 'active' ? 'inactive' : 'active',
                  ),
                )
              }
            >
              {selectedPlan.status === 'active' ? 'Deactivate' : 'Activate'}
            </Button>
            {selectedPlan.status === 'inactive' && (
              <Button
                small
                secondary
                onPress={() => update((old) => setPlanStatus(old, selectedPlan.id, 'draft'))}
              >
                Move to draft
              </Button>
            )}
          </View>
        </View>
        {m.overcommitted && (
          <View style={st.warning}>
            <Text style={{ color: C.red }}>Bills exceed income by {fmt(m.fixed - m.income)}.</Text>
          </View>
        )}
        <View style={[st.grid, { flexDirection: columns ? 'row' : 'column' }]}>
          <Card style={{ flex: columns ? 1 : undefined }}>
            <Text style={u.caption}>INCOME</Text>
            <Text style={u.h2}>Monthly take-home income</Text>
            <Text style={u.amount}>{fmt(state.income)}</Text>
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
                style={{ flex: Math.max(0.001, 100 - state.savePercent), backgroundColor: C.ink }}
              />
              <View
                style={{ flex: Math.max(0.001, state.savePercent), backgroundColor: '#B8D883' }}
              />
            </View>
            <View style={u.between}>
              <Text style={st.bold}>{100 - state.savePercent}% spending</Text>
              <Text style={st.bold}>{state.savePercent}% savings</Text>
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
          {state.bills.length ? (
            state.bills.map((b) => {
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
                        disabled={selectedPlan.status !== 'active'}
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
                    : t.percent > state.savePercent
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
            {t.feasible && t.percent > state.savePercent && (
              <Button
                small
                onPress={() => {
                  changePlan((old) => ({ ...old, savePercent: t.percent }));
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
      </>
    );
  }
  function planner() {
    return (
      <View
        testID="planner-chat"
        onLayout={(event) => setChatAvailableHeight(event.nativeEvent.layout.height)}
        style={{ flex: 1, minHeight: 0 }}
      >
        <Text accessibilityRole="header" style={[u.h1, { marginBottom: 12, flexShrink: 0 }]}>
          AI planner
        </Text>
        <Card style={{ flex: 1, flexShrink: 1, minHeight: 0, padding: columns ? 20 : 14, gap: 12 }}>
          <View style={[u.between, { flexShrink: 0, flexWrap: 'nowrap', gap: 8 }]}>
            <Text style={[u.body, { flex: 1 }]}>
              {deviceAi.available ? 'On-device AI' : 'AI unavailable'}
            </Text>
            {keyboardVisible && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Dismiss keyboard"
                onPress={Keyboard.dismiss}
                style={st.iconButton}
              >
                <Icon name="chevron-down" color={C.muted} />
              </Pressable>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear conversation"
              disabled={busy}
              style={st.iconButton}
              onPress={() => {
                Keyboard.dismiss();
                setConfirm({
                  title: 'Clear chat?',
                  body: 'The current chat will be removed from this device. Saved goals stay in your budget.',
                  action: () => {
                    update((old) => ({ ...old, messages: [] }));
                    setProposal(null);
                    setSources([]);
                  },
                });
              }}
            >
              <Icon name="refresh-outline" size={20} color={C.muted} />
            </Pressable>
          </View>
          <ScrollView
            ref={chatScroll}
            testID="page-scroll"
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={
              Platform.OS === 'web' ? 'none' : Platform.OS === 'ios' ? 'interactive' : 'on-drag'
            }
            contentInsetAdjustmentBehavior="never"
            automaticallyAdjustContentInsets={false}
            automaticallyAdjustKeyboardInsets={false}
            onLayout={() => chatScroll.current?.scrollToEnd({ animated: false })}
            onContentSizeChange={() => chatScroll.current?.scrollToEnd({ animated: true })}
            style={{ flex: 1, minHeight: 0 }}
            contentContainerStyle={{ flexGrow: 1, gap: 16, paddingVertical: 8 }}
          >
            {!deviceAi.available && <Text style={u.body}>{deviceAi.reason}</Text>}
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
            {!!notice && (
              <Text accessibilityRole="alert" style={[u.body, { color: C.red }]}>
                {notice}
              </Text>
            )}
          </ScrollView>
          <View
            testID="chat-composer"
            style={{
              flexDirection: 'row',
              alignItems: 'flex-end',
              gap: 8,
              flexShrink: 0,
              minWidth: 0,
            }}
          >
            <TextInput
              accessibilityLabel="Message your planner"
              multiline
              style={[
                u.input,
                {
                  flex: 1,
                  width: undefined,
                  minHeight: 54,
                  height: Math.min(
                    chatInputHeight,
                    Math.max(54, Math.min(120, chatAvailableHeight * 0.3 || 120)),
                  ),
                  textAlignVertical: 'top',
                },
              ]}
              scrollEnabled
              onContentSizeChange={(event) =>
                setChatInputHeight(Math.max(54, event.nativeEvent.contentSize.height))
              }
              value={chatInput}
              onChangeText={setChatInput}
              placeholder="Describe a purchase or trip"
              placeholderTextColor={C.muted}
              maxLength={6000}
            />
            <Button
              disabled={busy || !chatInput.trim() || !deviceAi.available}
              icon="arrow-up"
              onPress={() => send()}
            >
              Send
            </Button>
          </View>
        </Card>
      </View>
    );
  }
  function tools() {
    return (
      <>
        {heading('Tools')}
        <View style={[st.grid, { flexDirection: columns ? 'row' : 'column' }]}>
          <View style={{ flex: columns ? 1 : undefined, minWidth: 0 }}>
            <ReceiptScanner
              batch={receipts}
              state={state}
              saveAll={saveReceipts}
              undo={receiptUndo ? undoReceipts : undefined}
            />
          </View>
          <Card style={{ flex: columns ? 1 : undefined, backgroundColor: C.mint }}>
            <View style={st.toolIcon}>
              <Icon name="sunny-outline" size={30} color={C.green} />
            </View>
            <Text style={u.h2}>Daily allowance</Text>
            <Text style={[u.amount, { fontSize: 36, lineHeight: 48 }]}>{fmt(m.daily)}</Text>
            <Text style={u.body}>/ day · {m.days} days left</Text>
            <Text style={u.body}>Remaining spending ÷ days left.</Text>
            <View style={u.divider} />
            <Text style={u.h2}>Recurring bills</Text>
            <Text style={u.body}>
              {state.bills.filter((b) => b.recurring).length} monthly commitments ·{' '}
              {fmt(state.bills.filter((b) => b.recurring).reduce((a, b) => a + b.amount, 0) * 12)} a
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
  function settings() {
    const currencies = state.preferredCurrencies || [state.currency];
    const available = CURRENCIES.filter((currency) => !currencies.includes(currency));
    return (
      <>
        {heading('Settings')}
        <View style={{ gap: 20 }}>
          <Card>
            <Text style={u.h2}>Currencies</Text>
            <Text style={u.body}>Choose the currencies used for entries and reports.</Text>
            {currencies.map((currency) => (
              <View key={currency} style={[u.between, { flexWrap: 'nowrap', minHeight: 48 }]}>
                <Text style={st.bold}>
                  {currency}
                  {currency === state.currency ? ' · Budget' : ''}
                </Text>
                {currency !== state.currency && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove currency ${currency}`}
                    style={st.iconButton}
                    onPress={() =>
                      update((old) => ({
                        ...old,
                        preferredCurrencies: old.preferredCurrencies?.filter(
                          (code) => code !== currency,
                        ),
                        displayCurrency:
                          old.displayCurrency === currency ? old.currency : old.displayCurrency,
                      }))
                    }
                  >
                    <Icon name="remove-circle-outline" color={C.muted} />
                  </Pressable>
                )}
              </View>
            ))}
            {available.length > 0 &&
              (addingCurrency ? (
                <CurrencyPicker
                  label="Add currency"
                  value=""
                  currencies={[...available]}
                  onChange={(currency) => {
                    update((old) => ({
                      ...old,
                      preferredCurrencies: [
                        ...(old.preferredCurrencies || [old.currency]),
                        currency,
                      ],
                    }));
                    setAddingCurrency(false);
                  }}
                />
              ) : (
                <Button secondary icon="add" onPress={() => setAddingCurrency(true)}>
                  Add currency
                </Button>
              ))}
            <CurrencyPicker
              label="Display currency"
              value={state.displayCurrency || state.currency}
              currencies={currencies}
              onChange={(displayCurrency) => update((old) => ({ ...old, displayCurrency }))}
            />
            {!(state.plans?.length || state.entries.length) && (
              <CurrencyPicker
                label="Budget currency"
                value={state.currency}
                currencies={currencies}
                onChange={(currency) =>
                  update((old) => ({ ...old, currency, displayCurrency: currency, fx: undefined }))
                }
              />
            )}
            <Text style={u.body}>
              {state.fx
                ? `${state.fx.source} · ${new Date(state.fx.fetchedAt).toLocaleTimeString()}`
                : 'Rates unavailable'}
              . Rates refresh every minute; saved conversions stay fixed.
            </Text>
            {!!fx.error && (
              <Text accessibilityRole="alert" style={st.error}>
                {fx.error}
              </Text>
            )}
            <Button secondary disabled={fx.loading} onPress={() => void fx.refresh()}>
              {fx.loading ? 'Refreshing…' : 'Refresh rates'}
            </Button>
          </Card>
          <Card>
            <Text style={u.h2}>On-device AI</Text>
            <Text style={u.body}>
              {deviceAi.available ? 'Available · Apple Intelligence' : deviceAi.reason}
            </Text>
            <Text style={u.body}>
              Categorizes entries and receipts after OCR. Chat stays on-device. No cloud AI or API
              keys.
            </Text>
          </Card>
          <Card>
            <Text style={u.h2}>Account</Text>
            {onSignIn ? (
              <>
                <Text style={u.body}>Local budget · no account required</Text>
                {authConfigured && (
                  <Button
                    secondary
                    onPress={() =>
                      void queue.current.finally(onSignIn).catch((e) => setNotice(errorText(e)))
                    }
                  >
                    Sign in to an existing budget
                  </Button>
                )}
              </>
            ) : (
              <Button
                secondary
                onPress={() =>
                  void queue.current.finally(() => signOut()).catch((e) => setNotice(errorText(e)))
                }
              >
                Sign out
              </Button>
            )}
          </Card>
          <Card>
            <Text style={u.h2}>Local data</Text>
            <Text style={u.body}>Budgets are stored on this device.</Text>
            {!!storageError && (
              <Button secondary onPress={() => update((old) => ({ ...old }))}>
                Retry saving local data
              </Button>
            )}
            <Button
              secondary
              danger
              onPress={() =>
                setConfirm({
                  title: 'Reset this device’s budget?',
                  body: 'Deletes all local entries, plans, goals and conversations. This cannot be undone.',
                  action: () => {
                    void queue.current
                      .catch(() => {})
                      .then(() => {
                        receipts.clear(true);
                        setReceiptUndo(null);
                        setS(
                          migratePlans({
                            ...initialState,
                            apiUrl: state.apiUrl,
                            aiMode: state.aiMode,
                          }),
                        );
                        setSelectedPlanId(null);
                        setSelectedDate(today());
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
    <SafeAreaView style={st.safe} edges={['top', 'left', 'right']}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={st.shell}
        behavior="padding"
        enabled={Platform.OS !== 'web' && tab === 'AI planner' && !form && !confirm}
        keyboardVerticalOffset={0}
      >
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
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          {!wide && !(tab === 'AI planner' && keyboardVisible) && (
            <View style={st.mobileHeader}>
              <View style={u.row}>
                <Icon name="wallet-outline" color={C.green} size={23} />
                <Text style={[st.brandText, { fontSize: 25 }]}>Budget</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                style={st.iconButton}
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
          {tab === 'AI planner' ? (
            <View
              style={{
                flex: 1,
                minHeight: 0,
                paddingHorizontal: wide ? 32 : 16,
                paddingTop: 12,
                paddingBottom: 12,
              }}
            >
              <View
                style={{
                  flex: 1,
                  minHeight: 0,
                  maxWidth: 1100,
                  width: '100%',
                  alignSelf: 'center',
                }}
              >
                <PageContext.Provider value={renderPage}>
                  <Slot />
                </PageContext.Provider>
              </View>
            </View>
          ) : (
            <ScrollView
              key={tab}
              testID="page-scroll"
              keyboardShouldPersistTaps="handled"
              style={{ flex: 1 }}
              contentInsetAdjustmentBehavior="never"
              automaticallyAdjustContentInsets={false}
              contentContainerStyle={{
                padding: wide ? 32 : 16,
                paddingTop: wide ? 38 : 18,
                paddingBottom: Platform.OS === 'web' ? 24 : 12,
              }}
            >
              <View style={{ maxWidth: 1100, minWidth: 0, width: '100%', alignSelf: 'center' }}>
                <PageContext.Provider value={renderPage}>
                  <Slot />
                </PageContext.Provider>
              </View>
            </ScrollView>
          )}
          {!wide && !(tab === 'AI planner' && keyboardVisible) && (
            <SafeAreaView
              edges={['bottom']}
              testID="bottom-navigation"
              style={{
                paddingTop: 6,
                paddingBottom: 0,
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
            </SafeAreaView>
          )}
        </View>
      </KeyboardAvoidingView>
      {!!notice && tab !== 'AI planner' && (
        <Pressable accessibilityRole="alert" onPress={() => setNotice('')} style={st.toast}>
          <Text style={{ fontSize: 13, color: '#fff', lineHeight: 20, flex: 1 }}>{notice}</Text>
          <Icon name="close-outline" color="#fff" size={18} />
        </Pressable>
      )}
      <Modal
        visible={!!form}
        transparent
        animationType={Platform.OS === 'web' ? 'none' : 'fade'}
        onRequestClose={() => {
          setForm(null);
          setScanNote('');
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[
            st.overlay,
            { paddingTop: Math.max(16, insets.top), paddingBottom: Math.max(12, insets.bottom) },
          ]}
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
                    <>
                      <View
                        testID="entry-amount-row"
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
                      >
                        <View style={{ width: 56 }}>
                          <Select
                            compact
                            label="Entry type"
                            value={form.kind}
                            onChange={(kind) => setForm({ ...form, kind: kind as Kind })}
                            options={
                              form.kind === 'saving'
                                ? [{ value: 'saving', label: '↗' }]
                                : [
                                    { value: 'expense', label: '−' },
                                    { value: 'income', label: '+' },
                                  ]
                            }
                          />
                        </View>
                        <TextInput
                          accessibilityLabel="Amount"
                          value={form.amount}
                          onChangeText={(amount) => setForm({ ...form, amount })}
                          keyboardType="decimal-pad"
                          placeholder="0.00"
                          placeholderTextColor={C.muted}
                          style={[
                            u.input,
                            {
                              flex: 1,
                              width: undefined,
                              fontSize: 22,
                              lineHeight: 30,
                              paddingHorizontal: 8,
                            },
                          ]}
                        />
                        <View style={{ width: 84 }}>
                          <CurrencyPicker
                            compact
                            label="Entry currency"
                            value={form.currency}
                            currencies={[
                              ...new Set([
                                ...(state.preferredCurrencies || [state.currency]),
                                ...(supportedCurrency(form.currency) ? [form.currency] : []),
                              ]),
                            ]}
                            onChange={(currency) =>
                              setForm({ ...form, currency, exchangeRate: '' })
                            }
                          />
                        </View>
                      </View>
                      {!form.existing && !form.receiptId && (
                        <Text style={u.body}>Today · {today()}</Text>
                      )}
                    </>
                  )}
                  <Field
                    label={form.type === 'plan' ? 'Plan name' : 'Name'}
                    value={form.title}
                    onChangeText={(title) =>
                      setForm({
                        ...form,
                        title,
                        ...(!form.categoryEdited ? { category: 'Other' } : {}),
                      })
                    }
                    placeholder={form.type === 'entry' ? 'Optional' : 'Name'}
                  />
                  {form.type !== 'entry' && (
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
                  )}
                  {foreignEntry && (
                    <Card style={{ padding: 16, backgroundColor: C.mint }}>
                      <Text style={u.h2}>Conversion</Text>
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
                    </Card>
                  )}
                  {(form.type === 'goal' ||
                    form.type === 'bill' ||
                    (form.type === 'entry' && !!form.receiptId)) && (
                    <Field
                      label={form.type === 'goal' ? 'Deadline (YYYY-MM-DD)' : 'Date (YYYY-MM-DD)'}
                      value={form.date}
                      onChangeText={(date) => setForm({ ...form, date })}
                      placeholder="YYYY-MM-DD"
                    />
                  )}
                  {form.type === 'entry' && form.kind === 'expense' && (
                    <Select
                      label="Category"
                      value={form.category}
                      options={categories.map((value) => ({ value, label: value }))}
                      onChange={(category) => setForm({ ...form, category, categoryEdited: true })}
                    />
                  )}
                  {form.type === 'entry' &&
                    form.kind === 'expense' &&
                    entryClassification?.status === 'working' && (
                      <Text style={u.body}>Categorizing on-device…</Text>
                    )}
                  {form.type === 'entry' &&
                    form.kind === 'expense' &&
                    entryClassification &&
                    ['unavailable', 'needs-input'].includes(entryClassification.status) && (
                      <Text style={u.body}>Choose a category manually.</Text>
                    )}
                  {form.type === 'entry' && form.kind === 'saving' && (
                    <Select
                      label="Savings goal"
                      value={form.goalId}
                      options={state.goals.map((g) => ({ value: g.id, label: g.title }))}
                      onChange={(goalId) => setForm({ ...form, goalId })}
                    />
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
                    disabled={entryClassification?.status === 'working'}
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
        animationType={Platform.OS === 'web' ? 'none' : 'fade'}
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
const localSession: Session = {
  uid: 'local-budget',
  email: '',
  idToken: '',
  refreshToken: '',
  expiresAt: Number.MAX_SAFE_INTEGER,
};
export default function App() {
  const auth = useAuth();
  const [showAuth, setShowAuth] = useState(false);
  return (
    <SafeAreaProvider>
      {auth.loading ? (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <ActivityIndicator />
        </View>
      ) : auth.session ? (
        <AppContent key={auth.session.uid} session={auth.session} />
      ) : showAuth ? (
        <AuthScreen onUseLocal={() => setShowAuth(false)} />
      ) : (
        <AppContent key="local-budget" session={localSession} onSignIn={() => setShowAuth(true)} />
      )}
    </SafeAreaProvider>
  );
}
const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  shell: { flex: 1, flexDirection: 'row' },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
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
  hero: { backgroundColor: C.ink, borderRadius: 23, padding: 20, gap: 8, minWidth: 0 },
  heroBadge: { flexDirection: 'row', flexShrink: 1, gap: 5, alignItems: 'center' },
  heroAmount: {
    fontWeight: '400',
    color: '#fff',
    letterSpacing: -1.5,
    minWidth: 0,
    maxWidth: '100%',
    flexShrink: 1,
  },
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
    maxHeight: '100%',
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
