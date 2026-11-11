import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from '@/state/AppContext';
import { Loading } from '@/ui/components';
import { colors } from '@/ui/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

function Ready() {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);
  return null;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AppProvider fallback={<Loading text="Abrindo seus dados…" />}>
        <Ready />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.navy,
            headerTitleStyle: { fontWeight: '700', color: colors.text },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.bg },
            headerBackButtonDisplayMode: 'minimal',
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="scan" options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'fade' }} />
          <Stack.Screen name="label" options={{ title: 'Ler etiqueta de preço' }} />
          <Stack.Screen name="item/add" options={{ title: 'Adicionar produto', presentation: 'modal' }} />
          <Stack.Screen name="item/[id]" options={{ title: 'Editar item' }} />
          <Stack.Screen name="receipt/capture" options={{ title: 'Conferir nota fiscal' }} />
          <Stack.Screen name="receipt/[id]" options={{ title: 'Revisar leitura do cupom' }} />
          <Stack.Screen name="report/[id]" options={{ title: 'Resultado da conferência' }} />
          <Stack.Screen name="purchase/[id]" options={{ title: 'Detalhes da compra' }} />
          <Stack.Screen name="product/[id]" options={{ title: 'Preços do produto' }} />
          <Stack.Screen name="capture" options={{ title: 'Foto do produto e preço' }} />
          <Stack.Screen name="prices" options={{ title: 'Preços registrados' }} />
          <Stack.Screen name="compare" options={{ title: 'Comparar compras' }} />
          <Stack.Screen name="auth" options={{ title: 'Sua conta', presentation: 'modal' }} />
          <Stack.Screen name="privacy" options={{ title: 'Privacidade' }} />
          <Stack.Screen name="offers/publish" options={{ title: 'Publicar promoção' }} />
          <Stack.Screen name="offers/[id]" options={{ title: 'Oferta' }} />
          <Stack.Screen name="offers/mine" options={{ title: 'Minhas publicações' }} />
          <Stack.Screen name="offers/store/[id]" options={{ title: 'Ofertas da unidade' }} />
          <Stack.Screen name="offers/notifications" options={{ title: 'Avisos de ofertas' }} />
          <Stack.Screen name="admin/index" options={{ title: 'Moderação' }} />
          <Stack.Screen name="admin/[id]" options={{ title: 'Revisar publicação' }} />
        </Stack>
      </AppProvider>
    </SafeAreaProvider>
  );
}
