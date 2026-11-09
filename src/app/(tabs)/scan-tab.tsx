import { Redirect } from 'expo-router';

/** A aba "Escanear" abre o leitor em tela cheia (ver listeners em (tabs)/_layout.tsx). */
export default function ScanTab() {
  return <Redirect href="/scan" />;
}
