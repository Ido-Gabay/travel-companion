import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { envResult } from './env';

/**
 * Supabase is used only for authentication. App data goes through our API.
 *
 * Session storage: AsyncStorage (not encrypted) for Phase 1. All reads and
 * writes go through this adapter, so moving to an encrypted store later is a
 * change in this one place.
 */
const sessionStorage = {
  getItem: (key: string) => AsyncStorage.getItem(key),
  setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
  removeItem: (key: string) => AsyncStorage.removeItem(key),
};

export const supabase: SupabaseClient | null = envResult.ok
  ? createClient(envResult.env.supabaseUrl, envResult.env.supabasePublishableKey, {
      auth: {
        storage: sessionStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

// Refresh tokens only while the app is in the foreground.
if (supabase) {
  const client = supabase;
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void client.auth.startAutoRefresh();
    } else {
      void client.auth.stopAutoRefresh();
    }
  });
}

export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error('Supabase is not configured. See apps/mobile/.env.example.');
  return supabase;
}
