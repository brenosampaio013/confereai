import { Image, ImageStyle } from 'expo-image';
import { useEffect, useState } from 'react';
import { Platform, StyleProp, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { signedImageUrls } from '@/services/marketplace';
import { colors } from './theme';

/**
 * Exibe uma foto do armazenamento privado via URL assinada temporária.
 * Na web a imagem é baixada com CORS e exibida como blob: o site roda isolado (COEP),
 * o que bloquearia imagens de outra origem carregadas diretamente.
 */
export function RemoteImage({ path, style, contentFit = 'cover' }: { path: string | null | undefined; style: StyleProp<ImageStyle>; contentFit?: 'cover' | 'contain' }) {
  const [uri, setUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    if (!path) return;
    (async () => {
      try {
        const urls = await signedImageUrls([path]);
        const url = urls[path];
        if (!url) throw new Error('sem URL');
        if (Platform.OS === 'web') {
          const blob = await (await fetch(url, { mode: 'cors' })).blob();
          objectUrl = URL.createObjectURL(blob);
          if (alive) setUri(objectUrl);
        } else if (alive) setUri(url);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);
  if (!path || failed || !uri) {
    return (
      <View style={[style as object, { backgroundColor: colors.navySoft, alignItems: 'center', justifyContent: 'center' }]}>
        <Ionicons name={failed || !path ? 'image-outline' : 'hourglass-outline'} size={22} color={colors.textFaint} />
      </View>
    );
  }
  return <Image source={{ uri }} style={style} contentFit={contentFit} transition={150} />;
}
