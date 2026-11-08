import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';
import { newId } from './id';

/** Copia a foto da embalagem para a pasta permanente do app (fica só no aparelho). */
export async function persistProductPhoto(uri: string): Promise<string> {
  if (Platform.OS === 'web') {
    // Na web a foto é um endereço temporário do navegador: guarda uma miniatura no próprio banco.
    const ctx = ImageManipulator.manipulate(uri);
    ctx.resize({ width: 320 });
    const saved = await (await ctx.renderAsync()).saveAsync({ compress: 0.6, format: SaveFormat.JPEG, base64: true });
    return `data:image/jpeg;base64,${saved.base64}`;
  }
  const dir = new Directory(Paths.document, 'product-photos');
  dir.create({ idempotent: true, intermediates: true });
  const dest = new File(dir, `${newId()}.jpg`);
  new File(uri).copy(dest);
  return dest.uri;
}

/** Remove um arquivo temporário (ex.: fotos de cupom após a leitura). Erros são ignorados. */
export function deleteQuietly(uri: string | null | undefined) {
  if (!uri || Platform.OS === 'web') return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // arquivo já removido pelo sistema
  }
}
