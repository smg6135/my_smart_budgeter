// CI-only synthetic inputs. No routes, account data or ledger mutations.
import * as FileSystem from 'expo-file-system/legacy';
import { classifyEntry, classifyReceipt, downloadDeviceAi } from './device-ai.native';

export async function runDeviceAiSmoke() {
  const file = `${FileSystem.documentDirectory}pocket-local-ai-smoke.json`;
  try {
    await downloadDeviceAi();
    for (const [text, expected] of [
      ['taxi fare', 'Transport'],
      ['dentist appointment', 'Health'],
      ['movie tickets', 'Entertainment'],
    ]) {
      const result = await classifyEntry(text);
      if (result.status !== 'classified' || result.category !== expected)
        throw new Error(`Local classification failed: ${text}: ${JSON.stringify(result)}`);
    }
    const text = [
      'Corner Cafe',
      '19 Nov 2026',
      'Latte 5.00',
      'Sandwich 7.50',
      'TOTAL SGD 12.50',
      'Cash 20.00',
      'Change 7.50',
    ];
    const result = await classifyReceipt(
      {
        engine: 'apple-vision',
        width: 500,
        height: 800,
        lines: text.map((text, index) => ({
          text,
          confidence: 0.99,
          bounds: { x: 0.1, y: index * 0.1, width: 0.8, height: 0.04 },
        })),
      },
      {
        merchant: 'Corner Cafe',
        amount: 12.5,
        currency: 'SGD',
        date: '2026-11-19',
        category: 'Other',
        notes: '',
      },
    );
    if (result.status !== 'classified' || result.category !== 'Food & drinks' || !result.approved)
      throw new Error(`Local receipt check failed: ${JSON.stringify(result)}`);
    await FileSystem.writeAsStringAsync(
      file,
      JSON.stringify({ status: 'passed', entries: 3, receipt: true }),
    );
  } catch (error) {
    await FileSystem.writeAsStringAsync(
      file,
      JSON.stringify({ status: 'failed', error: String(error) }),
    );
  }
}
