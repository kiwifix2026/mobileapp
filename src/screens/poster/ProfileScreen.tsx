import React from 'react';
import { View, Text, Pressable, StyleSheet, SafeAreaView } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { PosterStackParamList } from '../../navigation/types';
import { useAuth } from '../../auth/AuthContext';
import ScreenBackground from '../../components/ScreenBackground';

type Props = NativeStackScreenProps<PosterStackParamList, 'Profile'>;

// Kept intentionally minimal — the app has no `GET /customers/me` (or
// equivalent) endpoint to fetch a job poster's own name/mobile back, and
// AuthContext's session only ever stores {role, token, email}. Showing a
// fabricated name here would violate the same "real data only" rule the
// tradie side follows — email + sign out is genuinely everything available.
// Restyled 2026-08-29 to match the tradie app's ProfileMenuScreen (fern
// background, ring avatar, floating sign-out card) for visual consistency
// across both apps — same visual language, no data or logic changes.
export default function ProfileScreen({}: Props) {
  const { session, signOut } = useAuth();

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safe}>
        <View style={styles.container}>
          <View style={styles.avatarRing}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{(session?.email?.[0] || '?').toUpperCase()}</Text>
            </View>
          </View>
          <Text style={styles.email}>{session?.email}</Text>
          <Text style={styles.role}>Job poster</Text>

          <View style={styles.signOutCard}>
            <Pressable style={styles.signOutRow} onPress={signOut}>
              <View style={styles.signOutIconCircle}>
                <Text style={styles.signOutIconGlyph}>🚪</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.signOutText}>Sign Out</Text>
                <Text style={styles.signOutSub}>Log out of your account</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, alignItems: 'center', paddingTop: 60, paddingHorizontal: 24 },
  avatarRing: {
    width: 100, height: 100, borderRadius: 50, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
    borderWidth: 3, borderColor: '#BBF7D0',
    shadowColor: '#0F172A', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  avatar: {
    width: 88, height: 88, borderRadius: 44, backgroundColor: '#16A34A',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 30 },
  email: { fontSize: 18, fontWeight: '800', color: '#14251B' },
  role: { fontSize: 14, color: '#16A34A', fontWeight: '600', marginTop: 4, marginBottom: 28 },
  signOutCard: {
    width: '100%', backgroundColor: 'rgba(254,226,226,0.75)', borderRadius: 20, overflow: 'hidden',
  },
  signOutRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 16, gap: 14 },
  signOutIconCircle: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(220,38,38,0.14)',
    alignItems: 'center', justifyContent: 'center',
  },
  signOutIconGlyph: { fontSize: 20 },
  signOutText: { fontSize: 16, fontWeight: '800', color: '#DC2626' },
  signOutSub: { fontSize: 13, color: '#DC262699', marginTop: 2 },
  chevron: { fontSize: 22, color: '#DC2626', fontWeight: '700' },
});
