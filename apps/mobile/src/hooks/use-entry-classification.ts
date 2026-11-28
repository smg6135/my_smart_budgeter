import { useEffect, useRef, useState } from 'react';
import { classifyEntry } from '../lib/device-ai';
import { expenseCategories, type Classification, type ExpenseCategory } from '../classification';
export function useEntryClassification(
  text: string | undefined,
  enabled: boolean,
  onCategory: (category: ExpenseCategory, text: string) => void,
  categories: readonly string[] = expenseCategories,
) {
  const [result, setResult] = useState<{ text: string; selection: string; value: Classification } | null>(null);
  const callback = useRef(onCategory);
  const selection = JSON.stringify(categories);
  useEffect(() => {
    callback.current = onCategory;
  }, [onCategory]);
  useEffect(() => {
    if (!enabled || !text?.trim()) return;
    let current = true;
    const timer = setTimeout(() => {
      void classifyEntry(text, JSON.parse(selection)).then((value) => {
        if (!current) return;
        setResult({ text, selection, value });
        if (value.status === 'classified') callback.current(value.category, text);
      });
    }, 650);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [text, enabled, selection]);
  if (!enabled || !text?.trim()) return null;
  return result?.text === text && result.selection === selection ? result.value : { status: 'working' as const };
}
