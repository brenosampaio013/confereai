import { router } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useApp } from '@/state/AppContext';
import { Banner, Button, Sheet, T } from './components';
import { colors } from './theme';

/**
 * Consentimento antes do primeiro envio de imagens ao serviço de leitura automática.
 * Uso: const { ensureConsent, sheet } = useOcrConsent(); ... if (await ensureConsent()) ...
 */
export function useOcrConsent() {
  const { repo } = useApp();
  const [open, setOpen] = useState(false);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const ensureConsent = useCallback(async () => {
    if ((await repo.getSetting('ocr_consent')) === '1') return true;
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, [repo]);

  const answer = async (ok: boolean) => {
    if (ok) await repo.setSetting('ocr_consent', '1');
    setOpen(false);
    resolver.current?.(ok);
    resolver.current = null;
  };

  const sheet = (
    <Sheet visible={open} onClose={() => answer(false)} title="Leitura automática de imagens">
      <T>
        Para ler o texto da foto, a imagem é enviada com conexão segura ao servidor do Confere Aí, que a repassa ao serviço de
        reconhecimento de texto configurado pelo operador do aplicativo (inteligência artificial ou OCR em nuvem).
      </T>
      <Banner t="navy" icon="shield-checkmark-outline">
        As imagens não são armazenadas no servidor: são usadas só para extrair o texto. No aparelho, as fotos do cupom são apagadas após a leitura. Apenas os dados que você revisar são salvos.
      </Banner>
      <T v="small" color={colors.textMuted}>Se preferir, você pode digitar os dados manualmente; todas as outras funções continuam disponíveis.</T>
      <Button title="Concordo, ler a imagem" icon="checkmark" kind="confirm" onPress={() => answer(true)} />
      <Button title="Ler a política de privacidade" kind="secondary" onPress={() => { answer(false); router.push('/privacy'); }} />
      <Button title="Agora não" kind="ghost" onPress={() => answer(false)} />
    </Sheet>
  );
  return { ensureConsent, sheet };
}
