import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, SafeAreaView, ActivityIndicator, RefreshControl, ScrollView, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
import { useAuth } from '../../auth/AuthContext';
import ScreenBackground from '../../components/ScreenBackground';
import { useSavedJobs } from '../../api/useSavedJobs';

type Props = NativeStackScreenProps<TradieStackParamList, 'BrowseJobs'>;

// The tradie app's "Home" tab — a real dashboard ported from
// tradie-dashboard.html, trimmed to: greeting header, 3 stat cards
// (Completed / Active / Invites), and near/other-area job groups.
// Profile/Applications/Messages/Notifications all moved out to their own
// bottom tabs (see TradieNavigator.tsx) — nothing profile-related lives on
// this screen anymore, so the avatar here is just a portrait, not a menu
// trigger. The "Job Invites" list itself lives on its own screen
// (TradieJobInvitesScreen) — see that file for the Accept/Decline-
// equivalent flow; this dashboard's Invites card is the only nav entry
// point to it, so it stays visible even at zero (a conditional banner used
// to hide it entirely whenever there were no invites, making the screen
// unreachable — see kiwifix_mobile_stale_bottomtab_screens-adjacent fix
// 2026-09-03).
export default function BrowseJobsScreen({ navigation }: Props) {
  const { session } = useAuth();
  const email = session!.email;
  const queryClient = useQueryClient();
  // Same bottom-tab-bar overlap fix as JobDetailScreen/TradieJobDetailScreen
  // — this is a tab-bar-visible screen, so a long enough near/far job list
  // can have its last card sit under the tab bar without this.
  const tabBarHeight = useBottomTabBarHeight();
  const savedJobs = useSavedJobs();

  // Cosmetic only, exactly like the web dashboard's toggleAvail() — that
  // toggle has never once written to the backend there either, it just
  // flips the label. Not a mobile shortcut; a faithful port of what's
  // actually there.

  const { data: tradie, isLoading: tradieLoading, refetch: refetchTradie, isRefetching: tradieRefetching } = useQuery({
    queryKey: ['myTradieProfile', email],
    queryFn: () => getTradieByEmail(email),
  });
  const { data: approvedTrades, isLoading: tradesLoading } = useQuery({
    queryKey: ['approvedTrades'],
    queryFn: getApprovedTrades,
  });

  // Mirrors web's syncApprovalStatusFromBackend()/dismissApprovalBanner()
  // exactly. Mobile used to just hide this banner outright once approved —
  // no confirmation at all — where web shows a one-time green "you're
  // approved" banner. PENDING is never dismissible (that status is only
  // ever true while job posters genuinely can't see this tradie yet, so
  // the warning has to stay up); APPROVED/REJECTED are dismissible, and the
  // dismissal is persisted server-side per-status so it reappears the next
  // time approvalStatus actually changes to something new rather than
  // staying suppressed forever.
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
    // Optimistic — hides immediately rather than waiting on the request,
    // same reasoning as web's dismissApprovalBanner (nothing useful to do
    // if the fire-and-forget call fails beyond it reappearing next visit).
    setLocallyDismissedStatus(approvalStatus);
    dismissBanner.mutate();
  }

  const { data: avatarUrl } = useQuery({
    queryKey: ['tradieAvatarUrl', tradie?.photoUrl],
    queryFn: () => getSignedUrl(tradie!.photoUrl!),
    enabled: !!tradie?.photoUrl,
  });

  // Same query/key ProfileMenuScreen used for its old "Notifications" row
  // badge — sharing the key means whichever screen loads it first primes
  // the other's cache too. This now drives the bell icon in the header
  // instead: notifications moved off the Profile tab entirely (they were
  // easy to miss buried under a menu item nobody thinks to check), onto a
  // top-right bell on Home, same placement pattern as most apps put an
  // inbox. NotificationsScreen itself (and the TradieMessage data it reads
  // — admin approval notes, job invites, job-accepted/complete notices) is
  // unchanged; only the entry point moved.
  const { data: messagesData } = useQuery({
    queryKey: ['tradieMessagesUnread', email],
    queryFn: () => listTradieMessages(session!.token, email),
  });
  const unreadNotifications = messagesData?.unreadCount || 0;

  const categories = useMemo(() => {
    if (!tradie?.trades?.length) return [];
    const jobLabelByTrade = new Map((approvedTrades || []).map((t) => [t.name, t.jobLabel]));
    return [...new Set(tradie.trades.map((t) => jobLabelByTrade.get(t) || t))];
  }, [tradie, approvedTrades]);

  // Real per-trade emoji from the backend's own approved-trades catalog
  // (ApprovedTrade.icon — same field PostJobScreen's category picker already
  // uses) keyed by jobLabel, which is what Job.category actually stores.
  // Lets job cards show a real trade icon instead of a plain text title,
  // without inventing any new data.
  const iconByCategory = useMemo(
    () => new Map((approvedTrades || []).map((t) => [t.jobLabel, t.icon])),
    [approvedTrades],
  );

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
    <ScreenBackground>
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
          <View style={{ flex: 1, flexShrink: 1 }}>
            <Text style={styles.greeting} numberOfLines={1}>{greeting}, {tradie?.firstName || fullName} 👋</Text>
            <Text style={styles.greetingSub}>
              {new Date().toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long' })}
            </Text>
          </View>
          <Pressable
            style={styles.bellBtn}
            hitSlop={8}
            onPress={() => navigation.navigate('Notifications')}
          >
            <Text style={styles.bellIcon}>🔔</Text>
            {unreadNotifications > 0 && (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>{unreadNotifications > 9 ? '9+' : unreadNotifications}</Text>
              </View>
            )}
          </Pressable>
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
                  ? "✕ Your profile was rejected by KiwiFix. Update your details and it will be reviewed again."
                  : '🕓 Your profile is pending review — the KiwiFix team is checking your details before you appear in job poster searches or can apply for jobs.'}
            </Text>
            {/* Same as web: PENDING has no dismiss button at all — it's the
                only visible cue job posters can't see this tradie yet, so
                it has to stay up the whole time that's true. */}
            {approvalStatus !== 'PENDING' && (
              <Pressable onPress={handleDismissBanner} hitSlop={8}>
                <Text
                  style={[
                    styles.approvalBannerDismiss,
                    approvalStatus === 'APPROVED' ? styles.approvedBannerText : styles.rejectedBannerText,
                  ]}
                >
                  ✕
                </Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Job Invites used to only appear as a banner here when
            actionableInviteCount > 0 — meaning TradieJobInvitesScreen was
            completely unreachable whenever a tradie had zero invites (no
            other nav entry point exists for it). Matches web's
            tradie-dashboard.html exactly: Job Invites is a third stat card
            alongside Jobs Completed/Active Jobs, always visible, showing
            "None yet" at zero rather than disappearing. */}
        <View style={styles.statsRow}>
          <Pressable
            style={styles.statCard}
            onPress={() => navigation.navigate('MyApplications', { filter: 'completed' })}
          >
            <View style={styles.statLabelRow}>
              <View style={[styles.statIconCircle, styles.statIconCircleGreen]}>
                <Ionicons name="checkmark" size={16} color="#fff" />
              </View>
              <Text style={styles.statLabel}>Completed</Text>
            </View>
            <Text style={styles.statValue}>{completedCount}</Text>
            <Text style={styles.statSub}>{completedCount > 0 ? 'Nice work!' : 'None yet'}</Text>
          </Pressable>
          <Pressable
            style={styles.statCard}
            onPress={() => navigation.navigate('MyApplications', { filter: 'active' })}
          >
            <View style={styles.statLabelRow}>
              <View style={[styles.statIconCircle, styles.statIconCircleOrange]}>
                <Ionicons name="briefcase" size={15} color="#EA580C" />
              </View>
              <Text style={styles.statLabel}>Active</Text>
            </View>
            <Text style={styles.statValue}>{activeCount}</Text>
            <Text style={styles.statSub}>{activeCount > 0 ? 'In progress' : 'None yet'}</Text>
          </Pressable>
          <Pressable
            style={styles.statCard}
            onPress={() => navigation.navigate('TradieJobInvites')}
          >
            <View style={styles.statLabelRow}>
              <View style={[styles.statIconCircle, styles.statIconCircleIndigo]}>
                <Ionicons name="mail-unread" size={14} color="#4338CA" />
              </View>
              <Text style={styles.statLabel}>Invites</Text>
            </View>
            <Text style={styles.statValue}>{actionableInviteCount}</Text>
            <Text style={styles.statSub}>{actionableInviteCount > 0 ? 'Waiting on you' : 'None yet'}</Text>
          </Pressable>
        </View>

        {/* Web dashboard's Saved Jobs card + "View calendar" link. */}
        <View style={styles.quickRow}>
          <Pressable style={styles.quickBtn} onPress={() => navigation.navigate('SavedJobs')}>
            <Ionicons name="bookmark-outline" size={16} color="#16A34A" />
            <Text style={styles.quickText}>Saved jobs{savedJobs.saved.length ? ` (${savedJobs.saved.length})` : ''}</Text>
          </Pressable>
          <Pressable style={styles.quickBtn} onPress={() => navigation.navigate('Calendar')}>
            <Ionicons name="calendar-outline" size={16} color="#16A34A" />
            <Text style={styles.quickText}>Calendar</Text>
          </Pressable>
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
                  <JobCard
                    key={item.id}
                    job={item}
                    icon={iconByCategory.get(item.category) || '🔧'}
                    saved={savedJobs.isSaved(item.id)}
                    onToggleSave={() => savedJobs.toggle(item.id)}
                    onPress={() => navigation.navigate('TradieJobDetail', { jobId: item.id })}
                  />
                ))}
              </View>
            )}
            {far.length > 0 && (
              <View>
                <Text style={styles.groupLabel}>🌐 Other areas ({far.length})</Text>
                {far.map((item) => (
                  <JobCard
                    key={item.id}
                    job={item}
                    icon={iconByCategory.get(item.category) || '🔧'}
                    saved={savedJobs.isSaved(item.id)}
                    onToggleSave={() => savedJobs.toggle(item.id)}
                    onPress={() => navigation.navigate('TradieJobDetail', { jobId: item.id })}
                  />
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
    </ScreenBackground>
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

function JobCard({ job, icon, onPress, saved, onToggleSave }: { job: Job; icon: string; onPress: () => void; saved: boolean; onToggleSave: () => void }) {
  const photos = job.photos || [];
  const shownPhotos = photos.slice(0, 3);
  const overflow = photos.length - shownPhotos.length;
  // Same "is this actually urgent" read as the web dashboard's urgency
  // pill — anything that isn't an explicit no-rush phrasing gets the
  // attention colour, real ASAP/emergency wording gets it too.
  const isUrgent = !!job.urgency && !/no rush|flexible|whenever/i.test(job.urgency);
  return (
    <Pressable style={styles.jobCard} onPress={onPress}>
      <View style={styles.jobCardIconCircle}>
        <Text style={styles.jobCardIconGlyph}>{icon}</Text>
      </View>
      <View style={styles.jobCardBody}>
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
        {job.urgency && (
          <Text style={[styles.cardUrgency, isUrgent ? styles.cardUrgencyHot : styles.cardUrgencyCalm]}>
            ⏱ {job.urgency}
          </Text>
        )}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 8 }}>
        <Pressable hitSlop={8} onPress={onToggleSave} style={[styles.saveChip, saved && styles.saveChipOn]}>
          <Text style={[styles.saveChipText, saved && styles.saveChipTextOn]}>{saved ? '★ Saved' : '☆ Save'}</Text>
        </Pressable>
        <Text style={styles.jobCardChevron}>›</Text>
      </View>
    </Pressable>
  );
}

const CARD_SHADOW = {
  shadowColor: '#0F172A', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2,
};

const styles = StyleSheet.create({
  quickRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  quickBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: '#BBF7D0',
  },
  quickText: { color: '#14532D', fontWeight: '700', fontSize: 13 },
  saveChip: { borderWidth: 1, borderColor: '#BBF7D0', backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  saveChipOn: { backgroundColor: '#F0FDF4' },
  saveChipText: { color: '#64748B', fontWeight: '700', fontSize: 11 },
  saveChipTextOn: { color: '#16A34A' },
  safe: { flex: 1 },
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
  bellBtn: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center', ...CARD_SHADOW,
  },
  bellIcon: { fontSize: 18 },
  bellBadge: {
    position: 'absolute', top: -3, right: -3, minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
    borderWidth: 2, borderColor: '#F8FAFC',
  },
  bellBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  // approvalBanner holds the shared row layout (message + optional dismiss
  // ✕); the status-specific styles below only ever set colour, kept
  // separate so pending/approved/rejected can share one row structure.
  approvalBanner: {
    flexDirection: 'row', alignItems: 'flex-start', borderWidth: 1, borderRadius: 12,
    padding: 14, marginBottom: 14, gap: 10,
  },
  approvalBannerText: { flex: 1, fontWeight: '600', fontSize: 13, lineHeight: 18 },
  approvalBannerDismiss: { fontSize: 15, fontWeight: '800', opacity: 0.75, paddingHorizontal: 2 },
  pendingBanner: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  pendingBannerText: { color: '#92400E' },
  approvedBanner: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  approvedBannerText: { color: '#0B6B35' },
  rejectedBanner: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  rejectedBannerText: { color: '#DC2626' },
  // 3-up now instead of 2 (Job Invites joined Jobs Completed/Active Jobs —
  // see comment above the stats row JSX), so gap/padding/font sizes are
  // trimmed down a notch from the old 2-card layout to keep each card
  // comfortable on a narrow phone width.
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  statCard: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 16, padding: 12, ...CARD_SHADOW,
  },
  statLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  statIconCircle: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  statIconCircleGreen: { backgroundColor: '#16A34A' },
  statIconCircleOrange: { backgroundColor: '#FDECD8' },
  statIconCircleIndigo: { backgroundColor: '#E0E7FF' },
  statLabel: { fontSize: 12, color: '#0F172A', fontWeight: '700', flexShrink: 1 },
  statValue: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
  statSub: { fontSize: 11, color: '#16A34A', fontWeight: '600', marginTop: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginBottom: 10 },
  groupLabel: { fontSize: 13, fontWeight: '700', color: '#334155', marginTop: 4, marginBottom: 8 },
  empty: { fontSize: 14, color: '#475569', fontWeight: '500', textAlign: 'center', marginTop: 30, paddingHorizontal: 10 },
  jobCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 16, padding: 16, marginBottom: 12,
    borderLeftWidth: 4, borderLeftColor: '#16A34A', ...CARD_SHADOW,
  },
  jobCardIconCircle: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(22,163,74,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  jobCardIconGlyph: { fontSize: 20 },
  jobCardBody: { flex: 1 },
  jobCardChevron: { fontSize: 20, color: '#CBD5E1', fontWeight: '700', marginLeft: 4 },
  cardCategory: { fontSize: 16, fontWeight: '700', marginBottom: 4, color: '#0F172A' },
  cardDescription: { fontSize: 14, color: '#475569', marginBottom: 6 },
  cardPhotoRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  cardThumb: { width: 56, height: 56, borderRadius: 10, backgroundColor: '#F1F5F9' },
  cardThumbLoading: { alignItems: 'center', justifyContent: 'center' },
  cardThumbOverflow: { alignItems: 'center', justifyContent: 'center' },
  cardThumbOverflowText: { color: '#64748B', fontWeight: '700', fontSize: 13 },
  cardLocation: { fontSize: 13, color: '#94A3B8' },
  cardUrgency: { fontSize: 13, marginTop: 2, fontWeight: '600' },
  cardUrgencyHot: { color: '#EA580C' },
  cardUrgencyCalm: { color: '#16A34A' },
});
