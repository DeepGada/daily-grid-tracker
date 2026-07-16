import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';

import { appStorage } from './storage';

const configuredUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const configuredKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

export const isSupabaseConfigured = Boolean(configuredUrl && configuredKey);

const supabaseUrl = configuredUrl || 'https://placeholder.supabase.co';
const supabaseKey = configuredKey || 'placeholder-publishable-key';

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: appStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
