import * as Font from 'expo-font';
import { Platform } from 'react-native';
import { font } from './theme';

/**
 * Registra a Archivo na web: o mesmo arquivo variável do site (pesos 400 a 800, 35 KB), para que
 * `fontWeight` escolha o peso. No Android e no iOS a fonte já vem dentro da build, pelo plugin
 * do expo-font no app.json, e nada precisa ser carregado aqui.
 */
export function carregarFontes(): Promise<void> {
  if (Platform.OS !== 'web') return Promise.resolve();
  return Font.loadAsync([
    {
      fontFamily: font.family,
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- arquivo de fonte empacotado pelo Metro
      fontDefinitions: [{ path: require('../../assets/fonts/Archivo-variavel.woff2'), weight: '400 800', display: Font.FontDisplay.SWAP }],
    },
  ]).catch(() => {
    // Sem a fonte, o navegador usa a do sistema: o app continua funcionando.
  });
}
