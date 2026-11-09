/** Estado de permissão da câmera traduzido para o que a interface deve mostrar. */
export type CameraPermissionView =
  | { kind: 'loading' }
  | { kind: 'granted' }
  | { kind: 'request'; message: string }
  | { kind: 'blocked'; message: string }
  | { kind: 'unavailable'; message: string };

export interface PermissionLike {
  granted: boolean;
  canAskAgain: boolean;
  status: 'granted' | 'denied' | 'undetermined' | string;
}

export function cameraPermissionView(p: PermissionLike | null | undefined, cameraAvailable = true): CameraPermissionView {
  if (!cameraAvailable) {
    return { kind: 'unavailable', message: 'Não encontramos uma câmera disponível neste aparelho. Você pode digitar o código de barras.' };
  }
  if (!p) return { kind: 'loading' };
  if (p.granted) return { kind: 'granted' };
  if (p.canAskAgain) {
    return {
      kind: 'request',
      message: 'Para ler códigos de barras e fotografar cupons, o Confere Aí precisa acessar a câmera. As imagens ficam no aparelho, salvo quando você pedir a leitura automática.',
    };
  }
  return {
    kind: 'blocked',
    message: 'O acesso à câmera foi negado. Para escanear, libere a câmera nas configurações do aparelho. Enquanto isso, você pode digitar o código manualmente.',
  };
}

/** Permissão de localização para publicar/confirmar ofertas. Nunca bloqueia a navegação no marketplace. */
export type LocationPermissionView =
  | { kind: 'granted' }
  | { kind: 'request'; message: string }
  | { kind: 'blocked'; message: string }
  | { kind: 'loading' };

export function locationPermissionView(p: PermissionLike | null | undefined): LocationPermissionView {
  if (!p) return { kind: 'loading' };
  if (p.granted) return { kind: 'granted' };
  if (p.canAskAgain) {
    return {
      kind: 'request',
      message:
        'Usamos sua localização só no momento da publicação, para conferir se você está perto do supermercado escolhido. Guardamos apenas a distância até a loja, nunca suas coordenadas.',
    };
  }
  return {
    kind: 'blocked',
    message:
      'A localização está desativada para o Confere Aí. Você ainda pode publicar escolhendo o supermercado manualmente; a oferta passará por análise antes de aparecer para todos.',
  };
}
