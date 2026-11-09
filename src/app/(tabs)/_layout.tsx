import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Tabs } from 'expo-router/tabs';
import { View } from 'react-native';
import { useApp } from '@/state/AppContext';
import { colors } from '@/ui/theme';

export default function TabsLayout() {
  const { cart } = useApp();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.navy,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, minHeight: 62 },
        headerStyle: { backgroundColor: colors.surface },
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '700', color: colors.text },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Início', headerShown: false, tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" color={String(color)} size={size} /> }}
      />
      <Tabs.Screen
        name="offers"
        options={{ title: 'Ofertas', headerShown: false, tabBarIcon: ({ color, size }) => <Ionicons name="pricetags-outline" color={String(color)} size={size} /> }}
      />
      <Tabs.Screen
        name="scan-tab"
        options={{
          title: 'Escanear',
          tabBarAccessibilityLabel: 'Escanear produtos',
          tabBarIcon: () => (
            <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center', marginTop: -14, borderWidth: 4, borderColor: colors.surface }}>
              <Ionicons name="barcode-outline" color={colors.white} size={24} />
            </View>
          ),
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            router.push('/scan');
          },
        }}
      />
      <Tabs.Screen
        name="purchases"
        options={{
          title: 'Compras',
          tabBarBadge: cart.length ? cart.length : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.green, fontSize: 11 },
          tabBarIcon: ({ color, size }) => <Ionicons name="cart-outline" color={String(color)} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Perfil', tabBarIcon: ({ color, size }) => <Ionicons name="person-circle-outline" color={String(color)} size={size} /> }}
      />
    </Tabs>
  );
}
