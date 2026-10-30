import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
import { Alert, Linking, Modal, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatCnpj, isOfficialConsultUrl, isValidCnpj, NfceQrInfo, parseNfceQr } from '@/domain/fiscal';
import { formatBRL } from '@/domain/money';
import { parseReceipt } from '@/domain/receiptParser';
import type { ParsedReceipt } from '@/domain/types';
import { deleteQuietly } from '@/lib/files';
import { cameraPermissionView } from '@/lib/permissions';
import { OcrError, runOcr } from '@/services/ocr';
import { useOnline } from '@/services/network';
import { useApp } from '@/state/AppContext';
import { Banner, Button, Card, IconButton, KeyValue, Pill, Row, Screen, SectionTitle, T } from '@/ui/components';
import { useOcrConsent } from '@/ui/OcrConsent';
import { colors, radius, space } from '@/ui/theme';

const MAX_PHOTOS = 6;

export default function CaptureReceipt() {
  const { purchaseId } = useLocalSearchParams<{ purchaseId?: string }>();
  const { repo, bump } = useApp();
  const online = useOnline();
  const { ensureConsent, sheet } = useOcrConsent();
  const [photos, setPhotos] = useState<string[]>([]);
  const [qr, setQr] = useState<NfceQrInfo | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<OcrError | null>(null);
  const [purchaseLabel, setPurchaseLabel] = useState<string | null>(null);
  const processed = useRef(false);

  useEffect(() => {
    if (!purchaseId) return;
    repo.getPurchaseSummary(purchaseId).then((s) => {
      if (s) setPurchaseLabel(`${s.itemCount} ${s.itemCount === 1 ? 'item registrado' : 'itens registrados'} · ${formatBRL(s.cartTotalCents)}`);
    });
  }, [purchaseId, repo]);

  // Fotos do cupom não ficam guardadas: se o usuário sair sem processar, são apagadas.
  const photosRef = useRef(photos);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  useEffect(
    () => () => {
      if (!processed.current) photosRef.current.forEach(deleteQuietly);
    },
    [],
  );

  const addFromCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Câmera sem permissão', 'Libere a câmera nas configurações do aparelho ou escolha fotos da galeria.', [
        { text: 'Fechar', style: 'cancel' },
        { text: 'Abrir configurações', onPress: () => Linking.openSettings() },
      ]);
      return;
    }
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (!r.canceled && r.assets[0]) setPhotos((p) => [...p, r.assets[0].uri].slice(0, MAX_PHOTOS));
  };

  const addFromGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Galeria sem permissão', 'Libere o acesso às fotos nas configurações do aparelho.');
      return;
    }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: MAX_PHOTOS, quality: 0.85, orderedSelection: true });
    if (!r.canceled) setPhotos((p) => [...p, ...r.assets.map((a) => a.uri)].slice(0, MAX_PHOTOS));
  };

  const move = (i: number, dir: -1 | 1) => {
    setPhotos((p) => {
      const j = i + dir;
      if (j < 0 || j >= p.length) return p;
      const copy = [...p];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  };

  const remove = (i: number) => {
    setPhotos((p) => {
      deleteQuietly(p[i]);
      return p.filter((_, k) => k !== i);
    });
  };

  const saveAndOpen = async (parsed: ParsedReceipt, provider: string | null) => {
    const pid = purchaseId ?? (await repo.startPurchase('receipt_only', parsed.storeName)).id;
    if (qr) {
      parsed.accessKey = parsed.accessKey ?? qr.accessKey.key;
      parsed.cnpj = parsed.cnpj ?? qr.accessKey.cnpj;
    }
    const receiptId = await repo.saveParsedReceipt(pid, parsed, { qrUrl: qr?.url ?? null, qrTotalCents: qr?.totalCents ?? null, ocrProvider: provider });
    processed.current = true;
    photos.forEach(deleteQuietly);
    bump();
    router.replace(`/receipt/${receiptId}`);
  };

  const process = async () => {
    if (!photos.length) return;
    if (!(await ensureConsent())) return;
    setBusy(true);
    setError(null);
    try {
      const res = await runOcr('receipt', photos);
      const parsed = parseReceipt(res.parts.map((p) => p.lines));
      await saveAndOpen(parsed, res.provider);
    } catch (e) {
      setError(e instanceof OcrError ? e : new OcrError('service_error', e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  const manual = async () => {
    const empty: ParsedReceipt = {
      storeName: null,
      cnpj: null,
      issuedAt: null,
      accessKey: null,
      items: [],
      unassignedDiscountCents: 0,
      totals: { itemCount: null, subtotalCents: null, discountCents: null, surchargeCents: null, totalCents: qr?.totalCents ?? null },
      unparsedLines: [],
      warnings: ['Cupom digitado manualmente.'],
    };
    await saveAndOpen(empty, 'manual');
  };

  return (
    <Screen
      footer={
        <>
          <Button
            title={photos.length ? `Ler ${photos.length} ${photos.length === 1 ? 'foto' : 'fotos'} do cupom` : 'Adicione fotos do cupom'}
            icon="scan-outline"
            kind="confirm"
            onPress={process}
            loading={busy}
            disabled={!photos.length || online === false}
          />
          <Button title="Digitar os itens manualmente" kind="ghost" compact onPress={manual} disabled={busy} />
        </>
      }
    >
      {sheet}
      {purchaseId ? (
        <Banner t="navy" icon="cart-outline" title="Comparar com o carrinho">
          {purchaseLabel ? `A nota será comparada com os produtos registrados (${purchaseLabel}).` : 'A nota será comparada com os produtos registrados.'}
        </Banner>
      ) : (
        <Banner t="navy" icon="receipt-outline" title="Conferência só da nota">
          Sem produtos registrados, o Confere Aí analisa a própria nota: linhas repetidas, contas que não fecham e itens ilegíveis.
        </Banner>
      )}
      {online === false ? (
        <Banner t="yellow" icon="cloud-offline-outline" title="Sem internet">
          A leitura automática precisa de conexão. Aguarde a conexão voltar nesta tela ou digite os itens manualmente.
        </Banner>
      ) : null}

      <SectionTitle>Fotos do cupom ({photos.length}/{MAX_PHOTOS})</SectionTitle>
      <T v="small" color={colors.textMuted}>
        Cupom comprido? Fotografe em partes, de cima para baixo, deixando um pequeno trecho repetido entre uma foto e a próxima. Linhas repetidas na emenda são identificadas e mostradas para revisão.
      </T>
      {photos.map((uri, i) => (
        <Card key={uri} style={{ flexDirection: 'row', alignItems: 'center', padding: space.sm }}>
          <Image source={{ uri }} style={styles.thumb} contentFit="cover" />
          <View style={{ flex: 1 }}>
            <T v="bodyStrong">Parte {i + 1}</T>
            <T v="small" color={colors.textMuted}>{i === 0 ? 'Início do cupom' : i === photos.length - 1 ? 'Final do cupom' : 'Meio do cupom'}</T>
          </View>
          <IconButton icon="arrow-up" label="Mover para cima" onPress={() => move(i, -1)} size={20} />
          <IconButton icon="arrow-down" label="Mover para baixo" onPress={() => move(i, 1)} size={20} />
          <IconButton icon="trash-outline" label="Remover foto" onPress={() => remove(i)} color={colors.redText} size={20} />
        </Card>
      ))}
      <Row>
        <Button title="Fotografar" icon="camera-outline" onPress={addFromCamera} style={{ flex: 1 }} disabled={photos.length >= MAX_PHOTOS} />
        <Button title="Galeria" icon="images-outline" kind="secondary" onPress={addFromGallery} style={{ flex: 1 }} disabled={photos.length >= MAX_PHOTOS} />
      </Row>

      {error ? (
        <Banner t={error.reason === 'offline' || error.reason === 'not_configured' ? 'yellow' : 'red'} icon="alert-circle" title="A leitura automática não foi concluída">
          <T v="small" color={colors.text}>{error.message}</T>
          {error.reason === 'needs_account' ? <Button title="Entrar na conta" kind="secondary" compact onPress={() => router.push('/auth')} /> : null}
        </Banner>
      ) : null}

      <SectionTitle>QR Code da NFC-e (opcional)</SectionTitle>
      {qr ? (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <T v="heading">Dados do QR Code</T>
            <Pill label={qr.accessKey.valid ? 'Chave válida' : 'Chave com dígito inválido'} t={qr.accessKey.valid ? 'green' : 'yellow'} />
          </Row>
          <KeyValue label="CNPJ do emitente" value={`${formatCnpj(qr.accessKey.cnpj)}${isValidCnpj(qr.accessKey.cnpj) ? '' : ' (inválido)'}`} />
          <KeyValue label="Estado" value={qr.accessKey.uf ?? '—'} />
          <KeyValue label="Emissão" value={`${String(qr.accessKey.month).padStart(2, '0')}/${qr.accessKey.year}`} />
          <KeyValue label="Número / série" value={`${qr.accessKey.number} / ${qr.accessKey.series}`} />
          <KeyValue label="Valor total no QR" value={qr.totalCents != null ? formatBRL(qr.totalCents) : 'Não informado (emissão online)'} />
          <T v="small" color={colors.textMuted}>
            O QR Code não contém a lista de produtos. Ela pode ser vista no portal oficial da SEFAZ do estado, cujo formato varia; por isso a leitura por foto continua necessária.
          </T>
          {isOfficialConsultUrl(qr.url) ? (
            <Button title="Abrir consulta oficial (SEFAZ)" icon="open-outline" kind="secondary" compact onPress={() => WebBrowser.openBrowserAsync(qr.url!)} />
          ) : null}
          <Button title="Remover QR Code" kind="ghost" compact onPress={() => setQr(null)} />
        </Card>
      ) : (
        <Button title="Ler QR Code da nota" icon="qr-code-outline" kind="secondary" onPress={() => setQrOpen(true)} />
      )}

      <QrScanner
        visible={qrOpen}
        onClose={() => setQrOpen(false)}
        onResult={(info) => {
          setQr(info);
          setQrOpen(false);
        }}
      />
    </Screen>
  );
}

function QrScanner({ visible, onClose, onResult }: { visible: boolean; onClose: () => void; onResult: (q: NfceQrInfo) => void }) {
  const [permission, request] = useCameraPermissions();
  const [message, setMessage] = useState<string | null>(null);
  const done = useRef(false);
  useEffect(() => {
    if (visible) done.current = false;
  }, [visible]);
  const close = () => {
    setMessage(null);
    onClose();
  };
  const view = cameraPermissionView(permission);
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: colors.black }}>
        {visible && view.kind === 'granted' ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={(r) => {
              if (done.current) return;
              const info = parseNfceQr(r.data);
              if (info) {
                done.current = true;
                setMessage(null);
                onResult(info);
              } else {
                setMessage('Este QR Code não parece ser de uma NFC-e.');
              }
            }}
          />
        ) : null}
        <SafeAreaView style={{ flex: 1, justifyContent: 'space-between', padding: space.lg }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <IconButton icon="close" label="Fechar" color={colors.white} bg="rgba(0,0,0,0.45)" onPress={close} />
            <T v="bodyStrong" color={colors.white}>QR Code da NFC-e</T>
            <View style={{ width: 44 }} />
          </Row>
          {view.kind === 'granted' ? (
            <View style={styles.qrFrame}>
              <Ionicons name="qr-code-outline" size={40} color="rgba(255,255,255,0.5)" />
            </View>
          ) : (
            <Card>
              <T>{'message' in view ? view.message : 'Verificando permissão…'}</T>
              {view.kind === 'request' ? <Button title="Permitir câmera" onPress={() => request()} /> : null}
              {view.kind === 'blocked' ? <Button title="Abrir configurações" onPress={() => Linking.openSettings()} /> : null}
            </Card>
          )}
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, padding: space.md }}>
            <T v="small" center>{message ?? 'Aponte para o QR Code impresso no cupom.'}</T>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  thumb: { width: 56, height: 72, borderRadius: radius.sm, backgroundColor: colors.border, marginRight: space.sm },
  qrFrame: { alignSelf: 'center', width: 240, height: 240, borderWidth: 3, borderColor: 'rgba(255,255,255,0.9)', borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
});
