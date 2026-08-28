import React, { useCallback, useMemo } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, SafeAreaView, ActivityIndicator, RefreshControl } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useQuery } from '@tanstack/react-query';
import type { TradieStackParamList } from '../../navigation/types';
import { listMyApplications } from '../../api/jobs';
import { useAuth } from '../../auth/AuthContext';

type Props = NativeStackScreenProps<TradieStackParamList, 'MyApplications'>;

function statusColor(status: string): string {
  if (status === 'ACCEPTED' || status === 'COMPLETED') return '#16A34A';
  if (status === 'DECLINED') return '#DC2626';
  return '#F59E0B';
}

// The application itself stays 'ACCEPTED' forever once a tradie is picked —
// completion is tracked on the JOB, not the application (see
// JobsService.complete). Web's "✅ Completed" pill on tradie-jobs.html
// reflects `job.status`, not `application.status`, for exactly this reason;
// showing the raw application status here would permanently read "ACCEPTED"
// even for a job finished a week ago.
function displayStatus(item: { status: string; job?: { status: string } | null }): string {
  if (item.status === 'ACCEPTED' && item.job?.status === 'COMPLETED') return 'COMPLETED';
  return item.status;
}

// `filter` mirrors web's tradie-jobs.html?type=active|completed, reached
// from the dashboard's stat cards — that page filters to ACCEPTED
// applications only, then splits by the underlying JOB's status (not the
// application's own status), same logic BrowseJobsScreen already uses for
// the stat counts themselves. Keep the two in sync if either changes.
function applyFilter(applications: import('../../api/types').JobApplication[], filter?: 'active' | 'completed') {
  if (!filter) return applications;
  const accepted = applications.filter((a) => a.status === 'ACCEPTED' && a.job);
  return filter === 'completed'
    ? accepted.filter((a) => a.job!.status === 'COMPLETED')
    : accepted.filter((a) => a.job!.status !== 'COMPLETED');
}

export default function MyApplicationsScreen({ route, navigation }: Props) {
  const { session } = useAuth();
  const filter = route.params?.filter;
  // Same tab-bar overlap fix as the other tab-bar-visible screens — a long
  // applications list can otherwise have its last card sit under the tab bar.
  const tabBarHeight = useBottomTabBarHeight();

  const { data: applications, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['myApplications', session!.email],
    queryFn: () => listMyApplications(session!.token, session!.email),
  });

  // Jobs tab root — stays mounted across tab switches. Notably, a job being
  // marked complete happens entirely on the JOB POSTER's device
  // (JobDetailScreen's complete mutation) — there's no trigger on this
  // tradie's own app at all for that, so without a focus refetch here,
  // "Jobs Completed" could only ever update via manual pull-to-refresh or a
  // full app restart. See kiwifix_mobile_stale_bottomtab_screens memory.
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const filtered = useMemo(() => applyFilter(applications || [], filter), [applications, filter]);

  React.useLayoutEffect(() => {
    if (filter === 'active') navigation.setOptions({ title: 'Active Jobs' });
    else if (filter === 'completed') navigation.setOptions({ title: 'Jobs Completed' });
  }, [filter, navigation]);

  const emptyText = filter === 'active'
    ? 'No active jobs right now — accepted jobs that aren\'t marked complete yet will show up here.'
    : filter === 'completed'
      ? 'No completed jobs yet.'
      : 'You haven\'t applied to any jobs yet.';

  return (
    <SafeAreaView style={styles.safe}>
      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(a) => a.id}
          contentContainerStyle={[styles.list, { paddingBottom: tabBarHeight + 20 }]}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
          ListEmptyComponent={<Text style={styles.empty}>{emptyText}</Text>}
          renderItem={({ item }) => {
            const shownStatus = displayStatus(item);
            return (
            // Tappable regardless of status — web's tradie-jobs.html cards
            // (and the my-applications modal) all link through to the job's
            // own detail page, whether it's still open, matched/active, or
            // completed. TradieJobDetailScreen already fetches via
            // getMatchingJob, which — confirmed against
            // JobsService.findOneForTradie — deliberately doesn't gate on
            // job.status, so a MATCHED or COMPLETED job still returns full
            // detail (including the revealed address) for the tradie who
            // was accepted on it.
            <Pressable
              style={styles.card}
              // JobApplicationsService.listForTradie (the endpoint backing
              // this screen) never puts jobId at the top level of each
              // application — only inside the nested `job` object it
              // remaps in (job.id). The JobApplication type's top-level
              // `jobId` field only actually exists on the job-poster-side
              // listApplicants response (raw Prisma records), not this
              // one — using item.jobId here was silently undefined,
              // which used to hang forever on the old spinner-with-no-
              // error-branch bug and now correctly, but wrongly, shows
              // "Job not found." Use item.job.id, which this endpoint
              // always actually sends.
              onPress={() => item.job?.id && navigation.navigate('TradieJobDetail', { jobId: item.job.id })}
            >
              <View style={styles.cardTop}>
                <Text style={styles.cardCategory}>{item.job?.category || 'Job'}</Text>
                <Text style={[styles.status, { color: statusColor(shownStatus) }]}>
                  {shownStatus === 'COMPLETED' ? '✅ Completed' : shownStatus}
                </Text>
              </View>
              {item.job?.description && <Text style={styles.cardDescription} numberOfLines={2}>{item.job.description}</Text>}
              {item.status === 'ACCEPTED' && item.job?.address && (
                <Text style={styles.revealedAddress}>📍 {item.job.address}</Text>
              )}
              {item.message ? <Text style={styles.message}>Your note: "{item.message}"</Text> : null}
              <Text style={styles.detailsLink}>View full details →</Text>
            </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  list: { padding: 16, paddingTop: 20 },
  empty: { fontSize: 14, color: '#94A3B8', textAlign: 'center', marginTop: 60 },
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardCategory: { fontSize: 16, fontWeight: '700' },
  status: { fontSize: 12, fontWeight: '700' },
  cardDescription: { fontSize: 14, color: '#475569', marginBottom: 6 },
  revealedAddress: { fontSize: 13, color: '#16A34A', fontWeight: '600', marginTop: 4 },
  message: { fontSize: 13, color: '#94A3B8', fontStyle: 'italic', marginTop: 6 },
  detailsLink: { color: '#2563EB', fontWeight: '600', fontSize: 13, marginTop: 10 },
});
