import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, RefreshControl, ScrollView, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TradieStackParamList } from '../../navigation/types';
import type { Job } from '../../api/types';
import { findMatchingJobs, listMyApplications } from '../../api/jobs';
import { getTradieByEmail, listTradieInvites, listTradieMessages, dismissApprovalBanner } from '../../api/tradies';
import { getApprovedTrades } from '../../api/trades';
import { getSignedUrl } from '../../api/uploads';
import { listCalendarEvents } from '../../api/extras';
import { useAuth } from '../../auth/AuthContext';
import { useSavedJobs } from '../../api/useSavedJobs';
import { ensureNotificationPermission, useNotifyOnIncrease } from '../../notifications/deviceNotifications';
import LegalFooter from '../../components/LegalFooter';

type Props = NativeStackScreenProps<TradieStackParamList, 'BrowseJobs'>;

const POLL_MS = 60000;

function timeAgo(iso: string) {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

// The tradie app's Home tab. Layout follows the redesigned web dashboard
// (tradie-dashboard.html): six tappable stat cards, a "KiwiFix is actively
// searching" banner, then New Jobs For You (Near your area / Other areas
// tabs). Saved Jobs, Applications and Upcoming Jobs live in the Jobs tab,
// reached from the stat cards, so Home doesn't scroll forever. Differences
// from web are on purpose for a phone: no notification bell (new activity arrives as a real
// phone notification — see notifications/deviceNotifications.ts), no
// in-app calendar (events go into the phone's own calendar), and no
// decorative background image.
export default function BrowseJobsScreen({ navigation }: Props) {
  const { session } = useAuth();
  const email = session!.email;
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const savedJobs = useSavedJobs();
  const [areaTab, setAreaTab] = useState<'near' | 'far'>('near');
  // Ask for notification permission once, when the dashboard first opens.
  useEffect(() => { ensureNotificationPermission(); }, []);

  const { data: tradie, isLoading: tradieLoading, refetch: refetchTradie, isRefetching: tradieRefetching } = useQuery({
    queryKey: ['myTradieProfile', email],
    queryFn: () => getTradieByEmail(email),
  });
  const { data: approvedTrades, isLoading: tradesLoading } = useQuery({
    queryKey: ['approvedTrades'],
    queryFn: getApprovedTrades,
  });

  // Approval banner — same behaviour as before (PENDING is never
  // dismissible; APPROVED/REJECTED dismiss per-status, persisted server-side).
  const approvalStatus = tradie?.approvalStatus || 'PENDING';
  const [locallyDismissedStatus, setLocallyDismissedStatus] = useState<string | null>(null);
  const bannerDismissed =
    approvalStatus !== 'PENDING' &&
    (locallyDismissedStatus === approvalStatus || tradie?.approvalBannerDismissedForStatus === approvalStatus);
  const showApprovalBanner = !!tradie && !bannerDismissed;
  const dismissBanner = useMutation({
    mutationFn: () => dismissApprovalBanner(session!.token, email),
    onSuccess: (updated) => queryClient.setQueryData(['myTradieProfile', email], updated),
  });
  function handleDismissBanner() {
    setLocallyDismissedStatus(approvalStatus);
    dismissBanner.mutate();
  }

  const { data: avatarUrl } = useQuery({
    queryKey: ['tradieAvatarUrl', tradie?.photoUrl],
    queryFn: () => getSignedUrl(tradie!.photoUrl!),
    enabled: !!tradie?.photoUrl,
  });

  // Notifications (admin approval notes, job invites, accepted/complete
  // notices) — polled so a native phone notification can fire when something
  // new arrives. The list itself is on Profile > Notifications.
  const { data: messagesData } = useQuery({
    queryKey: ['tradieMessagesUnread', email],
    queryFn: () => listTradieMessages(session!.token, email),
    refetchInterval: POLL_MS,
  });
  const unreadNotifications = messagesData?.unreadCount || 0;

  const categories = useMemo(() => {
    if (!tradie?.trades?.length) return [];
    const jobLabelByTrade = new Map((approvedTrades || []).map((t) => [t.name, t.jobLabel]));
    return [...new Set(tradie.trades.map((t) => jobLabelByTrade.get(t) || t))];
  }, [tradie, approvedTrades]);

  const region = tradie?.region || undefined;
  const suburb = tradie?.areas?.[0] || undefined;

  const {
    data: jobs, isLoading: jobsLoading, refetch: refetchJobs, isRefetching: jobsRefetching, dataUpdatedAt: jobsCheckedAt,
  } = useQuery({
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
    // The "actively searching" banner is real: re-check on a timer.
    refetchInterval: POLL_MS,
  });

  const { data: invites } = useQuery({
    queryKey: ['tradieInvites', email],
    queryFn: () => listTradieInvites(session!.token, email),
    refetchInterval: POLL_MS,
  });
  const actionableInviteCount = (invites || []).filter((i) => !i.myApplicationStatus).length;

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

  const { data: calendarEvents, refetch: refetchEvents } = useQuery({
    queryKey: ['calendarEvents', email],
    queryFn: () => listCalendarEvents(session!.token, email),
  });
  const upcoming = useMemo(
    () =>
      (calendarEvents || [])
        .filter((e) => new Date(e.startAt).getTime() >= Date.now() - 60 * 60 * 1000)
        .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()),
    [calendarEvents],
  );

  // Native phone notifications when something new shows up.
  const near = (jobs || []).filter((j) => j.nearby !== false);
  const far = (jobs || []).filter((j) => j.nearby === false);
  useNotifyOnIncrease(messagesData ? unreadNotifications : undefined, 'KiwiFix', (n) => (n === 1 ? 'You have a new notification' : `You have ${n} new notifications`));
  useNotifyOnIncrease(invites ? actionableInviteCount : undefined, 'New job invite', (n) => (n === 1 ? 'A job poster invited you to a job' : `${n} new job invites`));
  useNotifyOnIncrease(jobs ? jobs.length : undefined, 'New job matches', (n) => (n === 1 ? 'A new job matches your trade and area' : `${n} new jobs match your trade and area`));

  useFocusEffect(
    useCallback(() => {
      refetchApplications();
      refetchTradie();
      refetchEvents();
    }, [refetchApplications, refetchTradie, refetchEvents]),
  );

  const iconByCategory = useMemo(
    () => new Map((approvedTrades || []).map((t) => [t.jobLabel, t.icon])),
    [approvedTrades],
  );

  const isLoading = tradieLoading || tradesLoading;
  const isRefetching = tradieRefetching || jobsRefetching;
  const refetchAll = () => {
    refetchTradie();
    refetchJobs();
    refetchApplications();
    refetchEvents();
  };

  const fullName = [tradie?.firstName, tradie?.lastName].filter(Boolean).join(' ') || 'there';
  const initials = (((tradie?.firstName || '')[0] || '') + ((tradie?.lastName || '')[0] || '')) || 'T';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const lastChecked = jobsCheckedAt
    ? new Date(jobsCheckedAt).toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    : '—';

  const shown = areaTab === 'near' ? near : far;

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16, paddingBottom: tabBarHeight + 24 }]}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetchAll} progressViewOffset={insets.top} />}
      >
        {/* Header: greeting on the left, profile photo on the right. The top
            padding above clears the phone's status bar / notch / camera
            cut-out. */}
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.greeting} numberOfLines={1}>{greeting}, {tradie?.firstName || fullName} 👋</Text>
            <Text style={styles.greetingSub}>
              Here's what's happening in your area today —{' '}
              {new Date().toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </Text>
          </View>
          <View style={styles.avatar}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
            ) : (
              <Text style={styles.avatarText}>{initials.toUpperCase()}</Text>
            )}
          </View>
        </View>

        {showApprovalBanner && (
          <View
            style={[
              styles.approvalBanner,
              approvalStatus === 'APPROVED' ? styles.approvedBanner : approvalStatus === 'REJECTED' ? styles.rejectedBanner : styles.pendingBanner,
            ]}
          >
            <Text
              style={[
                styles.approvalBannerText,
                approvalStatus === 'APPROVED' ? styles.approvedBannerText : approvalStatus === 'REJECTED' ? styles.rejectedBannerText : styles.pendingBannerText,
              ]}
            >
              {approvalStatus === 'APPROVED'
                ? '✓ Your profile has been approved — job posters can see and contact you.'
                : approvalStatus === 'REJECTED'
                  ? '✕ Your profile was rejected by KiwiFix. Update your details and it will be reviewed again.'
                  : '🕓 Your profile is pending review — the KiwiFix team is checking your details before you appear in job poster searches or can apply for jobs.'}
            </Text>
            {approvalStatus !== 'PENDING' && (
              <Pressable onPress={handleDismissBanner} hitSlop={8}>
                <Text style={[styles.approvalBannerDismiss, approvalStatus === 'APPROVED' ? styles.approvedBannerText : styles.rejectedBannerText]}>✕</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Six stat cards, two per row. Each opens the matching section of the
            Jobs tab (Applications / Saved / Upcoming) — those lists no longer
            live down the bottom of Home. */}
        <View style={styles.statsGrid}>
          <StatCard
            label="Job Invites"
            value={actionableInviteCount}
            sub={actionableInviteCount > 0 ? 'Waiting on you' : 'None right now'}
            icon="mail-outline"
            tint="#16A34A"
            onPress={() => navigation.navigate('TradieJobInvites')}
          />
          <StatCard
            label="Active Jobs"
            value={activeCount}
            sub={activeCount > 0 ? 'In progress now' : 'None yet'}
            icon="sync"
            tint="#2563EB"
            onPress={() => navigation.navigate('MyApplications', { section: 'applications', filter: 'active' })}
          />
          <StatCard
            label="Applications"
            value={applications?.length ?? 0}
            sub="Jobs you have applied for"
            icon="paper-plane-outline"
            tint="#EA580C"
            onPress={() => navigation.navigate('MyApplications', { section: 'applications' })}
          />
          <StatCard
            label="Saved Jobs"
            value={savedJobs.saved.length}
            sub={savedJobs.saved.length > 0 ? 'Apply when ready' : 'Tap ☆ Save on a job'}
            icon="bookmark-outline"
            tint="#7C3AED"
            onPress={() => navigation.navigate('MyApplications', { section: 'saved' })}
          />
          <StatCard
            label="Jobs Completed"
            value={completedCount}
            sub={completedCount > 0 ? 'Nice work!' : 'Get your first job done!'}
            icon="checkmark-circle-outline"
            tint="#64748B"
            onPress={() => navigation.navigate('MyApplications', { section: 'applications', filter: 'completed' })}
          />
          <StatCard
            label="Upcoming Jobs"
            value={upcoming.length}
            sub={upcoming.length > 0 ? 'Scheduled' : 'Nothing scheduled'}
            icon="calendar-outline"
            tint="#0891B2"
            onPress={() => navigation.navigate('MyApplications', { section: 'upcoming' })}
          />
        </View>

        {/* Live search banner — the timer behind it is real (see the
            refetchInterval on the matching-jobs query). */}
        <View style={styles.liveBanner}>
          <View style={styles.liveIcon}>
            <Ionicons name="search" size={20} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.liveTitle}>KiwiFix is actively searching for matching jobs…</Text>
            <Text style={styles.liveSub}>We're continuously checking for new jobs in your area and trade. Last checked {lastChecked}.</Text>
          </View>
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.livePillText}>Live</Text>
          </View>
        </View>

        {/* New Jobs For You */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🔎 New Jobs For You</Text>
          <View style={styles.tabs}>
            <Pressable style={[styles.tab, areaTab === 'near' && styles.tabActive]} onPress={() => setAreaTab('near')}>
              <Text style={[styles.tabText, areaTab === 'near' && styles.tabTextActive]}>📍 Near your area</Text>
              <View style={styles.countPill}><Text style={styles.countPillText}>{near.length}</Text></View>
            </Pressable>
            <Pressable style={[styles.tab, areaTab === 'far' && styles.tabActive]} onPress={() => setAreaTab('far')}>
              <Text style={[styles.tabText, areaTab === 'far' && styles.tabTextActive]}>🌐 Other areas</Text>
              <View style={styles.countPill}><Text style={styles.countPillText}>{far.length}</Text></View>
            </Pressable>
          </View>

          {isLoading || (categories.length > 0 && jobsLoading) ? (
            <ActivityIndicator style={{ marginVertical: 24 }} />
          ) : !categories.length ? (
            <Text style={styles.empty}>Add a trade to your profile to start seeing matching jobs.</Text>
          ) : !shown.length ? (
            <Text style={styles.empty}>
              {areaTab === 'near' ? 'No open jobs near you right now — check back soon.' : 'No open jobs in other areas right now.'}
            </Text>
          ) : (
            shown.map((item) => (
              <JobCard
                key={item.id}
                job={item}
                icon={iconByCategory.get(item.category) || '🔧'}
                saved={savedJobs.isSaved(item.id)}
                onToggleSave={() => savedJobs.toggle(item.id)}
                onOpen={() => navigation.navigate('TradieJobDetail', { jobId: item.id })}
              />
            ))
          )}
        </View>

        <LegalFooter style={{ marginTop: 8 }} />
      </ScrollView>
    </View>
  );
}

