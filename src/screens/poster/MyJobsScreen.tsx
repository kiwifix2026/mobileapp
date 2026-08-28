import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, SafeAreaView, ActivityIndicator, RefreshControl } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useQuery } from '@tanstack/react-query';
import type { PosterStackParamList } from '../../navigation/types';
import { listMyJobs } from '../../api/jobs';
import { useAuth } from '../../auth/AuthContext';
import type { Job } from '../../api/types';

type Props = NativeStackScreenProps<PosterStackParamList, 'MyJobs'>;

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

type Filter = 'ALL' | 'OPEN' | 'MATCHED' | 'COMPLETED';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'OPEN', label: 'Active' },
  { key: 'MATCHED', label: 'In Progress' },
  { key: 'COMPLETED', label: 'Completed' },
];

export default function MyJobsScreen({ navigation }: Props) {
  const { session } = useAuth();
  const token = session!.token;
  const [filter, setFilter] = useState<Filter>('ALL');
  // Same tab-bar overlap fix as the other full-list tab-bar-visible screens.
  const tabBarHeight = useBottomTabBarHeight();

  const { data: jobs, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['myJobs'],
    queryFn: () => listMyJobs(token),
  });

  // Jobs tab root — stays mounted across tab switches. Same reasoning as
  // HomeScreen's identical fix (see kiwifix_mobile_stale_bottomtab_screens
  // memory): a job's status changes entirely from JobDetailScreen (accept/
  // decline/complete), so without this the filtered list here can lag
  // behind reality until the app restarts.
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const filtered = useMemo(() => {
    if (filter === 'ALL') return jobs || [];
    return (jobs || []).filter((j) => j.status === filter);
  }, [jobs, filter]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Jobs</Text>
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <Pressable key={f.key} style={[styles.filterChip, filter === f.key && styles.filterChipActive]} onPress={() => setFilter(f.key)}>
            <Text style={[styles.filterChipText, filter === f.key && styles.filterChipTextActive]}>{f.label}</Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(j) => j.id}
          contentContainerStyle={[styles.list, { paddingBottom: tabBarHeight + 20 }]}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>{filter === 'ALL' ? 'No jobs posted yet.' : 'No jobs in this category.'}</Text>
              <Text style={styles.emptySubtext}>Tap "+ Post a Job" below to get started.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => navigation.navigate('JobDetail', { jobId: item.id })}>
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
              {typeof item.applicantsCount === 'number' && item.applicantsCount > 0 && (
                <Text style={styles.applicantsCount}>
                  {item.applicantsCount} applicant{item.applicantsCount === 1 ? '' : 's'}
                </Text>
              )}
            </Pressable>
          )}
        />
      )}

      <Pressable style={styles.fab} onPress={() => navigation.navigate('PostJob')}>
        <Text style={styles.fabText}>+ Post a Job</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12,
  },
  headerTitle: { fontSize: 26, fontWeight: '800' },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 12, flexWrap: 'wrap' },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#fff',
  },
  filterChipActive: { backgroundColor: '#16A34A', borderColor: '#16A34A' },
  filterChipText: { fontSize: 13, fontWeight: '600', color: '#334155' },
  filterChipTextActive: { color: '#fff' },
  list: { paddingHorizontal: 16, paddingBottom: 100 },
  empty: { alignItems: 'center', marginTop: 60, gap: 4 },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#334155' },
  emptySubtext: { fontSize: 14, color: '#94A3B8' },
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
  applicantsCount: { fontSize: 13, color: '#2563EB', fontWeight: '600', marginTop: 4 },
  fab: {
    position: 'absolute', bottom: 24, left: 20, right: 20,
    backgroundColor: '#16A34A', borderRadius: 14, paddingVertical: 16, alignItems: 'center',
  },
  fabText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
