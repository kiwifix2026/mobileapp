import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, SafeAreaView, ScrollView, ActivityIndicator, Image } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { TradieStackParamList } from '../../navigation/types';
import { getMatchingJob, applyToJob } from '../../api/jobs';
import { startConversation } from '../../api/conversations';
import { getTradieByEmail } from '../../api/tradies';
import { getSignedUrl } from '../../api/uploads';
import { useAuth } from '../../auth/AuthContext';
import { ApiError } from '../../api/client';

type Props = NativeStackScreenProps<TradieStackParamList, 'TradieJobDetail'>;

// Job photos are stored as private S3 keys (see kiwifix_s3_file_storage
// memory) — same signed-URL pattern as InviteThumb on TradieJobInvitesScreen.
// The backend already sends `photos` on this job's redacted view
// (redactJobForTradie includes it) so a tradie could see them from the very
// start of matching, not just once accepted — this screen just never
// rendered them.
function JobPhotoThumb({ photoKey }: { photoKey: string }) {
  const { data: url } = useQuery({
    queryKey: ['jobPhoto', photoKey],
    queryFn: () => getSignedUrl(photoKey),
  });
  if (!url) return <View style={[styles.photoThumb, styles.photoThumbLoading]} />;
  return <Image source={{ uri: url }} style={styles.photoThumb} />;
}

