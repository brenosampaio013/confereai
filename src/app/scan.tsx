import { Ionicons } from '@expo/vector-icons';
import { BarcodeScanningResult, BarcodeType, CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { findByBarcode, isValidGtin, normalizeBarcode } from '@/domain/cart';
import { formatBRL } from '@/domain/money';
import { decisionToEvent, ScanDecision, ScanGuard } from '@/domain/scanGuard';
import type { CartItem } from '@/domain/types';
import { formatQuantity, isWeighed, MILLI } from '@/domain/units';
import { cameraPermissionView } from '@/lib/permissions';
import { useApp } from '@/state/AppContext';
import { BudgetStrip } from '@/ui/Budget';
import { Banner, Button, Field, IconButton, Money, Row, Sheet, T } from '@/ui/components';
import { colors, radius, space } from '@/ui/theme';

/** Formatos usados em supermercados. QR fica de fora para não confundir com o QR da NFC-e. */
const BARCODE_TYPES: BarcodeType[] = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'itf14', 'code39'];

export default function ScanScreen() {
  const { repo, cart, totals, active, ensureActivePurchase, bump, budget } = useApp();
  const [permission, requestPermission] = useCameraPermissions();
  const [focused, setFocused] = useState(false);
  const [torch, setTorch] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [repeat, setRepeat] = useState<CartItem | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const guard = useRef(new ScanGuard()).current;
  const busy = useRef(false);
  const loggedTechnical = useRef<string | null>(null);
  const cartRef = useRef(cart);
  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);

  // A câmera só fica ativa com a tela em foco; ao sair, os recursos são liberados.
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      busy.current = false;
      return () => {
        setFocused(false);
        setTorch(false);
      };
    }, []),
  );

  const last = useMemo(
    () => [...cart].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0] ?? null,
    [cart],
  );

  const handleDecision = async (decision: ScanDecision, manual: boolean) => {
    const purchase = active ?? (await ensureActivePurchase());
    if (decision.kind === 'technical_repeat') {
      if (loggedTechnical.current !== decision.code) {
        loggedTechnical.current = decision.code;
        await repo.logScanEvent({ purchaseId: purchase.id, type: 'scan_technical_repeat', barcode: decision.code, detail: 'Leitura repetida pela câmera ignorada' });
      }
      return;
    }
    loggedTechnical.current = null;
    await repo.logScanEvent({ purchaseId: purchase.id, type: decisionToEvent(decision, manual), barcode: decision.code });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (decision.kind === 'already_in_cart') {
      const item = findByBarcode(cartRef.current, decision.code);
      if (item) {
        setRepeat(item);
        return;
      }
    }
    busy.current = true;
    router.push({ pathname: '/item/add', params: { barcode: decision.code, via: manual ? 'manual' : 'scan' } });
  };

  const onScanned = (r: BarcodeScanningResult) => {
    if (busy.current || repeat || manualOpen) {
      // Mantém a janela de repetição técnica enquanto um diálogo está aberto.
      guard.touch(normalizeBarcode(r.data, r.type), Date.now());
      return;
    }
    const code = normalizeBarcode(r.data, r.type);
    if (!/^\d{6,14}$/.test(code)) return; // ignora códigos que não são de produto
    const decision = guard.evaluateCameraRead(code, Date.now(), (c) => !!findByBarcode(cartRef.current, c));
    if (decision.kind !== 'technical_repeat') {
      setFlash(code);
      setTimeout(() => setFlash(null), 900);
    }
    void handleDecision(decision, false);
  };

  const submitManual = () => {
    const code = manualCode.replace(/\D/g, '');
    if (!/^\d{6,14}$/.test(code)) {
      setManualError('Digite apenas os números do código (de 6 a 14 dígitos).');
      return;
    }
    if ((code.length === 8 || code.length >= 12) && !isValidGtin(code)) {
      setManualError('O dígito verificador não confere. Confira os números digitados.');
      return;
    }
    setManualOpen(false);
    setManualCode('');
    setManualError(null);
    const decision = guard.evaluateManual(code, Date.now(), (c) => !!findByBarcode(cartRef.current, c));
    void handleDecision(decision, true);
  };

  const addOneMore = async () => {
    if (!repeat) return;
    const item = repeat;
    setRepeat(null);
    if (isWeighed(item.saleUnit)) {
      // Nova pesagem é um novo item, com o peso informado pelo usuário.
      busy.current = true;
      router.push({ pathname: '/item/add', params: { barcode: item.barcode ?? '', via: 'scan', newLine: '1' } });
      return;
    }
    await repo.updateCartItem(item.id, { quantityMilli: item.quantityMilli + MILLI });
    await repo.logScanEvent({ purchaseId: item.purchaseId, type: 'quantity_increment_confirmed', barcode: item.barcode, cartItemId: item.id });
    bump();
  };

  const cancelRepeat = async () => {
    if (repeat) await repo.logScanEvent({ purchaseId: repeat.purchaseId, type: 'scan_cancelled', barcode: repeat.barcode, cartItemId: repeat.id });
    setRepeat(null);
  };

  const fixRead = async () => {
    if (!repeat) return;
    const item = repeat;
    setRepeat(null);
    await repo.logScanEvent({ purchaseId: item.purchaseId, type: 'scan_corrected', barcode: item.barcode, cartItemId: item.id });
    busy.current = true;
    router.push(`/item/${item.id}`);
  };

  const view = cameraPermissionView(permission, !cameraError);

  return (
    <View style={{ flex: 1, backgroundColor: colors.black }}>
      {view.kind === 'granted' ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          active={focused}
          enableTorch={torch && focused}
          barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
          onBarcodeScanned={focused ? onScanned : undefined}
          onMountError={(e) => setCameraError(e.message)}
        />
      ) : null}

      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <Row style={styles.topBar}>
          <IconButton icon="close" label="Fechar leitor" color={colors.white} bg="rgba(0,0,0,0.45)" onPress={() => router.back()} />
          <T v="bodyStrong" color={colors.white}>Escanear produtos</T>
          <IconButton
            icon={torch ? 'flashlight' : 'flashlight-outline'}
            label={torch ? 'Desligar lanterna' : 'Ligar lanterna'}
            color={torch ? colors.yellow : colors.white}
            bg="rgba(0,0,0,0.45)"
            onPress={() => setTorch((t) => !t)}
          />
        </Row>

        <View style={styles.center}>
          {view.kind === 'granted' ? (
            <>
              <View style={[styles.frame, flash ? { borderColor: colors.green } : null]}>
                {flash ? (
                  <View style={styles.flash}>
                    <Ionicons name="checkmark-circle" size={44} color={colors.green} />
                    <T v="bodyStrong" color={colors.white}>Código lido</T>
                  </View>
                ) : null}
              </View>
              <T v="small" color="#DCE6F0" center style={{ marginTop: space.md }}>
                Aponte para o código de barras. Segurar o produto parado não adiciona unidades extras.
              </T>
            </>
          ) : (
            <View style={styles.permissionBox}>
              <Ionicons name="camera-outline" size={40} color={colors.navy} />
              {view.kind === 'loading' ? <T>Verificando permissão da câmera…</T> : <T center>{'message' in view ? view.message : ''}</T>}
              {cameraError ? <T v="small" color={colors.redText} center>{cameraError}</T> : null}
              {view.kind === 'request' ? <Button title="Permitir câmera" icon="camera" onPress={() => requestPermission()} style={{ alignSelf: 'stretch' }} /> : null}
              {view.kind === 'blocked' ? <Button title="Abrir configurações" icon="settings-outline" onPress={() => Linking.openSettings()} style={{ alignSelf: 'stretch' }} /> : null}
              <Button title="Digitar código" icon="keypad-outline" kind="secondary" onPress={() => setManualOpen(true)} style={{ alignSelf: 'stretch' }} />
            </View>
          )}
        </View>

        <View style={styles.panel}>
          {last ? (
            <Pressable onPress={() => router.push(`/item/${last.id}`)} accessibilityRole="button" accessibilityLabel={`Último produto: ${last.name}. Toque para editar.`}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <T v="caption" color={colors.textMuted} style={{ textTransform: 'uppercase' }}>Último produto</T>
                  <T v="bodyStrong" numberOfLines={1}>{last.name}</T>
                  <T v="small" color={colors.textMuted}>
                    {formatQuantity(last.quantityMilli, last.saleUnit)} × {formatBRL(last.unitPriceCents)}
                    {isWeighed(last.saleUnit) ? (last.saleUnit === 'kg' ? '/kg' : '/L') : ''}
                  </T>
                </View>
                <Ionicons name="create-outline" size={20} color={colors.navy} />
              </Row>
            </Pressable>
          ) : (
            <T v="small" color={colors.textMuted}>Nenhum produto registrado nesta compra ainda.</T>
          )}
          <Row style={{ justifyContent: 'space-between', paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
            <View>
              <T v="caption" color={colors.textMuted} style={{ textTransform: 'uppercase' }}>Total da compra</T>
              <Money cents={totals.totalCents} v="title" />
            </View>
            <T v="small" color={colors.textMuted}>{totals.lineCount} {totals.lineCount === 1 ? 'item' : 'itens'}</T>
          </Row>
          {budget ? <BudgetStrip status={budget} /> : null}
          <Row>
            <Button title="Digitar código" icon="keypad-outline" kind="secondary" compact onPress={() => setManualOpen(true)} style={{ flex: 1 }} />
            <Button title="Foto" icon="camera-outline" kind="secondary" compact onPress={() => { busy.current = true; router.push('/capture'); }} style={{ flex: 1 }} />
            <Button title="Carrinho" icon="cart-outline" compact onPress={() => router.navigate('/purchases')} style={{ flex: 1 }} />
          </Row>
        </View>
      </SafeAreaView>

      <Sheet visible={!!repeat} onClose={cancelRepeat} title="Você já adicionou este produto">
        {repeat ? (
          <>
            <View style={{ gap: 4 }}>
              <T v="heading">{repeat.name}{repeat.packageLabel ? ` — ${repeat.packageLabel}` : ''}</T>
              <T color={colors.textMuted}>Quantidade atual: {formatQuantity(repeat.quantityMilli, repeat.saleUnit)}</T>
              <T color={colors.textMuted}>Preço unitário: {formatBRL(repeat.unitPriceCents)}{isWeighed(repeat.saleUnit) ? ' por kg/L' : ''}</T>
            </View>
            <Banner t="navy" icon="information-circle-outline">
              Se você pegou outra unidade, adicione. Se a câmera leu o mesmo item de novo por engano, cancele.
            </Banner>
            <Button title={isWeighed(repeat.saleUnit) ? 'Adicionar outra pesagem' : 'Adicionar mais uma unidade'} icon="add" kind="confirm" onPress={addOneMore} />
            <Button title="Corrigir leitura" icon="create-outline" kind="secondary" onPress={fixRead} />
            <Button title="Cancelar" kind="ghost" onPress={cancelRepeat} />
          </>
        ) : null}
      </Sheet>

      <Sheet visible={manualOpen} onClose={() => setManualOpen(false)} title="Digitar código de barras">
        <Field
          label="Código de barras"
          value={manualCode}
          onChangeText={(s) => {
            setManualCode(s.replace(/\D/g, ''));
            setManualError(null);
          }}
          keyboardType="number-pad"
          placeholder="Ex.: 7891234567895"
          autoFocus
          error={manualError}
          hint="Os números ficam logo abaixo das barras."
        />
        <Button title="Buscar produto" icon="search" onPress={submitManual} />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { justifyContent: 'space-between', paddingHorizontal: space.lg, paddingTop: space.sm },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl },
  frame: {
    width: '88%',
    aspectRatio: 1.9,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.9)',
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flash: { alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.55)', padding: space.md, borderRadius: radius.md },
  permissionBox: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.xl, gap: space.md, alignItems: 'center', width: '100%' },
  panel: { backgroundColor: colors.surface, margin: space.md, borderRadius: radius.lg, padding: space.lg, gap: space.md },
});
