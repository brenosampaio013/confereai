import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import type { PurchaseSummary } from '@/data/repository';
import { fmtDate, plural } from '@/lib/format';
import { Money, Pill, Row, SEVERITY_ICON, SEVERITY_LABEL, T } from './components';
import { colors, space } from './theme';

export function purchaseStatusPill(s: PurchaseSummary) {
  if (s.purchase.status === 'active') return <Pill label="Em andamento" t="navy" icon="cart-outline" />;
  if (s.reportOverall) {
    if (s.reportComplete === false) return <Pill label="Conferência incompleta" t="yellow" icon="alert-circle" />;
    return <Pill label={s.openDivergences ? `${SEVERITY_LABEL[s.reportOverall]} · ${s.openDivergences}` : SEVERITY_LABEL[s.reportOverall]} t={s.reportOverall} icon={SEVERITY_ICON[s.reportOverall]} />;
  }
  if (s.receiptStatus === 'draft') return <Pill label="Nota em revisão" t="yellow" icon="document-text-outline" />;
  return <Pill label="Sem conferência" t="neutral" icon="ellipse-outline" />;
}

export function PurchaseRow({ s }: { s: PurchaseSummary }) {
  const total = s.finalTotalCents;
  return (
    <Pressable
      onPress={() => router.push(`/purchase/${s.purchase.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`Compra de ${fmtDate(s.purchase.startedAt)}`}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceAlt }]}
    >
      <View style={styles.icon}>
        <Ionicons name={s.purchase.mode === 'cart' ? 'cart-outline' : 'receipt-outline'} size={20} color={colors.navy} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <T v="bodyStrong" numberOfLines={1}>{s.purchase.storeName || (s.purchase.mode === 'cart' ? 'Compra' : 'Conferência de nota')}</T>
        <T v="small" color={colors.textMuted}>
          {fmtDate(s.purchase.startedAt)}
          {s.purchase.mode === 'cart' ? ` · ${plural(s.itemCount, 'item', 'itens')}` : ''}
        </T>
        <Row gap={6} style={{ flexWrap: 'wrap' }}>
          {purchaseStatusPill(s)}
          {s.budgetDiffCents != null && s.purchase.status !== 'active' ? (
            <Pill label={s.budgetDiffCents > 0 ? 'Acima do orçamento' : 'Dentro do orçamento'} t={s.budgetDiffCents > 0 ? 'red' : 'green'} icon="wallet-outline" />
          ) : null}
        </Row>
      </View>
      <Row gap={4}>
        <Money cents={total} />
        <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
      </Row>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  icon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.navySoft, alignItems: 'center', justifyContent: 'center' },
});
