import { Alert, AlertButton, Platform } from 'react-native';

/**
 * Alert.alert não aparece na web (react-native-web não o implementa).
 * Na web, usa as caixas nativas do navegador: uma confirmação por ação, na ordem;
 * recusar todas equivale ao botão de estilo "cancel".
 */
export function showAlert(title: string, message?: string, buttons?: AlertButton[]) {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }
  const text = [title, message].filter(Boolean).join('\n\n');
  const list = buttons ?? [];
  const cancel = list.find((b) => b.style === 'cancel');
  const actions = list.filter((b) => b !== cancel);
  if (actions.length === 0) {
    window.alert(text);
    cancel?.onPress?.();
    return;
  }
  if (actions.length === 1 && !cancel) {
    window.alert(text);
    actions[0].onPress?.();
    return;
  }
  for (const a of actions) {
    const question = actions.length === 1 ? `${text}\n\n(OK: ${a.text})` : `${text}\n\n${a.text}?`;
    if (window.confirm(question)) {
      a.onPress?.();
      return;
    }
  }
  cancel?.onPress?.();
}