export default function TradieJobDetailScreen({ route, navigation }: Props) {
  const { jobId } = route.params;
  const { session } = useAuth();
  const queryClient = useQueryClient();
  // Same bottom-tab-bar overlap fix as the poster-side JobDetailScreen —
  // this screen keeps the tab bar visible too, so scroll content needs to
  // clear its actual rendered height, not a guessed fixed padding.
  const tabBarHeight = useBottomTabBarHeight();
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  const { data: job, isLoading, isError: jobIsError, error: jobError, refetch: refetchJob } = useQuery({
    queryKey: ['matchingJob', jobId, session!.email],
    queryFn: () => getMatchingJob(jobId, session!.email),
  });

  // JobApplicationsService.apply() hard-rejects with a 403 unless
  // approvalStatus === 'APPROVED' — every brand new tradie starts PENDING,
  // so this has to be checked here too, not just relied on as a
  // backend-side error after the fact (matches web's
  // window.currentTradieApprovalStatus gate on the Apply button).
  const { data: tradie } = useQuery({
    queryKey: ['myTradieProfile', session!.email],
    queryFn: () => getTradieByEmail(session!.email),
  });
  const approvalStatus = tradie?.approvalStatus || 'PENDING';
  const isApproved = approvalStatus === 'APPROVED';

  const apply = useMutation({
    mutationFn: () => applyToJob(session!.token, jobId, session!.email, message.trim() || undefined),
    onSuccess: () => {
      setApplied(true);
      queryClient.invalidateQueries({ queryKey: ['myApplications', session!.email] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not apply to this job. Please try again.'),
  });

  const startChat = useMutation({
    mutationFn: () => startConversation('tradie', session!.token, jobId, { tradieEmail: session!.email }),
    onSuccess: (conversation) => {
      navigation.navigate('ChatThread', {
        conversationId: conversation.id,
        jobCategory: job?.category || '',
        counterpartName: job?.customerName || 'Job poster',
      });
    },
  });

  // Same bug class fixed on the poster side's JobDetailScreen: this used to
  // be an unconditional `isLoading || !job` spinner with no error branch —
  // any failed fetch left `isLoading` false and `job` undefined forever, so
  // the screen just sat on a spinner indefinitely with no visible error and
  // no way to retry.
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
  if (isLoading || !job) {
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

        {!!job.photos?.length && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll}>
            {job.photos.map((key) => <JobPhotoThumb key={key} photoKey={key} />)}
          </ScrollView>
        )}

        {/* Only present once this tradie is ACCEPTED on the job (see
            buildAcceptedJobView on the backend) — full street address and
            customerMobile are both withheld until then, and this section
            still renders exactly the same whether the job is MATCHED or
            already COMPLETED, matching web's tradie-job-view.html. */}
        {job.customerName && (
          <View style={styles.contactCard}>
            <Text style={styles.contactTitle}>CONTACT DETAILS</Text>
            <Text style={styles.contactLine}><Text style={styles.contactLabel}>Name: </Text>{job.customerName}</Text>
            {job.customerMobile && (
              <Text style={styles.contactLine}><Text style={styles.contactLabel}>Phone: </Text>{job.customerMobile}</Text>
            )}
            {job.address && (
              <Text style={styles.contactLine}><Text style={styles.contactLabel}>Address: </Text>{job.address}</Text>
            )}
          </View>
        )}

        {!isApproved && (
          <View style={approvalStatus === 'REJECTED' ? styles.rejectedBanner : styles.pendingBanner}>
            <Text style={approvalStatus === 'REJECTED' ? styles.rejectedBannerText : styles.pendingBannerText}>
              {approvalStatus === 'REJECTED'
                ? '✕ Your profile was rejected by KiwiFix. Update your details on the web app and it will be reviewed again.'
                : '🕓 Your profile is pending review — you can message job posters, but you can\'t apply for jobs until KiwiFix approves your profile.'}
            </Text>
          </View>
        )}

        <Pressable
          style={[styles.messageBtn, startChat.isPending && styles.submitDisabled]}
          disabled={startChat.isPending}
          onPress={() => startChat.mutate()}
        >
          <Text style={styles.messageBtnText}>💬 Message the job poster</Text>
        </Pressable>

        {(applied || job.myApplicationStatus === 'pending' || job.myApplicationStatus === 'accepted') ? (
          <View style={styles.appliedBanner}>
            <Text style={styles.appliedBannerText}>
              {job.myApplicationStatus === 'accepted'
                ? '🎉 You were accepted for this job!'
                : '✓ Application sent — you can track it under My Applications.'}
            </Text>
          </View>
        ) : !isApproved ? (
          <Pressable style={[styles.submit, styles.submitDisabled]} disabled>
            <Text style={styles.submitText}>🕓 Pending approval</Text>
          </Pressable>
        ) : (
          <>
            <Text style={styles.label}>Add a note (optional)</Text>
            <TextInput
              style={styles.textarea}
              multiline
              numberOfLines={3}
              placeholder="e.g. I can come take a look this Thursday afternoon"
              value={message}
              onChangeText={setMessage}
            />
            {error && <Text style={styles.error}>⚠️ {error}</Text>}
            <Pressable
              style={[styles.submit, apply.isPending && styles.submitDisabled]}
              disabled={apply.isPending}
              onPress={() => apply.mutate()}
            >
              {apply.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Apply for this Job</Text>}
            </Pressable>
          </>
        )}
      </ScrollView>
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
  photoScroll: { marginTop: 12 },
  photoThumb: { width: 100, height: 100, borderRadius: 12, backgroundColor: '#F1F5F9', marginRight: 10 },
  photoThumbLoading: { alignItems: 'center', justifyContent: 'center' },
  contactCard: {
    backgroundColor: '#F0FDF4', borderRadius: 12, padding: 14, marginTop: 16,
  },
  contactTitle: { fontSize: 11, fontWeight: '800', color: '#16A34A', letterSpacing: 0.5, marginBottom: 8 },
  contactLine: { fontSize: 14, color: '#1E293B', marginTop: 3, lineHeight: 20 },
  contactLabel: { fontWeight: '700' },
  label: { fontSize: 14, fontWeight: '700', marginTop: 24, marginBottom: 8, color: '#334155' },
  textarea: {
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, minHeight: 80, textAlignVertical: 'top',
  },
  error: { color: '#DC2626', fontSize: 13, marginTop: 12 },
  messageBtn: {
    backgroundColor: '#EFF6FF', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 20,
  },
  messageBtnText: { color: '#2563EB', fontWeight: '700', fontSize: 15 },
  submit: { backgroundColor: '#16A34A', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 20 },
  submitDisabled: { opacity: 0.5 },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  appliedBanner: { backgroundColor: '#F0FDF4', borderRadius: 12, padding: 16, marginTop: 24 },
  appliedBannerText: { color: '#16A34A', fontWeight: '600', fontSize: 14 },
  pendingBanner: { backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', borderRadius: 12, padding: 14, marginTop: 16 },
  pendingBannerText: { color: '#92400E', fontWeight: '600', fontSize: 13, lineHeight: 18 },
  rejectedBanner: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: 12, padding: 14, marginTop: 16 },
  rejectedBannerText: { color: '#DC2626', fontWeight: '600', fontSize: 13, lineHeight: 18 },
  errorState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorStateText: { fontSize: 15, color: '#475569', textAlign: 'center', lineHeight: 22, marginBottom: 16 },
  retryBtn: { backgroundColor: '#16A34A', borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12 },
  retryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
