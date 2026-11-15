import type { ScanResult } from './api';
import { CURRENCIES, parseAmount } from './currency';
import { today, validDate } from './finance';

export type RecognizedLine = {
  text: string;
  confidence: number;
  bounds: { x: number; y: number; width: number; height: number };
};
export type RecognizedReceipt = {
  engine: 'apple-vision';
  width: number;
  height: number;
  lines: RecognizedLine[];
};

// Join split label/value observations on the same row, without trusting input order.
export function receiptTextRows(document: RecognizedReceipt): string[] {
  const lines = document.lines
    .filter(
      (line) => line.text.trim() && Number.isFinite(line.confidence) && line.confidence >= 0.6,
    )
    .filter((line) => Object.values(line.bounds).every(Number.isFinite))
    .sort((a, b) => a.bounds.y - b.bounds.y);
  const rows: RecognizedLine[][] = [];
  for (const line of lines) {
    const row = rows[rows.length - 1];
    const anchor = row?.[0];
    const center = (item: RecognizedLine) => item.bounds.y + item.bounds.height / 2;
    if (
      anchor &&
      Math.abs(center(anchor) - center(line)) <=
        Math.min(anchor.bounds.height, line.bounds.height) / 2
    )
      row.push(line);
    else rows.push([line]);
  }
  return rows.map((row) =>
    row
      .sort((a, b) => a.bounds.x - b.bounds.x)
      .map((line) => line.text.trim())
      .join(' '),
  );
}

function currencies(text: string): string[] {
  const upper = text.toUpperCase();
  const found = CURRENCIES.filter((code) =>
    new RegExp(`(?:^|[^A-Z])${code}(?=$|[^A-Z])`).test(upper),
  );
  const symbols: [RegExp, string][] = [
    [/(?:\bS\$|\bSG\$)/, 'SGD'],
    [/\bUS\$/, 'USD'],
    [/(?:\bCA\$|\bC\$)/, 'CAD'],
    [/(?:\bAU\$|\bA\$)/, 'AUD'],
    [/\bHK\$/, 'HKD'],
    [/\bNZ\$/, 'NZD'],
    [/€/, 'EUR'],
    [/£/, 'GBP'],
    [/₩/, 'KRW'],
    [/₹/, 'INR'],
  ];
  return [
    ...new Set([
      ...found,
      ...symbols.filter(([pattern]) => pattern.test(upper)).map(([, code]) => code),
    ]),
  ];
}

