import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, SafeAreaView, ActivityIndicator, RefreshControl, ScrollView, Image } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import type { TradieStackParamList } from '../../navigation/types';
import type { Job } from '../../api/types';
import { findMatchingJobs, listMyApplications } from '../../api/jobs';
import { getTradieByEmail, listTradieInvites } from '../../api/tradies';
import { getApprovedTrades } from '../../api/trades';
import { getSignedUrl } from '../../api/uploads';
import { useAuth } from '../../auth/AuthContext';

type Props = NativeStackScreenProps<TradieStackParamList, 'BrowseJobs'>;

// The tradie app's "Home" tab — a real dashboard ported from
// tradie-dashboard.html, trimmed to: greeting header, stat cards (Jobs
// Completed / Active Jobs), a Job Invites banner, availability toggle, and
// near/other-area job groups. Profile/Applications/Messages/Notifications
// all moved out to their own bottom tabs (see TradieNavigator.tsx) —
// nothing profile-related lives on this screen anymore, so the avatar here
// is just a portrait, not a menu trigger. The "Job Invites" list itself now
// lives on its own screen (TradieJobInvitesScreen) — see that file for the
// Accept/Decline-equivalent flow; this dashboard only surfaces a count.
export default function BrowseJobsScreen({ navigation }: Props) {
  const { session } = useAuth();
  const email = session!.email;
  // Same bottom-tab-bar overlap fix as JobDetailScreen/TradieJobDetailScreen
  // — this is a tab-bar-visible screen, so a long enough near/far job list
  // can have its last card sit under the tab bar without this.
  const tabBarHeight = useBottomTabBarHeight();

  // Cosmetic only, exactly like the web dashboard's toggleAvail() — that
  // toggle has never once written to the backend there either, it just
  // flips the label. Not a mobile shortcut; a faithful port of what's
  // actually there.
  const [available, setAvailable] = useState(true);

  const { data: tradie, isLoading: tradieLoading, refetch: refetchTradie, isRefetching: tradieRefetching } = useQuery({
    queryKey: ['myTradieProfile', email],
    queryFn: () => getTradieByEmail(email),
  });
  const { data: approvedTrades, isLoading: tradesLoading } = useQuery({
    queryKey: ['approvedTrades'],
    queryFn: getApprovedTrades,
  });

  const { data: avatarUrl } = useQuery({
    queryKey: ['tradieAvatarUrl', tradie?.photoUrl],
    queryFn: () => getSignedUrl(tradie!.photoUrl!),
    enabled: !!tradie?.photoUrl,
  });

  const categories = useMemo(() => {
    if (!tradie?.trades?.length) return [];
    const jobLabelByTrade = new Map((approvedTrades || []).map((t) => [t.name, t.jobLabel]));
    return [...new Set(tradie.trades.map((t) => jobLabelByTrade.get(t) || t))];
  }, [tradie, approvedTrades]);

  const region = tradie?.region || undefined;
  const suburb = tradie?.areas?.[0] || undefined;

  const { data: jobs, isLoading: jobsLoading, refetch: refetchJobs, isRefetching: jobsRefetching } = useQuery({
    queryKey: ['matchingJobs', email, categories.join(','), region, suburb],
    queryFn: async () => {
      const lists = await Promise.all(
        categories.map((category) => findMatchingJobs({ category, region, suburb, tradieEmail: email })),
      );
      const seen = new Set<string>();
      return lists.flat().filter((j: Job) => {
        if (seen.has(j.id)) return false;
        seen.add(j.id);
        return true;
      });
    },
    enabled: categories.length > 0,
  });

  // Count only — the actual list/Accept flow lives on TradieJobInvitesScreen.
  // "Actionable" here means not yet applied/declined, matching what web's
  // dashboard invite-count badge counts (an invite the tradie already acted
  // on isn't a new thing to draw their eye to).
  const { data: invites } = useQuery({
    queryKey: ['tradieInvites', email],
    queryFn: () => listTradieInvites(session!.token, email),
  });
  const actionableInviteCount = (invites || []).filter((i) => !i.myApplicationStatus).length;

  // Real "Jobs Completed"/"Active Jobs" counts — same source as web's
  // loadActiveJobsCount(): ACCEPTED applications, split by whether the
  // underlying job itself has been marked complete yet. Same cache key
  // ('myApplications') as MyApplicationsScreen.tsx and TradieJobDetailScreen's
  // apply mutation — this used to be its own 'myApplicationsForStats' key
  // that nothing ever invalidated, so accepting a job (either the normal
  // apply flow or a job invite) never updated this stat until the app was
  // fully restarted. Sharing the key means either accept path's existing
  // invalidateQueries(['myApplications', email]) call refreshes this too.
  const { data: applications, refetch: refetchApplications } = useQuery({
    queryKey: ['myApplications', email],
    queryFn: () => listMyApplications(session!.token, email),
  });
  const { activeCount, completedCount } = useMemo(() => {
    const accepted = (applications || []).filter((a) => a.status === 'ACCEPTED');
    return {
      activeCount: accepted.filter((a) => a.job && a.job.status !== 'COMPLETED').length,
      completedCount: accepted.filter((a) => a.job && a.job.status === 'COMPLETED').length,
    };
  }, [applications]);

  // Home tab stays mounted across tab switches (same as every bottom-tab
  // screen — see kiwifix_mobile_stale_bottomtab_screens memory). Refetching
  // applications on every focus means accepting a job invite (or applying
  // normally) and coming back to Home shows the updated count immediately.
  // refetchTradie is included here too — this screen's own header/greeting
  // and `categories` (which drives which jobs it fetches) are derived from
  // this SAME 'myTradieProfile' query, so a trade added via EditProfile
  // needs this screen to actually re-pull it on return, not just trust that
  // EditProfileScreen's invalidateQueries reached this specific mounted
  // instance in time.
  useFocusEffect(
    useCallback(() => {
      refetchApplications();
      refetchTradie();
    }, [refetchApplications, refetchTradie]),
  );

  const isLoading = tradieLoading || tradesLoading;
  const isRefetching = tradieRefetching || jobsRefetching;
  const refetchAll = () => {
    refetchTradie();
    refetchJobs();
  };

  const fullName = [tradie?.firstName, tradie?.lastName].filter(Boolean).join(' ') || 'there';
  const initials = (((tradie?.firstName || '')[0] || '') + ((tradie?.lastName || '')[0] || '')) || 'T';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const near = (jobs || []).filter((j) => j.nearby !== false);
  const far = (jobs || []).filter((j) => j.nearby === false);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: tabBarHeight + 20 }]}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetchAll} />}
      >
        <View style={styles.header}>
          <View style={styles.avatar}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
            ) : (
              <Text style={styles.avatarText}>{initials.toUpperCase()}</Text>
            )}
          </View>
          <View style={{ flexShrink: 1 }}>
            <Text style={styles.greeting} numberOfLines={1}>{greeting}, {tradie?.firstName || fullName} 👋</Text>
            <Text style={styles.greetingSub}>
              {new Date().toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long' })}
            </Text>
          </View>
        </View>

        {tradie && tradie.approvalStatus !== 'APPROVED' && (
          <View style={tradie.approvalStatus === 'REJECTED' ? styles.rejectedBanner : styles.pendingBanner}>
            <Text style={tradie.approvalStatus === 'REJECTED' ? styles.rejectedBannerText : styles.pendingBannerText}>
              {tradie.approvalStatus === 'REJECTED'
                ? '✕ Your profile was rejected by KiwiFix. Update your details on the web app and it will be reviewed again.'
                : '🕓 Your profile is pending review — the KiwiFix team is checking your details before you appear in job poster searches or can apply for jobs.'}
            </Text>
          </View>
        )}

        {actionableInviteCount > 0 && (
          <Pressable style={styles.inviteBanner} onPress={() => navigation.navigate('TradieJobInvites')}>
            <Text style={styles.inviteBannerText}>
              💼 {actionableInviteCount} job {actionableInviteCount === 1 ? 'invite' : 'invites'} waiting for you
            </Text>
            <Text style={styles.inviteBannerLink}>View →</Text>
          </Pressable>
        )}

        <View style={styles.statsRow}>
          <Pressable
            style={styles.statCard}
            onPress={() => navigation.navigate('MyApplications', { filter: 'completed' })}
          >
            <Text style={styles.statLabel}>✅ Jobs Completed</Text>
            <Text style={styles.statValue}>{completedCount}</Text>
            <Text style={styles.statSub}>{completedCount > 0 ? 'Nice work!' : 'Get your first job done!'}</Text>
          </Pressable>
          <Pressable
            style={styles.statCard}
            onPress={() => navigation.navigate('MyApplications', { filter: 'active' })}
          >
            <Text style={styles.statLabel}>🔄 Active Jobs</Text>
            <Text style={styles.statValue}>{activeCount}</Text>
            <Text style={styles.statSub}>{activeCount > 0 ? 'In progress now' : 'None yet'}</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <View style={styles.availRow}>
            <View>
              <Text style={styles.availLabel}>{available ? '🟢 Available for Work' : '🔴 Not Available'}</Text>
              <Text style={styles.availSub}>Job posters can see and contact you</Text>
            </View>
            <Pressable style={[styles.toggle, available && styles.toggleOn]} onPress={() => setAvailable((v) => !v)}>
              <View style={[styles.toggleThumb, available && styles.toggleThumbOn]} />
            </Pressable>
          </View>
        </View>

        <Text style={styles.sectionTitle}>📍 New Jobs in Your Area</Text>
        {isLoading || (categories.length > 0 && jobsLoading) ? (
          <ActivityIndicator style={{ marginTop: 20 }} />
        ) : !categories.length ? (
          <Text style={styles.empty}>Add a trade to your profile on the web app to start seeing matching jobs.</Text>
        ) : !jobs?.length ? (
          <Text style={styles.empty}>No open jobs matching your trades right now — check back soon.</Text>
        ) : (
          <View>
            {near.length > 0 && (
              <View>
                <Text style={styles.groupLabel}>📍 Near your area ({near.length})</Text>
                {near.map((item) => (
                  <JobCard key={item.id} job={item} onPress={() => navigation.navigate('TradieJobDetail', { jobId: item.id })} />
                ))}
              </View>
            )}
            {far.length > 0 && (
              <View>
                <Text style={styles.groupLabel}>🌐 Other areas ({far.length})</Text>
                {far.map((item) => (
                  <JobCard key={item.id} job={item} onPress={() => navigation.navigate('TradieJobDetail', { jobId: item.id })} />
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// Same signed-URL thumbnail pattern as TradieJobInvitesScreen's InviteThumb —
// the job poster's photos were already sent on this redacted job view
// (redactJobForTradie includes `photos`), this card just never rendered
// them, so a job with photos looked identical to one without any.
function JobCardThumb({ photoKey }: { photoKey: string }) {
  const { data: url } = useQuery({
    queryKey: ['jobPhoto', photoKey],
    queryFn: () => getSignedUrl(photoKey),
  });
  if (!url) return <View style={[styles.cardThumb, styles.cardThumbLoading]} />;
  return <Image source={{ uri: url }} style={styles.cardThumb} />;
}

function JobCard({ job, onPress }: { job: Job; onPress: () => void }) {
  const photos = job.photos || [];
  const shownPhotos = photos.slice(0, 3);
  const overflow = photos.length - shownPhotos.length;
  return (
    <Pressable style={styles.jobCard} onPress={onPress}>
      <Text style={styles.cardCategory}>{job.category}</Text>
      <Text style={styles.cardDescription} numberOfLines={2}>{job.description}</Text>
      {shownPhotos.length > 0 && (
        <View style={styles.cardPhotoRow}>
          {shownPhotos.map((key) => <JobCardThumb key={key} photoKey={key} />)}
          {overflow > 0 && (
            <View style={[styles.cardThumb, styles.cardThumbOverflow]}>
              <Text style={styles.cardThumbOverflowText}>+{overflow}</Text>
            </View>
          )}
        </View>
      )}
      {(job.suburb || job.city) && (
        <Text style={styles.cardLocation}>📍 {[job.suburb, job.city].filter(Boolean).join(', ')}</Text>
      )}
      {job.urgency && <Text style={styles.cardUrgency}>⏱ {job.urgency}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  scroll: { padding: 20, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  avatar: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: '#16A34A',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  greeting: { fontSize: 19, fontWeight: '800', color: '#0F172A' },
  greetingSub: { fontSize: 12, color: '#64748B', marginTop: 2 },
  pendingBanner: {
    backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', borderRadius: 12,
    padding: 14, marginBottom: 14,
  },
  pendingBannerText: { color: '#92400E', fontWeight: '600', fontSize: 13, lineHeight: 18 },
  rejectedBanner: {
    backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: 12,
    padding: 14, marginBottom: 14,
  },
  rejectedBannerText: { color: '#DC2626', fontWeight: '600', fontSize: 13, lineHeight: 18 },
  inviteBanner: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#EEF2FF', borderRadius: 12, padding: 14, marginBottom: 14,
  },
  inviteBannerText: { color: '#4338CA', fontWeight: '700', fontSize: 14, flexShrink: 1, marginRight: 8 },
  inviteBannerLink: { color: '#4338CA', fontWeight: '700', fontSize: 13 },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  statCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  statLabel: { fontSize: 12, color: '#64748B', fontWeight: '600', marginBottom: 6 },
  statValue: { fontSize: 26, fontWeight: '800', color: '#0F172A' },
  statSub: { fontSize: 12, color: '#16A34A', fontWeight: '600', marginTop: 4 },
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 14,
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  availRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  availLabel: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  availSub: { fontSize: 12, color: '#64748B', marginTop: 2 },
  toggle: { width: 44, height: 24, borderRadius: 12, backgroundColor: '#E2E8F0', justifyContent: 'center', padding: 3 },
  toggleOn: { backgroundColor: '#16A34A' },
  toggleThumb: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff' },
  toggleThumbOn: { transform: [{ translateX: 20 }] },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginBottom: 10 },
  groupLabel: { fontSize: 13, fontWeight: '700', color: '#334155', marginTop: 4, marginBottom: 8 },
  empty: { fontSize: 14, color: '#94A3B8', textAlign: 'center', marginTop: 30, paddingHorizontal: 10 },
  jobCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  cardCategory: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  cardDescription: { fontSize: 14, color: '#475569', marginBottom: 6 },
  cardPhotoRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  cardThumb: { width: 56, height: 56, borderRadius: 10, backgroundColor: '#F1F5F9' },
  cardThumbLoading: { alignItems: 'center', justifyContent: 'center' },
  cardThumbOverflow: { alignItems: 'center', justifyContent: 'center' },
  cardThumbOverflowText: { color: '#64748B', fontWeight: '700', fontSize: 13 },
  cardLocation: { fontSize: 13, color: '#94A3B8' },
  cardUrgency: { fontSize: 13, color: '#F59E0B', marginTop: 2, fontWeight: '600' },
});
