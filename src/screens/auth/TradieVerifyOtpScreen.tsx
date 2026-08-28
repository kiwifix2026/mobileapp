import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, SafeAreaView, ActivityIndicator } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../navigation/types';
import { verifyTradieSignupOtp } from '../../api/auth';
import { ApiError } from '../../api/client';

type Props = NativeStackScreenProps<AuthStackParamList, 'TradieVerifyOtp'>;

// First step of the new-tradie signup branch — proves the tradie controls
// this email (TRADIE_VERIFY OTP, no token) before they fill in any profile
// details. See TradiesController.upsert's comment: the backend trusts this
// step already happened by the time POST /tradies is called.
export default function TradieVerifyOtpScreen({ route, navigation }: Props) {
  const { email } = route.params;
  // devCode is ignored entirely — see OtpScreen.tsx for why (matches the
  // web app, which never reads that field either).
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleVerify = async () => {
    if (code.trim().length !== 6) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await verifyTradieSignupOtp(email, code.trim());
      navigation.replace('TradieOnboarding', { email });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>New here? Let's verify your email</Text>
        <Text style={styles.subtitle}>We sent a 6-digit code to {email}</Text>

        <TextInput
          style={styles.input}
          placeholder="123456"
          keyboardType="number-pad"
          maxLength={6}
          value={code}
          onChangeText={(t) => { setCode(t.replace(/\D/g, '')); setError(null); }}
          onSubmitEditing={handleVerify}
        />
        {error && <Text style={styles.error}>⚠️ {error}</Text>}

        <Pressable
          style={[styles.button, (code.length !== 6 || loading) && styles.buttonDisabled]}
          onPress={handleVerify}
          disabled={code.length !== 6 || loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Verify →</Text>}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  container: { flex: 1, padding: 24, paddingTop: 48, gap: 12 },
  title: { fontSize: 24, fontWeight: '800', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#64748B', marginBottom: 16 },
  input: {
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14, fontSize: 24, letterSpacing: 8, textAlign: 'center',
  },
  error: { color: '#DC2626', fontSize: 13 },
  button: {
    backgroundColor: '#16A34A', borderRadius: 12, paddingVertical: 16,
    alignItems: 'center', marginTop: 8,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
