import { Pressable, Text, View } from 'react-native';
import { CURRENCIES } from '../currency';
import { C, Label } from './ui';
export function CurrencyPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (currency: string) => void;
}) {
  return (
    <View style={{ gap: 10, minWidth: 0 }}>
      <Label>{label}</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {CURRENCIES.map((currency) => (
          <Pressable
            key={currency}
            accessibilityRole="button"
            accessibilityLabel={`${label} ${currency}`}
            accessibilityState={{ selected: value === currency }}
            onPress={() => onChange(currency)}
            style={{
              minHeight: 42,
              minWidth: 54,
              justifyContent: 'center',
              alignItems: 'center',
              padding: 10,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: value === currency ? '#B5D1BA' : C.line,
              backgroundColor: value === currency ? C.mint : C.bg,
            }}
          >
            <Text
              style={{ fontSize: 12, color: C.ink, fontWeight: value === currency ? '700' : '400' }}
            >
              {currency}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
