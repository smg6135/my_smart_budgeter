import { useState } from 'react';
import { Keyboard, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, C, Icon, Label, styles as u } from './ui';

type Option = { value: string; label: string };
export function Select({
  label,
  value,
  options,
  onChange,
  compact = false,
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  compact?: boolean;
}) {
  const [visible, setVisible] = useState(false),
    [draft, setDraft] = useState(value);
  const selected = options.find((option) => option.value === value);
  return (
    <View style={{ minWidth: 0, gap: 8 }}>
      {!compact && <Label>{label}</Label>}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} ${selected?.label || 'Select'}`}
        onPress={() => {
          Keyboard.dismiss();
          setDraft(value || options[0]?.value);
          setVisible(true);
        }}
        style={{
          minHeight: 48,
          paddingHorizontal: compact ? 10 : 13,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: C.line,
          backgroundColor: C.bg,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
        }}
      >
        <Text style={{ color: C.ink, fontSize: 15, flexShrink: 1 }}>
          {selected?.label || 'Select'}
        </Text>
        <Icon name="chevron-down" size={14} color={C.muted} />
      </Pressable>
      <Modal
        visible={visible}
        transparent
        animationType={Platform.OS === 'web' ? 'none' : 'slide'}
        onRequestClose={() => setVisible(false)}
      >
        <View
          style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(21,40,29,.35)' }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Cancel ${label}`}
            style={{ flex: 1 }}
            onPress={() => setVisible(false)}
          />
          <SafeAreaView
            edges={['bottom']}
            style={{
              backgroundColor: C.paper,
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              maxHeight: '70%',
            }}
          >
            <View style={{ padding: 20, gap: 12 }}>
              <Text style={u.h2}>{label}</Text>
              {Platform.OS === 'ios' ? (
                <>
                  <Picker
                    accessibilityLabel={label}
                    selectedValue={draft}
                    onValueChange={(next) => setDraft(String(next))}
                    itemStyle={{ color: C.ink, fontSize: 22 }}
                  >
                    {options.map((option) => (
                      <Picker.Item key={option.value} label={option.label} value={option.value} />
                    ))}
                  </Picker>
                  <Button
                    onPress={() => {
                      onChange(draft);
                      setVisible(false);
                    }}
                  >
                    Done
                  </Button>
                </>
              ) : (
                <ScrollView style={{ maxHeight: 360 }}>
                  {options.map((option) => (
                    <Pressable
                      key={option.value}
                      accessibilityRole="button"
                      accessibilityLabel={`Select ${option.label}`}
                      accessibilityState={{ selected: option.value === value }}
                      aria-pressed={option.value === value}
                      onPress={() => {
                        onChange(option.value);
                        setVisible(false);
                      }}
                      style={{
                        minHeight: 48,
                        paddingVertical: 12,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderBottomWidth: 1,
                        borderColor: C.line,
                      }}
                    >
                      <Text style={u.body}>{option.label}</Text>
                      {option.value === value && <Icon name="checkmark" color={C.green} />}
                    </Pressable>
                  ))}
                </ScrollView>
              )}
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}
