import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, SafeAreaView, ActivityIndicator, RefreshControl } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useQuery } from '@tanstack/react-query';
import type { TradieStackParamList } from '../../navigation/types';
import type { JobApplication } from '../../api/types';
import { listMyApplications } from '../../api/jobs';
import { listCalendarEvents } from '../../api/extras';
import { useSavedJobs } from '../../api/useSavedJobs';
import { useAuth } from '../../auth/AuthContext';
import ScreenBackground from '../../components/ScreenBackground';

type Props = NativeStackScreenProps<TradieStackParamList, 'MyApplications'>;
type Section = 'applications' | 'saved' | 'upcoming';
type AppFilter = 'all' | 'active' | 'completed';

function statusColor(status: string): string {
  if (status === 'ACCEPTED' || status === 'COMPLETED') return '#16A34A';
  if (status === 'DECLINED') return '#DC2626';
  return '#F59E0B';
}

// The application itself stays 'ACCEPTED' forever once a tradie is picked —
// completion is tracked on the JOB, not the application (see
// JobsService.complete). Web's "✅ Completed" pill reflects `job.status`, not
// `application.status`, for exactly this reason.
function displayStatus(item: { status: string; job?: { status: string } | null }): string {
  if (item.status === 'ACCEPTED' && item.job?.status === 'COMPLETED') return 'COMPLETED';
  return item.status;
}

// Active/Completed split mirrors web's tradie-jobs.html?type=active|completed
// and the Home stat cards: ACCEPTED applications only, split by the
// underlying JOB's status. Keep in sync with BrowseJobsScreen's counts.
function applyFilter(applications: JobApplication[], filter: AppFilter) {
  if (filter === 'all') return applications;
  const accepted = applications.filter((a) => a.status === 'ACCEPTED' && a.job);
  return filter === 'completed'
    ? accepted.filter((a) => a.job!.status === 'COMPLETED')
    : accepted.filter((a) => a.job!.status !== 'COMPLETED');
}

