import React, { useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, SafeAreaView, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import type { PosterStackParamList } from '../../navigation/types';
import { listMyJobs } from '../../api/jobs';
import { useAuth } from '../../auth/AuthContext';
import type { Job } from '../../api/types';

type Props = NativeStackScreenProps<PosterStackParamList, 'Home'>;

const STATUS_LABEL: Record<Job['status'], string> = {
  OPEN: 'Looking for a tradie',
  MATCHED: 'Tradie assigned',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};
const STATUS_COLOR: Record<Job['status'], string> = {
  OPEN: '#F59E0B',
  MATCHED: '#16A34A',
  COMPLETED: '#64748B',
  CANCELLED: '#DC2626',
};

// Job poster's "Home" tab — a real dashboard (greeting, big Post a Job CTA,
// recent jobs preview) rather than the full posted-jobs list, which now
// lives on its own "Jobs" tab (MyJobsScreen). Deliberately doesn't include
// a "browse nearby tradies" section like some marketplace-app mockups show
// — the real backend has no such flow for job posters (they post a job and
// tradies apply to it, not the other way around), so that section would
// only ever be able to show fake data.
export default function HomeScreen({ navigation }: Props) {
  const { session } = useAuth();
  const token = session!.token;

  const { data: jobs, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['myJobs'],
    queryFn: () => listMyJobs(token),
  });

  // This is the Home tab's root — stays mounted across tab switches, so
  // without this a job's status (accepted/declined/completed, all changed
  // from JobDetailScreen) or a freshly posted job wouldn't show up here
  // until the app restarted. See kiwifix_mobile_stale_bottomtab_screens memory.
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const recent = (jobs || []).slice(0, 3);
  const activeCount = (jobs || []).filter((j) => j.status === 'OPEN' || j.status === 'MATCHED').length;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      >
        <Text style={styles.greeting}>{greeting} 👋</Text>
        <Text style={styles.greetingSub}>What do you need done today?</Text>

        <Pressable style={styles.postCard} onPress={() => navigation.navigate('PostJob')}>
          <View style={styles.postCardIcon}><Text style={styles.postCardIconText}>➕</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.postCardTitle}>Post a Job</Text>
            <Text style={styles.postCardSub}>It's free and takes less than a minute</Text>
          </View>
          <Text style={styles.postCardArrow}>→</Text>
        </Pressable>

        {activeCount > 0 && (
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>🔄 Active jobs</Text>
            <Text style={styles.statValue}>{activeCount}</Text>
          </View>
        )}

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Recent Jobs</Text>
          {!!jobs?.length && (
            <Pressable onPress={() => navigation.navigate('MyJobs')}>
              <Text style={styles.seeAll}>See all →</Text>
            </Pressable>
          )}
        </View>

        {isLoading ? (
          <ActivityIndicator style={{ marginTop: 20 }} />
        ) : !recent.length ? (
          <Text style={styles.empty}>No jobs posted yet — tap "Post a Job" above to get started.</Text>
        ) : (
          recent.map((item) => (
            <Pressable key={item.id} style={styles.card} onPress={() => navigation.navigate('JobDetail', { jobId: item.id })}>
              <View style={styles.cardTop}>
                <Text style={styles.cardCategory}>{item.category}</Text>
                <View style={[styles.badge, { backgroundColor: STATUS_COLOR[item.status] + '22' }]}>
                  <Text style={[styles.badgeText, { color: STATUS_COLOR[item.status] }]}>{STATUS_LABEL[item.status]}</Text>
                </View>
              </View>
              <Text style={styles.cardDescription} numberOfLines={2}>{item.description}</Text>
              {(item.suburb || item.city) && (
                <Text style={styles.cardLocation}>📍 {[item.suburb, item.city].filter(Boolean).join(', ')}</Text>
              )}
            </Pressable>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  scroll: { padding: 20, paddingBottom: 40 },
  greeting: { fontSize: 24, fontWeight: '800', color: '#0F172A' },
  greetingSub: { fontSize: 14, color: '#64748B', marginTop: 2, marginBottom: 18 },
  postCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#16A34A', borderRadius: 16, padding: 18, marginBottom: 14,
  },
  postCardIcon: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  postCardIconText: { fontSize: 18 },
  postCardTitle: { color: '#fff', fontWeight: '800', fontSize: 16 },
  postCardSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 },
  postCardArrow: { color: '#fff', fontSize: 20, fontWeight: '700' },
  statCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 18,
    borderWidth: 1, borderColor: '#E2E8F0', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  statLabel: { fontSize: 13, color: '#64748B', fontWeight: '600' },
  statValue: { fontSize: 20, fontWeight: '800', color: '#0F172A' },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  seeAll: { color: '#16A34A', fontWeight: '700', fontSize: 13 },
  empty: { fontSize: 14, color: '#94A3B8', textAlign: 'center', marginTop: 20 },
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardCategory: { fontSize: 16, fontWeight: '700' },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  cardDescription: { fontSize: 14, color: '#475569', marginBottom: 6 },
  cardLocation: { fontSize: 13, color: '#94A3B8' },
});
