import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Image,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PosterStackParamList } from '../../navigation/types';
import { getMyJob, updateJob } from '../../api/jobs';
import { uploadPhoto, getSignedUrl } from '../../api/uploads';
import { useAuth } from '../../auth/AuthContext';
import { ApiError } from '../../api/client';
import ScreenBackground from '../../components/ScreenBackground';
import AddressAutocompleteField, { ConfirmedAddress } from '../../components/AddressAutocompleteField';

type Props = NativeStackScreenProps<PosterStackParamList, 'EditJob'>;

// Same options PostJobScreen already offers on create — kept in sync so
// editing never shows a narrower urgency list than posting did.
const URGENCY_OPTIONS = ['Emergency (ASAP)', 'Within a week', 'Within a month', 'No rush'];
// Web's job-detail.html edit form's exact 3 options for Job.contact — a
// real schema field PostJobScreen never collects on create, only settable
// here (see contact field comment on the Job type in api/types.ts).
const CONTACT_OPTIONS = ['Phone Call', 'Text Message', 'Email'];
const MAX_PHOTOS = 6;
const MIN_DESCRIPTION_WORDS = 5;

type PhotoEntry = { id: string; key?: string; localUri?: string; uploading: boolean };

// Existing (already-saved) photos only have an S3 key, not a local file URI
// — same signed-URL pattern as every other private-S3 image in this app
// (JobPhotoThumb on TradieJobDetailScreen, InviteThumb, etc).
function EditPhotoThumb({ photoKey }: { photoKey: string }) {
  const { data: url } = useQuery({
    queryKey: ['jobPhoto', photoKey],
    queryFn: () => getSignedUrl(photoKey),
  });
  if (!url) return <View style={[styles.photoThumb, styles.photoThumbLoading]} />;
  return <Image source={{ uri: url }} style={styles.photoThumb} />;
}

