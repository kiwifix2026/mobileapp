import React, { useCallback, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import type { PosterStackParamList } from '../../navigation/types';
import { listMyJobs } from '../../api/jobs';
import { listMatchingTradies } from '../../api/tradies';
import { getApprovedTrades, ApprovedTrade } from '../../api/trades';
import { useAuth } from '../../auth/AuthContext';
import type { Job } from '../../api/types';
import ScreenBackground from '../../components/ScreenBackground';

type Props = NativeStackScreenProps<PosterStackParamList, 'Home'>;

// OPEN no longer shows this — see JobMatchesBadge below, which replaces it
// with a live "Matches (N)" count. Left in the Record so TS still requires
// every status to have a label (MATCHED/COMPLETED/CANCELLED still use it).
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

// OPEN jobs' badge — real matching-tradie count instead of the static
// "Looking for a tradie" label. Same query JobDetailScreen's Matches tab is
// built on (TradiesService.findMatching via listMatchingTradies), just the
// count — not a fabricated number. Same jobLabel→trade name lookup as
// there too, since the backend matches on the real trade name, not the
// job-facing category label shown on the card. Identical to MyJobsScreen's
// JobMatchesBadge — kept as a separate copy per this app's existing
// per-screen card pattern (see kiwifix_duplicated_page_sidebars memory).
function JobMatchesBadge({ job, approvedTrades }: { job: Job; approvedTrades?: ApprovedTrade[] }) {
  const tradeName = useMemo(() => {
    const match = approvedTrades?.find((t) => t.jobLabel === job.category || t.name === job.category);
    return match?.name || job.category;
  }, [approvedTrades, job.category]);

  const { data: matchingTradies } = useQuery({
    queryKey: ['matchingTradies', job.id, tradeName, job.region, job.suburb],
    queryFn: () => listMatchingTradies({ trade: tradeName, region: job.region || undefined, suburb: job.suburb || undefined }),
    enabled: !!tradeName,
  });
  // Same hard filter as JobDetailScreen's Matches tab — the backend
  // returns every APPROVED tradie nationwide for this trade (nearby is
  // only a sort hint there, not a filter), so this count would otherwise
  // include tradies who don't actually cover this job's area at all.
  const count = matchingTradies?.filter((t) => t.nearby).length;

  return (
    <View style={[styles.badge, { backgroundColor: STATUS_COLOR.OPEN + '22' }]}>
      <Text style={[styles.badgeText, { color: STATUS_COLOR.OPEN }]}>
        {count === undefined ? 'Matches' : `Matches (${count})`}
      </Text>
    </View>
  );
}

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
  const { data: approvedTrades } = useQuery({
    queryKey: ['approvedTrades'],
    queryFn: getApprovedTrades,
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

  const insets = useSafeAreaInsets();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const recent = (jobs || []).slice(0, 3);
  const activeCount = (jobs || []).filter((j) => j.status === 'OPEN' || j.status === 'MATCHED').length;

  return (
    <ScreenBackground plain>
    <View style={styles.safe}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16 }]}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      >
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>{greeting} 👋</Text>
            <Text style={styles.greetingSub}>What do you need done today?</Text>
          </View>
        </View>

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
                <Text style={styles.cardCategory} numberOfLines={1}>{item.category}</Text>
                {item.status === 'OPEN' ? (
                  <JobMatchesBadge job={item} approvedTrades={approvedTrades} />
                ) : (
                  <View style={[styles.badge, { backgroundColor: STATUS_COLOR[item.status] + '22' }]}>
                    <Text style={[styles.badgeText, { color: STATUS_COLOR[item.status] }]}>{STATUS_LABEL[item.status]}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.cardDescription} numberOfLines={2}>{item.description}</Text>
              {(item.suburb || item.city) && (
                <Text style={styles.cardLocation}>📍 {[item.suburb, item.city].filter(Boolean).join(', ')}</Text>
              )}
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'flex-start' },
  safe: { flex: 1 },
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
    backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 16, padding: 16, marginBottom: 18,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    shadowColor: '#0F172A', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  statLabel: { fontSize: 13, color: '#64748B', fontWeight: '600' },
  statValue: { fontSize: 20, fontWeight: '800', color: '#0F172A' },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  seeAll: { color: '#16A34A', fontWeight: '700', fontSize: 13 },
  empty: { fontSize: 14, color: '#475569', fontWeight: '500', textAlign: 'center', marginTop: 20 },
  card: {
    backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 16, padding: 16, marginBottom: 12,
    shadowColor: '#0F172A', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  // A long category ("Data / Network / Home Automation Specialist") and the
  // status badge used to just sit in one unwrapped row with neither side
  // able to give way — the badge got pushed clean off the card's right
  // edge and clipped by the screen instead of wrapping or shrinking.
  // cardCategory now takes the flexible remaining space and truncates with
  // an ellipsis; the badge keeps its natural size so it's always fully
  // visible. Same fix applied on MyJobsScreen's identical card markup.
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardCategory: { fontSize: 16, fontWeight: '700', flex: 1, marginRight: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, flexShrink: 0 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  cardDescription: { fontSize: 14, color: '#475569', marginBottom: 6 },
  cardLocation: { fontSize: 13, color: '#94A3B8' },
});
