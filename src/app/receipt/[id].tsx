import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { formatCnpj } from '@/domain/fiscal';
import { centsToInput, formatBRL, parseBRL } from '@/domain/money';
import { itemNeedsReview, receiptItemNet, validateReceipt } from '@/domain/receiptParser';
import type { ReceiptItem } from '@/domain/types';
import { formatQuantity, lineSubtotal, parseQuantity, quantityToInput, SaleUnit } from '@/domain/units';
import { fmtReceiptDate } from '@/lib/format';
import { useLoad } from '@/lib/useLoad';
import { runConference } from '@/services/conference';
import { useApp } from '@/state/AppContext';
import { Banner, Button, Card, Divider, Field, KeyValue, Loading, Money, Pill, Row, Screen, SectionTitle, Segmented, Sheet, T } from '@/ui/components';
import { colors, space } from '@/ui/theme';
import { showAlert } from '@/lib/dialog';

const ISSUE_LABEL: Record<string, string> = {
  missing_quantity: 'quantidade não lida',
  missing_unit_price: 'preço unitário não lido',
  missing_total: 'valor da linha não lido',
  math_mismatch: 'quantidade × preço ≠ total',
  possible_overlap: 'possível repetição entre fotos',
  unreadable: 'descrição ilegível',
  ambiguous_discount: 'desconto ambíguo',
};

type Draft = { id: string | null; description: string; unit: SaleUnit; qty: string; unitPrice: string; total: string; discount: string };