// Mirrors web's job-detail.html "Edit job" form (see toggleEditJob/
// saveJobEdit there and UpdateJobDto/JobsService.update on the backend),
// as its own full screen built from the app's existing address/photo-picker
// components instead of a toggled inline form — same shape decision as
// EditProfileScreen already made for tradies. Partial update via PATCH
// /jobs/:id — only fields this screen actually touches get sent (undefined
// means "leave it alone"), same contract as every other edit endpoint in
// this app.
//
// Deliberately does NOT let the category/trade be changed here, unlike
// web's edit form — a job's category is what determined which tradies got
// matched/notified/applied in the first place, so silently reassigning it
// after tradies have already engaged would misrepresent their applications.
// Anyone who posted under the wrong trade should post a new job instead.
export default function EditJobScreen({ route, navigation }: Props) {
  const { jobId } = route.params;
  const { session } = useAuth();
  const token = session!.token;
  const queryClient = useQueryClient();

  const { data: job, isLoading, isError, error: jobError, refetch } = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => getMyJob(token, jobId),
  });

  const [description, setDescription] = useState('');
  const [urgency, setUrgency] = useState('');
  const [contact, setContact] = useState('');
  const [addressText, setAddressText] = useState('');
  const [addressEditing, setAddressEditing] = useState(false);
  // Only set once the poster actually picks a NEW address from the
  // suggestions — stays null if they leave the existing address alone, so
  // the save only sends address/suburb/city/region when they were really
  // touched (same "undefined means unchanged" contract as everything else
  // this screen sends).
  const [newAddress, setNewAddress] = useState<ConfirmedAddress | null>(null);
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // Same one-time hydration guard EditProfileScreen uses — a background
  // refetch of ['job', jobId] (e.g. from JobDetailScreen still mounted
  // underneath) must never clobber edits already in progress here.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!job || hydratedRef.current) return;
    hydratedRef.current = true;
    setDescription(job.description || '');
    setUrgency(job.urgency || '');
    setContact(job.contact || '');
    setAddressText(job.address || [job.suburb, job.city].filter(Boolean).join(', '));
    setAddressEditing(!job.address);
    setPhotos((job.photos || []).map((key) => ({ id: key, key, uploading: false })));
  }, [job]);

  async function pickPhoto() {
    setPhotoError(null);
    if (photos.length >= MAX_PHOTOS) {
      setPhotoError(`You can attach up to ${MAX_PHOTOS} photos.`);
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setPhotoError('Photo library access is needed to attach photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    const id = asset.uri;
    setPhotos((prev) => [...prev, { id, localUri: asset.uri, uploading: true }]);
    try {
      const key = await uploadPhoto(asset.uri, asset.fileName || undefined, asset.mimeType || undefined);
      setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, key, uploading: false } : p)));
    } catch (err) {
      setPhotos((prev) => prev.filter((p) => p.id !== id));
      setPhotoError(err instanceof ApiError ? err.message : 'Could not upload that photo. Please try again.');
    }
  }
  function removePhoto(id: string) {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  }

  const descriptionWordCount = description.trim().split(/\s+/).filter(Boolean).length;
  const descriptionTooShort = description.trim().length > 0 && descriptionWordCount < MIN_DESCRIPTION_WORDS;
  const canSubmit =
    description.trim().length > 0 &&
    !descriptionTooShort &&
    !addressEditing &&
    !!addressText &&
    !photos.some((p) => p.uploading);

  const save = useMutation({
    mutationFn: () =>
      // No `category` here on purpose — see the screen-level comment above.
      updateJob(token, jobId, {
        description: description.trim(),
        urgency: urgency || undefined,
        contact: contact || undefined,
        address: newAddress?.display,
        suburb: newAddress?.suburb,
        city: newAddress?.city,
        region: newAddress?.region,
        photos: photos.filter((p) => p.key).map((p) => p.key!),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['job', jobId], updated);
      queryClient.invalidateQueries({ queryKey: ['myJobs'] });
      // Area (suburb/city) may have changed who counts as a match — same
      // reload web's saveJobEdit() triggers via loadMatchingTradies().
      queryClient.invalidateQueries({ queryKey: ['matchingTradies'] });
      navigation.goBack();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not save changes. Please try again.'),
  });

  if (isError) {
    return (
      <ScreenBackground>
      <SafeAreaView style={styles.safe}>
        <View style={styles.errorState}>
          <Text style={styles.errorStateText}>
            ⚠️ Couldn't load this job.{'\n'}
            {jobError instanceof ApiError ? jobError.message : 'Check your connection and try again.'}
          </Text>
          <Pressable style={styles.retryBtn} onPress={() => refetch()}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
      </ScreenBackground>
    );
  }
  if (isLoading || !job) {
    return (
      <ScreenBackground>
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator style={{ marginTop: 40 }} />
      </SafeAreaView>
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Edit Job</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Category</Text>
        <View style={styles.categoryReadOnly}>
          <Text style={styles.categoryReadOnlyText}>{job.category}</Text>
        </View>
        <Text style={styles.hint}>
          The job's trade category can't be changed once posted — tradies were already matched against it. Post a new job if it's the wrong trade.
        </Text>

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={styles.textarea}
          multiline
          numberOfLines={4}
          value={description}
          onChangeText={setDescription}
        />
        {descriptionTooShort && (
          <Text style={styles.error}>
            ⚠️ Add a bit more detail — at least {MIN_DESCRIPTION_WORDS} words (you've written {descriptionWordCount}).
          </Text>
        )}

        <Text style={styles.label}>How urgent?</Text>
        <View style={styles.chipRow}>
          {URGENCY_OPTIONS.map((u) => (
            <Pressable key={u} style={[styles.chip, urgency === u && styles.chipActive]} onPress={() => setUrgency(u)}>
              <Text style={[styles.chipText, urgency === u && styles.chipTextActive]}>{u}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Preferred contact</Text>
        <View style={styles.chipRow}>
          {CONTACT_OPTIONS.map((c) => (
            <Pressable key={c} style={[styles.chip, contact === c && styles.chipActive]} onPress={() => setContact(c)}>
              <Text style={[styles.chipText, contact === c && styles.chipTextActive]}>{c}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Address</Text>
        {/* Job.address is only ever a plain string (no structured
            street/houseNumber/postcode breakdown saved), same limitation
            EditProfileScreen hit for Tradie.address — can't rebuild the
            full ConfirmedAddress object the field's "confirmed card" view
            needs, so this shows a plain confirmed card with the real saved
            text until Change is tapped, same pattern as that screen. */}
        {!addressEditing && addressText ? (
          <View style={styles.addressConfirmedWrap}>
            <View style={styles.addressConfirmedCard}>
              <Text style={styles.addressConfirmedText}>{addressText}</Text>
            </View>
            <Pressable onPress={() => setAddressEditing(true)}>
              <Text style={styles.changeBtn}>Change address</Text>
            </Pressable>
          </View>
        ) : (
          <AddressAutocompleteField
            label="Job address"
            value={null}
            onChange={(v) => {
              if (v?.display) {
                setNewAddress(v);
                setAddressText(v.display);
                setAddressEditing(false);
              }
            }}
          />
        )}

        <Text style={styles.label}>Photos</Text>
        <View style={styles.photoRow}>
          {photos.map((p) => (
            <View key={p.id} style={styles.photoThumbWrap}>
              {p.localUri ? (
                <Image source={{ uri: p.localUri }} style={styles.photoThumb} />
              ) : (
                <EditPhotoThumb photoKey={p.key!} />
              )}
              {p.uploading ? (
                <View style={styles.photoOverlay}>
                  <ActivityIndicator size="small" color="#fff" />
                </View>
              ) : (
                <Pressable style={styles.photoRemove} onPress={() => removePhoto(p.id)}>
                  <Text style={styles.photoRemoveText}>✕</Text>
                </Pressable>
              )}
            </View>
          ))}
          {photos.length < MAX_PHOTOS && (
            <Pressable style={styles.photoAdd} onPress={pickPhoto}>
              <Text style={styles.photoAddIcon}>📷</Text>
              <Text style={styles.photoAddText}>Add</Text>
            </Pressable>
          )}
        </View>
        {photoError && <Text style={styles.error}>⚠️ {photoError}</Text>}

        {error && <Text style={styles.error}>⚠️ {error}</Text>}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.footerRow}>
          <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backBtnText}>Cancel</Text>
          </Pressable>
          <Pressable
            style={[styles.saveBtn, (!canSubmit || save.isPending) && styles.saveBtnDisabled]}
            disabled={!canSubmit || save.isPending}
            onPress={() => save.mutate()}
          >
            {save.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save changes</Text>}
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4,
  },
  backArrow: { fontSize: 22, color: '#0F172A', fontWeight: '700' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#0F172A' },
  scroll: { flex: 1 },
  container: { padding: 20, paddingBottom: 40 },
  label: { fontSize: 14, fontWeight: '700', marginTop: 20, marginBottom: 8, color: '#334155' },
  hint: { color: '#475569', fontWeight: '500', fontSize: 12, marginTop: 6 },
  categoryReadOnly: {
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, backgroundColor: '#F8FAFC',
    paddingHorizontal: 14, paddingVertical: 12,
  },
  categoryReadOnlyText: { fontSize: 15, fontWeight: '700', color: '#334155' },
  textarea: {
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, minHeight: 100, textAlignVertical: 'top',
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20,
    borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC',
  },
  chipActive: { backgroundColor: '#16A34A', borderColor: '#16A34A' },
  chipText: { fontSize: 13, color: '#334155', fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  addressConfirmedWrap: { gap: 8 },
  addressConfirmedCard: {
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, backgroundColor: '#F8FAFC',
    paddingHorizontal: 14, paddingVertical: 12,
  },
  addressConfirmedText: { fontSize: 15, fontWeight: '600', color: '#1E293B' },
  changeBtn: { color: '#2563EB', fontWeight: '600', fontSize: 13, alignSelf: 'flex-start' },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoThumbWrap: { width: 80, height: 80, borderRadius: 12, overflow: 'hidden', position: 'relative' },
  photoThumb: { width: '100%', height: '100%' },
  photoThumbLoading: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F5F9' },
  photoOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  photoRemove: { position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  photoRemoveText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  photoAdd: {
    width: 80, height: 80, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC',
  },
  photoAddIcon: { fontSize: 20 },
  photoAddText: { fontSize: 11, color: '#64748B', marginTop: 2 },
  error: { color: '#DC2626', fontSize: 13, marginTop: 10 },
  footer: { padding: 16, paddingBottom: 24, borderTopWidth: 1, borderTopColor: '#E2E8F0', backgroundColor: '#fff' },
  footerRow: { flexDirection: 'row', gap: 10 },
  backBtn: { paddingVertical: 16, paddingHorizontal: 20, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  backBtnText: { color: '#334155', fontWeight: '700', fontSize: 15 },
  saveBtn: { flex: 1, backgroundColor: '#16A34A', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  errorState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorStateText: { fontSize: 15, color: '#475569', textAlign: 'center', lineHeight: 22, marginBottom: 16 },
  retryBtn: { backgroundColor: '#16A34A', borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12 },
  retryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
