import { useEffect, useRef, useState } from 'react';
import { classifyEntry } from '../lib/device-ai';
import type { Classification, ExpenseCategory } from '../classification';
export function useEntryClassification(
  text: string | undefined,
  enabled: boolean,
  onCategory: (category: ExpenseCategory, text: string) => void,
) {
  const [result, setResult] = useState<{ text: string; value: Classification } | null>(null);
  const callback = useRef(onCategory);
  useEffect(() => {
    callback.current = onCategory;
  }, [onCategory]);
  useEffect(() => {
    if (!enabled || !text?.trim()) return;
    let current = true;
    const timer = setTimeout(() => {
      void classifyEntry(text).then((value) => {
        if (!current) return;
        setResult({ text, value });
        if (value.status === 'classified') callback.current(value.category, text);
      });
    }, 650);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [text, enabled]);
  if (!enabled || !text?.trim()) return null;
  return result?.text === text ? result.value : { status: 'working' as const };
}
