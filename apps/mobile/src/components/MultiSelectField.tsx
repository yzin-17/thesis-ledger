import { useState, type Ref } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useMobileRuntime } from '../app/MobileRuntime';
import { Copy } from './MobilePrimitives';

export function MultiSelectField({ label, value, onChange, selected, onRemove, editable = true, inputRef, onFocus, onSubmit }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  selected: readonly { id: string; label: string }[];
  onRemove: (id: string) => void;
  editable?: boolean;
  inputRef?: Ref<TextInput>;
  onFocus?: () => void;
  onSubmit?: () => void;
}) {
  const { theme } = useMobileRuntime();
  const [focused, setFocused] = useState(false);
  return <View style={styles.field}>
    <Copy>{label}</Copy>
    <View testID="multiselect-field" style={[styles.container, {
      borderColor: focused ? theme.brand : theme.borderStrong, backgroundColor: theme.surface1,
    }]}>
      {selected.map((item) => <View key={item.id} style={[styles.chip, { backgroundColor: theme.surface2 }]}>
        <Text style={[styles.label, { color: theme.textPrimary }]} numberOfLines={1}>{item.label}</Text>
        <Pressable
          accessibilityRole="button" accessibilityLabel={`移除 ${item.label}`}
          accessibilityState={{ disabled: !editable }} disabled={!editable}
          onPress={() => onRemove(item.id)}
          style={({ pressed }) => [styles.remove, pressed && styles.pressed]}
        ><Text style={{ color: theme.textMuted }}>×</Text></Pressable>
      </View>)}
      <TextInput
        ref={inputRef} accessibilityLabel={label} value={value} onChangeText={onChange}
        editable={editable} autoCapitalize="none" autoCorrect={false} autoComplete="off"
        onFocus={() => { setFocused(true); onFocus?.(); }} onBlur={() => setFocused(false)}
        onSubmitEditing={onSubmit}
        style={[styles.input, { color: theme.textPrimary }]}
      />
    </View>
  </View>;
}

const styles = StyleSheet.create({
  field: { gap: 8 },
  container: { minHeight: 44, borderWidth: 1, borderRadius: 6, padding: 6, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  chip: { maxWidth: '100%', flexDirection: 'row', alignItems: 'center', borderRadius: 4, paddingLeft: 8 },
  label: { flexShrink: 1, fontSize: 14 },
  remove: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  input: { flexGrow: 1, flexShrink: 1, flexBasis: 112, minWidth: 0, minHeight: 44, paddingHorizontal: 6, fontSize: 14, outlineWidth: 0, outlineStyle: 'solid' },
  pressed: { opacity: 0.72 },
});