function amounts(text: string): number[] {
  const tokens = text.match(/[+-]?(?:\d{1,3}(?:[,.'’ ]\d{3})+|\d+)(?:[.,]\d{1,2})?/g) || [];
  return tokens.flatMap((token) => {
    let value = token.replace(/[ '’]/g, '');
    const dot = value.lastIndexOf('.'),
      comma = value.lastIndexOf(',');
    if (dot >= 0 && comma >= 0) {
      const decimal = dot > comma ? '.' : ',';
      value = value.replace(decimal === '.' ? /,/g : /\./g, '').replace(',', '.');
    } else if (comma >= 0 || dot >= 0) {
      const separator = comma >= 0 ? ',' : '.';
      const parts = value.split(separator);
      if (parts.length > 1 && parts.slice(1).every((part) => part.length === 3))
        value = parts.join('');
      else if (parts.length === 2 && parts[1].length <= 2) value = parts.join('.');
      else return [];
    }
    const number = Number(value);
    return Number.isFinite(number) && number > 0 && number <= 1_000_000_000 ? [number] : [];
  });
}

function printedDate(rows: string[], now: string): string {
  const found = new Set<string>();
  const add = (year: number, month: number, day: number) => {
    const value = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (validDate(value)) found.add(value);
  };
  const months = [
    'jan',
    'feb',
    'mar',
    'apr',
    'may',
    'jun',
    'jul',
    'aug',
    'sep',
    'oct',
    'nov',
    'dec',
  ];
  for (const row of rows) {
    for (const match of row.matchAll(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/g))
      add(+match[1], +match[2], +match[3]);
    for (const match of row.matchAll(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/g)) {
      const a = +match[1],
        b = +match[2];
      if (a > 12 || a === b) add(+match[3], b, a);
      else if (b > 12) add(+match[3], a, b);
      // 08/11 could mean August 11 or November 8. Keep it blank for review.
    }
    for (const match of row.matchAll(/\b(\d{1,2})\s+([a-z]{3,9})\.?[, ]+\s*(\d{4})\b/gi)) {
      const month = months.indexOf(match[2].slice(0, 3).toLowerCase());
      if (month >= 0) add(+match[3], month + 1, +match[1]);
    }
    for (const match of row.matchAll(/\b([a-z]{3,9})\.?\s+(\d{1,2})[, ]+\s*(\d{4})\b/gi)) {
      const month = months.indexOf(match[1].slice(0, 3).toLowerCase());
      if (month >= 0) add(+match[3], month + 1, +match[2]);
    }
  }
  const values = [...found];
  return values.length === 1 && values[0] <= now ? values[0] : '';
}

export function parseReceiptText(document: RecognizedReceipt, now = today()): ScanResult {
  const rows = receiptTextRows(document);
  const totals: { amount: number; row: string; rank: number }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (/-\s*\d/.test(row)) continue;
    if (
      /\b(?:sub\s*total|sous[- ]?total|total\s+(?:tax|gst|vat|tva|savings|discount|items)|change|tender|tip|gratuity)\b/i.test(
        row,
      )
    )
      continue;
    const strong =
      /^(?:grand\s+total|total\s+(?:due|amount|ttc)|amount\s+(?:due|payable)|balance\s+due|net\s+total)\b/i.test(
        row,
      );
    if (!strong && !/^(?:total\b|合计|合計|总计|總計|应付|應付|实付|實付)/i.test(row)) continue;
    let line = row;
    let numbers = amounts(line);
    if (
      !numbers.length &&
      !/\d/.test(row) &&
      rows[i + 1] &&
      !/[a-z]{4,}|[\u3400-\u9fff]/i.test(rows[i + 1])
    ) {
      line += ' ' + rows[i + 1];
      numbers = amounts(rows[i + 1]);
    }
    if (numbers.length === 1) totals.push({ amount: numbers[0], row: line, rank: strong ? 2 : 1 });
  }
  const rank = Math.max(0, ...totals.map((item) => item.rank));
  const candidates = totals.filter((item) => item.rank === rank);
  const values = [...new Set(candidates.map((item) => item.amount))];
  const explicit = currencies(candidates.map((item) => item.row).join('\n'));
  const codes = explicit.length ? explicit : currencies(rows.join('\n'));
  const currency = codes.length === 1 ? codes[0] : '';
  let amount = values.length === 1 ? values[0] : 0;
  if (amount && currency) {
    try {
      parseAmount(String(amount), currency);
    } catch {
      amount = 0;
    }
  }
  const date = printedDate(rows, now);
  const merchant =
    rows
      .slice(0, 6)
      .find(
        (row) =>
          (row.match(/\p{L}/gu)?.length || 0) >= 2 &&
          row.length <= 100 &&
          !/\b(?:receipt|invoice|currency|tax|gst|vat|total|date|thank|tel|phone|www|http|road|street)\b/i.test(
            row,
          ) &&
          !CURRENCIES.includes(row.trim().toUpperCase() as (typeof CURRENCIES)[number]) &&
          !/^\d+\s/.test(row) &&
          !/\d[.,]\d{2}/.test(row),
      ) || '';
  const missing = [
    !merchant && 'merchant',
    !amount && 'total',
    !currency && 'currency',
    !date && 'date',
  ].filter(Boolean);
  return {
    merchant,
    amount,
    currency,
    date,
    category: 'Other',
    notes: missing.length ? `Review ${missing.join(', ')}.` : '',
  };
}
