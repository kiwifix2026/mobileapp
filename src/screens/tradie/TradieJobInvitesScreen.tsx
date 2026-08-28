import React, { useCallback, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, SafeAreaView, ScrollView, ActivityIndicator, Image, RefreshControl } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { TradieStackParamList } from '../../navigation/types';
import type { TradieInvite } from '../../api/tradies';
import { listTradieInvites, markInviteRead } from '../../api/tradies';
import { applyToJob } from '../../api/jobs';
import { getSignedUrl } from '../../api/uploads';
import { useAuth } from '../../auth/AuthContext';
import { ApiError } from '../../api/client';

type Props = NativeStackScreenProps<TradieStackParamList, 'TradieJobInvites'>;

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? '' : 's'} ago`;
  return `${Math.floor(hrs / 24)} day${Math.floor(hrs / 24) === 1 ? '' : 's'} ago`;
}

function InviteThumb({ photoKey }: { photoKey: string }) {
  const { data: url } = useQuery({
    queryKey: ['invitePhoto', photoKey],
    queryFn: () => getSignedUrl(photoKey),
  });
  if (!url) return <View style={[styles.thumb, styles.thumbLoading]} />;
  return <Image source={{ uri: url }} style={styles.thumb} />;
}

// A job a poster specifically invited this tradie to — mirrors web's
// tradie-job-invites.html. Accepting is literally the normal apply flow
// (JobApplicationsService.apply() auto-detects the existing invite and
// jumps straight to MATCHED server-side), so this reuses applyToJob as-is
// rather than needing an invite-specific accept endpoint.
function InviteCard({
  invite,
  onPress,
  onAccept,
  accepting,
}: {
  invite: TradieInvite;
  onPress: () => void;
  onAccept: () => void;
  accepting: boolean;
}) {
  const photos = invite.photos || [];
  const shownPhotos = photos.slice(0, 3);
  const overflow = photos.length - shownPhotos.length;

  let buttonLabel = 'Accept';
  let buttonDisabled = false;
  if (invite.myApplicationStatus === 'accepted') {
    buttonLabel = '🎉 You got this job!';
    buttonDisabled = true;
  } else if (invite.myApplicationStatus === 'declined') {
    buttonLabel = 'Not selected';
    buttonDisabled = true;
  } else if (invite.myApplicationStatus === 'pending') {
    buttonLabel = '✓ Applied';
    buttonDisabled = true;
  } else if (accepting) {
    buttonLabel = 'Accepting…';
    buttonDisabled = true;
  }

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.cardTop}>
        <Text style={styles.category}>{invite.category}</Text>
        <View style={styles.invitedBadge}>
          <Text style={styles.invitedBadgeText}>💼 Invited</Text>
        </View>
      </View>
      {invite.urgency && (
        <View style={styles.urgencyBadge}>
          <Text style={styles.urgencyBadgeText}>{invite.urgency}</Text>
        </View>
      )}
      <Text style={styles.description} numberOfLines={2}>{invite.description}</Text>
      {shownPhotos.length > 0 && (
        <View style={styles.photoRow}>
          {shownPhotos.map((key) => <InviteThumb key={key} photoKey={key} />)}
          {overflow > 0 && (
            <View style={[styles.thumb, styles.overflowChip]}>
              <Text style={styles.overflowText}>+{overflow}</Text>
            </View>
          )}
        </View>
      )}
      <Text style={styles.meta}>📍 {[invite.suburb, invite.region].filter(Boolean).join(', ') || 'Area not set'}</Text>
      <Text style={styles.meta}>🕐 Posted {timeAgo(invite.createdAt)}</Text>
      <Pressable
        style={[styles.acceptBtn, buttonDisabled && styles.acceptBtnDisabled]}
        disabled={buttonDisabled}
        onPress={onAccept}
      >
        <Text style={[styles.acceptBtnText, buttonDisabled && styles.acceptBtnTextDisabled]}>{buttonLabel}</Text>
      </Pressable>
      <Text style={styles.detailsLink}>View full details →</Text>
    </Pressable>
  );
}

export default function TradieJobInvitesScreen({ navigation }: Props) {
  const { session } = useAuth();
  const email = session!.email;
  const token = session!.token;
  const queryClient = useQueryClient();
  // Same tab-bar overlap fix as the other tab-bar-visible list screens.
  const tabBarHeight = useBottomTabBarHeight();

  const { data: invites, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['tradieInvites', email],
    queryFn: () => listTradieInvites(token, email),
  });

  // Same "bottom-tab keeps screens mounted" issue fixed on Conversations/
  // Notifications — refetch every time this screen is actually looked at.
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  // Viewing the list is what clears each invite's "new" state — mirrors
  // opening a chat/notification thread marking it read. Best-effort, fire
  // and forget; a failed read-mark just means the badge stays a beat longer.
  useEffect(() => {
    const unread = (invites || []).filter((i) => !i.invitedRead);
    if (unread.length === 0) return;
    Promise.all(unread.map((i) => markInviteRead(token, email, i.id))).catch(() => {});
  }, [invites, token, email]);

  const accept = useMutation({
    mutationFn: (jobId: string) => applyToJob(token, jobId, email),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tradieInvites', email] });
      queryClient.invalidateQueries({ queryKey: ['myApplications', email] });
    },
    onError: (err) => {
      // Surfaced inline per-card is overkill for a rare failure path —
      // matches how other list screens in this app handle mutation errors.
      console.warn(err instanceof ApiError ? err.message : 'Could not accept this invite');
    },
  });

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: tabBarHeight + 20 }]}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      >
        {isLoading ? (
          <ActivityIndicator style={{ marginTop: 40 }} />
        ) : !invites || invites.length === 0 ? (
          <Text style={styles.empty}>No job invites right now — job posters can invite you to a job directly from their job's tradie search.</Text>
        ) : (
          invites.map((invite) => (
            <InviteCard
              key={invite.id}
              invite={invite}
              onPress={() => navigation.navigate('TradieJobDetail', { jobId: invite.id })}
              onAccept={() => accept.mutate(invite.id)}
              accepting={accept.isPending && accept.variables === invite.id}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  scroll: { padding: 20, paddingBottom: 40 },
  empty: { fontSize: 14, color: '#94A3B8', textAlign: 'center', marginTop: 60, paddingHorizontal: 10, lineHeight: 20 },
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 14,
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  category: { fontSize: 17, fontWeight: '800', color: '#0F172A', flexShrink: 1 },
  invitedBadge: { backgroundColor: '#F0FDF4', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  invitedBadgeText: { color: '#16A34A', fontWeight: '700', fontSize: 12 },
  urgencyBadge: { alignSelf: 'flex-start', backgroundColor: '#F1F5F9', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3, marginTop: 8 },
  urgencyBadgeText: { color: '#475569', fontWeight: '600', fontSize: 12 },
  description: { fontSize: 14, color: '#334155', marginTop: 10, lineHeight: 20 },
  photoRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  thumb: { width: 56, height: 56, borderRadius: 10, backgroundColor: '#F1F5F9' },
  thumbLoading: { alignItems: 'center', justifyContent: 'center' },
  overflowChip: { alignItems: 'center', justifyContent: 'center' },
  overflowText: { color: '#64748B', fontWeight: '700', fontSize: 13 },
  meta: { fontSize: 13, color: '#94A3B8', marginTop: 8 },
  acceptBtn: { backgroundColor: '#16A34A', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 14 },
  acceptBtnDisabled: { backgroundColor: '#F1F5F9' },
  acceptBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  acceptBtnTextDisabled: { color: '#64748B' },
  detailsLink: { color: '#2563EB', fontWeight: '600', fontSize: 13, marginTop: 10, textAlign: 'center' },
});
