import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, SafeAreaView, ActivityIndicator } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../navigation/types';
import { verifyCustomerOtp, verifyTradieLoginOtp } from '../../api/auth';
import { ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import ScreenBackground from '../../components/ScreenBackground';

type Props = NativeStackScreenProps<AuthStackParamList, 'Otp'>;

export default function OtpScreen({ route }: Props) {
  const { role, email } = route.params;
  const { signIn } = useAuth();
  // The web app never reads the backend's devCode field either — it just
  // waits for the real code regardless. Matching that here: devCode is
  // ignored entirely, not read, not shown, not auto-filled.
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
      if (role === 'customer') {
        const result = await verifyCustomerOtp(email, code.trim());
        await signIn({ role: 'customer', token: result.accessToken, email: result.customer.email });
      } else {
        const result = await verifyTradieLoginOtp(email, code.trim());
        await signIn({ role: 'tradie', token: result.accessToken, email: result.tradie.email });
      }
      // No explicit navigation call needed — RootNavigator swaps to the
      // signed-in stack automatically once AuthContext's session updates.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenBackground>
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>Enter your code</Text>
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
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, padding: 24, paddingTop: 48, gap: 12 },
  title: { fontSize: 24, fontWeight: '800', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#64748B', marginBottom: 16 },
  input: {
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.95)',
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
