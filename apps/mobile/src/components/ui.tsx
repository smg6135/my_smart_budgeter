import React from 'react';
import { Pressable, Text, TextInput, View, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
export const C = {
  bg: '#F7F8F4',
  paper: '#FFFFFF',
  ink: '#233C32',
  muted: '#778079',
  green: '#317B58',
  mint: '#E5F1E8',
  lime: '#D7EE9B',
  line: '#E6EAE3',
  red: '#A84B3D',
  pink: '#F8E9E3',
  gold: '#9A7429',
};
export type IconName = React.ComponentProps<typeof Ionicons>['name'];
export const Icon = ({
  name,
  size = 20,
  color = C.ink,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) => <Ionicons name={name} size={size} color={color} />;
export function Button({
  children,
  onPress,
  secondary = false,
  small = false,
  disabled = false,
  icon,
  danger = false,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  onPress: () => void;
  secondary?: boolean;
  small?: boolean;
  disabled?: boolean;
  icon?: IconName;
  danger?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        accessibilityLabel || (typeof children === 'string' ? children : undefined)
      }
      disabled={disabled}
      onPress={onPress}
      style={({ pressed, hovered }: any) => [
        styles.button,
        secondary && styles.secondary,
        small && { minHeight: 44, paddingHorizontal: 14 },
        danger && { backgroundColor: C.pink },
        disabled && { opacity: 0.45 },
        (pressed || hovered) && { opacity: 0.8 },
      ]}
    >
      {icon && (
        <Icon
          name={icon}
          size={small ? 16 : 19}
          color={danger ? C.red : secondary ? C.ink : '#fff'}
        />
      )}
      <Text style={[styles.buttonText, secondary && { color: C.ink }, danger && { color: C.red }]}>
        {children}
      </Text>
    </Pressable>
  );
}
export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return (
    <View testID="budget-card" style={[styles.card, style]}>
      {children}
    </View>
  );
}
export function Label({ children }: { children: React.ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}
export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  secureTextEntry = false,
  multiline = false,
}: {
  label: string;
  value: string;
  onChangeText: (s: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'decimal-pad' | 'url';
  secureTextEntry?: boolean;
  multiline?: boolean;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Label>{label}</Label>
      <TextInput
        accessibilityLabel={label}
        style={[styles.input, multiline && { minHeight: 100, textAlignVertical: 'top' }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9BA29C"
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        multiline={multiline}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}
export function Pill({
  children,
  tone = 'green',
}: {
  children: React.ReactNode;
  tone?: 'green' | 'red' | 'neutral';
}) {
  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: tone === 'red' ? C.pink : tone === 'neutral' ? C.bg : C.mint },
      ]}
    >
      <Text
        style={{
          flexShrink: 1,
          lineHeight: 16,
          fontSize: 11,
          fontWeight: '600',
          color: tone === 'red' ? C.red : C.green,
        }}
      >
        {children}
      </Text>
    </View>
  );
}
export function Progress({ value, color = C.green }: { value: number; color?: string }) {
  return (
    <View style={{ height: 7, borderRadius: 10, backgroundColor: C.line, overflow: 'hidden' }}>
      <View
        style={{
          height: 7,
          borderRadius: 10,
          backgroundColor: color,
          width: `${Math.min(100, Math.max(0, value))}%`,
        }}
      />
    </View>
  );
}
export function Empty({
  title,
  body,
  action,
  onPress,
}: {
  title: string;
  body: string;
  action?: string;
  onPress?: () => void;
}) {
  return (
    <View style={{ paddingVertical: 20, alignItems: 'center', gap: 12, minWidth: 0 }}>
      <Text
        style={{
          fontSize: 18,
          lineHeight: 26,
          fontWeight: '600',
          color: C.ink,
          textAlign: 'center',
          maxWidth: '100%',
        }}
      >
        {title}
      </Text>
      <Text style={{ color: C.muted, lineHeight: 21, textAlign: 'center', maxWidth: 340 }}>
        {body}
      </Text>
      {action && onPress && (
        <Button small secondary onPress={onPress}>
          {action}
        </Button>
      )}
    </View>
  );
}
export const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    maxWidth: '100%',
    flexShrink: 1,
    paddingVertical: 12,
    borderRadius: 13,
    backgroundColor: C.ink,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  secondary: { backgroundColor: C.mint },
  buttonText: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
    color: '#fff',
    flexShrink: 1,
    minWidth: 0,
    textAlign: 'center',
  },
  card: {
    padding: 20,
    minWidth: 0,
    maxWidth: '100%',
    flexShrink: 0,
    borderRadius: 22,
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.line,
    gap: 18,
  },
  label: { fontSize: 12, lineHeight: 18, fontWeight: '600', color: C.muted, flexShrink: 1 },
  input: {
    minHeight: 48,
    minWidth: 0,
    maxWidth: '100%',
    width: '100%',
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 12,
    padding: 13,
    fontSize: 15,
    color: C.ink,
    backgroundColor: '#FAFBF8',
  },
  pill: {
    maxWidth: '100%',
    flexShrink: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  h1: {
    fontSize: 28,
    fontWeight: '600',
    lineHeight: 36,
    color: C.ink,
    letterSpacing: -1.4,
    minWidth: 0,
    maxWidth: '100%',
    flexShrink: 1,
  },
  h2: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '600',
    letterSpacing: -0.4,
    minWidth: 0,
    maxWidth: '100%',
    color: C.ink,
    flexShrink: 1,
  },
  body: {
    fontSize: 13,
    color: C.muted,
    lineHeight: 21,
    flexShrink: 1,
    minWidth: 0,
    maxWidth: '100%',
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, minWidth: 0 },
  between: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minWidth: 0,
  },
  caption: {
    minWidth: 0,
    maxWidth: '100%',
    flexShrink: 1,
    lineHeight: 16,
    fontSize: 10,
    fontWeight: '600',
    color: C.muted,
    letterSpacing: 1.6,
  },
  amount: {
    minWidth: 0,
    maxWidth: '100%',
    fontSize: 28,
    lineHeight: 36,
    fontWeight: '500',
    letterSpacing: -1,
    color: C.ink,
    flexShrink: 1,
  },
  divider: { height: 1, backgroundColor: C.line },
});
