import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/tabs';
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
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, minHeight: 60 },
        headerStyle: { backgroundColor: colors.surface },
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '700', color: colors.text },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Início',
          headerShown: false,
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" color={String(color)} size={size} />,
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: 'Compra atual',
          tabBarLabel: 'Carrinho',
          tabBarBadge: cart.length ? cart.length : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.green, fontSize: 11 },
          tabBarIcon: ({ color, size }) => <Ionicons name="cart-outline" color={String(color)} size={size} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'Histórico',
          tabBarIcon: ({ color, size }) => <Ionicons name="time-outline" color={String(color)} size={size} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Conta e dados',
          tabBarLabel: 'Conta',
          tabBarIcon: ({ color, size }) => <Ionicons name="person-circle-outline" color={String(color)} size={size} />,
        }}
      />
    </Tabs>
  );
}
