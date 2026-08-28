import React from 'react';
import { View, Text, Pressable, StyleSheet, SafeAreaView, ScrollView, ActivityIndicator, Alert, Linking, Image, Modal } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { PosterStackParamList } from '../../navigation/types';
import { getMyJob, listApplicants, acceptApplicant, declineApplicant, completeJob, inviteTradie } from '../../api/jobs';
import { startConversation } from '../../api/conversations';
import { listMatchingTradies } from '../../api/tradies';
import { getApprovedTrades } from '../../api/trades';
import { getSignedUrl } from '../../api/uploads';
import type { Tradie } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { ApiError } from '../../api/client';

type Props = NativeStackScreenProps<PosterStackParamList, 'JobDetail'>;

function statusColor(status: string): string {
  if (status === 'ACCEPTED') return '#16A34A';
  if (status === 'DECLINED') return '#DC2626';
  return '#F59E0B';
}

function applicantName(app: { tradie?: { businessName?: string | null; firstName?: string | null; lastName?: string | null } }): string {
  return app.tradie?.businessName || [app.tradie?.firstName, app.tradie?.lastName].filter(Boolean).join(' ') || 'Tradie';
}

function tradieDisplayName(t: Tradie): string {
  return t.businessName || [t.firstName, t.lastName].filter(Boolean).join(' ') || 'A tradie';
}

