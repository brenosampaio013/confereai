import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { View } from 'react-native';
import { BudgetLevel, budgetMessage, BudgetStatus, BudgetThresholds, BUDGET_TITLE, validateThresholds } from '@/domain/budget';
import { Cents, centsToInput, formatBRL, parseBRL } from '@/domain/money';
import { Button, Card, Field, IconName, Row, Sheet, T } from './components';
import { ProgressBar } from './charts';
import { colors, space } from './theme';

const TONE: Record<BudgetLevel, { bar: string; text: string; icon: IconName }> = {
  ok: { bar: colors.green, text: colors.greenText, icon: 'checkmark-circle' },
  attention: { bar: colors.yellow, text: colors.yellowText, icon: 'alert-circle' },
  near: { bar: colors.yellow, text: colors.yellowText, icon: 'warning' },
  reached: { bar: colors.red, text: colors.redText, icon: 'hand-left' },
  over: { bar: colors.red, text: colors.redText, icon: 'close-circle' },
};

/** Orçamento em tempo real: valor inicial, total acumulado, saldo e percentual. */
export function BudgetCard({ status, onEdit }: { status: BudgetStatus; onEdit?: () => void }) {
  const tone = TONE[status.level];
  return (
    <Card accessibilityLabel="Orçamento da compra">
      <Row style={{ justifyContent: 'space-between' }}>
        <Row gap={6} style={{ flex: 1 }}>
          <Ionicons name={tone.icon} size={20} color={tone.bar} />
          <T v="bodyStrong" color={tone.text} style={{ flex: 1 }}>{BUDGET_TITLE[status.level]}</T>
        </Row>
        {onEdit ? <Button title="Alterar" kind="ghost" compact onPress={onEdit} /> : null}
      </Row>
      <ProgressBar percent={status.usedPercent} color={tone.bar} label={`${status.usedPercent}% do orçamento utilizado`} />
      <Row style={{ justifyContent: 'space-between' }}>
        <Figure label="Orçamento" value={formatBRL(status.budgetCents)} />
        <Figure label="Total" value={formatBRL(status.spentCents)} />
        {status.level === 'over' ? (
          <Figure label="Ultrapassou" value={formatBRL(status.overCents)} color={colors.redText} />
        ) : (
          <Figure label="Saldo" value={formatBRL(status.remainingCents)} color={tone.text} />
        )}
        <Figure label="Usado" value={`${status.usedPercent}%`} />
      </Row>
      {status.level !== 'ok' ? <T v="small" color={tone.text}>{budgetMessage(status)}</T> : null}
    </Card>
  );
}

function Figure({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ gap: 2 }}>
      <T v="caption" color={colors.textMuted} style={{ textTransform: 'uppercase' }}>{label}</T>
      <T v="bodyStrong" color={color}>{value}</T>
    </View>
  );
}

/** Faixa compacta para o leitor de códigos. */
export function BudgetStrip({ status }: { status: BudgetStatus }) {
  const tone = TONE[status.level];
  return (
    <View style={{ gap: 4 }}>
      <ProgressBar percent={status.usedPercent} color={tone.bar} label={`${status.usedPercent}% do orçamento utilizado`} />
      <T v="small" color={tone.text} style={{ fontWeight: '600' }}>
        {status.level === 'over'
          ? `Passou ${formatBRL(status.overCents)} do orçamento de ${formatBRL(status.budgetCents)}`
          : `Restam ${formatBRL(status.remainingCents)} de ${formatBRL(status.budgetCents)} (${status.usedPercent}% usado)`}
      </T>
    </View>
  );
}

/** Define/altera o orçamento e os percentuais de alerta. */
export function BudgetSheet({
  visible,
  onClose,
  initialCents,
  thresholds,
  onSave,
  startLabel,
}: {
  visible: boolean;
  onClose: () => void;
  initialCents: Cents | null;
  thresholds: BudgetThresholds;
  onSave: (budgetCents: Cents | null, thresholds: BudgetThresholds) => void | Promise<void>;
  /** Quando informado, a folha inicia uma compra (mostra "sem orçamento" como opção). */
  startLabel?: string;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title={startLabel ? 'Quanto pretende gastar?' : 'Orçamento da compra'}>
      {visible ? <BudgetForm initialCents={initialCents} thresholds={thresholds} onSave={onSave} startLabel={startLabel} /> : null}
    </Sheet>
  );
}

function BudgetForm({ initialCents, thresholds, onSave, startLabel }: { initialCents: Cents | null; thresholds: BudgetThresholds; onSave: (b: Cents | null, t: BudgetThresholds) => void | Promise<void>; startLabel?: string }) {
  const [value, setValue] = useState(initialCents ? centsToInput(initialCents) : '');
  const [attention, setAttention] = useState(String(thresholds.attention));
  const [near, setNear] = useState(String(thresholds.near));
  const [showAlerts, setShowAlerts] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = (withBudget: boolean) => {
    const t = { attention: Number(attention), near: Number(near) };
    const tErr = validateThresholds(t);
    if (tErr) {
      setShowAlerts(true);
      setError(tErr);
      return;
    }
    if (!withBudget) return void onSave(null, t);
    const cents = parseBRL(value);
    if (cents == null || cents <= 0) {
      setError('Informe um valor maior que zero (ex.: 400,00).');
      return;
    }
    void onSave(cents, t);
  };

  return (
    <>
      <T color={colors.textMuted}>
        Cada produto adicionado entra na soma e o saldo é atualizado na hora. Você é avisado antes de passar do limite.
      </T>
      <Field label="Valor disponível para esta compra" value={value} onChangeText={(s) => { setValue(s); setError(null); }} keyboardType="decimal-pad" prefix="R$" placeholder="400,00" autoFocus testID="budget-input" error={showAlerts ? null : error} />
      {showAlerts ? (
        <View style={{ gap: space.sm }}>
          <Row>
            <View style={{ flex: 1 }}><Field label="Aviso de atenção" value={attention} onChangeText={(s) => { setAttention(s.replace(/\D/g, '')); setError(null); }} keyboardType="number-pad" suffix="%" /></View>
            <View style={{ flex: 1 }}><Field label="Limite próximo" value={near} onChangeText={(s) => { setNear(s.replace(/\D/g, '')); setError(null); }} keyboardType="number-pad" suffix="%" /></View>
          </Row>
          <T v="small" color={error ? colors.redText : colors.textMuted}>{error ?? 'Você também é avisado ao atingir 100% e sempre que ultrapassar o orçamento.'}</T>
        </View>
      ) : (
        <Button title={`Alertas em ${thresholds.attention}%, ${thresholds.near}% e 100% · alterar`} icon="notifications-outline" kind="ghost" compact onPress={() => setShowAlerts(true)} />
      )}
      <Button title={startLabel ?? 'Salvar orçamento'} icon="checkmark" kind="confirm" onPress={() => submit(true)} />
      {startLabel ? (
        <Button title="Começar sem orçamento" kind="ghost" onPress={() => submit(false)} />
      ) : initialCents ? (
        <Button title="Remover orçamento" kind="ghost" onPress={() => submit(false)} />
      ) : null}
    </>
  );
}
