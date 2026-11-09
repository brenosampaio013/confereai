import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';
import { STATUS_LABEL, verificationBadges, VerificationFlags, PromotionStatus } from '@/domain/marketplace';
import { Pill, T } from '../components';
import { colors, space } from '../theme';

/** Indicadores separados (nunca um selo genérico de "verificada"). */
export function VerificationBadges({ flags, compact }: { flags: VerificationFlags; compact?: boolean }) {
  const list = verificationBadges(flags);
  if (!list.length) {
    return compact ? null : <Pill label="Sem verificação ainda" t="neutral" icon="ellipse-outline" />;
  }
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {list.map((b) => (
        <Pill key={b.key} label={b.label} t={b.key === 'location' ? 'navy' : 'green'} icon={b.icon as never} />
      ))}
    </View>
  );
}

export function BadgeDetails({ flags }: { flags: VerificationFlags }) {
  const list = verificationBadges(flags);
  return (
    <View style={{ gap: space.sm }}>
      {list.length === 0 ? <T v="small" color={colors.textMuted}>Nenhuma verificação concluída até agora. Confira na loja antes de ir só por causa desta oferta.</T> : null}
      {list.map((b) => (
        <View key={b.key} style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
          <Ionicons name={b.icon as never} size={18} color={b.key === 'location' ? colors.navy : colors.green} style={{ marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <T v="small" style={{ fontWeight: '700' }}>{b.label}</T>
            <T v="small" color={colors.textMuted}>{b.detail}</T>
          </View>
        </View>
      ))}
    </View>
  );
}

export function StatusPill({ status }: { status: PromotionStatus }) {
  const t = status === 'community_confirmed' ? 'green' : status === 'contested' || status === 'pending_review' ? 'yellow' : status === 'removed' ? 'red' : status === 'expired' || status === 'draft' ? 'neutral' : 'navy';
  return <Pill label={STATUS_LABEL[status]} t={t} />;
}
