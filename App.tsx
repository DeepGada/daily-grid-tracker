import type { Session } from '@supabase/supabase-js';
import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { AuthScreen } from './src/components/AuthScreen';
import { TrackerScreen } from './src/components/TrackerScreen';
import { isSupabaseConfigured, supabase } from './src/lib/supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'android') {
      void Notifications.setNotificationChannelAsync('daily-reminders', {
        name: 'Daily reminders',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    if (!isSupabaseConfigured) {
      setReady(true);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setReady(true);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      {!ready ? null : session ? <TrackerScreen user={session.user} /> : <AuthScreen />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F7F8FA',
  },
});