export default function ReviewReceipt() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { repo, bump, version } = useApp();
  const { data: receipt, reload } = useLoad(() => repo.getReceipt(id), [id, version]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [headerOpen, setHeaderOpen] = useState(false);
  const [store, setStore] = useState('');
  const [total, setTotal] = useState('');
  const [showRaw, setShowRaw] = useState(false);
  const [running, setRunning] = useState(false);

  if (receipt === undefined) return <Loading />;
  if (receipt === null) return <Screen><Banner t="yellow" title="Cupom não encontrado" /></Screen>;

  const parsed = receipt.parsed;
  const v = validateReceipt(parsed);
  const qrMismatch = receipt.qrTotalCents != null && parsed.totals.totalCents != null && receipt.qrTotalCents !== parsed.totals.totalCents;

  const openItem = (it: ReceiptItem | null) => {
    setDraftError(null);
    setDraft(
      it
        ? {
            id: it.id,
            description: it.description,
            unit: it.unit,
            qty: it.quantityMilli != null ? quantityToInput(it.quantityMilli, it.unit) : '',
            unitPrice: it.unitPriceCents != null ? centsToInput(it.unitPriceCents) : '',
            total: it.totalCents != null ? centsToInput(it.totalCents) : '',
            discount: it.discountCents ? centsToInput(it.discountCents) : '',
          }
        : { id: null, description: '', unit: 'un', qty: '1', unitPrice: '', total: '', discount: '' },
    );
  };

  const saveDraft = async () => {
    if (!draft) return;
    const q = parseQuantity(draft.qty, draft.unit);
    const up = draft.unitPrice ? parseBRL(draft.unitPrice) : null;
    let tot = draft.total ? parseBRL(draft.total) : null;
    const disc = draft.discount ? parseBRL(draft.discount) : 0;
    if (!draft.description.trim()) return setDraftError('Informe a descrição.');
    if (q == null) return setDraftError(draft.unit === 'un' ? 'Quantidade deve ser um número inteiro.' : 'Informe o peso/volume (ex.: 1,250).');
    if (draft.unitPrice && up == null) return setDraftError('Preço unitário inválido.');
    if (draft.total && tot == null) return setDraftError('Valor total inválido.');
    if (disc == null || disc < 0) return setDraftError('Desconto inválido.');
    if (tot == null && up != null) tot = lineSubtotal(up, q);
    if (tot == null) return setDraftError('Informe o preço unitário ou o valor total da linha.');
    const values = { description: draft.description.trim(), unit: draft.unit, quantityMilli: q, unitPriceCents: up, totalCents: tot, discountCents: disc };
    if (draft.id) {
      await repo.updateReceiptItem(draft.id, values);
    } else {
      await repo.addReceiptItem(id, {
        ...values,
        seq: null,
        code: null,
        rawUnit: null,
        surchargeCents: 0,
        confidence: 1,
        issues: [],
        sourcePart: 0,
        rawLines: [],
        userEdited: true,
      });
    }
    setDraft(null);
    bump();
    reload();
  };

  const removeDraft = () => {
    if (!draft?.id) return;
    showAlert('Excluir linha?', 'Use quando a linha não existe no cupom (por exemplo, foi lida duas vezes na emenda das fotos).', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          await repo.removeReceiptItem(draft.id!);
          setDraft(null);
          bump();
          reload();
        },
      },
    ]);
  };

  const confirmDraft = async () => {
    if (!draft?.id) return;
    await repo.confirmReceiptItem(draft.id);
    setDraft(null);
    bump();
    reload();
  };

  const saveHeader = async () => {
    const t = total ? parseBRL(total) : null;
    if (total && t == null) return showAlert('Valor inválido', 'Confira o total (ex.: 123,45).');
    await repo.updateReceiptHeader(id, { storeName: store.trim() || null, totalCents: t });
    if (store.trim()) await repo.updatePurchase(receipt.purchaseId, { storeName: store.trim() });
    setHeaderOpen(false);
    bump();
    reload();
  };

  const check = async () => {
    const go = async () => {
      setRunning(true);
      try {
        await repo.updateReceiptHeader(id, { status: 'reviewed' });
        const reportId = await runConference(repo, id);
        bump();
        router.replace(`/report/${reportId}`);
      } catch (e) {
        showAlert('Não foi possível conferir', e instanceof Error ? e.message : String(e));
      } finally {
        setRunning(false);
      }
    };
    if (!v.complete) {
      showAlert('Leitura incompleta', 'Ainda há pendências na leitura. Você pode conferir mesmo assim; o resultado será marcado como incompleto.', [
        { text: 'Continuar revisando', style: 'cancel' },
        { text: 'Conferir assim', onPress: go },
      ]);
    } else {
      await go();
    }
  };

  return (
    <Screen
      footer={
        <>
          <Row style={{ justifyContent: 'space-between' }}>
            <T color={colors.textMuted}>{parsed.items.length} {parsed.items.length === 1 ? 'linha' : 'linhas'} · soma {v.itemsSumCents != null ? formatBRL(v.itemsSumCents) : '—'}</T>
            <Money cents={parsed.totals.totalCents} />
          </Row>
          <Button title="Conferir agora" icon="shield-checkmark-outline" kind="confirm" onPress={check} loading={running} disabled={!parsed.items.length} />
        </>
      }
    >
      {v.complete ? (
        <Banner t="green" icon="checkmark-circle" title="Leitura completa">
          Todos os itens têm quantidade e valor, e a soma confere com o total da nota. Ainda assim, compare com o cupom impresso.
        </Banner>
      ) : (
        <Banner t="yellow" icon="alert-circle" title="Leitura incompleta — revise antes de concluir">
          {v.problems.map((p) => <T key={p} v="small" color={colors.yellowText}>• {p}</T>)}
        </Banner>
      )}
      {qrMismatch ? (
        <Banner t="yellow" icon="qr-code-outline" title="Total diferente do QR Code">
          {`O QR Code informa ${formatBRL(receipt.qrTotalCents!)}, mas o total lido da foto é ${formatBRL(parsed.totals.totalCents!)}. Confira o valor impresso.`}
        </Banner>
      ) : null}

      <Card onPress={() => { setStore(parsed.storeName ?? ''); setTotal(parsed.totals.totalCents != null ? centsToInput(parsed.totals.totalCents) : ''); setHeaderOpen(true); }} accessibilityLabel="Editar dados do cupom">
        <Row style={{ justifyContent: 'space-between' }}>
          <T v="heading" style={{ flex: 1 }}>{parsed.storeName ?? 'Estabelecimento não identificado'}</T>
          <Pill label="Editar" t="navy" icon="create-outline" />
        </Row>
        {parsed.cnpj ? <KeyValue label="CNPJ" value={formatCnpj(parsed.cnpj)} /> : null}
        {parsed.issuedAt ? <KeyValue label="Emissão" value={fmtReceiptDate(parsed.issuedAt) ?? ''} /> : null}
        {parsed.totals.subtotalCents != null ? <KeyValue label="Valor dos produtos" value={formatBRL(parsed.totals.subtotalCents)} /> : null}
        {parsed.totals.discountCents ? <KeyValue label="Descontos" value={`− ${formatBRL(parsed.totals.discountCents)}`} /> : null}
        {parsed.totals.surchargeCents ? <KeyValue label="Acréscimos" value={formatBRL(parsed.totals.surchargeCents)} /> : null}
        <KeyValue label="Total da nota" value={parsed.totals.totalCents != null ? formatBRL(parsed.totals.totalCents) : 'Não identificado'} strong />
        {parsed.totals.itemCount != null ? <KeyValue label="Itens informados na nota" value={String(parsed.totals.itemCount)} /> : null}
      </Card>

      {parsed.warnings.length ? (
        <Card>
          <T v="bodyStrong">Observações da leitura</T>
          {parsed.warnings.map((w) => <T key={w} v="small" color={colors.textMuted}>• {w}</T>)}
        </Card>
      ) : null}

      <SectionTitle action={<Button title="Adicionar linha" icon="add" kind="ghost" compact onPress={() => openItem(null)} />}>Produtos na nota</SectionTitle>
      <Card style={{ paddingVertical: space.xs }}>
        {parsed.items.length === 0 ? <T color={colors.textMuted} style={{ paddingVertical: space.md }}>Nenhuma linha. Adicione os itens do cupom.</T> : null}
        {parsed.items.map((it, i) => {
          const review = itemNeedsReview(it);
          return (
            <View key={it.id}>
              {i > 0 ? <Divider /> : null}
              <Pressable onPress={() => openItem(it)} style={styles.line} accessibilityRole="button" accessibilityLabel={`Editar ${it.description}`}>
                <View style={{ flex: 1, gap: 3 }}>
                  <T v="bodyStrong" numberOfLines={2}>{it.seq != null ? `${String(it.seq).padStart(3, '0')} · ` : ''}{it.description}</T>
                  <T v="small" color={colors.textMuted}>
                    {it.quantityMilli != null ? formatQuantity(it.quantityMilli, it.unit) : 'qtd ?'} × {it.unitPriceCents != null ? formatBRL(it.unitPriceCents) : 'preço ?'}
                    {it.discountCents ? ` · desconto ${formatBRL(it.discountCents)}` : ''}
                  </T>
                  {review ? (
                    <Pill label={it.issues.length ? it.issues.map((x) => ISSUE_LABEL[x] ?? x).join(' · ') : 'Confira esta linha'} t="yellow" icon="alert-circle" />
                  ) : it.userEdited ? (
                    <Pill label="Revisado" t="green" icon="checkmark" />
                  ) : null}
                </View>
                <Money cents={receiptItemNet(it)} />
              </Pressable>
            </View>
          );
        })}
      </Card>

      {parsed.unparsedLines.length ? (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <T v="bodyStrong">Linhas não interpretadas ({parsed.unparsedLines.length})</T>
            <Button title={showRaw ? 'Ocultar' : 'Mostrar'} kind="ghost" compact onPress={() => setShowRaw(!showRaw)} />
          </Row>
          <T v="small" color={colors.textMuted}>Se alguma delas for um produto, adicione a linha manualmente.</T>
          {showRaw ? parsed.unparsedLines.map((l, i) => <T key={`${i}-${l}`} v="small" style={{ fontFamily: 'monospace' }}>{l}</T>) : null}
        </Card>
      ) : null}

      <Sheet visible={!!draft} onClose={() => setDraft(null)} title={draft?.id ? 'Corrigir linha' : 'Nova linha'}>
        {draft ? (
          <>
            <Field label="Descrição" value={draft.description} onChangeText={(s) => setDraft({ ...draft, description: s })} autoCapitalize="characters" />
            <Segmented label="Unidade" value={draft.unit} onChange={(u) => setDraft({ ...draft, unit: u })} options={[{ value: 'un', label: 'UN' }, { value: 'kg', label: 'KG' }, { value: 'l', label: 'L' }]} />
            <Field label={draft.unit === 'un' ? 'Quantidade' : draft.unit === 'kg' ? 'Peso (kg)' : 'Volume (L)'} value={draft.qty} onChangeText={(s) => setDraft({ ...draft, qty: s })} keyboardType="decimal-pad" />
            <Field label="Preço unitário" value={draft.unitPrice} onChangeText={(s) => setDraft({ ...draft, unitPrice: s })} keyboardType="decimal-pad" prefix="R$" />
            <Field label="Valor total da linha" value={draft.total} onChangeText={(s) => setDraft({ ...draft, total: s })} keyboardType="decimal-pad" prefix="R$" hint="Como impresso no cupom, antes do desconto." />
            <Field label="Desconto da linha" value={draft.discount} onChangeText={(s) => setDraft({ ...draft, discount: s })} keyboardType="decimal-pad" prefix="R$" placeholder="0,00" />
            {draftError ? <T v="small" color={colors.redText}>{draftError}</T> : null}
            <Button title="Salvar correção" icon="checkmark" kind="confirm" onPress={saveDraft} />
            {draft.id ? <Button title="A leitura está certa" icon="checkmark-done-outline" kind="secondary" onPress={confirmDraft} /> : null}
            {draft.id ? <Button title="Excluir linha" icon="trash-outline" kind="danger" onPress={removeDraft} /> : null}
          </>
        ) : null}
      </Sheet>

      <Sheet visible={headerOpen} onClose={() => setHeaderOpen(false)} title="Dados do cupom">
        <Field label="Estabelecimento" value={store} onChangeText={setStore} autoCapitalize="words" />
        <Field label="Total da nota (valor a pagar)" value={total} onChangeText={setTotal} keyboardType="decimal-pad" prefix="R$" />
        <Button title="Salvar" icon="checkmark" kind="confirm" onPress={saveHeader} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
});
