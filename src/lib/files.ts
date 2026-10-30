import { Directory, File, Paths } from 'expo-file-system';
import { newId } from './id';

/** Copia a foto da embalagem para a pasta permanente do app (fica só no aparelho). */
export function persistProductPhoto(uri: string): string {
  const dir = new Directory(Paths.document, 'product-photos');
  dir.create({ idempotent: true, intermediates: true });
  const dest = new File(dir, `${newId()}.jpg`);
  new File(uri).copy(dest);
  return dest.uri;
}

/** Remove um arquivo temporário (ex.: fotos de cupom após a leitura). Erros são ignorados. */
export function deleteQuietly(uri: string | null | undefined) {
  if (!uri) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // arquivo já removido pelo sistema
  }
}
