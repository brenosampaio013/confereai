import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useState } from 'react';
import { LayoutChangeEvent, Modal, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, IconButton, Row, T } from '../components';
import { colors, radius, space } from '../theme';

export interface Picked { uri: string; width: number; height: number }

const ZOOMS = [1, 1.5, 2, 3];

/**
 * Recorte e visualização antes do envio: girar, aproximar e enquadrar.
 * A visualização simula o recorte; ao confirmar, o recorte real é feito na imagem.
 */
export function ImageCropper({ image, onDone, onCancel }: { image: Picked | null; onDone: (p: Picked) => void; onCancel: () => void }) {
  // O componente é remontado (key) a cada nova imagem, então o estado inicial basta.
  const [img, setImg] = useState<Picked | null>(image);
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 }); // deslocamento do centro, em fração da imagem
  const [boxW, setBoxW] = useState(0);
  const [busy, setBusy] = useState(false);
  if (!img) return null;

  const maxOff = (1 - 1 / zoom) / 2;
  const clamp = (v: number) => Math.max(-maxOff, Math.min(maxOff, v));
  const move = (dx: number, dy: number) => setOff((o) => ({ x: clamp(o.x + dx / zoom / 4), y: clamp(o.y + dy / zoom / 4) }));
  const setZ = (z: number) => {
    const m = (1 - 1 / z) / 2;
    setZoom(z);
    setOff((o) => ({ x: Math.max(-m, Math.min(m, o.x)), y: Math.max(-m, Math.min(m, o.y)) }));
  };

  const boxH = boxW * (img.height / img.width);
  const scale = boxW ? (boxW * zoom) / img.width : 0;
  const left = -((img.width * (1 - 1 / zoom)) / 2 + off.x * img.width) * scale;
  const top = -((img.height * (1 - 1 / zoom)) / 2 + off.y * img.height) * scale;

  const rotate = async () => {
    setBusy(true);
    try {
      const ctx = ImageManipulator.manipulate(img.uri);
      ctx.rotate(90);
      const r = await (await ctx.renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.92 });
      setImg({ uri: r.uri, width: r.width, height: r.height });
      setZoom(1);
      setOff({ x: 0, y: 0 });
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (zoom === 1) return onDone(img);
    setBusy(true);
    try {
      const w = Math.round(img.width / zoom);
      const h = Math.round(img.height / zoom);
      const originX = Math.round(img.width * (0.5 + off.x) - w / 2);
      const originY = Math.round(img.height * (0.5 + off.y) - h / 2);
      const ctx = ImageManipulator.manipulate(img.uri);
      ctx.crop({ originX: Math.max(0, originX), originY: Math.max(0, originY), width: w, height: h });
      const r = await (await ctx.renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.92 });
      onDone({ uri: r.uri, width: r.width, height: r.height });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onCancel}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg, padding: space.lg, gap: space.md }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T v="title">Recortar foto</T>
          <IconButton icon="close" label="Cancelar" onPress={onCancel} />
        </Row>
        <T v="small" color={colors.textMuted}>Deixe o preço e o nome do produto bem legíveis. Evite cortar a etiqueta.</T>
        <View style={{ flex: 1, justifyContent: 'center' }} onLayout={(e: LayoutChangeEvent) => setBoxW(Math.min(e.nativeEvent.layout.width, e.nativeEvent.layout.height * (img.width / img.height)))}>
          {boxW ? (
            <View style={[styles.box, { width: boxW, height: boxH }]}>
              <Image source={{ uri: img.uri }} style={{ position: 'absolute', left, top, width: img.width * scale, height: img.height * scale }} contentFit="fill" />
            </View>
          ) : null}
        </View>
        <Row style={{ justifyContent: 'center' }}>
          {ZOOMS.map((z) => <Button key={z} title={`${z}x`} kind={zoom === z ? 'primary' : 'secondary'} compact onPress={() => setZ(z)} style={{ minWidth: 60 }} />)}
        </Row>
        <Row style={{ justifyContent: 'center' }}>
          <IconButton icon="arrow-back" label="Mover para a esquerda" onPress={() => move(-1, 0)} bg={colors.surface} />
          <IconButton icon="arrow-up" label="Mover para cima" onPress={() => move(0, -1)} bg={colors.surface} />
          <IconButton icon="arrow-down" label="Mover para baixo" onPress={() => move(0, 1)} bg={colors.surface} />
          <IconButton icon="arrow-forward" label="Mover para a direita" onPress={() => move(1, 0)} bg={colors.surface} />
          <IconButton icon="refresh" label="Girar 90 graus" onPress={rotate} bg={colors.surface} />
        </Row>
        <Button title="Usar esta foto" icon="checkmark" kind="confirm" onPress={apply} loading={busy} />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  box: { alignSelf: 'center', overflow: 'hidden', borderRadius: radius.md, borderWidth: 2, borderColor: colors.navy, backgroundColor: colors.black },
});