function StatCard({
  label, value, sub, icon, tint, onPress,
}: {
  label: string; value: number; sub: string; icon: keyof typeof Ionicons.glyphMap; tint: string; onPress: () => void;
}) {
  return (
    <Pressable style={styles.statCard} onPress={onPress}>
      <View style={[styles.statIcon, { backgroundColor: tint }]}>
        <Ionicons name={icon} size={22} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.statLabel} numberOfLines={2}>{label}</Text>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statSub} numberOfLines={2}>{sub}</Text>
      </View>
    </Pressable>
  );
}

function JobCardThumb({ photoKey }: { photoKey: string }) {
  const { data: url } = useQuery({
    queryKey: ['jobPhoto', photoKey],
    queryFn: () => getSignedUrl(photoKey),
  });
  if (!url) return <View style={styles.cardThumb} />;
  return <Image source={{ uri: url }} style={styles.cardThumb} />;
}

function JobCard({
  job, icon, saved, onToggleSave, onOpen,
}: { job: Job; icon: string; saved: boolean; onToggleSave: () => void; onOpen: () => void }) {
  const photos = (job.photos || []).slice(0, 3);
  const isNew = Date.now() - new Date(job.createdAt).getTime() < 3 * 24 * 60 * 60 * 1000;
  return (
    <View style={styles.jobCard}>
      <View style={styles.jobTopRow}>
        <View style={styles.categoryPill}>
          <Text style={styles.categoryPillText}>{icon} {job.category}</Text>
        </View>
        {isNew && (
          <View style={styles.newPill}><Text style={styles.newPillText}>NEW</Text></View>
        )}
        <Pressable hitSlop={8} onPress={onToggleSave} style={[styles.saveChip, saved && styles.saveChipOn]}>
          <Text style={[styles.saveChipText, saved && styles.saveChipTextOn]}>{saved ? '★ Saved' : '☆ Save'}</Text>
        </Pressable>
        {!!job.urgency && <Text style={styles.priority} numberOfLines={1}>{job.urgency}</Text>}
      </View>
      <Text style={styles.jobDesc} numberOfLines={3}>{job.description}</Text>
      {photos.length > 0 && (
        <View style={styles.cardPhotoRow}>
          {photos.map((key) => <JobCardThumb key={key} photoKey={key} />)}
        </View>
      )}
      <View style={styles.jobMetaRow}>
        {(job.suburb || job.city) && <Text style={styles.jobMeta}>📍 {[job.suburb, job.city].filter(Boolean).join(', ')}</Text>}
        <Text style={styles.jobMeta}>🕒 Posted {timeAgo(job.createdAt)}</Text>
      </View>
      <View style={styles.jobActions}>
        <Pressable style={styles.applyBtn} onPress={onOpen}>
          <Text style={styles.applyBtnText}>Apply for this job</Text>
        </Pressable>
        <Pressable onPress={onOpen} hitSlop={8}>
          <Text style={styles.detailsLink}>View full details →</Text>
        </Pressable>
      </View>
    </View>
  );
}