// One card in the "Tradies for X" list — mirrors job-detail.html's
// renderCard(): Call (tel: link), Invite (unless already applied/accepted
// on this job), Message, all wired to real backend actions. Its own signed-
// URL query per card rather than prop drilling — react-query dedupes/caches
// by key anyway, so N cards for the same photoUrl only fetch once.
function TradieMatchCard({
  tradie,
  applicantStatus,
  onInvite,
  onMessage,
  onViewProfile,
  inviteState,
  messagePending,
}: {
  tradie: Tradie;
  applicantStatus?: 'PENDING' | 'ACCEPTED' | 'DECLINED';
  onInvite: () => void;
  onMessage: () => void;
  onViewProfile: () => void;
  inviteState: 'idle' | 'pending' | 'sent';
  messagePending: boolean;
}) {
  const { data: signedUrl } = useQuery({
    queryKey: ['tradiePhoto', tradie.photoUrl],
    queryFn: () => getSignedUrl(tradie.photoUrl!),
    enabled: !!tradie.photoUrl,
  });
  const areaLabel = tradie.serviceAreas?.[0]
    ? `${tradie.serviceAreas[0].area}, ${tradie.serviceAreas[0].region}`
    : 'Area not set';

  return (
    <View style={styles.matchCard}>
      <View style={styles.matchTop}>
        {signedUrl ? (
          <Image source={{ uri: signedUrl }} style={styles.matchAvatar} />
        ) : (
          <View style={[styles.matchAvatar, styles.matchAvatarFallback]}>
            <Text style={styles.matchAvatarInitials}>
              {((tradie.firstName?.[0] || '') + (tradie.lastName?.[0] || '')).toUpperCase() || 'TR'}
            </Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <View style={styles.matchNameRow}>
            <Text style={styles.matchName}>{tradieDisplayName(tradie)}</Text>
            {tradie.approvalStatus === 'APPROVED' && <Text style={styles.matchVerified}>✓ Verified</Text>}
          </View>
          {!!tradie.trades?.length && <Text style={styles.matchTrades}>{tradie.trades.join(', ')}</Text>}
          <Text style={styles.matchArea}>📍 {areaLabel}</Text>
        </View>
      </View>
      {/* Call dropped per feedback — phone number's still visible in the
          profile modal (Contact section) if it's genuinely needed; Message
          is the primary contact path here, same as web's default state. */}
      <View style={styles.matchActions}>
        {applicantStatus === 'ACCEPTED' ? (
          <View style={[styles.actionBtn, styles.actionBtnDisabled]}>
            <Text style={styles.disabledBtnText}>🚧 In-progress</Text>
          </View>
        ) : applicantStatus === 'PENDING' ? (
          <View style={[styles.actionBtn, styles.actionBtnDisabled]}>
            <Text style={styles.disabledBtnText}>✓ Applied</Text>
          </View>
        ) : (
          <Pressable
            style={[styles.actionBtn, styles.inviteBtn, inviteState !== 'idle' && styles.actionBtnDisabled]}
            disabled={inviteState !== 'idle'}
            onPress={onInvite}
          >
            <Text style={styles.inviteBtnText}>
              {inviteState === 'sent' ? '✓ Invited' : inviteState === 'pending' ? 'Inviting…' : '📋 Invite'}
            </Text>
          </Pressable>
        )}
        <Pressable
          style={[styles.actionBtn, styles.messageBtn, messagePending && styles.actionBtnDisabled]}
          disabled={messagePending}
          onPress={onMessage}
        >
          <Text style={styles.messageBtnText}>💬 Message</Text>
        </Pressable>
        <Pressable style={[styles.actionBtn, styles.profileBtn]} onPress={onViewProfile}>
          <Text style={styles.profileBtnText}>👁 Profile</Text>
        </Pressable>
      </View>
    </View>
  );
}

// Full read-only profile — mirrors job-detail.html's viewTradieProfile()
// modal exactly: Contact/About/Trades/Services Offered/Licences/
// Availability, all built purely from the SAME tradie object already in
// `matchingTradies` (no second API call). Confirmed against
// TradiesService.findMatching(): it's a bare `findMany` with no `select`/
// `include`, and licences/services/teamMembers/portfolioItems are Prisma
// composite types (embedded in the document, not real relations needing
// `include`) — so they're already present on every tradie in that list,
// this just wasn't being read into the UI before.
function TradieProfileModal({ tradie, onClose }: { tradie: Tradie; onClose: () => void }) {
  const { data: avatarUrl } = useQuery({
    queryKey: ['tradiePhoto', tradie.photoUrl],
    queryFn: () => getSignedUrl(tradie.photoUrl!),
    enabled: !!tradie.photoUrl,
  });
  const visibleServices = (tradie.services || []).filter((s) => s.reviewStatus !== 'rejected');

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalSafe}>
        <View style={styles.modalHeader}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.modalAvatar} />
          ) : (
            <View style={[styles.modalAvatar, styles.matchAvatarFallback]}>
              <Text style={styles.matchAvatarInitials}>
                {((tradie.firstName?.[0] || '') + (tradie.lastName?.[0] || '')).toUpperCase() || 'TR'}
              </Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <View style={styles.matchNameRow}>
              <Text style={styles.modalName}>{tradieDisplayName(tradie)}</Text>
              {tradie.approvalStatus === 'APPROVED' && <Text style={styles.matchVerified}>✓ Verified</Text>}
            </View>
            <Text style={styles.modalSub}>
              {[tradie.businessName, tradie.hasTeam ? `Team of ${(tradie.teamMembers?.length || 0) + 1}` : null]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12}><Text style={styles.modalClose}>✕</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.modalBody}>
          <Text style={styles.modalSectionTitle}>CONTACT</Text>
          {!!tradie.mobile && (
            <Pressable onPress={() => Linking.openURL(`tel:${tradie.mobile!.replace(/\s+/g, '')}`)}>
              <Text style={[styles.modalLine, styles.modalLineTappable]}>📞 {tradie.mobile}</Text>
            </Pressable>
          )}
          {!!tradie.email && <Text style={styles.modalLine}>✉️ {tradie.email}</Text>}

          {!!tradie.bio && (
            <>
              <Text style={styles.modalSectionTitle}>ABOUT</Text>
              <Text style={styles.modalLine}>{tradie.bio}</Text>
            </>
          )}

          {!!tradie.trades?.length && (
            <>
              <Text style={styles.modalSectionTitle}>TRADES</Text>
              <View style={styles.chipRow}>
                {tradie.trades.map((t) => (
                  <View key={t} style={styles.tradeChipStatic}><Text style={styles.tradeChipStaticText}>{t}</Text></View>
                ))}
              </View>
            </>
          )}

          {!!visibleServices.length && (
            <>
              <Text style={styles.modalSectionTitle}>SERVICES OFFERED</Text>
              <View style={styles.chipRow}>
                {visibleServices.map((s, i) => (
                  <View key={`${s.name}-${i}`} style={styles.tradeChipStatic}>
                    <Text style={styles.tradeChipStaticText}>
                      {s.name}{s.reviewStatus === 'pending' ? ' (pending review)' : ''}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {!!tradie.licences?.length && (
            <>
              <Text style={styles.modalSectionTitle}>LICENCES</Text>
              {tradie.licences.map((l, i) => (
                <Text key={i} style={styles.modalLine}>
                  {l.label}{l.number ? ` — #${l.number}` : ''}{l.expiry ? ` (expires ${l.expiry})` : ''}
                </Text>
              ))}
            </>
          )}

          <Text style={styles.modalSectionTitle}>AVAILABILITY</Text>
          {!!tradie.workingDays?.length && <Text style={styles.modalLine}>{tradie.workingDays.join(', ')}</Text>}
          {!!(tradie.startTime && tradie.endTime) && (
            <Text style={styles.modalLine}>{tradie.startTime} – {tradie.endTime}</Text>
          )}
          {tradie.acceptsEmergency && <Text style={styles.modalEmergency}>🚨 Accepts emergency call-outs</Text>}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

export default function JobDetailScreen({ route, navigation }: Props) {
  const { jobId } = route.params;
  const { session } = useAuth();
  const token = session!.token;
  const queryClient = useQueryClient();
  // This screen keeps the bottom tab bar visible (it's not in
  // PosterNavigator's FULL_SCREEN_ROUTES), so a fixed paddingBottom on the
  // ScrollView isn't enough once the "Tradies for X" list is long enough —
  // the tab bar (49pt + the home-indicator safe area) sits on top of the
  // last card's action row. useBottomTabBarHeight() gives the actual
  // rendered height so the scroll content always clears it.
  const tabBarHeight = useBottomTabBarHeight();

  const { data: job, isLoading: jobLoading, isError: jobIsError, error: jobError, refetch: refetchJob } = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => getMyJob(token, jobId),
  });

  const [viewingTradie, setViewingTradie] = React.useState<Tradie | null>(null);

  const { data: applicants, isLoading: applicantsLoading } = useQuery({
    queryKey: ['applicants', jobId],
    queryFn: () => listApplicants(token, jobId),
  });

  // "Tradies for X" — mirrors job-detail.html's loadMatchingTradies(). Needs
  // the real trade catalog name (not the job-facing category label) for the
  // backend's exact array match, same jobLabel->name lookup PostJobScreen
  // builds the other direction when rendering its category grid.
  const { data: approvedTrades } = useQuery({
    queryKey: ['approvedTrades'],
    queryFn: getApprovedTrades,
  });
  const tradeName = React.useMemo(() => {
    if (!job) return undefined;
    const match = approvedTrades?.find((t) => t.jobLabel === job.category || t.name === job.category);
    return match?.name || job.category;
  }, [approvedTrades, job]);

  const { data: matchingTradies, isLoading: matchingLoading } = useQuery({
    queryKey: ['matchingTradies', jobId, tradeName, job?.region, job?.suburb],
    queryFn: () => listMatchingTradies({ trade: tradeName, region: job!.region || undefined, suburb: job!.suburb || undefined }),
    enabled: !!job && !!tradeName,
  });

  // Populated once applicants have loaded — lets each matching-tradie card
  // know to show "Applied"/"In-progress" instead of "Invite" for tradies who
  // already have an application on this job (same relationship
  // applicantStatusByTradieId captures on web).
  const applicantStatusByTradieId = React.useMemo(() => {
    const map: Record<string, 'PENDING' | 'ACCEPTED' | 'DECLINED'> = {};
    for (const app of applicants || []) map[app.tradieId] = app.status;
    return map;
  }, [applicants]);

  const [inviteStates, setInviteStates] = React.useState<Record<string, 'idle' | 'pending' | 'sent'>>({});

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['applicants', jobId] });
    queryClient.invalidateQueries({ queryKey: ['job', jobId] });
    queryClient.invalidateQueries({ queryKey: ['myJobs'] });
  };

  const accept = useMutation({
    mutationFn: (applicationId: string) => acceptApplicant(token, jobId, applicationId),
    onSuccess: invalidate,
  });
  const decline = useMutation({
    mutationFn: (applicationId: string) => declineApplicant(token, jobId, applicationId),
    onSuccess: invalidate,
  });
  const complete = useMutation({
    mutationFn: () => completeJob(token, jobId),
    onSuccess: invalidate,
  });
  const message = useMutation({
    mutationFn: (tradieId: string) => startConversation('customer', token, jobId, { tradieId }),
    onSuccess: (conversation, tradieId) => {
      const app = applicants?.find((a) => a.tradieId === tradieId);
      const matched = matchingTradies?.find((t) => t.id === tradieId);
      navigation.navigate('ChatThread', {
        conversationId: conversation.id,
        jobCategory: job?.category || '',
        counterpartName: app ? applicantName(app) : matched ? tradieDisplayName(matched) : 'Tradie',
      });
    },
  });

  const invite = useMutation({
    mutationFn: ({ tradieId, shareContact }: { tradieId: string; shareContact: boolean }) =>
      inviteTradie(token, jobId, tradieId, shareContact),
    onMutate: ({ tradieId }) => setInviteStates((s) => ({ ...s, [tradieId]: 'pending' })),
    onSuccess: (_data, { tradieId }) => setInviteStates((s) => ({ ...s, [tradieId]: 'sent' })),
    onError: (_err, { tradieId }) => setInviteStates((s) => ({ ...s, [tradieId]: 'idle' })),
  });

  const handleInvite = (tradieId: string) => {
    Alert.alert(
      'Invite this tradie?',
      'Would you like to share your phone number and exact address with them if they accept?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: "No, don't share", onPress: () => invite.mutate({ tradieId, shareContact: false }) },
        { text: 'Yes, share', onPress: () => invite.mutate({ tradieId, shareContact: true }) },
      ],
    );
  };

  // Was previously an unconditional spinner (`jobLoading || !job`) with no
  // error branch — if this request ever failed (bad jobId, network issue,
  // expired token), `isLoading` correctly flips to false but `job` stays
  // undefined forever, so the screen just sat on a spinner indefinitely
  // with no visible error and no way to retry. Split that out explicitly.
  if (jobIsError) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.errorState}>
          <Text style={styles.errorStateText}>
            ⚠️ Couldn't load this job.{'\n'}
            {jobError instanceof ApiError ? jobError.message : 'Check your connection and try again.'}
          </Text>
          <Pressable style={styles.retryBtn} onPress={() => refetchJob()}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }
  if (jobLoading || !job) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={[styles.container, { paddingBottom: tabBarHeight + 40 }]}>
        <Text style={styles.category}>{job.category}</Text>
        <Text style={styles.description}>{job.description}</Text>
        {(job.suburb || job.city) && (
          <Text style={styles.location}>📍 {[job.suburb, job.city].filter(Boolean).join(', ')}</Text>
        )}
        {job.urgency && <Text style={styles.urgency}>⏱ {job.urgency}</Text>}

        {job.status === 'MATCHED' && (
          <Pressable
            style={[styles.completeBtn, complete.isPending && styles.completeBtnDisabled]}
            disabled={complete.isPending}
            onPress={() => complete.mutate()}
          >
            <Text style={styles.completeBtnText}>{complete.isPending ? 'Marking complete…' : '✓ Mark Job Complete'}</Text>
          </Pressable>
        )}
        {job.status === 'COMPLETED' && (
          <View style={styles.completedBanner}>
            <Text style={styles.completedBannerText}>✓ This job is marked complete.</Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>Applicants</Text>
        {applicantsLoading ? (
          <ActivityIndicator style={{ marginTop: 20 }} />
        ) : !applicants || applicants.length === 0 ? (
          <Text style={styles.empty}>No applicants yet — tradies matching this job's category and area will show up here.</Text>
        ) : (
          applicants.map((app) => (
            <View key={app.id} style={styles.applicantCard}>
              <View style={styles.applicantTop}>
                <Text style={styles.applicantName}>{applicantName(app)}</Text>
                <Text style={[styles.applicantStatus, { color: statusColor(app.status) }]}>{app.status}</Text>
              </View>
              {app.wasInvited && <Text style={styles.invitedTag}>You invited this tradie</Text>}
              {app.message ? <Text style={styles.applicantMessage}>"{app.message}"</Text> : null}
              <View style={styles.applicantActions}>
                <Pressable
                  style={[styles.actionBtn, styles.messageBtn]}
                  onPress={() => message.mutate(app.tradieId)}
                  disabled={message.isPending}
                >
                  <Text style={styles.messageBtnText}>Message</Text>
                </Pressable>
                {app.status === 'PENDING' && (
                  <>
                    <Pressable
                      style={[styles.actionBtn, styles.declineBtn]}
                      onPress={() => decline.mutate(app.id)}
                      disabled={decline.isPending || accept.isPending}
                    >
                      <Text style={styles.declineBtnText}>Decline</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.actionBtn, styles.acceptBtn]}
                      onPress={() => accept.mutate(app.id)}
                      disabled={decline.isPending || accept.isPending}
                    >
                      <Text style={styles.acceptBtnText}>Accept</Text>
                    </Pressable>
                  </>
                )}
              </View>
            </View>
          ))
        )}

        <Text style={styles.sectionTitle}>🔧 Tradies for '{job.category}'</Text>
        {matchingLoading ? (
          <ActivityIndicator style={{ marginTop: 20 }} />
        ) : !matchingTradies || matchingTradies.length === 0 ? (
          <Text style={styles.empty}>No matching tradies found nearby yet.</Text>
        ) : (
          matchingTradies.map((tradie) => (
            <TradieMatchCard
              key={tradie.id}
              tradie={tradie}
              applicantStatus={applicantStatusByTradieId[tradie.id]}
              inviteState={inviteStates[tradie.id] || 'idle'}
              messagePending={message.isPending}
              onInvite={() => handleInvite(tradie.id)}
              onMessage={() => message.mutate(tradie.id)}
              onViewProfile={() => setViewingTradie(tradie)}
            />
          ))
        )}
      </ScrollView>
      {viewingTradie && <TradieProfileModal tradie={viewingTradie} onClose={() => setViewingTradie(null)} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  container: { padding: 20, paddingBottom: 60 },
  category: { fontSize: 24, fontWeight: '800', marginBottom: 8 },
  description: { fontSize: 15, color: '#334155', marginBottom: 12, lineHeight: 22 },
  location: { fontSize: 14, color: '#64748B', marginBottom: 4 },
  urgency: { fontSize: 14, color: '#64748B', marginBottom: 4 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginTop: 28, marginBottom: 12 },
  empty: { fontSize: 14, color: '#94A3B8' },
  applicantCard: {
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 14, marginBottom: 10,
  },
  applicantTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  applicantName: { fontSize: 15, fontWeight: '700', flexShrink: 1, marginRight: 8 },
  applicantStatus: { fontSize: 12, fontWeight: '700' },
  invitedTag: { fontSize: 12, color: '#2563EB', fontWeight: '600', marginTop: 4 },
  applicantMessage: { fontSize: 14, color: '#475569', marginTop: 6, fontStyle: 'italic' },
  applicantActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  actionBtn: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  messageBtn: { backgroundColor: '#EFF6FF' },
  messageBtnText: { color: '#2563EB', fontWeight: '700' },
  declineBtn: { backgroundColor: '#FEF2F2' },
  declineBtnText: { color: '#DC2626', fontWeight: '700' },
  acceptBtn: { backgroundColor: '#16A34A' },
  acceptBtnText: { color: '#fff', fontWeight: '700' },
  completeBtn: {
    backgroundColor: '#16A34A', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 20,
  },
  completeBtnDisabled: { opacity: 0.5 },
  completeBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  completedBanner: { backgroundColor: '#F0FDF4', borderRadius: 12, padding: 14, marginTop: 20 },
  completedBannerText: { color: '#16A34A', fontWeight: '600', fontSize: 14 },

  matchCard: {
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 14, marginBottom: 10,
  },
  matchTop: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  matchAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#F1F5F9' },
  matchAvatarFallback: { alignItems: 'center', justifyContent: 'center' },
  matchAvatarInitials: { color: '#64748B', fontWeight: '700', fontSize: 15 },
  matchNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  matchName: { fontSize: 15, fontWeight: '700' },
  matchVerified: { fontSize: 11, color: '#16A34A', fontWeight: '700' },
  matchTrades: { fontSize: 13, color: '#475569', marginTop: 2 },
  matchArea: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  // Plain single-row flex — the earlier flexWrap + percentage-minWidth
  // 2x2 grid produced a real Yoga layout bug (children stretching to fill
  // leftover cross-axis height unpredictably, some items effectively
  // invisible). Three flex:1 buttons in one row is simple and reliable.
  matchActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  inviteBtn: { backgroundColor: '#EEF2FF' },
  inviteBtnText: { color: '#4338CA', fontWeight: '700', fontSize: 13 },
  profileBtn: { backgroundColor: '#F8FAFC' },
  profileBtnText: { color: '#334155', fontWeight: '700', fontSize: 13 },
  actionBtnDisabled: { opacity: 0.5 },
  disabledBtnText: { color: '#94A3B8', fontWeight: '700', fontSize: 13 },

  errorState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorStateText: { fontSize: 15, color: '#475569', textAlign: 'center', lineHeight: 22, marginBottom: 16 },
  retryBtn: { backgroundColor: '#16A34A', borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12 },
  retryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  modalSafe: { flex: 1, backgroundColor: '#fff' },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 20,
    borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
  },
  modalAvatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#F1F5F9' },
  modalName: { fontSize: 17, fontWeight: '800', color: '#0F172A' },
  modalSub: { fontSize: 13, color: '#64748B', marginTop: 2 },
  modalClose: { fontSize: 20, color: '#94A3B8', padding: 4 },
  modalBody: { padding: 20, paddingBottom: 40 },
  modalSectionTitle: { fontSize: 11, fontWeight: '800', color: '#94A3B8', letterSpacing: 0.5, marginTop: 20, marginBottom: 8 },
  modalLine: { fontSize: 14, color: '#1E293B', marginTop: 3, lineHeight: 20 },
  modalLineTappable: { color: '#16A34A', fontWeight: '700' },
  modalEmergency: { fontSize: 13, color: '#DC2626', fontWeight: '700', marginTop: 6 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tradeChipStatic: { backgroundColor: '#F0FDF4', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  tradeChipStaticText: { color: '#166534', fontWeight: '700', fontSize: 13 },
});
