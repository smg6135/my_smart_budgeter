export const expenseCategories = [
  'Food & drinks',
  'Groceries',
  'Transport',
  'Shopping',
  'Health',
  'Entertainment',
  'Other',
] as const;
export type ExpenseCategory = (typeof expenseCategories)[number];
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
export function isExpenseCategory(value: unknown): value is ExpenseCategory {
  return typeof value === 'string' && (expenseCategories as readonly string[]).includes(value);
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
