import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors } from '@/theme/tokens';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

function tabIcon(name: IoniconName, focusedName: IoniconName) {
  return ({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) => (
    <Ionicons
      name={focused ? focusedName : name}
      size={size}
      // Our tint colors are plain strings; anything else falls back to the theme.
      color={typeof color === 'string' ? color : colors.textTertiary}
    />
  );
}

export default function TabsLayout() {
  const { t } = useTranslation();

  // SDK 58: every tab must be declared here to appear in the tab bar.
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: t('tabs.home'), tabBarIcon: tabIcon('home-outline', 'home') }}
      />
      <Tabs.Screen
        name="trips"
        options={{ title: t('tabs.trips'), tabBarIcon: tabIcon('airplane-outline', 'airplane') }}
      />
      <Tabs.Screen
        name="places"
        options={{ title: t('tabs.places'), tabBarIcon: tabIcon('bookmark-outline', 'bookmark') }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          tabBarIcon: tabIcon('person-circle-outline', 'person-circle'),
        }}
      />
    </Tabs>
  );
}
