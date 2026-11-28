export type SavedBudget = { key: string; uid: string; local: boolean; label: string };
const guestKey = 'pocket-budget.local.v1';
const prefix = 'pocket-budget.v2.';
export function budgetChoices(keys: readonly string[], saved: string | null, uid?: string) {
  const guest: SavedBudget = {
    key: guestKey,
    uid: 'local-budget',
    local: true,
    label: 'Local budget',
  };
  const budgets = [guest];
  for (const key of [...keys].sort()) {
    if (!key.startsWith(prefix)) continue;
    try {
      const accountUid = decodeURIComponent(key.slice(prefix.length));
      // Only canonical keys can be opened by the existing persistence adapter.
      if (!accountUid || prefix + encodeURIComponent(accountUid) !== key) continue;
      budgets.push({ key, uid: accountUid, local: false, label: `Saved budget ${budgets.length}` });
    } catch {}
  }
  const selected =
    budgets.find((b) => b.key === saved) ||
    budgets.find((b) => !b.local && b.uid === uid) ||
    (keys.includes(guestKey) ? guest : budgets[1]) ||
    guest;
  return { budgets, selected };
}
