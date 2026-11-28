export const expenseCategories = [
  'Food & drinks',
  'Groceries',
  'Transport',
  'Shopping',
  'Health',
  'Entertainment',
  'Other',
] as const;
export type ExpenseCategory = string;
export function activeCategories(state: { expenseCategories?: string[] }): string[] {
  return state.expenseCategories || [...expenseCategories];
}
export function validateCategories(values: string[]): string[] {
  if (!values.length || values.length > 24) throw new Error('Keep between 1 and 24 categories.');
  const normalized = values.map((v) => v.normalize('NFKC').trim());
  if (normalized.some((v) => !v || v.length > 32 || /[\u0000-\u001f]/.test(v)))
    throw new Error('Use category names between 1 and 32 characters.');
  if (new Set(normalized.map((v) => v.toLocaleLowerCase('en'))).size !== normalized.length)
    throw new Error('That category already exists.');
  return normalized;
}
export type DeviceAiAvailability = {
  available: boolean;
  reason?: string;
  provider?: 'system' | 'downloaded';
  model?: string;
  download?: 'waiting' | 'downloading' | 'verifying' | 'ready' | 'paused' | 'error';
  progress?: number;
};
export type Classification =
  | { status: 'classified'; category: ExpenseCategory; reason?: string }
  | { status: 'needs-input' | 'unavailable'; reason: string };
export type ReceiptClassification = Classification & { approved?: boolean };
export function isExpenseCategory(
  value: unknown,
  categories: readonly string[] = expenseCategories,
): value is ExpenseCategory {
  return typeof value === 'string' && categories.includes(value);
}
// Invalid model output is never replaced with a keyword/category heuristic.
export function validateClassification(value: unknown): Classification {
  if (value && typeof value === 'object') {
    const result = value as Record<string, unknown>;
    if (result.status === 'classified' && isExpenseCategory(result.category))
      return { status: 'classified', category: result.category };
    if (result.status === 'unavailable' || result.status === 'needs-input')
      return {
        status: result.status,
        reason:
          typeof result.reason === 'string' ? result.reason.slice(0, 160) : 'Choose a category.',
      };
  }
  return { status: 'needs-input', reason: 'Choose a category.' };
}

type CategoryDraft = {
  type: string;
  kind: string;
  title: string;
  category: string;
  categoryEdited: boolean;
};
export function applyCategorySuggestion<T extends CategoryDraft>(
  draft: T | null,
  requestedText: string,
  category: ExpenseCategory,
): T | null {
  if (
    !draft ||
    draft.type !== 'entry' ||
    draft.kind !== 'expense' ||
    draft.categoryEdited ||
    draft.title !== requestedText
  )
    return draft;
  return { ...draft, category };
}
