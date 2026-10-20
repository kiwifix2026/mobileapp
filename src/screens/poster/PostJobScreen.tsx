import React, { useMemo, useState } from 'react';
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
  Modal,
  FlatList,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PosterStackParamList } from '../../navigation/types';
import { createJob } from '../../api/jobs';
import { getApprovedTrades, getAllTradeServices } from '../../api/trades';
import { uploadPhoto } from '../../api/uploads';
import { useAuth } from '../../auth/AuthContext';
import { ApiError } from '../../api/client';
import AddressAutocompleteField, { ConfirmedAddress } from '../../components/AddressAutocompleteField';
import ScreenBackground from '../../components/ScreenBackground';

type Props = NativeStackScreenProps<PosterStackParamList, 'PostJob'>;

const URGENCY_OPTIONS = ['Emergency (ASAP)', 'Within a week', 'Within a month', 'No rush'];
const MAX_PHOTOS = 6;
// Matches web's saveStep1() MIN_DESCRIPTION_WORDS — guards against low-effort
// entries like "fix it" that don't give a tradie enough to go on.
const MIN_DESCRIPTION_WORDS = 5;
const STEPS = ['Category', 'Details', 'Review'];

type SearchMatch = { label: string; icon: string; sub?: string };

// A 3-step wizard (Category → Details → Review & Submit), visually matching
// a step-indicator-dots pattern rather than one long scrolling form — same
// fields as before, just grouped into steps. Deliberately does NOT add a
// "budget range" step some marketplace-app mockups show: Job has no budget
// field in the real backend (see schema.prisma), only `urgency` (free text),
// so that stays as the real Step 3 input instead of a fabricated one.
export default function PostJobScreen({ navigation }: Props) {
  const { session } = useAuth();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(0);
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState<ConfirmedAddress | null>(null);
  const [urgency, setUrgency] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  // "Other" used to be an inline grid of 30+ tiles that expanded in place —
  // picking one didn't visually confirm anything and pushed the rest of the
  // form far down the page, so it looked like nothing happened. Replaced
  // with a modal list: single-select, closes itself the moment you pick
  // something, and the page layout never shifts.
  const [otherModalVisible, setOtherModalVisible] = useState(false);
  const [otherModalSearch, setOtherModalSearch] = useState('');
  const [customText, setCustomText] = useState('');
  const [customWasTyped, setCustomWasTyped] = useState(false);
  const [photos, setPhotos] = useState<{ uri: string; key?: string; uploading: boolean }[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // Full trade catalog — nothing about which categories exist is hardcoded
  // here, mirrors the web app's fetchApprovedTrades(). See src/api/trades.ts.
  const { data: approvedTrades } = useQuery({
    queryKey: ['approvedTrades'],
    queryFn: getApprovedTrades,
  });
  const { data: tradeServices } = useQuery({
    queryKey: ['tradeServices'],
    queryFn: getAllTradeServices,
  });

  // Several distinct trades can share the same jobLabel (e.g. Builder and
  // Handyman both map to job category "Handyman") — dedupe by label here,
  // same as the web app's renderJobCategoryGrid()/getExtraCategories()
  // `seen` sets, otherwise two tiles end up with the same React key.
  const featured = useMemo(() => {
    const seen = new Set<string>();
    return (approvedTrades || []).filter((t) => {
      if (!t.featuredForJobPosters || seen.has(t.jobLabel)) return false;
      seen.add(t.jobLabel);
      return true;
    });
  }, [approvedTrades]);
  // The grid always shows TILE_COUNT category tiles and then "Other". The
  // catalog's "featured for job posters" flag currently only marks 9 trades,
  // so the grid is topped up from the next regular trades in catalog order
  // until it reaches 11. Anything beyond the 11 lives under "Other". (To
  // control exactly which 11 appear, flag them as featured in the admin
  // trade catalog — web and mobile will then agree.)
  const TILE_COUNT = 11;
  const tiles = useMemo(() => {
    if (featured.length >= TILE_COUNT) return featured.slice(0, TILE_COUNT);
    const seen = new Set(featured.map((t) => t.jobLabel));
    const topUp: typeof featured = [];
    for (const t of approvedTrades || []) {
      if (featured.length + topUp.length >= TILE_COUNT) break;
      if (t.searchOnly || seen.has(t.jobLabel)) continue;
      seen.add(t.jobLabel);
      topUp.push(t);
    }
    return [...featured, ...topUp];
  }, [featured, approvedTrades]);
  // Labels already shown as tiles (name kept: it gates the "Other" list and
  // the "picked something outside the tiles" check below).
  const featuredLabels = useMemo(() => new Set(tiles.map((t) => t.jobLabel)), [tiles]);

  const extraCategories = useMemo(() => {
    const seen = new Set<string>();
    return (approvedTrades || [])
      .filter((t) => !t.searchOnly && !featuredLabels.has(t.jobLabel))
      .filter((t) => {
        if (seen.has(t.jobLabel)) return false;
        seen.add(t.jobLabel);
        return true;
      })
      .map((t) => ({ name: t.jobLabel, icon: t.icon || '🔧' }));
  }, [approvedTrades, featuredLabels]);

  // Top search box — searches the full catalog (trade name/jobLabel, trade
  // keywords, then per-service keywords), same ranking as the web app's
  // renderCategorySearchResults(). See kiwifix_mobile_app_backend_alignment
  // memory for the parity work this is part of.
  const searchResults = useMemo<SearchMatch[]>(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];
    const seen = new Set<string>();
    const matches: SearchMatch[] = [];

    (approvedTrades || []).forEach((t) => {
      const key = t.jobLabel.toLowerCase();
      if (seen.has(key) || !key.includes(query)) return;
      seen.add(key);
      matches.push({ label: t.jobLabel, icon: t.icon || '🔧' });
    });
    (approvedTrades || []).forEach((t) => {
      const key = t.jobLabel.toLowerCase();
      if (seen.has(key)) return;
      if (!(t.keywords || []).some((k) => k.toLowerCase().includes(query))) return;
      seen.add(key);
      matches.push({ label: t.jobLabel, icon: t.icon || '🔧' });
    });
    Object.entries(tradeServices || {}).forEach(([trade, services]) => {
      services.forEach((s) => {
        const nameMatch = s.name.toLowerCase().includes(query);
        const keywordMatch = (s.keywords || []).some((k) => k.toLowerCase().includes(query));
        if (!nameMatch && !keywordMatch) return;
        const tradeRow = (approvedTrades || []).find((t) => t.name === trade);
        const label = tradeRow ? tradeRow.jobLabel : trade;
        const key = label.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        matches.push({ label, icon: tradeRow?.icon || '🔧', sub: `via "${s.name}"` });
      });
    });

    return matches.slice(0, 8);
  }, [searchQuery, approvedTrades, tradeServices]);

  function selectCategory(label: string) {
    setCategory(label);
    setCustomWasTyped(false);
    setCustomText('');
    setSearchQuery('');
    setOtherModalVisible(false);
  }

  function useCustomCategory() {
    const trimmed = customText.trim();
    if (!trimmed) return;
    setCategory(trimmed);
    setCustomWasTyped(true);
    setOtherModalVisible(false);
  }

  const otherModalResults = useMemo(() => {
    const q = otherModalSearch.trim().toLowerCase();
    if (!q) return extraCategories;
    return extraCategories.filter((c) => c.name.toLowerCase().includes(q));
  }, [extraCategories, otherModalSearch]);

  // True once the tradie has picked something via the Other modal (list
  // pick or typed-own) rather than one of the featured tiles above — used
  // to show the compact "Selected: X" confirmation instead of re-opening
  // the whole modal just to see what's chosen.
  const otherSelectionLabel =
    category && !featuredLabels.has(category) ? category : null;

  const mutation = useMutation({
    mutationFn: () =>
      createJob(session!.token, {
        category,
        description: description.trim(),
        region: address?.region || undefined,
        city: address?.city || undefined,
        suburb: address?.suburb || undefined,
        address: address?.display || undefined,
        urgency: urgency || undefined,
        photos: photos.filter((p) => p.key).map((p) => p.key!),
        customOtherServices: customWasTyped ? [category] : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myJobs'] });
      navigation.goBack();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not post this job. Please try again.'),
  });

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
      // iOS: force the picker to hand back a JPEG instead of the original
      // HEIC (the backend can't read HEIC). Android ignores this.
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });
    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    const entry = { uri: asset.uri, uploading: true };
    setPhotos((prev) => [...prev, entry]);

    try {
      const key = await uploadPhoto(asset.uri, asset.fileName || undefined, asset.mimeType || undefined);
      setPhotos((prev) => prev.map((p) => (p.uri === asset.uri ? { ...p, key, uploading: false } : p)));
    } catch (err) {
      setPhotos((prev) => prev.filter((p) => p.uri !== asset.uri));
      console.error('[PostJobScreen] photo upload failed:', err);
      setPhotoError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
          ? `Could not upload that photo: ${err.message}`
          : 'Could not upload that photo. Please try again.'
      );
    }
  }

  function removePhoto(uri: string) {
    setPhotos((prev) => prev.filter((p) => p.uri !== uri));
  }

  const descriptionWordCount = description.trim().split(/\s+/).filter(Boolean).length;
  const descriptionTooShort = description.trim().length > 0 && descriptionWordCount < MIN_DESCRIPTION_WORDS;

  // Mirrors the web app's saveStep1()/saveStep2() gates exactly: a
  // minimum-detail description, and address is not optional and must be a
  // full address picked from the suggestions (not just typed text) —
  // AddressAutocompleteField only ever sets `address` via a selected, full
  // (house number + street) Photon result, so `!!address` here is the same
  // guarantee as web's dataset.confirmed check.
  const step0Valid = !!category;
  const step1Valid = description.trim().length > 0 && !descriptionTooShort && !!address;
  const canSubmit = step0Valid && step1Valid && !photos.some((p) => p.uploading);

  function goNext() {
    if (step === 0 && !step0Valid) return;
    if (step === 1 && !step1Valid) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }
  function goBack() {
    if (step === 0) {
      navigation.goBack();
      return;
    }
    setStep((s) => Math.max(s - 1, 0));
  }

  return (
    <ScreenBackground plain>
    <SafeAreaView style={styles.safe}>
      <View style={styles.stepperHeader}>
        <Pressable onPress={goBack}><Text style={styles.backArrow}>←</Text></Pressable>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.stepperCount}>Step {step + 1} of {STEPS.length}</Text>
          <Text style={styles.stepperLabel}>{STEPS[step]}</Text>
        </View>
      </View>
      <View style={styles.stepperDots}>
        {STEPS.map((s, i) => (
          <View key={s} style={[styles.stepDot, i <= step && styles.stepDotActive]} />
        ))}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {step === 0 && (
          <View>
            <Text style={styles.label}>What do you need done?</Text>

            <View style={styles.searchWrap}>
              <TextInput
                style={styles.input}
                placeholder="Search — e.g. 'leaking pipe' or 'heat pump'"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.trim().length > 0 && (
                <View style={styles.searchDropdown}>
                  {searchResults.length ? (
                    searchResults.map((m, i) => (
                      <Pressable key={i} style={styles.searchItem} onPress={() => selectCategory(m.label)}>
                        <Text style={styles.searchIcon}>{m.icon}</Text>
                        <View>
                          <Text style={styles.searchLabel}>{m.label}</Text>
                          {m.sub && <Text style={styles.searchSub}>{m.sub}</Text>}
                        </View>
                      </Pressable>
                    ))
                  ) : (
                    <Text style={styles.searchEmpty}>No matches — try "Other" below to type your own.</Text>
                  )}
                </View>
              )}
            </View>

            <View style={styles.grid}>
              {tiles.map((t) => (
                <Pressable
                  key={t.name}
                  style={[styles.tile, category === t.jobLabel && styles.tileActive]}
                  onPress={() => selectCategory(t.jobLabel)}
                >
                  <Text style={styles.tileIcon}>{t.icon || '🔧'}</Text>
                  <Text style={[styles.tileLabel, category === t.jobLabel && styles.tileLabelActive]}>{t.jobLabel}</Text>
                </Pressable>
              ))}
              <Pressable
                style={[styles.tile, !!otherSelectionLabel && styles.tileActive]}
                onPress={() => setOtherModalVisible(true)}
              >
                <Text style={styles.tileIcon}>⋯</Text>
                <Text style={[styles.tileLabel, !!otherSelectionLabel && styles.tileLabelActive]}>Other</Text>
              </Pressable>
            </View>

            {otherSelectionLabel && (
              <View style={styles.otherSelectedRow}>
                <Text style={styles.otherSelectedText}>
                  Selected: <Text style={styles.otherSelectedName}>{otherSelectionLabel}</Text>
                  {customWasTyped ? ' (will be queued for a quick admin review)' : ''}
                </Text>
                <Pressable onPress={() => setOtherModalVisible(true)}>
                  <Text style={styles.otherSelectedChange}>Change</Text>
                </Pressable>
              </View>
            )}

            <Modal
              visible={otherModalVisible}
              animationType="slide"
              presentationStyle="pageSheet"
              onRequestClose={() => setOtherModalVisible(false)}
            >
              <SafeAreaView style={styles.modalSafe}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>What kind of job is it?</Text>
                  <Pressable onPress={() => setOtherModalVisible(false)}>
                    <Text style={styles.modalClose}>Done</Text>
                  </Pressable>
                </View>
                <View style={styles.modalBody}>
                  <TextInput
                    style={styles.input}
                    placeholder="Search the list…"
                    value={otherModalSearch}
                    onChangeText={setOtherModalSearch}
                  />
                  <FlatList
                    data={otherModalResults}
                    keyExtractor={(c) => c.name}
                    style={styles.modalList}
                    keyboardShouldPersistTaps="handled"
                    renderItem={({ item: c }) => {
                      const active = category === c.name && !customWasTyped;
                      return (
                        <Pressable style={styles.modalRow} onPress={() => selectCategory(c.name)}>
                          <Text style={styles.modalRowIcon}>{c.icon}</Text>
                          <Text style={styles.modalRowLabel}>{c.name}</Text>
                          {active && <Text style={styles.modalRowCheck}>✓</Text>}
                        </Pressable>
                      );
                    }}
                    ListEmptyComponent={<Text style={styles.searchEmpty}>No matches — type your own below.</Text>}
                  />
                  <View style={styles.modalCustomBlock}>
                    <Text style={styles.label}>Not listed? Type your own</Text>
                    <View style={styles.customRow}>
                      <TextInput
                        style={[styles.input, styles.customInput]}
                        placeholder="e.g. Pool Maintenance"
                        value={customText}
                        onChangeText={setCustomText}
                      />
                      <Pressable style={styles.customBtn} onPress={useCustomCategory} disabled={!customText.trim()}>
                        <Text style={styles.customBtnText}>Use</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              </SafeAreaView>
            </Modal>
          </View>
        )}

        {step === 1 && (
          <View>
            <Text style={styles.label}>Describe the job</Text>
            <TextInput
              style={styles.textarea}
              multiline
              numberOfLines={4}
              placeholder="e.g. Leaking pipe under the kitchen sink, needs fixing this week"
              value={description}
              onChangeText={setDescription}
            />
            {descriptionTooShort && (
              <Text style={styles.error}>
                ⚠️ Add a bit more detail — at least {MIN_DESCRIPTION_WORDS} words so tradies understand the job (you've written {descriptionWordCount}).
              </Text>
            )}

            <AddressAutocompleteField label="Job address" value={address} onChange={setAddress} />
            {!address && <Text style={styles.hint}>Select your full address from the suggestions to continue.</Text>}

            <Text style={styles.label}>Add photos (optional)</Text>
            <View style={styles.photoRow}>
              {photos.map((p) => (
                <View key={p.uri} style={styles.photoThumbWrap}>
                  <Image source={{ uri: p.uri }} style={styles.photoThumb} />
                  {p.uploading ? (
                    <View style={styles.photoOverlay}>
                      <ActivityIndicator size="small" color="#fff" />
                    </View>
                  ) : (
                    <Pressable style={styles.photoRemove} onPress={() => removePhoto(p.uri)}>
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
          </View>
        )}

        {step === 2 && (
          <View>
            <Text style={styles.label}>How urgent?</Text>
            <View style={styles.chipRow}>
              {URGENCY_OPTIONS.map((u) => (
                <Pressable key={u} style={[styles.chip, urgency === u && styles.chipActive]} onPress={() => setUrgency(u)}>
                  <Text style={[styles.chipText, urgency === u && styles.chipTextActive]}>{u}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.label, { marginTop: 28 }]}>Review your job</Text>
            <View style={styles.reviewCard}>
              <Text style={styles.reviewLabel}>Category</Text>
              <Text style={styles.reviewValue}>{category || '—'}</Text>
            </View>
            <View style={styles.reviewCard}>
              <Text style={styles.reviewLabel}>Description</Text>
              <Text style={styles.reviewValue}>{description || '—'}</Text>
            </View>
            <View style={styles.reviewCard}>
              <Text style={styles.reviewLabel}>Location</Text>
              <Text style={styles.reviewValue}>{address?.display || '—'}</Text>
            </View>
            {photos.length > 0 && (
              <View style={styles.reviewCard}>
                <Text style={styles.reviewLabel}>Photos</Text>
                <Text style={styles.reviewValue}>{photos.length} attached</Text>
              </View>
            )}

            {error && <Text style={styles.error}>⚠️ {error}</Text>}
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.footerRow}>
          {step > 0 && (
            <Pressable style={styles.backBtn} onPress={goBack}>
              <Text style={styles.backBtnText}>← Back</Text>
            </Pressable>
          )}
          {step < STEPS.length - 1 ? (
            <Pressable
              style={[styles.nextBtn, ((step === 0 && !step0Valid) || (step === 1 && !step1Valid)) && styles.nextBtnDisabled]}
              disabled={(step === 0 && !step0Valid) || (step === 1 && !step1Valid)}
              onPress={goNext}
            >
              <Text style={styles.nextBtnText}>Next →</Text>
            </Pressable>
          ) : (
            <Pressable
              style={[styles.nextBtn, (!canSubmit || mutation.isPending) && styles.nextBtnDisabled]}
              disabled={!canSubmit || mutation.isPending}
              onPress={() => mutation.mutate()}
            >
              {mutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.nextBtnText}>Publish Job</Text>}
            </Pressable>
          )}
        </View>
      </View>
    </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  stepperHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 10, backgroundColor: 'rgba(255,255,255,0.7)' },
  backArrow: { fontSize: 22, color: '#0F172A', fontWeight: '700' },
  stepperCount: { fontSize: 12, color: '#94A3B8', fontWeight: '600' },
  stepperLabel: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginTop: 2 },
  stepperDots: { flexDirection: 'row', gap: 6, paddingHorizontal: 20, marginTop: 12, marginBottom: 4 },
  stepDot: { flex: 1, height: 4, borderRadius: 2, backgroundColor: '#E2E8F0' },
  stepDotActive: { backgroundColor: '#16A34A' },
  scroll: { flex: 1 },
  container: { padding: 20, paddingBottom: 40, gap: 4 },
  label: { fontSize: 14, fontWeight: '700', marginTop: 20, marginBottom: 8, color: '#334155' },
  input: {
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
  },
  textarea: {
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, minHeight: 100, textAlignVertical: 'top',
  },
  searchWrap: { position: 'relative', zIndex: 10 },
  searchDropdown: {
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, marginTop: 6, overflow: 'hidden',
    backgroundColor: '#fff',
  },
  searchItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  searchIcon: { fontSize: 18 },
  searchLabel: { fontSize: 14, fontWeight: '600', color: '#1E293B' },
  searchSub: { fontSize: 12, color: '#94A3B8' },
  searchEmpty: { fontSize: 13, color: '#94A3B8', padding: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  tile: {
    width: '30%', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC',
  },
  tileActive: { borderColor: '#16A34A', backgroundColor: '#F0FDF4' },
  tileIcon: { fontSize: 24 },
  tileLabel: { fontSize: 12, fontWeight: '600', color: '#334155', textAlign: 'center' },
  tileLabelActive: { color: '#16A34A' },
  otherSelectedRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 10, paddingHorizontal: 2,
  },
  otherSelectedText: { fontSize: 13, color: '#64748B', flex: 1, marginRight: 8 },
  otherSelectedName: { fontWeight: '700', color: '#16A34A' },
  otherSelectedChange: { color: '#2563EB', fontWeight: '600', fontSize: 13 },
  modalSafe: { flex: 1, backgroundColor: '#fff' },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
  },
  modalTitle: { fontSize: 17, fontWeight: '700' },
  modalClose: { color: '#2563EB', fontWeight: '700', fontSize: 15 },
  modalBody: { flex: 1, padding: 20 },
  modalList: { flex: 1, marginTop: 12 },
  modalRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  modalRowIcon: { fontSize: 20, width: 24, textAlign: 'center' },
  modalRowLabel: { fontSize: 15, fontWeight: '600', color: '#1E293B', flex: 1 },
  modalRowCheck: { color: '#16A34A', fontWeight: '800', fontSize: 16 },
  modalCustomBlock: { borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingTop: 14, marginTop: 10 },
  customRow: { flexDirection: 'row', gap: 8 },
  customInput: { flex: 1 },
  customBtn: { backgroundColor: '#16A34A', borderRadius: 12, paddingHorizontal: 18, justifyContent: 'center' },
  customBtnText: { color: '#fff', fontWeight: '700' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20,
    borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC',
  },
  chipActive: { backgroundColor: '#16A34A', borderColor: '#16A34A' },
  chipText: { fontSize: 13, color: '#334155', fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoThumbWrap: { width: 80, height: 80, borderRadius: 12, overflow: 'hidden', position: 'relative' },
  photoThumb: { width: '100%', height: '100%' },
  photoOverlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  photoRemove: { position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  photoRemoveText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  photoAdd: {
    width: 80, height: 80, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC',
  },
  photoAddIcon: { fontSize: 20 },
  photoAddText: { fontSize: 11, color: '#64748B', marginTop: 2 },
  error: { color: '#DC2626', fontSize: 13, marginTop: 16 },
  hint: { color: '#475569', fontWeight: '500', fontSize: 12, marginTop: 6 },
  reviewCard: {
    backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 14, padding: 14, marginTop: 10,
    shadowColor: '#0F172A', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 1,
  },
  reviewLabel: { fontSize: 12, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', marginBottom: 4 },
  reviewValue: { fontSize: 14, color: '#0F172A', fontWeight: '600' },
  footer: { padding: 16, paddingBottom: 24, borderTopWidth: 1, borderTopColor: '#E2E8F0', backgroundColor: '#fff' },
  footerRow: { flexDirection: 'row', gap: 10 },
  backBtn: { paddingVertical: 16, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  backBtnText: { color: '#334155', fontWeight: '700', fontSize: 15 },
  nextBtn: { flex: 1, backgroundColor: '#16A34A', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  nextBtnDisabled: { opacity: 0.5 },
  nextBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
