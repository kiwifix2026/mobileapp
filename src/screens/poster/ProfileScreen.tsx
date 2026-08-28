import React from 'react';
import { View, Text, Pressable, StyleSheet, SafeAreaView } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { PosterStackParamList } from '../../navigation/types';
import { useAuth } from '../../auth/AuthContext';

type Props = NativeStackScreenProps<PosterStackParamList, 'Profile'>;

// Kept intentionally minimal — the app has no `GET /customers/me` (or
// equivalent) endpoint to fetch a job poster's own name/mobile back, and
// AuthContext's session only ever stores {role, token, email}. Showing a
// fabricated name here would violate the same "real data only" rule the
// tradie side follows — email + sign out is genuinely everything available.
export default function ProfileScreen({}: Props) {
  const { session, signOut } = useAuth();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(session?.email?.[0] || '?').toUpperCase()}</Text>
        </View>
        <Text style={styles.email}>{session?.email}</Text>
        <Text style={styles.role}>Job poster</Text>

        <Pressable style={styles.signOutBtn} onPress={signOut}>
          <Text style={styles.signOutText}>🚪 Sign Out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  container: { flex: 1, alignItems: 'center', paddingTop: 60, paddingHorizontal: 24 },
  avatar: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: '#16A34A',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 28 },
  email: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  role: { fontSize: 13, color: '#64748B', marginTop: 4, marginBottom: 32 },
  signOutBtn: {
    width: '100%', backgroundColor: '#fff', borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', borderWidth: 1, borderColor: '#FECACA',
  },
  signOutText: { color: '#DC2626', fontWeight: '700', fontSize: 15 },
});
