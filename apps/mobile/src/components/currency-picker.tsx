import { CURRENCIES } from '../currency';
import { Select } from './select';
export function CurrencyPicker({
  label,
  value,
  onChange,
  currencies = [...CURRENCIES],
  compact = false,
}: {
  label: string;
  value: string;
  onChange: (currency: string) => void;
  currencies?: string[];
  compact?: boolean;
}) {
  return (
    <Select
      label={label}
      value={value}
      onChange={onChange}
      compact={compact}
      options={currencies.map((currency) => ({ value: currency, label: currency }))}
    />
  );
}
