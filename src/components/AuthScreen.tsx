import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { isSupabaseConfigured, supabase } from '../lib/supabase';

type Mode = 'signIn' | 'signUp';

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('signUp');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'info' | 'error'>('info');

  async function submit() {
    setMessage('');

    if (!isSupabaseConfigured) {
      const text = 'Add the Supabase values to .env before signing in.';
      setMessageTone('error');
      setMessage(text);
      Alert.alert('Setup required', text);
      return;
    }

    const cleanedEmail = email.trim().toLowerCase();
    if (!cleanedEmail || password.length < 6) {
      const text = 'Enter a valid email and a password with at least 6 characters.';
      setMessageTone('error');
      setMessage(text);
      Alert.alert('Check your details', text);
      return;
    }

    setBusy(true);
    setMessageTone('info');
    setMessage(mode === 'signIn' ? 'Signing in...' : 'Creating your account...');
    try {
      if (mode === 'signIn') {
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanedEmail,
          password,
        });
        if (error) throw error;
        setMessage('Signed in. Loading your grid...');
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: cleanedEmail,
          password,
        });
        if (error) throw error;
        if (!data.session) {
          const text = 'Open the confirmation email, then return here and sign in.';
          setMessageTone('info');
          setMessage(text);
          Alert.alert('Check your email', text);
          setMode('signIn');
        } else {
          setMessage('Account created. Loading your grid...');
        }
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Unknown error';
      setMessageTone('error');
      setMessage(text);
      Alert.alert('Could not continue', text);
    } finally {
      setBusy(false);
    }
  }

  async function resendConfirmation() {
    const cleanedEmail = email.trim().toLowerCase();
    if (!cleanedEmail) {
      const text = 'Enter your email first.';
      setMessageTone('error');
      setMessage(text);
      return;
    }

    setBusy(true);
    setMessageTone('info');
    setMessage('Sending confirmation email...');
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: cleanedEmail,
      });
      if (error) throw error;
      setMessage('Confirmation email sent. Open it, then return here and sign in.');
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Unknown error';
      setMessageTone('error');
      setMessage(text);
      Alert.alert('Could not resend email', text);
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle() {
    setBusy(true);
    setMessageTone('info');
    setMessage('Opening Google sign-in...');
    try {
      const redirectTo = Platform.OS === 'web' && 'location' in globalThis ? globalThis.location.origin : undefined;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: redirectTo ? { redirectTo } : undefined,
      });
      if (error) throw error;
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Unknown error';
      setMessageTone('error');
      setMessage(text);
      Alert.alert('Google sign-in failed', text);
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.page}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.brandMark}>
        {Array.from({ length: 9 }).map((_, index) => (
          <View key={index} style={[styles.brandCell, index > 4 && styles.brandCellDark]} />
        ))}
      </View>
      <Text style={styles.title}>Tracking Tabs</Text>
      <Text style={styles.subtitle}>Private daily number trackers with independent graph tabs.</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{mode === 'signIn' ? 'Sign in' : 'Create account'}</Text>
        <Text style={styles.helper}>Use the same account on another phone to restore and sync your data.</Text>

        <Text style={styles.label}>Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="At least 6 characters"
          secureTextEntry
          autoCapitalize="none"
          style={styles.input}
        />

        <Pressable
          accessibilityRole="button"
          onPress={submit}
          disabled={busy}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, busy && styles.disabled]}
        >
          {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>{mode === 'signIn' ? 'Sign in' : 'Create account'}</Text>}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => void signInWithGoogle()}
          disabled={busy}
          style={({ pressed }) => [styles.googleButton, pressed && styles.pressed, busy && styles.disabled]}
        >
          <Text style={styles.googleMark}>G</Text>
          <Text style={styles.googleText}>Continue with Google</Text>
        </Pressable>

        <Pressable
          onPress={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}
          style={styles.linkButton}
        >
          <Text style={styles.linkText}>
            {mode === 'signIn' ? 'New here? Create an account' : 'Already have an account? Sign in'}
          </Text>
        </Pressable>

        {mode === 'signIn' ? (
          <Pressable onPress={() => void resendConfirmation()} disabled={busy} style={styles.subtleButton}>
            <Text style={styles.subtleButtonText}>Resend confirmation email</Text>
          </Pressable>
        ) : null}

        {message ? (
          <View style={[styles.messageBox, messageTone === 'error' && styles.messageBoxError]}>
            <Text style={[styles.messageText, messageTone === 'error' && styles.messageTextError]}>{message}</Text>
          </View>
        ) : null}
      </View>

      {!isSupabaseConfigured && (
        <View style={styles.setupNotice}>
          <Text style={styles.setupTitle}>Developer setup required</Text>
          <Text style={styles.setupText}>Copy .env.example to .env and add your Supabase project URL and publishable key.</Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#F7F8FA',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  brandMark: {
    width: 62,
    height: 62,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    alignSelf: 'center',
    marginBottom: 16,
  },
  brandCell: {
    width: 18,
    height: 18,
    borderRadius: 4,
    backgroundColor: '#BFD7FF',
  },
  brandCellDark: {
    backgroundColor: '#2563EB',
  },
  title: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 22,
    color: '#6B7280',
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 22,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
  },
  helper: {
    marginTop: 6,
    marginBottom: 18,
    fontSize: 13,
    lineHeight: 19,
    color: '#6B7280',
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    minHeight: 48,
    fontSize: 16,
    color: '#111827',
  },
  primaryButton: {
    backgroundColor: '#2563EB',
    minHeight: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  primaryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  googleButton: {
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  googleMark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    lineHeight: 24,
    textAlign: 'center',
    color: '#2563EB',
    backgroundColor: '#EFF6FF',
    fontWeight: '900',
  },
  googleText: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '800',
  },
  linkButton: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  linkText: {
    color: '#2563EB',
    fontWeight: '700',
  },
  subtleButton: {
    alignItems: 'center',
    paddingBottom: 12,
  },
  subtleButtonText: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '700',
  },
  messageBox: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  messageBoxError: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  messageText: {
    color: '#1E3A8A',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  messageTextError: {
    color: '#991B1B',
  },
  pressed: {
    opacity: 0.82,
  },
  disabled: {
    opacity: 0.55,
  },
  setupNotice: {
    marginTop: 14,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  setupTitle: {
    color: '#9A3412',
    fontWeight: '800',
  },
  setupText: {
    color: '#9A3412',
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
  },
});
