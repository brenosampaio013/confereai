import NetInfo, { useNetInfo } from '@react-native-community/netinfo';

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