// The Jobs tab: one place for everything a tradie has lined up — their
// applications (with All / Active / Completed), jobs they saved for later,
// and upcoming scheduled jobs. Used to be three cards at the bottom of Home.
export default function MyApplicationsScreen({ route, navigation }: Props) {
  const { session } = useAuth();
  const email = session!.email;
  const tabBarHeight = useBottomTabBarHeight();
  const savedJobs = useSavedJobs();

  const [section, setSection] = useState<Section>(route.params?.section ?? 'applications');
  const [appFilter, setAppFilter] = useState<AppFilter>(route.params?.filter ?? 'all');

  // Home's stat cards open this screen on a specific section/filter.
  useEffect(() => {
    if (route.params?.section) setSection(route.params.section);
    if (route.params?.filter) {
      setSection('applications');
      setAppFilter(route.params.filter);
    } else if (route.params?.section === 'applications') {
      setAppFilter('all');
    }
  }, [route.params?.section, route.params?.filter]);

  const { data: applications, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['myApplications', email],
    queryFn: () => listMyApplications(session!.token, email),
  });
  const { data: events, refetch: refetchEvents } = useQuery({
    queryKey: ['calendarEvents', email],
    queryFn: () => listCalendarEvents(session!.token, email),
  });

  // Jobs tab root — stays mounted across tab switches, and a job being
  // marked complete happens on the job poster's device, so refetch on focus.
  useFocusEffect(
    useCallback(() => {
      refetch();
      refetchEvents();
      savedJobs.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refetch, refetchEvents]),
  );

  const filteredApps = useMemo(() => applyFilter(applications || [], appFilter), [applications, appFilter]);
  const upcoming = useMemo(
    () =>
      (events || [])
        .filter((e) => new Date(e.startAt).getTime() >= Date.now() - 60 * 60 * 1000)
        .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()),
    [events],
  );

  const refreshAll = () => {
    refetch();
    refetchEvents();
    savedJobs.refetch();
  };

  const emptyApps =
    appFilter === 'active'
      ? "No active jobs right now — accepted jobs that aren't marked complete yet will show up here."
      : appFilter === 'completed'
        ? 'No completed jobs yet.'
        : "You haven't applied to any jobs yet.";

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safe}>
        {/* Section switch */}
        <View style={styles.segment}>
          <SegmentBtn label="Applications" count={applications?.length} active={section === 'applications'} onPress={() => setSection('applications')} />
          <SegmentBtn label="Saved" count={savedJobs.saved.length} active={section === 'saved'} onPress={() => setSection('saved')} />
          <SegmentBtn label="Upcoming" count={upcoming.length} active={section === 'upcoming'} onPress={() => setSection('upcoming')} />
        </View>

        {section === 'applications' && (
          <View style={styles.chips}>
            {(['all', 'active', 'completed'] as AppFilter[]).map((f) => (
              <Pressable key={f} onPress={() => setAppFilter(f)} style={[styles.chip, appFilter === f && styles.chipActive]}>
                <Text style={[styles.chipText, appFilter === f && styles.chipTextActive]}>
                  {f === 'all' ? 'All' : f === 'active' ? 'Active' : 'Completed'}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {section === 'applications' ? (
          isLoading ? (
            <ActivityIndicator style={{ marginTop: 40 }} />
          ) : (
            <FlatList
              data={filteredApps}
              keyExtractor={(a) => a.id}
              contentContainerStyle={[styles.list, { paddingBottom: tabBarHeight + 20 }]}
              refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refreshAll} />}
              ListEmptyComponent={<Text style={styles.empty}>{emptyApps}</Text>}
              renderItem={({ item }) => {
                const shownStatus = displayStatus(item);
                return (
                  // JobApplicationsService.listForTradie never sends a
                  // top-level jobId — only the nested job.id. Using
                  // item.jobId here silently produced "Job not found."
                  <Pressable
                    style={styles.card}
                    onPress={() => item.job?.id && navigation.navigate('TradieJobDetail', { jobId: item.job.id })}
                  >
                    <View style={styles.cardTop}>
                      <Text style={styles.cardCategory} numberOfLines={1}>{item.job?.category || 'Job'}</Text>
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
          )
        ) : section === 'saved' ? (
          savedJobs.isLoading ? (
            <ActivityIndicator style={{ marginTop: 40 }} />
          ) : (
            <FlatList
              data={savedJobs.saved}
              keyExtractor={(j) => j.id}
              contentContainerStyle={[styles.list, { paddingBottom: tabBarHeight + 20 }]}
              refreshControl={<RefreshControl refreshing={false} onRefresh={refreshAll} />}
              ListEmptyComponent={<Text style={styles.empty}>No saved jobs yet — tap ☆ Save on a job to keep it here for later.</Text>}
              renderItem={({ item }) => (
                <Pressable style={styles.savedCard} onPress={() => navigation.navigate('TradieJobDetail', { jobId: item.id })}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardCategory}>{item.category}</Text>
                    <Text style={styles.cardDescription} numberOfLines={2}>{item.description}</Text>
                    {(item.suburb || item.city) && <Text style={styles.loc}>📍 {[item.suburb, item.city].filter(Boolean).join(', ')}</Text>}
                    {item.status !== 'OPEN' && <Text style={styles.closed}>No longer open</Text>}
                  </View>
                  <Pressable hitSlop={8} onPress={() => savedJobs.toggle(item.id)} style={styles.unsaveBtn}>
                    <Text style={styles.unsaveText}>★ Saved</Text>
                  </Pressable>
                </Pressable>
              )}
            />
          )
        ) : (
          <FlatList
            data={upcoming}
            keyExtractor={(e) => e.id}
            contentContainerStyle={[styles.list, { paddingBottom: tabBarHeight + 20 }]}
            refreshControl={<RefreshControl refreshing={false} onRefresh={refreshAll} />}
            ListEmptyComponent={
              <Text style={styles.empty}>Nothing scheduled yet — open an accepted job and tap "Add to my phone calendar".</Text>
            }
            renderItem={({ item }) => (
              <Pressable style={styles.card} onPress={() => navigation.navigate('TradieJobDetail', { jobId: item.jobId })}>
                <Text style={styles.cardCategory} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.when}>
                  📅 {new Date(item.startAt).toLocaleString('en-NZ', { weekday: 'long', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                </Text>
                {item.location ? <Text style={styles.loc}>📍 {item.location}</Text> : null}
                <Text style={styles.detailsLink}>View job →</Text>
              </Pressable>
            )}
          />
        )}
      </SafeAreaView>
    </ScreenBackground>
  );
}

function SegmentBtn({ label, count, active, onPress }: { label: string; count?: number; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.segBtn, active && styles.segBtnActive]} onPress={onPress}>
      <Text style={[styles.segText, active && styles.segTextActive]}>
        {label}{count !== undefined ? ` (${count})` : ''}
      </Text>
    </Pressable>
  );
}

const SHADOW = {
  shadowColor: '#0F172A', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2,
};

const styles = StyleSheet.create({
  safe: { flex: 1 },
  segment: {
    flexDirection: 'row', backgroundColor: '#E2E8F0', borderRadius: 14, padding: 4,
    marginHorizontal: 16, marginTop: 14,
  },
  segBtn: { flex: 1, paddingVertical: 9, borderRadius: 11, alignItems: 'center' },
  segBtnActive: { backgroundColor: '#fff', ...SHADOW },
  segText: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  segTextActive: { color: '#15803D' },
  chips: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginTop: 12 },
  chip: { borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6 },
  chipActive: { backgroundColor: '#DCFCE7', borderColor: '#86EFAC' },
  chipText: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  chipTextActive: { color: '#15803D' },
  list: { padding: 16, paddingTop: 14 },
  empty: { fontSize: 14, color: '#475569', fontWeight: '500', textAlign: 'center', marginTop: 60, paddingHorizontal: 24 },
  card: { backgroundColor: 'rgba(255,255,255,0.96)', borderRadius: 16, padding: 16, marginBottom: 12, ...SHADOW },
  savedCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 16, padding: 16, marginBottom: 12, ...SHADOW,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardCategory: { fontSize: 16, fontWeight: '700', flex: 1, marginRight: 8, color: '#0F172A' },
  status: { fontSize: 12, fontWeight: '700', flexShrink: 0 },
  cardDescription: { fontSize: 14, color: '#475569', marginTop: 4, marginBottom: 6 },
  revealedAddress: { fontSize: 13, color: '#16A34A', fontWeight: '600', marginTop: 4 },
  message: { fontSize: 13, color: '#94A3B8', fontStyle: 'italic', marginTop: 6 },
  detailsLink: { color: '#2563EB', fontWeight: '600', fontSize: 13, marginTop: 10 },
  loc: { fontSize: 13, color: '#64748B', marginTop: 4 },
  when: { fontSize: 14, color: '#15803D', fontWeight: '700', marginTop: 6 },
  closed: { fontSize: 12, color: '#B45309', fontWeight: '700', marginTop: 6 },
  unsaveBtn: { backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#BBF7D0', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  unsaveText: { color: '#16A34A', fontWeight: '700', fontSize: 12 },
});
