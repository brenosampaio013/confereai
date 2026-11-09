import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { CATEGORIES } from '@/domain/marketplace';
import { T } from '../components';
import { colors, radius, space } from '../theme';

export function CategoryStrip({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.lg }}>
      {CATEGORIES.map((c) => {
        const active = value === c.id;
        return (
          <Pressable
            key={c.id}
            onPress={() => onChange(active ? null : c.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={c.label}
            style={({ pressed }) => [styles.item, pressed && { opacity: 0.8 }]}
          >
            <View style={[styles.circle, { backgroundColor: active ? c.color : `${c.color}1A`, borderColor: active ? c.color : 'transparent' }]}>
              <Ionicons name={c.icon as never} size={24} color={active ? colors.white : c.color} />
            </View>
            <T v="small" center numberOfLines={2} style={{ fontWeight: active ? '700' : '500', fontSize: 12.5, lineHeight: 16 }}>{c.label}</T>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  item: { width: 76, alignItems: 'center', gap: 6 },
  circle: { width: 58, height: 58, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
});
