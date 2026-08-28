import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, SafeAreaView, ActivityIndicator } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../navigation/types';
import { sendCustomerOtp, sendTradieLoginOtp, sendTradieSignupOtp } from '../../api/auth';
import { ApiError } from '../../api/client';

type Props = NativeStackScreenProps<AuthStackParamList, 'EmailEntry'>;

export default function EmailEntryScreen({ route, navigation }: Props) {
  const { role } = route.params;
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Real format check (was just "@" + length>3, which let through garbage
  // like "name@gmai.net") — still not deliverability-proof, but catches
  // obviously malformed input before we hit the network.
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const isValidEmail = EMAIL_RE.test(email.trim());

  const handleContinue = async () => {
    if (!isValidEmail) {
      setError('Please enter a valid email address.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const normalized = email.trim().toLowerCase();
      if (role === 'customer') {
        await sendCustomerOtp(normalized);
        navigation.navigate('Otp', { role, email: normalized });
        return;
      }
      try {
        await sendTradieLoginOtp(normalized);
        navigation.navigate('Otp', { role, email: normalized });
      } catch (err) {
        // "No tradie account found for this email" (401) means this is a
        // brand new tradie, not an error to dead-end on — move straight
        // into the signup branch (email-verify OTP, then profile details)
        // instead of just showing a red banner.
        if (err instanceof ApiError && err.status === 401 && /no tradie account/i.test(err.message)) {
          await sendTradieSignupOtp(normalized);
          navigation.navigate('TradieVerifyOtp', { email: normalized });
          return;
        }
        throw err;
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>What's your email?</Text>
        <Text style={styles.subtitle}>
          {role === 'customer'
            ? "We'll text a code to your email to get you started."
            : "We'll check if you already have a tradie account — if not, we'll get you set up."}
        </Text>

        <TextInput
          style={styles.input}
          placeholder="you@example.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          value={email}
          onChangeText={(t) => { setEmail(t); setError(null); }}
          onSubmitEditing={handleContinue}
        />
        {error && <Text style={styles.error}>⚠️ {error}</Text>}

        <Pressable
          style={[styles.button, (!isValidEmail || loading) && styles.buttonDisabled]}
          onPress={handleContinue}
          disabled={!isValidEmail || loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Continue →</Text>}
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
    paddingHorizontal: 16, paddingVertical: 14, fontSize: 16,
  },
  error: { color: '#DC2626', fontSize: 13 },
  button: {
    backgroundColor: '#16A34A', borderRadius: 12, paddingVertical: 16,
    alignItems: 'center', marginTop: 8,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
