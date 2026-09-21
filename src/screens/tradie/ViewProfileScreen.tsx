import React, { useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, SafeAreaView, ScrollView, ActivityIndicator, Image } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useQuery } from '@tanstack/react-query';
import type { TradieStackParamList } from '../../navigation/types';
import { getTradieByEmail } from '../../api/tradies';
import { getSignedUrl } from '../../api/uploads';
import { useAuth } from '../../auth/AuthContext';
import { ApiError } from '../../api/client';
import ScreenBackground from '../../components/ScreenBackground';

type Props = NativeStackScreenProps<TradieStackParamList, 'ViewProfile'>;

// Read-only preview — mirrors the spirit of web's tradie-profile-preview.html
// ("this is exactly what job posters see"). Licences/services/portfolio ARE
// actually available on GET /tradies/:email (they're Prisma composite types,
// not relations needing include — see the corrected
// kiwifix_tradie_relation_fields_not_returned memory); this screen just
// doesn't render them yet. Not a data limitation, just not built out here.
export default function ViewProfileScreen({}: Props) {
  const { session } = useAuth();
  const email = session!.email;
  const tabBarHeight = useBottomTabBarHeight();

  const { data: tradie, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['myTradieProfile', email],
    queryFn: () => getTradieByEmail(email),
  });

  // This is the exact screen a tradie checks right after editing their
  // trades to confirm it saved — it needs to be right every time, not just
  // on first mount. See kiwifix_mobile_stale_bottomtab_screens memory.
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const { data: avatarUrl } = useQuery({
    queryKey: ['tradieAvatarUrl', tradie?.photoUrl],
    queryFn: () => getSignedUrl(tradie!.photoUrl!),
    enabled: !!tradie?.photoUrl,
  });

  if (isError) {
    return (
      <ScreenBackground>
      <SafeAreaView style={styles.safe}>
        <View style={styles.errorState}>
          <Text style={styles.errorStateText}>
            ⚠️ Couldn't load your profile.{'\n'}
            {error instanceof ApiError ? error.message : 'Check your connection and try again.'}
          </Text>
          <Pressable style={styles.retryBtn} onPress={() => refetch()}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
      </ScreenBackground>
    );
  }
  if (isLoading || !tradie) {
    return (
      <ScreenBackground>
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator style={{ marginTop: 60 }} />
      </SafeAreaView>
      </ScreenBackground>
    );
  }

  const fullName = [tradie.firstName, tradie.lastName].filter(Boolean).join(' ') || 'Tradie';
  const initials = (((tradie.firstName || '')[0] || '') + ((tradie.lastName || '')[0] || '')) || 'T';
  const displayName = tradie.businessName || fullName;
  const areaLabel = [tradie.region, tradie.areas?.[0]].filter(Boolean).join(', ') || 'Not set yet';
  const isApproved = tradie.approvalStatus === 'APPROVED';

  return (
    <ScreenBackground>
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={[styles.container, { paddingBottom: tabBarHeight + 20 }]}>
        <View
          style={[
            styles.banner,
            tradie.approvalStatus === 'REJECTED' ? styles.bannerRejected : isApproved ? styles.bannerApproved : styles.bannerPending,
          ]}
        >
          <Text
            style={[
              styles.bannerText,
              tradie.approvalStatus === 'REJECTED' ? styles.bannerTextRejected : isApproved ? styles.bannerTextApproved : styles.bannerTextPending,
            ]}
          >
            {tradie.approvalStatus === 'REJECTED'
              ? '✕ Your profile was rejected — job posters cannot see this.'
              : isApproved
              ? '✓ This is exactly what job posters see when they view your profile.'
              : '🕓 Pending review — job posters cannot see this yet.'}
          </Text>
        </View>

        <View style={styles.header}>
          <View style={styles.avatar}>
            {avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.avatarImg} /> : <Text style={styles.avatarText}>{initials.toUpperCase()}</Text>}
          </View>
          <Text style={styles.name}>
            {displayName}{isApproved ? '  ✓' : ''}
          </Text>
          {tradie.businessName ? <Text style={styles.sub}>{fullName}</Text> : null}
        </View>

        {!!tradie.trades?.length && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Trades</Text>
            <View style={styles.chipRow}>
              {tradie.trades.map((t) => (
                <View key={t} style={styles.chip}><Text style={styles.chipText}>{t}</Text></View>
              ))}
            </View>
          </View>
        )}

        {!!tradie.bio && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>About</Text>
            <Text style={styles.value}>{tradie.bio}</Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Service Area</Text>
          <Text style={styles.value}>📍 {areaLabel}</Text>
        </View>

        {!!tradie.mobile && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Contact</Text>
            <Text style={styles.value}>📞 {tradie.mobile}</Text>
          </View>
        )}

        {(tradie.workingDays?.length || tradie.startTime) ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Availability</Text>
            {!!tradie.workingDays?.length && <Text style={styles.value}>{tradie.workingDays.join(', ')}</Text>}
            {!!(tradie.startTime && tradie.endTime) && <Text style={styles.value}>{tradie.startTime} – {tradie.endTime}</Text>}
            {tradie.acceptsEmergency && <Text style={styles.emergencyBadge}>🚨 Accepts emergency call-outs</Text>}
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Insurance</Text>
          <Text style={styles.value}>{tradie.insuranceCertUrl ? '📄 On file' : 'Not uploaded'}</Text>
        </View>

        <Text style={styles.footnote}>
          Licences, specific services offered, and portfolio photos aren't shown in this preview yet — check the web app for the full public profile.
        </Text>
      </ScrollView>
    </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { padding: 20, paddingBottom: 40 },
  banner: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 16 },
  bannerApproved: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  bannerPending: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  bannerRejected: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  bannerText: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  bannerTextApproved: { color: '#0B6B35' },
  bannerTextPending: { color: '#92400E' },
  bannerTextRejected: { color: '#DC2626' },
  errorState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorStateText: { fontSize: 15, color: '#475569', textAlign: 'center', lineHeight: 22, marginBottom: 16 },
  retryBtn: { backgroundColor: '#16A34A', borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12 },
  retryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  header: { alignItems: 'center', marginBottom: 20 },
  avatar: {
    width: 84, height: 84, borderRadius: 42, backgroundColor: '#16A34A',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 10,
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 28 },
  name: { fontSize: 20, fontWeight: '800', color: '#0F172A', textAlign: 'center' },
  sub: { fontSize: 13, color: '#64748B', marginTop: 2 },
  section: {
    backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 16, padding: 16, marginBottom: 12,
    shadowColor: '#0F172A', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', marginBottom: 8 },
  value: { fontSize: 14, color: '#0F172A', fontWeight: '600', marginTop: 2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: '#F0FDF4', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { color: '#166534', fontWeight: '700', fontSize: 13 },
  emergencyBadge: { fontSize: 13, color: '#DC2626', fontWeight: '700', marginTop: 6 },
  footnote: { fontSize: 12, color: '#475569', fontWeight: '500', textAlign: 'center', marginTop: 8, lineHeight: 17, paddingHorizontal: 10 },
});
