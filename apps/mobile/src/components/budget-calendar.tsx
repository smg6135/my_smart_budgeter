import { Pressable, Text, View } from 'react-native';
import { Entry, monthLabel, today } from '../finance';
import { monthEnd, shiftMonth } from '../plans';
import { C, Card, Icon, styles as u } from './ui';

export function BudgetCalendar({
  date,
  onChange,
  entries,
}: {
  date: string;
  onChange: (date: string) => void;
  entries: Entry[];
}) {
  const month = date.slice(0, 7),
    current = today(),
    [year, number] = month.split('-').map(Number);
  const offset = (new Date(year, number - 1, 1).getDay() + 6) % 7;
  const count = Number(monthEnd(month).slice(-2));
  const daysWithEntries = new Set(entries.map((e) => e.date));
  const changeMonth = (amount: number) => {
    const next = shiftMonth(month, amount);
    onChange(next === current.slice(0, 7) ? current : monthEnd(next));
  };
  return (
    <Card style={{ padding: 16, gap: 12 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          onPress={() => changeMonth(-1)}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="chevron-back" />
        </Pressable>
        <Text accessibilityRole="header" style={[u.h2, { textAlign: 'center', flex: 1 }]}>
          {monthLabel(date)}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next month"
          accessibilityState={{ disabled: month >= current.slice(0, 7) }}
          disabled={month >= current.slice(0, 7)}
          onPress={() => changeMonth(1)}
          style={{
            width: 44,
            height: 44,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: month >= current.slice(0, 7) ? 0.25 : 1,
          }}
        >
          <Icon name="chevron-forward" />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row' }}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => (
          <Text key={i} style={[u.body, { width: '14.285714%', textAlign: 'center' }]}>
            {day}
          </Text>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {Array.from({ length: offset + count }, (_, index) => {
          const day = index - offset + 1,
            value = `${month}-${String(day).padStart(2, '0')}`;
          if (day <= 0) return <View key={index} style={{ width: '14.285714%', minHeight: 44 }} />;
          const selected = date === value,
            future = value > current;
          return (
            <Pressable
              key={index}
              accessibilityRole="button"
              accessibilityLabel={`View ${value}`}
              accessibilityState={{ selected, disabled: future }}
              aria-pressed={selected}
              disabled={future}
              onPress={() => onChange(value)}
              style={{
                width: '14.285714%',
                minHeight: 44,
                paddingVertical: 6,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 12,
                gap: 3,
                backgroundColor: selected ? C.ink : 'transparent',
                opacity: future ? 0.3 : 1,
              }}
            >
              <Text
                style={{
                  fontSize: 14,
                  lineHeight: 20,
                  color: selected ? '#fff' : C.ink,
                  fontWeight: value === current ? '700' : '400',
                }}
              >
                {day}
              </Text>
              <View
                style={{
                  height: 4,
                  width: 4,
                  borderRadius: 2,
                  backgroundColor: daysWithEntries.has(value)
                    ? selected
                      ? C.lime
                      : C.green
                    : 'transparent',
                }}
              />
            </Pressable>
          );
        })}
      </View>
      {date !== current && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to today"
          onPress={() => onChange(current)}
          style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center' }}
        >
          <Text style={{ color: C.green, fontWeight: '600' }}>Today</Text>
        </Pressable>
      )}
    </Card>
  );
}
