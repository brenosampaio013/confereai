import { Stack } from 'expo-router';

/** As telas de conta trazem o próprio cabeçalho, então a pilha não desenha barra. */
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />;
}