const SHADOW = {
  shadowColor: '#0F172A', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2,
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F6F8FB' },
  scroll: { paddingHorizontal: 18 },

  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  headerText: { flex: 1, minWidth: 0 },
  greeting: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
  greetingSub: { fontSize: 13, color: '#64748B', marginTop: 4, lineHeight: 18 },
  avatar: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: '#16A34A',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    borderWidth: 2, borderColor: '#fff', ...SHADOW,
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 17 },

  approvalBanner: { flexDirection: 'row', alignItems: 'flex-start', borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 14, gap: 10 },
  approvalBannerText: { flex: 1, fontWeight: '600', fontSize: 13, lineHeight: 18 },
  approvalBannerDismiss: { fontSize: 15, fontWeight: '800', opacity: 0.75, paddingHorizontal: 2 },
  pendingBanner: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  pendingBannerText: { color: '#92400E' },
  approvedBanner: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  approvedBannerText: { color: '#0B6B35' },
  rejectedBanner: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  rejectedBannerText: { color: '#DC2626' },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 14 },
  statCard: {
    width: '47.8%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 16, padding: 14, ...SHADOW,
  },
  statIcon: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  statLabel: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  statValue: { fontSize: 26, fontWeight: '800', color: '#0F172A', lineHeight: 32 },
  statSub: { fontSize: 12, color: '#16A34A', fontWeight: '600' },

  liveBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#ECFDF5',
    borderWidth: 1, borderColor: '#BBF7D0', borderRadius: 16, padding: 14, marginBottom: 14,
  },
  liveIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#15803D', alignItems: 'center', justifyContent: 'center' },
  liveTitle: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  liveSub: { fontSize: 12, color: '#475569', marginTop: 2, lineHeight: 16 },
  livePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#fff', borderWidth: 1,
    borderColor: '#BBF7D0', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#16A34A' },
  livePillText: { fontSize: 12, fontWeight: '800', color: '#15803D' },

  card: { backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 14, ...SHADOW },
  cardTitle: { fontSize: 17, fontWeight: '800', color: '#0F172A', marginBottom: 10 },
  cardHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  countInline: { color: '#16A34A', fontSize: 14 },
  viewAll: { color: '#15803D', fontWeight: '700', fontSize: 13, marginBottom: 10 },
  empty: { fontSize: 14, color: '#64748B', textAlign: 'center', paddingVertical: 24, paddingHorizontal: 10 },
  emptySmall: { fontSize: 13, color: '#64748B', textAlign: 'center', paddingVertical: 14, lineHeight: 19 },

  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E2E8F0', marginBottom: 12 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#16A34A' },
  tabText: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  tabTextActive: { color: '#15803D' },
  countPill: { backgroundColor: '#DCFCE7', borderRadius: 10, minWidth: 20, paddingHorizontal: 6, paddingVertical: 1, alignItems: 'center' },
  countPillText: { fontSize: 11, fontWeight: '800', color: '#15803D' },

  jobCard: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 14, padding: 14, marginBottom: 12, backgroundColor: '#fff' },
  jobTopRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  categoryPill: { backgroundColor: '#DCFCE7', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  categoryPillText: { fontSize: 12, fontWeight: '800', color: '#15803D' },
  newPill: { backgroundColor: '#FEE2E2', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4 },
  newPillText: { fontSize: 11, fontWeight: '800', color: '#DC2626' },
  saveChip: { borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4 },
  saveChipOn: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  saveChipText: { color: '#64748B', fontWeight: '700', fontSize: 12 },
  saveChipTextOn: { color: '#16A34A' },
  priority: { marginLeft: 'auto', fontSize: 12, fontWeight: '700', color: '#0F172A', flexShrink: 1 },
  jobDesc: { fontSize: 14, color: '#475569', lineHeight: 20, marginBottom: 8 },
  cardPhotoRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  cardThumb: { width: 56, height: 56, borderRadius: 10, backgroundColor: '#F1F5F9' },
  jobMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 12 },
  jobMeta: { fontSize: 12.5, color: '#64748B' },
  jobActions: { flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' },
  applyBtn: { backgroundColor: '#15803D', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 11 },
  applyBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  detailsLink: { color: '#15803D', fontWeight: '700', fontSize: 14 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  rowTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  rowSub: { fontSize: 12.5, color: '#64748B', marginTop: 2 },
  pill: { borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontSize: 12, fontWeight: '800' },
  pillGreen: { backgroundColor: '#DCFCE7' },
  pillGreenText: { color: '#15803D' },
  pillAmber: { backgroundColor: '#FEF3C7' },
  pillAmberText: { color: '#B45309' },
  pillRed: { backgroundColor: '#FEE2E2' },
  pillRedText: { color: '#DC2626' },
});
