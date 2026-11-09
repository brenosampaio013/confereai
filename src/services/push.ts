/**
 * Registro do aparelho para notificações push (Expo Push). O envio é feito pela Edge Function
 * `send-push`, que lê a tabela `notifications` (somente eventos reais) e respeita as preferências.
 */
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';
import { savePushToken } from './marketplace';

export async function enablePush(): Promise<{ ok: boolean; message: string }> {
  if (Platform.OS === 'web') return { ok: false, message: 'Na versão web, os avisos aparecem dentro do app (sininho na aba Ofertas).' };
  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  if (!projectId) return { ok: false, message: 'Notificações push ainda não configuradas neste build (falta o projectId do EAS). Os avisos continuam no app.' };
  let perm = await Notifications.getPermissionsAsync();
  if (!perm.granted && perm.canAskAgain) perm = await Notifications.requestPermissionsAsync();
  if (!perm.granted) return { ok: false, message: 'Permissão de notificações negada. Você pode ativá-la nas configurações do aparelho.' };
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('ofertas', { name: 'Ofertas', importance: AndroidImportance.DEFAULT });
  }
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await savePushToken(token, Platform.OS === 'ios' ? 'ios' : 'android');
  return { ok: true, message: 'Notificações ativadas neste aparelho.' };
}
