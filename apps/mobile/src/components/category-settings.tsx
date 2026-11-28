import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { activeCategories, validateCategories } from '../classification';
import type { State } from '../finance';
import { Button, C, Card, Field, styles as u } from './ui';

export function CategorySettings({
  state,
  update,
}: {
  state: State;
  update: (fn: (s: State) => State) => void;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const categories = activeCategories(state);
  function change(next: string[]) {
    try {
      const checked = validateCategories(next);
      update((old) => ({ ...old, expenseCategories: checked }));
      setError('');
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Check the categories.');
      return false;
    }
  }
  return (
    <Card>
      <Text style={u.h2}>Expense categories</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {categories.map((category) => (
          <View
            key={category}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              maxWidth: '100%',
              borderRadius: 24,
              backgroundColor: C.mint,
              paddingLeft: 14,
            }}
          >
            <Text style={{ color: C.ink, flexShrink: 1 }}>{category}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove category ${category}`}
              onPress={() => change(categories.filter((v) => v !== category))}
              style={{
                minWidth: 44,
                minHeight: 44,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: C.ink, fontSize: 20 }}>×</Text>
            </Pressable>
          </View>
        ))}
      </View>
      <Field label="New category" value={name} onChangeText={setName} />
      <Button
        onPress={() => {
          if (change([...categories, name])) setName('');
        }}
      >
        Add category
      </Button>
      {!!error && (
        <Text accessibilityRole="alert" style={{ color: C.red }}>
          {error}
        </Text>
      )}
    </Card>
  );
}
