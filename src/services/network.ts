import NetInfo, { useNetInfo } from '@react-native-community/netinfo';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Na web, o teste de conexão padrão consulta a raiz do domínio ("/"). Quando o app é publicado em
// uma subpasta (ex.: GitHub Pages em /confereai), a raiz responde 404 e o app se consideraria offline.
// Aqui o teste passa a consultar o endereço do próprio app.
if (Platform.OS === 'web') {
  const base = (Constants.expoConfig?.experiments?.baseUrl ?? '').replace(/\/+$/, '');
  NetInfo.configure({ reachabilityUrl: `${base}/`, reachabilityMethod: 'HEAD', reachabilityTest: async (r) => r.status === 200 });
}

export async function isOnline(): Promise<boolean> {
  const s = await NetInfo.fetch();
  return !!s.isConnected && s.isInternetReachable !== false;
}

/** true = online, false = offline, null = ainda verificando. */
export function useOnline(): boolean | null {
  const s = useNetInfo();
  if (s.isConnected == null) return null;
  return s.isConnected && s.isInternetReachable !== false;
}
