import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { showAlert } from '@/lib/dialog';
import { newId } from '@/lib/id';
import { OcrError, readProductPhoto } from '@/services/ocr';
import { handoff } from '@/state/handoff';
import { Banner, Button, Card, Row, Screen, T } from '@/ui/components';
import { useOcrConsent } from '@/ui/OcrConsent';
import { colors } from '@/ui/theme';

/**
 * Foto do produto com a etiqueta de preço. A leitura preenche o formulário do item,
 * onde o usuário confere e corrige tudo antes de salvar.
 */
export default function CaptureScreen() {
  const { ensureConsent, sheet } = useOcrConsent();
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<OcrError | null>(null);

  const pick = async (fromCamera: boolean) => {
    const perm = fromCamera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showAlert('Permissão necessária', fromCamera ? 'Permita o acesso à câmera para fotografar o produto.' : 'Permita o acesso às fotos para escolher uma imagem.');
      return;
    }
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8 };
    const r = fromCamera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (!r.canceled && r.assets[0]) {
      setPhoto(r.assets[0].uri);
      setError(null);
    }
  };

  const read = async () => {
    if (!photo) return;
    if (!(await ensureConsent())) return;
    setBusy(true);
    setError(null);
    try {
      const { reading } = await readProductPhoto(photo);
      const token = newId();
      handoff.putLabel(token, reading, photo);
      router.replace({ pathname: '/item/add', params: { via: 'manual', capture: token, ...(reading.barcode ? { barcode: reading.barcode } : {}) } });
    } catch (e) {
      setError(e instanceof OcrError ? e : new OcrError('service_error', e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      {sheet}
      <T color={colors.textMuted}>
        Enquadre o produto e a etiqueta de preço da gôndola na mesma foto, de frente e com boa luz. O nome, a marca, o peso e os preços lidos aparecem para você conferir antes de salvar.
      </T>
      {photo ? (
        <Image source={{ uri: photo }} style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: 12, backgroundColor: colors.border }} contentFit="contain" accessibilityLabel="Foto escolhida" />
      ) : (
        <Card>
          <T v="bodyStrong">Para uma boa leitura</T>
          <T v="small" color={colors.textMuted}>• A frente da embalagem deve aparecer, com marca e peso legíveis.</T>
          <T v="small" color={colors.textMuted}>• A etiqueta deve ser a que fica logo abaixo ou ao lado do produto.</T>
          <T v="small" color={colors.textMuted}>• Evite pegar etiquetas de outros produtos na mesma foto.</T>
        </Card>
      )}
      <Row>
        <Button title={photo ? 'Nova foto' : 'Fotografar'} icon="camera-outline" kind={photo ? 'secondary' : 'primary'} onPress={() => pick(true)} style={{ flex: 1 }} />
        <Button title="Galeria" icon="images-outline" kind="secondary" onPress={() => pick(false)} style={{ flex: 1 }} />
      </Row>
      {photo ? <Button title="Identificar produto e preço" icon="sparkles-outline" kind="confirm" onPress={read} loading={busy} /> : null}

      {error ? (
        <Banner t={error.reason === 'offline' || error.reason === 'not_configured' ? 'yellow' : 'red'} icon="alert-circle" title="Não foi possível ler automaticamente">
          <T v="small" color={colors.text}>{error.message}</T>
          <Button title="Digitar os dados" kind="secondary" compact onPress={() => router.replace({ pathname: '/item/add', params: { via: 'manual' } })} />
        </Banner>
      ) : null}
      <T v="small" color={colors.textFaint}>
        A leitura é feita por inteligência artificial e pode errar. Os valores só são usados depois da sua conferência.
      </T>
    </Screen>
  );
}
