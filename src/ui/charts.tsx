/**
 * Gráficos simples feitos com Views (sem biblioteca): uma série, uma cor, barras finas
 * com topo arredondado apoiadas na linha de base. Tocar em uma barra mostra o valor.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Cents, formatBRL } from '@/domain/money';
import { T } from './components';
import { colors, space } from './theme';

export interface BarDatum {
  key: string;
  label: string;
  valueCents: Cents;
  /** Texto extra do detalhe (ex.: "3 compras"). */
  detail?: string;
}

/** Barras verticais (ex.: gasto por mês). A barra selecionada mostra o valor acima do gráfico. */
export function BarChart({ data, height = 140, initialKey, accessibilityLabel }: { data: BarDatum[]; height?: number; initialKey?: string; accessibilityLabel: string }) {
  const [selected, setSelected] = useState<string | null>(initialKey ?? data[data.length - 1]?.key ?? null);
  const max = Math.max(1, ...data.map((d) => d.valueCents));
  const current = data.find((d) => d.key === selected) ?? null;
  return (
    <View accessible accessibilityLabel={accessibilityLabel} style={{ gap: space.sm }}>
      <View style={{ minHeight: 40 }}>
        {current ? (
          <>
            <T v="heading">{formatBRL(current.valueCents)}</T>
            <T v="small" color={colors.textMuted}>{current.label}{current.detail ? ` · ${current.detail}` : ''}</T>
          </>
        ) : null}
      </View>
      <View style={[styles.plot, { height }]}>
        {data.map((d) => {
          const h = d.valueCents > 0 ? Math.max(4, Math.round((d.valueCents / max) * (height - 4))) : 0;
          const on = d.key === selected;
          return (
            <Pressable key={d.key} onPress={() => setSelected(d.key)} style={styles.col} accessibilityRole="button" accessibilityLabel={`${d.label}: ${formatBRL(d.valueCents)}`}>
              <View style={[styles.bar, { height: h, backgroundColor: on ? colors.navy : '#9DB4CC' }]} />
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row' }}>
        {data.map((d) => (
          <View key={d.key} style={{ flex: 1, alignItems: 'center' }}>
            <T v="caption" color={d.key === selected ? colors.text : colors.textMuted}>{d.label}</T>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Barras horizontais com rótulo e valor ao lado (ex.: gasto por supermercado, preço por loja). */
export function HBarList({ data, note }: { data: (BarDatum & { muted?: boolean })[]; note?: string }) {
  const max = Math.max(1, ...data.map((d) => d.valueCents));
  return (
    <View style={{ gap: space.md }}>
      {data.map((d) => (
        <View key={d.key} style={{ gap: 4 }} accessible accessibilityLabel={`${d.label}: ${formatBRL(d.valueCents)}${d.detail ? `, ${d.detail}` : ''}`}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.sm }}>
            <T v="small" style={{ flex: 1, fontWeight: '600' }} numberOfLines={1}>{d.label}</T>
            <T v="small" style={{ fontWeight: '700' }}>{formatBRL(d.valueCents)}</T>
          </View>
          <View style={styles.track}>
            <View style={[styles.hbar, { width: `${Math.max(2, Math.round((d.valueCents / max) * 100))}%`, backgroundColor: d.muted ? '#B8C4D1' : colors.navy }]} />
          </View>
          {d.detail ? <T v="caption" color={colors.textMuted}>{d.detail}</T> : null}
        </View>
      ))}
      {note ? <T v="caption" color={colors.textMuted}>{note}</T> : null}
    </View>
  );
}

/** Barra de progresso (ex.: orçamento utilizado). */
export function ProgressBar({ percent, color, label }: { percent: number; color: string; label: string }) {
  return (
    <View style={[styles.track, { height: 12 }]} accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: Math.min(100, percent) }}>
      <View style={[styles.hbar, { height: 12, width: `${Math.max(0, Math.min(100, percent))}%`, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  plot: { flexDirection: 'row', alignItems: 'flex-end', borderBottomWidth: 1, borderBottomColor: colors.border },
  col: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 1 },
  bar: { width: '62%', maxWidth: 28, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  track: { height: 8, borderRadius: 6, backgroundColor: colors.navySoft, overflow: 'hidden' },
  hbar: { height: 8, borderRadius: 6 },
});
