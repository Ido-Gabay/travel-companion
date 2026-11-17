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
  // Four tabs: Home (trips + today), Discover, Saved (collection), Profile.
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
        name="discover"
        options={{ title: t('tabs.discover'), tabBarIcon: tabIcon('search-outline', 'search') }}
      />
      <Tabs.Screen
        name="trips"
        // Trips are listed on Home now. The route stays (deep links, "See all"), hidden from the bar.
        options={{ title: t('tabs.trips'), href: null }}
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
