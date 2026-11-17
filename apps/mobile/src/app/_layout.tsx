import '@/i18n/i18n';
import { QueryClientProvider } from '@tanstack/react-query';
import { LocaleProvider, Stack } from 'expo-router';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ConfigErrorScreen } from '@/components/ConfigErrorScreen';
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { LocaleSync } from '@/features/me/LocaleSync';
import { AppLocaleProvider, useLocale } from '@/i18n/LocaleProvider';
import { wakeApi } from '@/lib/api';
import { envResult } from '@/lib/env';
import { queryClient } from '@/lib/query-client';
import { colors } from '@/theme/tokens';

export default function RootLayout() {
  if (!envResult.ok) {
    return <ConfigErrorScreen problems={envResult.problems} />;
  }
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AppLocaleProvider>
          <AuthProvider>
            <RootNavigator />
          </AuthProvider>
        </AppLocaleProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const { session, initializing } = useAuth();
  const { direction, ready } = useLocale();

  // Start waking the (possibly sleeping) API while the app restores the session.
  useEffect(() => {
    wakeApi();
  }, []);

  if (initializing || !ready) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const signedIn = session !== null;

  return (
    <LocaleProvider direction={direction}>
      {/* `direction` flips the whole layout immediately when the language changes. */}
      <View style={[styles.root, { direction }]}>
        <StatusBar style="dark" />
        {signedIn ? <LocaleSync /> : null}
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          {/* SDK 58: redirectTo names where a blocked route goes (signed out -> welcome). */}
          <Stack.Protected guard={signedIn} redirectTo="/welcome">
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="trips/new" options={{ presentation: 'modal' }} />
            <Stack.Screen name="trips/[id]/index" />
            <Stack.Screen name="trips/[id]/add-places" options={{ presentation: 'modal' }} />
            <Stack.Screen name="places/new" options={{ presentation: 'modal' }} />
            <Stack.Screen name="places/[id]" />
          </Stack.Protected>
          <Stack.Protected guard={!signedIn} redirectTo="/">
            <Stack.Screen name="(auth)" />
          </Stack.Protected>
        </Stack>
      </View>
    </LocaleProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
