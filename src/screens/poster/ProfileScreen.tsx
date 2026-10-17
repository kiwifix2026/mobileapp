import React, { useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, SafeAreaView, Image, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import type { PosterStackParamList } from '../../navigation/types';
import { useAuth } from '../../auth/AuthContext';
import ScreenBackground from '../../components/ScreenBackground';
import LegalFooter from '../../components/LegalFooter';
import { getMyCustomerProfile } from '../../api/extras';
import { getSignedUrl } from '../../api/uploads';

type Props = NativeStackScreenProps<PosterStackParamList, 'Profile'>;

// Job poster's Profile tab — name/photo from GET /customers/me (the same
// endpoint web's profile.html uses), an Edit Profile row, Sign Out, and the
// legal footer. Styled like the tradie app's ProfileMenuScreen.
export default function ProfileScreen({ navigation }: Props) {
  const { session, signOut } = useAuth();

  const { data: profile, refetch } = useQuery({
    queryKey: ['customerProfile', session?.email],
    queryFn: () => getMyCustomerProfile(session!.token),
  });
  // Root of a bottom-tab stack stays mounted — refetch on focus so edits
  // made on the Edit Profile screen show up straight away.
  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const { data: avatarUrl } = useQuery({
    queryKey: ['customerAvatarUrl', profile?.photoUrl],
    queryFn: () => getSignedUrl(profile!.photoUrl!),
    enabled: !!profile?.photoUrl,
  });

  const fullName = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ');
  const initials = (((profile?.firstName || '')[0] || '') + ((profile?.lastName || '')[0] || '')) || (session?.email?.[0] || '?');

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.avatarRing}>
            <View style={styles.avatar}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
              ) : (
                <Text style={styles.avatarText}>{initials.toUpperCase()}</Text>
              )}
            </View>
          </View>
          <Text style={styles.email}>{fullName || session?.email}</Text>
          {!!fullName && <Text style={styles.emailSub}>{session?.email}</Text>}
          <Text style={styles.role}>Job poster</Text>

          <View style={styles.menuCard}>
            <Pressable style={styles.menuRow} onPress={() => navigation.navigate('EditPosterProfile')}>
              <View style={styles.editIconCircle}>
                <Ionicons name="create-outline" size={22} color="#16A34A" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuText}>Edit Profile</Text>
                <Text style={styles.menuSub}>Name, mobile, photo and address</Text>
              </View>
              <Text style={styles.menuChevron}>›</Text>
            </Pressable>
          </View>

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

          <LegalFooter style={{ marginTop: 24 }} />
        </ScrollView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 24, paddingBottom: 40 },
  avatarRing: {
    width: 100, height: 100, borderRadius: 50, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
    borderWidth: 3, borderColor: '#BBF7D0',
    shadowColor: '#0F172A', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  avatar: {
    width: 88, height: 88, borderRadius: 44, backgroundColor: '#16A34A',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 30 },
  email: { fontSize: 18, fontWeight: '800', color: '#14251B' },
  emailSub: { fontSize: 13, color: '#64748B', marginTop: 2 },
  menuCard: {
    width: '100%', backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 20, overflow: 'hidden', marginBottom: 16,
  },
  menuRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 16, gap: 14 },
  editIconCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(22,163,74,0.12)', alignItems: 'center', justifyContent: 'center' },
  menuText: { fontSize: 16, fontWeight: '800', color: '#14251B' },
  menuSub: { fontSize: 13, color: '#64748B', marginTop: 2 },
  menuChevron: { fontSize: 22, color: '#16A34A', fontWeight: '700' },
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
