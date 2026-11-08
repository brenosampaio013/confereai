import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { LabelReading, parseLabel } from '@/domain/labelParser';
import { centsToInput, parseBRL } from '@/domain/money';
import { extractPackageMeasure, formatPackageMeasure } from '@/domain/units';
import { deleteQuietly } from '@/lib/files';
import { OcrError, runOcr } from '@/services/ocr';
import { handoff } from '@/state/handoff';
import { Banner, Button, Card, Field, Pill, Row, Screen, Segmented, T } from '@/ui/components';
import { useOcrConsent } from '@/ui/OcrConsent';
import { colors } from '@/ui/theme';
import { showAlert } from '@/lib/dialog';

export default function LabelScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { ensureConsent, sheet } = useOcrConsent();
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<OcrError | null>(null);
  const [reading, setReading] = useState<LabelReading | null>(null);
  const [rawLines, setRawLines] = useState<string[]>([]);
  // campos revisáveis
  const [name, setName] = useState('');
  const [regular, setRegular] = useState('');
  const [promo, setPromo] = useState('');
  const [conditions, setConditions] = useState('');
  const [reference, setReference] = useState('');
  const [measure, setMeasure] = useState('');
  const [mode, setMode] = useState<'package' | 'weight'>('package');

  const pick = async (fromCamera: boolean) => {
    const perm = fromCamera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showAlert('Permissão necessária', fromCamera ? 'Permita o acesso à câmera para fotografar a etiqueta.' : 'Permita o acesso às fotos para escolher uma imagem.');
      return;
    }
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8 };
    const r = fromCamera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (!r.canceled && r.assets[0]) {
      setPhoto(r.assets[0].uri);
      setReading(null);
      setError(null);
    }
  };

  const read = async () => {
    if (!photo) return;
    if (!(await ensureConsent())) return;
    setBusy(true);
    setError(null);
    try {
      const res = await runOcr('label', [photo]);
      const lines = res.parts[0]?.lines ?? [];
      const r = parseLabel(lines);
      setRawLines(lines);
      setReading(r);
      setName(r.productName ?? '');
      setRegular(r.regularPriceCents != null ? centsToInput(r.regularPriceCents) : '');
      setPromo(r.promoPriceCents != null ? centsToInput(r.promoPriceCents) : '');
      setConditions(r.promoConditions.join('; '));
      setReference(r.referencePrice ? centsToInput(r.referencePrice.cents) : '');
      setMeasure(r.packageMeasure ? formatPackageMeasure(r.packageMeasure) : '');
      setMode(r.soldByWeight ? 'weight' : 'package');
    } catch (e) {
      setError(e instanceof OcrError ? e : new OcrError('service_error', e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  const confirm = () => {
    if (!reading) return;
    const reg = regular ? parseBRL(regular) : null;
    const pr = promo ? parseBRL(promo) : null;
    const ref = reference ? parseBRL(reference) : null;
    if ((regular && reg == null) || (promo && pr == null) || (reference && ref == null)) {
      showAlert('Valor inválido', 'Confira os preços (ex.: 5,49).');
      return;
    }
    const weight = mode === 'weight';
    if (weight && ref == null) {
      showAlert('Informe o preço por quilo', 'Produtos vendidos por peso precisam do preço por kg.');
      return;
    }
    if (!weight && reg == null && pr == null) {
      showAlert('Informe o preço', 'Não foi possível identificar o preço. Digite o valor da etiqueta.');
      return;
    }
    const final: LabelReading = {
      ...reading,
      productName: name.trim() || null,
      regularPriceCents: weight ? null : reg ?? pr,
      promoPriceCents: weight ? null : reg != null ? pr : null,
      promoConditions: conditions.split(';').map((c) => c.trim()).filter(Boolean),
      referencePrice: ref != null ? { cents: ref, per: weight ? 'kg' : reading.referencePrice?.per ?? 'kg' } : null,
      packageMeasure: extractPackageMeasure(measure),
      soldByWeight: weight,
      notes: [],
    };
    handoff.putLabel(token, final);
    deleteQuietly(photo);
    router.back();
  };

  return (
    <Screen>
      {sheet}
      <T color={colors.textMuted}>Fotografe a etiqueta da gôndola bem de frente, com boa luz. Os dados lidos aparecem para você conferir antes de usar.</T>
      {photo ? <Image source={{ uri: photo }} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 12, backgroundColor: colors.border }} contentFit="contain" /> : null}
      <Row>
        <Button title={photo ? 'Nova foto' : 'Fotografar etiqueta'} icon="camera-outline" kind={photo ? 'secondary' : 'primary'} onPress={() => pick(true)} style={{ flex: 1 }} />
        <Button title="Galeria" icon="images-outline" kind="secondary" onPress={() => pick(false)} style={{ flex: 1 }} />
      </Row>
      {photo && !reading ? <Button title="Ler etiqueta" icon="scan-outline" kind="confirm" onPress={read} loading={busy} /> : null}

      {error ? (
        <Banner t={error.reason === 'offline' || error.reason === 'not_configured' ? 'yellow' : 'red'} icon="alert-circle" title="Não foi possível ler automaticamente">
          <T v="small" color={colors.text}>{error.message}</T>
          <Button title="Digitar o preço" kind="secondary" compact onPress={() => router.back()} />
        </Banner>
      ) : null}

      {reading ? (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <T v="heading">Confira a leitura</T>
            <Pill label={reading.missing.length ? 'Leitura parcial' : 'Leitura concluída'} t={reading.missing.length ? 'yellow' : 'green'} />
          </Row>
          {reading.notes.map((n) => <T key={n} v="small" color={colors.textMuted}>• {n}</T>)}
          <Segmented
            label="Este produto é vendido"
            value={mode}
            onChange={setMode}
            options={[{ value: 'package', label: 'Por embalagem/unidade' }, { value: 'weight', label: 'Por peso (kg)' }]}
          />
          <Field label="Nome do produto" value={name} onChangeText={setName} error={reading.missing.includes('name') ? 'Não lido — digite se quiser' : null} />
          {mode === 'package' ? (
            <>
              <Field label="Preço normal" value={regular} onChangeText={setRegular} keyboardType="decimal-pad" prefix="R$" error={reading.missing.includes('price') ? 'Preço não lido — digite o valor da etiqueta' : null} />
              <Field label="Preço promocional (se houver)" value={promo} onChangeText={setPromo} keyboardType="decimal-pad" prefix="R$" />
              {promo ? <Field label="Condições da promoção" value={conditions} onChangeText={setConditions} placeholder="Ex.: leve 3 pague 2; válido até 31/10" hint="Separe as condições com ponto e vírgula." /> : null}
              <Field label="Peso ou volume da embalagem" value={measure} onChangeText={setMeasure} placeholder="Ex.: 500 g" />
              <Field label="Preço de referência por kg/L (informativo)" value={reference} onChangeText={setReference} keyboardType="decimal-pad" prefix="R$" hint="Não é usado como preço do produto." />
            </>
          ) : (
            <Field label="Preço por quilo" value={reference} onChangeText={setReference} keyboardType="decimal-pad" prefix="R$" suffix="/kg" />
          )}
          <Button title="Usar estes dados" icon="checkmark" kind="confirm" onPress={confirm} />
          {rawLines.length ? (
            <View style={{ gap: 2 }}>
              <T v="caption" color={colors.textMuted}>TEXTO LIDO</T>
              {rawLines.map((l, i) => <T key={`${i}-${l}`} v="small" color={colors.textMuted}>{l}</T>)}
            </View>
          ) : null}
        </Card>
      ) : null}
    </Screen>
  );
}
