import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, SafeAreaView, ScrollView,
  ActivityIndicator, Image, KeyboardAvoidingView, Platform,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import type { TradieStackParamList } from '../../navigation/types';
import { getApprovedTrades } from '../../api/trades';
import { getTradieByEmail, upsertTradie, Licence } from '../../api/tradies';
import { uploadPhoto, getSignedUrl } from '../../api/uploads';
import { ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import AddressAutocompleteField, { ConfirmedAddress } from '../../components/AddressAutocompleteField';
import LicenceDateField from '../../components/LicenceDateField';
import { NZ_REGIONS } from '../../data/nzRegions';
import ScreenBackground from '../../components/ScreenBackground';

type Props = NativeStackScreenProps<TradieStackParamList, 'EditProfile'>;

type UploadSlot = { uri: string; key?: string; uploading: boolean } | null;
const BUSINESS_TYPES = ['Sole Trader', 'Company', 'Partnership'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const TIME_OPTIONS = [
  '06:00 AM', '07:00 AM', '08:00 AM', '09:00 AM', '10:00 AM', '11:00 AM', '12:00 PM',
  '01:00 PM', '02:00 PM', '03:00 PM', '04:00 PM', '05:00 PM', '06:00 PM', '07:00 PM', '08:00 PM', '09:00 PM',
];

const STEP_IDS = ['trades', 'personal', 'business', 'licence', 'areas', 'availability', 'review'] as const;
type StepId = typeof STEP_IDS[number];
const STEP_LABELS: Record<StepId, string> = {
  trades: 'Trades',
  personal: 'Personal',
  business: 'Business',
  licence: 'Licence',
  areas: 'Areas',
  availability: 'Availability',
  review: 'Review & Save',
};

function isValidNZBN(value: string): boolean {
  const digits = (value || '').replace(/\D/g, '');
  if (digits.length !== 13) return false;
  const checkDigit = parseInt(digits[12], 10);
  let sum = 0;
  for (let i = 11; i >= 0; i--) {
    const weight = (11 - i) % 2 === 0 ? 3 : 1;
    sum += parseInt(digits[i], 10) * weight;
  }
  return (10 - (sum % 10)) % 10 === checkDigit;
}

function isPastDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d.getTime() < today.getTime();
}

// Finds this trade's already-saved licence entry, if any. Mobile's own
// onboarding wizard (TradieOnboardingScreen) always saves solo-trader
// licence labels as the bare trade name ("Plumbing"), but the web app labels
// even a solo trader's licence "OwnerFirstName — Trade" (see app.js's
// renderLicenceSections/licenceSectionHtml) — so a tradie who originally
// signed up on web has licences stored under a name-prefixed label. Exact
// match first (mobile's own convention), then fall back to "ends with ' —
// Trade'" the same way web's own renderLicenceSections() does when an exact
// label match misses — but only when exactly one saved entry matches that
// trade, since with several (e.g. a former team business) there's no way to
// know which one is "this" trade's licence without guessing.
function findExistingLicenceForTrade(trade: string, licences: Licence[]): Licence | undefined {
  const exact = licences.find((l) => l.label === trade);
  if (exact) return exact;
  const sameTrade = licences.filter((l) => l.label === trade || l.label.endsWith(` — ${trade}`));
  return sameTrade.length === 1 ? sameTrade[0] : undefined;
}

// Renders an already-uploaded licence document (an S3 key from a previous
// save) as a thumbnail — needs its own signed-URL query per key, so this has
// to be its own component rather than a hook called in a loop over however
// many trades happen to be selected.
function ExistingDocThumb({ docKey }: { docKey: string }) {
  const { data: url } = useQuery({
    queryKey: ['editProfileLicenceDocUrl', docKey],
    queryFn: () => getSignedUrl(docKey),
  });
  if (!url) return <ActivityIndicator size="small" style={{ marginTop: 10 }} />;
  return (
    <View style={styles.photoThumbWrap}>
      <Image source={{ uri: url }} style={styles.photoThumb} />
    </View>
  );
}

// Edits an EXISTING tradie's profile as a Next/Next/Next stepper, mirroring
// the web app's edit flow (index.html's 7-step wizard, reached from the
// tradie dashboard's Edit Profile link) instead of one long scrolling page.
// GET /tradies/:email DOES return licences/serviceAreas/teamMembers/services/
// customTrades/portfolioItems in full (they're Prisma composite types
// embedded in the document, not separate relation tables needing `include` —
// see the corrected kiwifix_tradie_relation_fields_not_returned memory).
//
// 2026-08-29: added a real Licence step. Previously this screen let a tradie
// freely add/remove trades on `selectedTrades` but never sent `licences` in
// the save payload — so TradiesService.upsert()'s hasLicenceChange always
// evaluated false (dto.licences === undefined short-circuits it), meaning an
// APPROVED tradie could swap Plumber -> Gasfitter and stay APPROVED, visible
// to job posters for a trade nobody at KiwiFix had ever reviewed a licence
// for. See buildLicencesPayload() below for exactly how a genuinely new
// trade now forces that same backend re-review path, with no backend change
// needed. Team roster and portfolio are still not editable here — same
// disclosed, deliberate limitation as before; those stay a web-app-only
// edit for now.
export default function EditProfileScreen({ navigation }: Props) {
  const { session, signIn } = useAuth();
  const email = session!.email;
  const queryClient = useQueryClient();

  const { data: tradie, isLoading: tradieLoading, isError: tradieIsError, error: tradieError, refetch: refetchTradie } = useQuery({
    queryKey: ['myTradieProfile', email],
    queryFn: () => getTradieByEmail(email),
  });
  const { data: approvedTrades, isLoading: tradesLoading } = useQuery({
    queryKey: ['approvedTrades'],
    queryFn: getApprovedTrades,
  });

  const [hydrated, setHydrated] = useState(false);
  const [step, setStep] = useState(0);
  const stepId = STEP_IDS[step];
  const [stepError, setStepError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [mobile, setMobile] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [businessType, setBusinessType] = useState('Sole Trader');
  const [nzbn, setNzbn] = useState('');
  const [bio, setBio] = useState('');
  const [selectedTrades, setSelectedTrades] = useState<string[]>([]);
  const [tradeQuery, setTradeQuery] = useState('');
  const [addressText, setAddressText] = useState('');
  const [photo, setPhoto] = useState<UploadSlot>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [driverLicencePhoto, setDriverLicencePhoto] = useState<UploadSlot>(null);
  const [insuranceCertPhoto, setInsuranceCertPhoto] = useState<UploadSlot>(null);
  const [selectedServiceAreas, setSelectedServiceAreas] = useState<{ region: string; district: string; area: string }[]>([]);
  const [areasTouched, setAreasTouched] = useState(false);
  const [addressEditing, setAddressEditing] = useState(false);
  const [activeRegion, setActiveRegion] = useState<string | null>(null);
  const [activeDistrict, setActiveDistrict] = useState<string | null>(null);
  const [activeDays, setActiveDays] = useState<string[]>([]);
  const [startTime, setStartTime] = useState('07:00 AM');
  const [endTime, setEndTime] = useState('06:00 PM');
  const [acceptsEmergency, setAcceptsEmergency] = useState(false);

  // --- Licence step state, keyed by trade name (see findExistingLicenceForTrade) ---
  const [originalTrades, setOriginalTrades] = useState<string[]>([]);
  const [originalLicences, setOriginalLicences] = useState<Licence[]>([]);
  const [licenceByKey, setLicenceByKey] = useState<Record<string, { number: string; expiry: string }>>({});
  const [licenceDocs, setLicenceDocs] = useState<Record<string, UploadSlot>>({});
  const [licenceErrors, setLicenceErrors] = useState<Record<string, string>>({});

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Prefill once, the moment the real profile loads — signed URLs for any
  // existing photos are resolved separately below.
  useEffect(() => {
    if (!tradie || hydrated) return;
    setFirstName(tradie.firstName || '');
    setLastName(tradie.lastName || '');
    setMobile(tradie.mobile || '');
    setBusinessName(tradie.businessName || '');
    setSelectedTrades(tradie.trades || []);
    setOriginalTrades(tradie.trades || []);
    setOriginalLicences(tradie.licences || []);
    setActiveDays(tradie.workingDays || []);
    setStartTime(tradie.startTime || '07:00 AM');
    setEndTime(tradie.endTime || '06:00 PM');
    setAcceptsEmergency(!!tradie.acceptsEmergency);
    setBio(tradie.bio || '');
    setBusinessType(tradie.businessType || 'Sole Trader');
    setNzbn(tradie.nzbn || '');
    setAddressText(tradie.address || '');
    setAddressEditing(!tradie.address);
    setSelectedServiceAreas((tradie.serviceAreas || []).map((a) => ({ region: a.region, district: a.district || '', area: a.area })));
    if (tradie.photoUrl) setPhoto({ uri: '', key: tradie.photoUrl, uploading: false });
    if (tradie.driverLicenceUrl) setDriverLicencePhoto({ uri: '', key: tradie.driverLicenceUrl, uploading: false });
    if (tradie.insuranceCertUrl) setInsuranceCertPhoto({ uri: '', key: tradie.insuranceCertUrl, uploading: false });

    // Hydrate one licence section per current trade from whatever's already
    // saved under it, so opening this screen never looks like an existing
    // licence went missing.
    const byKey: Record<string, { number: string; expiry: string }> = {};
    const docs: Record<string, UploadSlot> = {};
    (tradie.trades || []).forEach((trade) => {
      const existing = findExistingLicenceForTrade(trade, tradie.licences || []);
      if (existing) {
        byKey[trade] = { number: existing.number || '', expiry: existing.expiry || '' };
        if (existing.documentUrl) docs[trade] = { uri: '', key: existing.documentUrl, uploading: false };
      }
    });
    setLicenceByKey(byKey);
    setLicenceDocs(docs);

    setHydrated(true);
  }, [tradie, hydrated]);

  // Resolve any existing S3-key photos to viewable signed URLs, once, after
  // hydration — the prefill above only knows the opaque key.
  const { data: photoSignedUrl } = useQuery({
    queryKey: ['editProfilePhotoUrl', photo?.key],
    queryFn: () => getSignedUrl(photo!.key!),
    enabled: !!photo?.key && !photo.uri,
  });
  const { data: driverLicenceSignedUrl } = useQuery({
    queryKey: ['editProfileDriverLicenceUrl', driverLicencePhoto?.key],
    queryFn: () => getSignedUrl(driverLicencePhoto!.key!),
    enabled: !!driverLicencePhoto?.key && !driverLicencePhoto.uri,
  });
  const { data: insuranceSignedUrl } = useQuery({
    queryKey: ['editProfileInsuranceUrl', insuranceCertPhoto?.key],
    queryFn: () => getSignedUrl(insuranceCertPhoto!.key!),
    enabled: !!insuranceCertPhoto?.key && !insuranceCertPhoto.uri,
  });

  const featured = useMemo(() => (approvedTrades || []).filter((t) => t.featuredForTradies), [approvedTrades]);
  const searchResults = useMemo(() => {
    const q = tradeQuery.trim().toLowerCase();
    if (!q) return [];
    return (approvedTrades || [])
      .filter((t) => t.name.toLowerCase().includes(q) || t.keywords.some((k) => k.toLowerCase().includes(q)))
      .slice(0, 8);
  }, [approvedTrades, tradeQuery]);
  const visibleTrades = tradeQuery.trim() ? searchResults : featured;

  // Any trade selected now that wasn't on file when this screen opened —
  // these are exactly the ones buildLicencesPayload() below will force a
  // fresh (even if blank) licence entry for, and the ones the Licence step's
  // banner warns about.
  const newTrades = useMemo(() => selectedTrades.filter((t) => !originalTrades.includes(t)), [selectedTrades, originalTrades]);
  const droppedTrades = useMemo(() => originalTrades.filter((t) => !selectedTrades.includes(t)), [selectedTrades, originalTrades]);
  const tradesChanged = newTrades.length > 0 || droppedTrades.length > 0;
  const wasApproved = tradie?.approvalStatus === 'APPROVED';

  function toggleTrade(name: string) {
    setSelectedTrades((prev) => (prev.includes(name) ? prev.filter((t) => t !== name) : [...prev, name]));
  }
  function toggleDay(day: string) {
    setActiveDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  }
  function toggleArea(region: string, district: string, area: string) {
    setAreasTouched(true);
    setSelectedServiceAreas((prev) => {
      const exists = prev.some((a) => a.region === region && a.district === district && a.area === area);
      return exists
        ? prev.filter((a) => !(a.region === region && a.district === district && a.area === area))
        : [...prev, { region, district, area }];
    });
  }
  function isDistrictFullySelected(region: string, district: string, areas: string[]) {
    return areas.length > 0 && areas.every((area) => selectedServiceAreas.some((a) => a.region === region && a.district === district && a.area === area));
  }
  function toggleAllInDistrict(region: string, district: string, areas: string[]) {
    setAreasTouched(true);
    setSelectedServiceAreas((prev) => {
      const withoutDistrict = prev.filter((a) => !(a.region === region && a.district === district));
      if (isDistrictFullySelected(region, district, areas)) return withoutDistrict;
      return [...withoutDistrict, ...areas.map((area) => ({ region, district, area }))];
    });
  }

  async function pickAndUpload(
    onStart: (uri: string) => void,
    onDone: (key: string, uri: string) => void,
    onError: (msg: string) => void,
  ) {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      onError('Photo library access is needed.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8, preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    onStart(asset.uri);
    try {
      const key = await uploadPhoto(asset.uri, asset.fileName || undefined, asset.mimeType || undefined);
      onDone(key, asset.uri);
    } catch (err) {
      console.error('[pickAndUpload] photo upload failed:', err);
      onError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
          ? `Could not upload that photo: ${err.message}`
          : 'Could not upload that photo. Please try again.'
      );
    }
  }
  function pickProfilePhoto() {
    setPhotoError(null);
    pickAndUpload(
      (uri) => setPhoto({ uri, uploading: true }),
      (key, uri) => setPhoto({ uri, key, uploading: false }),
      (msg) => { setPhoto(null); setPhotoError(msg); },
    );
  }
  function pickDriverLicence() {
    pickAndUpload(
      (uri) => setDriverLicencePhoto({ uri, uploading: true }),
      (key, uri) => setDriverLicencePhoto({ uri, key, uploading: false }),
      () => setDriverLicencePhoto(null),
    );
  }
  function pickInsuranceCert() {
    pickAndUpload(
      (uri) => setInsuranceCertPhoto({ uri, uploading: true }),
      (key, uri) => setInsuranceCertPhoto({ uri, key, uploading: false }),
      () => setInsuranceCertPhoto(null),
    );
  }
  function pickLicenceDoc(trade: string) {
    setLicenceErrors((p) => ({ ...p, [trade]: '' }));
    pickAndUpload(
      (uri) => setLicenceDocs((p) => ({ ...p, [trade]: { uri, uploading: true } })),
      (key, uri) => setLicenceDocs((p) => ({ ...p, [trade]: { uri, key, uploading: false } })),
      (msg) => setLicenceErrors((p) => ({ ...p, [trade]: msg })),
    );
  }
  function licenceTierFor(trade: string) {
    return (approvedTrades || []).find((t) => t.name === trade)?.licenceTier || null;
  }

  // Same cap as web's formatMobile() (app.js: val.slice(0, 10)) and the
  // "+64" pill shown next to the field there — see TradieOnboardingScreen's
  // matching comment. +64 is decorative only; the stored value stays the
  // plain 0-prefixed local number (e.g. 0224220413).
  const mobileDigits = mobile.replace(/\D/g, '');
  const mobileError = mobile.trim().length > 0 && (mobileDigits.length < 8 || mobileDigits.length > 10) ? 'Enter a valid mobile number.' : null;
  const nzbnError = nzbn.trim().length > 0 && !isValidNZBN(nzbn) ? 'Enter a valid 13-digit NZBN.' : null;
  const hasValidNzbn = nzbn.trim().length > 0 && !nzbnError;
  // Same rule as TradieOnboardingScreen's business step: companies verify
  // via NZBN only, sole traders/partnerships need an NZBN OR a driver's
  // licence upload (whichever they have — most sole traders won't have an
  // NZBN, so the licence is the fallback proof of identity).
  const isCompany = businessType === 'Company';
  const needsDriverLicence = !isCompany && !hasValidNzbn;
  const businessVerificationError = isCompany
    ? (!hasValidNzbn ? 'NZBN is required for a company.' : null)
    : (needsDriverLicence && !driverLicencePhoto?.key ? "Provide an NZBN or upload a driver's licence." : null);

  function validateCurrentStep(): string | null {
    if (stepId === 'trades') {
      if (selectedTrades.length === 0) return 'Select at least one trade to continue.';
      return null;
    }
    if (stepId === 'personal') {
      if (!firstName.trim()) return 'First name is required.';
      if (mobileError) return mobileError;
      return null;
    }
    if (stepId === 'business') {
      if (nzbnError) return nzbnError;
      if (businessVerificationError) return businessVerificationError;
      return null;
    }
    if (stepId === 'licence') {
      for (const trade of selectedTrades) {
        const l = licenceByKey[trade];
        const doc = licenceDocs[trade];
        const anyFilled = !!(l?.number || l?.expiry || doc?.key);
        if (!anyFilled) continue;
        if (!l?.number || !l?.expiry || !doc?.key) {
          return `${trade}: licence number, expiry and document are all required once one is filled in (or leave all blank).`;
        }
        if (isPastDate(l.expiry)) return `${trade}: licence expiry can't be in the past.`;
      }
      return null;
    }
    if (stepId === 'availability') {
      if (activeDays.length === 0) return 'Select at least one working day.';
      return null;
    }
    return null;
  }

  function goNext() {
    const err = validateCurrentStep();
    if (err) {
      setStepError(err);
      return;
    }
    setStepError(null);
    setStep((s) => Math.min(s + 1, STEP_IDS.length - 1));
  }
  function goBack() {
    setStepError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  // Builds the licences array this save actually sends. Every existing
  // licence label NOT tied to one of the currently-selected trades (a team
  // member's licence, an ambiguous multi-entry trade, or a trade just
  // dropped this session) is carried forward untouched — see
  // kiwifix_never_delete_on_edit. A trade that was already on this tradie's
  // profile before this screen opened, with no licence ever recorded for it,
  // is also left alone: re-sending a blank entry for it on every unrelated
  // save (e.g. just changing availability) would otherwise falsely look like
  // "a newly-added licensed trade" to the backend every single time.
  //
  // A trade that IS new this session always gets an entry, even completely
  // blank — that's deliberate: TradiesService.upsert()'s hasLicenceChange
  // treats any label with no prior match as "a newly-added licensed trade"
  // (`!prev` in its lookup) regardless of whether it has actual licence
  // data, which is exactly what flips an APPROVED tradie back to PENDING.
  // That's the same effective gate the web app enforces by always routing a
  // trade change through its Licence step before Save & Continue — this
  // reproduces it without needing a backend change for the reported bug
  // (swapping/adding a trade silently stayed APPROVED). The one case this
  // can't cover is dropping a trade with no replacement and no other trade
  // change — see the hand-off note for the backend-side fix that would.
  function buildLicencesPayload(): Licence[] {
    const existing = originalLicences;
    const labelForTrade: Record<string, string | undefined> = {};
    selectedTrades.forEach((trade) => {
      labelForTrade[trade] = findExistingLicenceForTrade(trade, existing)?.label;
    });
    const handledLabels = new Set(Object.values(labelForTrade).filter((l): l is string => !!l));
    const untouched = existing.filter((l) => !handledLabels.has(l.label));

    const edited: Licence[] = selectedTrades
      .map((trade): Licence | null => {
        const existingLabel = labelForTrade[trade];
        const isNewTrade = !originalTrades.includes(trade);
        if (!existingLabel && !isNewTrade) return null; // long-standing unlicensed trade — leave alone

        const label = existingLabel || trade;
        const l = licenceByKey[trade];
        const doc = licenceDocs[trade];
        const existingEntry = existingLabel ? existing.find((e) => e.label === existingLabel) : undefined;
        const number = l?.number || existingEntry?.number || '';
        const expiry = l?.expiry || existingEntry?.expiry || '';
        const documentUrl = doc?.key || existingEntry?.documentUrl || '';

        if (isNewTrade) {
          return { label, number: number || undefined, expiry: expiry || undefined, documentUrl: documentUrl || undefined };
        }
        if (!number && !expiry && !documentUrl) return null;
        return { label, number: number || undefined, expiry: expiry || undefined, documentUrl: documentUrl || undefined };
      })
      .filter((l): l is Licence => l !== null);

    return [...untouched, ...edited];
  }

  const canSubmit =
    hydrated && firstName.trim().length > 0 && selectedTrades.length > 0 && !mobileError && !nzbnError
    && !businessVerificationError && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const region = areasTouched ? selectedServiceAreas[0]?.region : tradie?.region || undefined;
      const areas = areasTouched ? [...new Set(selectedServiceAreas.map((a) => a.area))] : tradie?.areas;

      const result = await upsertTradie({
        email,
        firstName: firstName.trim(),
        lastName: lastName.trim() || undefined,
        mobile: mobile.trim() || undefined,
        businessName: businessName.trim() || undefined,
        businessType,
        photoUrl: photo?.key,
        driverLicenceUrl: driverLicencePhoto?.key,
        insuranceCertUrl: insuranceCertPhoto?.key,
        address: addressText || undefined,
        nzbn: nzbn.trim() || undefined,
        trades: selectedTrades,
        region,
        areas,
        serviceAreas: areasTouched ? selectedServiceAreas : undefined,
        licences: buildLicencesPayload(),
        workingDays: activeDays,
        startTime,
        endTime,
        acceptsEmergency,
        bio: bio.trim() || undefined,
        // Still deliberately omitted: services, customTrades, teamMembers,
        // hasTeam, portfolioItems — team roster editing stays a web-app-only
        // edit for now, same disclosed limitation as before.
      });
      await signIn({ role: 'tradie', token: result.accessToken, email: result.email });
      queryClient.invalidateQueries({ queryKey: ['myTradieProfile', email] });
      // Land on Home (the dashboard, where the profile-strength/approval
      // banner and any new-review notice actually live) rather than back on
      // the Profile tab this screen was opened from — per explicit feedback,
      // a save should surface the result somewhere the tradie is more likely
      // to look next, not just return them to the menu they came from.
      // popToTop() first so the Profile tab's own stack doesn't stay parked
      // on this now-stale EditProfile screen next time it's revisited.
      navigation.popToTop();
      navigation.getParent()?.navigate('HomeTab');
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Could not save your changes. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (tradieIsError) {
    return (
      <ScreenBackground>
      <SafeAreaView style={styles.safe}>
        <View style={styles.errorState}>
          <Text style={styles.errorStateText}>
            ⚠️ Couldn't load your profile.{'\n'}
            {tradieError instanceof ApiError ? tradieError.message : 'Check your connection and try again.'}
          </Text>
          <Pressable style={styles.retryBtn} onPress={() => refetchTradie()}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
      </ScreenBackground>
    );
  }
  if (tradieLoading || !hydrated) {
    return (
      <ScreenBackground>
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator style={{ marginTop: 60 }} />
      </SafeAreaView>
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
    <SafeAreaView style={styles.safe}>
      <View style={styles.stepperHeader}>
        <Text style={styles.stepperCount}>Step {step + 1} of {STEP_IDS.length}</Text>
        <Text style={styles.stepperLabel}>{STEP_LABELS[stepId]}</Text>
        <View style={styles.stepperDots}>
          {STEP_IDS.map((id, i) => (
            <View key={id} style={[styles.stepDot, i <= step && styles.stepDotActive]} />
          ))}
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView style={styles.scroll} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          {stepId === 'trades' && (
            <View>
              <Text style={styles.title}>Your trade(s)</Text>
              <Text style={styles.subtitle}>
                {wasApproved
                  ? 'Adding a trade you\'re not already approved for sends your profile back under review — see the Licence step next.'
                  : 'Select every trade you want to be matched on.'}
              </Text>

              <View style={styles.inputIconWrap}>
                <Text style={styles.inputIcon}>🔍</Text>
                <TextInput style={[styles.input, styles.inputWithIcon]} placeholder="Search trades…" value={tradeQuery} onChangeText={setTradeQuery} />
              </View>
              {selectedTrades.length > 0 && (
                <View style={styles.selectedRow}>
                  {selectedTrades.map((name) => (
                    <Pressable key={name} style={styles.selectedChip} onPress={() => toggleTrade(name)}>
                      <Text style={styles.selectedChipText}>{name} ✕</Text>
                    </Pressable>
                  ))}
                </View>
              )}
              {tradesLoading ? (
                <ActivityIndicator style={{ marginTop: 12 }} />
              ) : (
                <View style={styles.tradeGrid}>
                  {visibleTrades.map((t) => {
                    const active = selectedTrades.includes(t.name);
                    return (
                      <Pressable key={t.name} style={[styles.tradeChip, active && styles.chipActive]} onPress={() => toggleTrade(t.name)}>
                        <Text style={styles.tradeChipIcon}>{t.icon}</Text>
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{t.name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          {stepId === 'personal' && (
            <View>
              <Text style={styles.title}>Your details</Text>

              <Pressable style={styles.avatarPicker} onPress={pickProfilePhoto}>
                {photo?.uri || photoSignedUrl ? (
                  <View style={styles.avatarThumbWrap}>
                    <Image source={{ uri: photo?.uri || photoSignedUrl }} style={styles.avatarThumb} />
                    {photo?.uploading && <View style={styles.photoOverlay}><ActivityIndicator color="#fff" /></View>}
                  </View>
                ) : (
                  <Text style={styles.avatarPickerText}>📷{'\n'}Add photo</Text>
                )}
              </Pressable>
              {photoError && <Text style={styles.error}>⚠️ {photoError}</Text>}

              <View style={styles.row}>
                <TextInput style={[styles.input, styles.half]} placeholder="First name" value={firstName} onChangeText={setFirstName} />
                <TextInput style={[styles.input, styles.half]} placeholder="Last name" value={lastName} onChangeText={setLastName} />
              </View>
              <View style={styles.inputIconWrap}>
                <Text style={styles.phonePrefix}>+64</Text>
                <TextInput
                  style={[styles.input, styles.inputWithPrefix]}
                  placeholder="021 234 5678"
                  keyboardType="phone-pad"
                  maxLength={10}
                  value={mobile}
                  onChangeText={(t) => setMobile(t.replace(/\D/g, '').slice(0, 10))}
                />
              </View>
              {mobileError && <Text style={styles.error}>⚠️ {mobileError}</Text>}

              {!addressEditing && addressText ? (
                <View style={styles.addressConfirmedWrap}>
                  <View style={styles.confirmedTop}>
                    <Text style={styles.label}>Home address</Text>
                    <Pressable onPress={() => setAddressEditing(true)}>
                      <Text style={styles.changeBtn}>Change</Text>
                    </Pressable>
                  </View>
                  <View style={styles.addressConfirmedCard}>
                    <Text style={styles.addressConfirmedText}>{addressText}</Text>
                  </View>
                </View>
              ) : (
                <AddressAutocompleteField
                  label="Home address"
                  value={null}
                  onChange={(v: ConfirmedAddress | null) => {
                    if (v?.display) {
                      setAddressText(v.display);
                      setAddressEditing(false);
                    }
                  }}
                />
              )}

              <Text style={styles.label}>About you (optional)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="A short blurb job posters will see on your profile"
                value={bio}
                onChangeText={setBio}
                multiline
              />
            </View>
          )}

          {stepId === 'business' && (
            <View>
              <Text style={styles.title}>Your business</Text>
              <Text style={styles.label}>Business name</Text>
              <TextInput style={styles.input} placeholder="Business name" value={businessName} onChangeText={setBusinessName} />
              <View style={styles.selectedRow}>
                {BUSINESS_TYPES.map((t) => (
                  <Pressable key={t} style={[styles.segmentChip, businessType === t && styles.chipActive]} onPress={() => setBusinessType(t)}>
                    <Text style={[styles.chipText, businessType === t && styles.chipTextActive]}>{t}</Text>
                  </Pressable>
                ))}
              </View>

              {/* Which of NZBN vs driver's licence is required depends on
                  business type — mirrors TradieOnboardingScreen's business
                  step. Companies verify via NZBN only; sole traders/
                  partnerships need one or the other. */}
              <View style={styles.infoBanner}>
                <Text style={styles.infoBannerText}>
                  🪪 To verify your business we need either an NZBN or a driver's licence number.
                  {isCompany ? ' Companies must provide an NZBN.' : " Sole traders/partnerships need one or the other — an NZBN if you have one, otherwise a driver's licence."}
                </Text>
              </View>

              <TextInput
                style={styles.input}
                placeholder={isCompany ? 'NZBN' : "NZBN (optional if you upload a driver's licence)"}
                keyboardType="number-pad"
                maxLength={13}
                value={nzbn}
                onChangeText={(t) => setNzbn(t.replace(/\D/g, ''))}
              />
              {nzbnError && <Text style={styles.error}>⚠️ {nzbnError}</Text>}

              {!isCompany && (
                <View>
                  <Pressable style={styles.photoPickerSmall} onPress={pickDriverLicence}>
                    {driverLicencePhoto?.uri || driverLicenceSignedUrl ? (
                      <View style={styles.photoThumbWrap}>
                        <Image source={{ uri: driverLicencePhoto?.uri || driverLicenceSignedUrl }} style={styles.photoThumb} />
                        {driverLicencePhoto?.uploading && <View style={styles.photoOverlay}><ActivityIndicator color="#fff" /></View>}
                      </View>
                    ) : (
                      <Text style={styles.photoPickerText}>
                        🪪 Driver's licence{hasValidNzbn ? ' (optional — NZBN provided)' : ' (required if no NZBN)'}
                      </Text>
                    )}
                  </Pressable>
                </View>
              )}

              <Text style={styles.label}>Public liability insurance (optional)</Text>
              <Pressable style={styles.photoPickerSmall} onPress={pickInsuranceCert}>
                {insuranceCertPhoto?.uri || insuranceSignedUrl ? (
                  <View style={styles.photoThumbWrap}>
                    <Image source={{ uri: insuranceCertPhoto?.uri || insuranceSignedUrl }} style={styles.photoThumb} />
                    {insuranceCertPhoto?.uploading && <View style={styles.photoOverlay}><ActivityIndicator color="#fff" /></View>}
                  </View>
                ) : (
                  <Text style={styles.photoPickerText}>🛡️ Upload insurance certificate</Text>
                )}
              </Pressable>

              <Text style={styles.hint}>
                Team roster (adding/removing staff) still needs the web app for now — everything else here is safe to change.
              </Text>
            </View>
          )}

          {stepId === 'licence' && (
            <View>
              <Text style={styles.title}>Licences & certification</Text>
              <Text style={styles.subtitle}>
                Optional overall — skip if you don't have these yet. But if you start filling one trade in, its number, expiry
                and document all need to be added.
              </Text>
              {newTrades.length > 0 && (
                <Text style={styles.hint}>
                  {newTrades.join(', ')} {newTrades.length > 1 ? "are new trades" : "is a new trade"} on your profile — KiwiFix
                  will need to review your account again before job posters see you listed for {newTrades.length > 1 ? 'them' : 'it'},
                  whether or not you add a licence now.
                </Text>
              )}

              {selectedTrades.map((trade) => {
                const tier = licenceTierFor(trade);
                const l = licenceByKey[trade] || { number: '', expiry: '' };
                const doc = licenceDocs[trade];
                return (
                  <View key={trade} style={styles.serviceBlock}>
                    <Text style={styles.serviceBlockTitle}>
                      {trade}{tier && tier !== 'none' ? '  ⚠️ Licence recommended' : ''}
                    </Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Licence number"
                      value={l.number}
                      onChangeText={(t) => setLicenceByKey((p) => ({ ...p, [trade]: { ...p[trade], number: t, expiry: p[trade]?.expiry || '' } }))}
                    />
                    <LicenceDateField
                      value={l.expiry || null}
                      onChange={(iso) => setLicenceByKey((p) => ({ ...p, [trade]: { ...p[trade], expiry: iso, number: p[trade]?.number || '' } }))}
                    />
                    <Pressable style={styles.photoPickerSmall} onPress={() => pickLicenceDoc(trade)}>
                      {doc?.uri ? (
                        <View style={styles.photoThumbWrap}>
                          <Image source={{ uri: doc.uri }} style={styles.photoThumb} />
                          {doc.uploading && <View style={styles.photoOverlay}><ActivityIndicator color="#fff" /></View>}
                        </View>
                      ) : doc?.key ? (
                        <ExistingDocThumb docKey={doc.key} />
                      ) : (
                        <Text style={styles.photoPickerText}>📄 Upload licence document</Text>
                      )}
                    </Pressable>
                    {!!licenceErrors[trade] && <Text style={styles.error}>⚠️ {licenceErrors[trade]}</Text>}
                  </View>
                );
              })}
            </View>
          )}

          {stepId === 'areas' && (
            <View>
              <Text style={styles.title}>Where do you work?</Text>
              <Text style={styles.hint}>Tap an area to add or remove it — you can pick suburbs across as many regions as you actually cover.</Text>

              <View style={styles.tradeGrid}>
                {Object.keys(NZ_REGIONS).map((region) => (
                  <Pressable
                    key={region}
                    style={[styles.tradeChip, activeRegion === region && styles.chipActive]}
                    onPress={() => { setActiveRegion(region); setActiveDistrict(null); }}
                  >
                    <Text style={[styles.chipText, activeRegion === region && styles.chipTextActive]}>{region}</Text>
                  </Pressable>
                ))}
              </View>

              {selectedServiceAreas.length > 0 && (
                <View style={styles.selectedRow}>
                  {selectedServiceAreas.map((a, i) => (
                    <Pressable key={i} style={styles.selectedChip} onPress={() => toggleArea(a.region, a.district, a.area)}>
                      <Text style={styles.selectedChipText}>{a.region} · {a.area} ✕</Text>
                    </Pressable>
                  ))}
                </View>
              )}

              {activeRegion && (
                <View style={styles.tradeGrid}>
                  {NZ_REGIONS[activeRegion].map((d) => (
                    <Pressable
                      key={d.district}
                      style={[styles.tradeChip, activeDistrict === d.district && styles.chipActive]}
                      onPress={() => setActiveDistrict(d.district)}
                    >
                      <Text style={[styles.chipText, activeDistrict === d.district && styles.chipTextActive]}>{d.district}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
              {activeRegion && activeDistrict && (
                <View>
                  <View style={styles.selectAllRow}>
                    <Text style={styles.hint}>{activeDistrict} — suburbs</Text>
                    <Pressable
                      onPress={() => toggleAllInDistrict(activeRegion, activeDistrict, NZ_REGIONS[activeRegion].find((d) => d.district === activeDistrict)?.areas || [])}
                    >
                      <Text style={styles.selectAllLink}>
                        {isDistrictFullySelected(activeRegion, activeDistrict, NZ_REGIONS[activeRegion].find((d) => d.district === activeDistrict)?.areas || [])
                          ? 'Clear all'
                          : 'Select all'}
                      </Text>
                    </Pressable>
                  </View>
                  <View style={styles.tradeGrid}>
                    {(NZ_REGIONS[activeRegion].find((d) => d.district === activeDistrict)?.areas || []).map((area) => {
                      const active = selectedServiceAreas.some((a) => a.region === activeRegion && a.district === activeDistrict && a.area === area);
                      return (
                        <Pressable key={area} style={[styles.tradeChip, active && styles.chipActive]} onPress={() => toggleArea(activeRegion, activeDistrict, area)}>
                          <Text style={[styles.chipText, active && styles.chipTextActive]}>{area}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}
            </View>
          )}

          {stepId === 'availability' && (
            <View>
              <Text style={styles.title}>Availability</Text>

              <Text style={styles.label}>Working days</Text>
              <View style={styles.selectedRow}>
                {DAYS.map((d) => {
                  const active = activeDays.includes(d);
                  return (
                    <Pressable key={d} style={[styles.segmentChip, active && styles.chipActive]} onPress={() => toggleDay(d)}>
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{d}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.label}>Start time</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {TIME_OPTIONS.map((t) => (
                  <Pressable key={t} style={[styles.segmentChip, startTime === t && styles.chipActive]} onPress={() => setStartTime(t)}>
                    <Text style={[styles.chipText, startTime === t && styles.chipTextActive]}>{t}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Text style={styles.label}>End time</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {TIME_OPTIONS.map((t) => (
                  <Pressable key={t} style={[styles.segmentChip, endTime === t && styles.chipActive]} onPress={() => setEndTime(t)}>
                    <Text style={[styles.chipText, endTime === t && styles.chipTextActive]}>{t}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Text style={styles.label}>Accept emergency call-outs?</Text>
              <View style={styles.selectedRow}>
                <Pressable style={[styles.segmentChip, acceptsEmergency && styles.chipActive]} onPress={() => setAcceptsEmergency(true)}>
                  <Text style={[styles.chipText, acceptsEmergency && styles.chipTextActive]}>Yes</Text>
                </Pressable>
                <Pressable style={[styles.segmentChip, !acceptsEmergency && styles.chipActive]} onPress={() => setAcceptsEmergency(false)}>
                  <Text style={[styles.chipText, !acceptsEmergency && styles.chipTextActive]}>No</Text>
                </Pressable>
              </View>
            </View>
          )}

          {stepId === 'review' && (
            <View>
              <Text style={styles.title}>Review & save</Text>
              {wasApproved && tradesChanged ? (
                <Text style={styles.reviewNotice}>
                  🕓 Your trades changed, so saving sends your profile back under review — job posters won't see your listing
                  again until KiwiFix confirms the change.
                </Text>
              ) : (
                <Text style={styles.subtitle}>Everything below gets saved to your profile.</Text>
              )}

              <View style={styles.reviewCard}>
                <Text style={styles.reviewLabel}>Trades</Text>
                <Text style={styles.reviewValue}>{selectedTrades.join(', ') || '—'}</Text>
              </View>
              <View style={styles.reviewCard}>
                <Text style={styles.reviewLabel}>Name</Text>
                <Text style={styles.reviewValue}>{[firstName, lastName].filter(Boolean).join(' ') || '—'}</Text>
                <Text style={styles.reviewValue}>{mobile || '—'}</Text>
              </View>
              <View style={styles.reviewCard}>
                <Text style={styles.reviewLabel}>Business</Text>
                <Text style={styles.reviewValue}>{businessName || '—'} ({businessType})</Text>
              </View>
              <View style={styles.reviewCard}>
                <Text style={styles.reviewLabel}>Licences</Text>
                <Text style={styles.reviewValue}>
                  {selectedTrades.filter((t) => licenceByKey[t]?.number).length} of {selectedTrades.length} trade(s) with licence info added
                </Text>
              </View>
              <View style={styles.reviewCard}>
                <Text style={styles.reviewLabel}>Service areas</Text>
                <Text style={styles.reviewValue}>{selectedServiceAreas.length ? selectedServiceAreas.map((a) => a.area).join(', ') : 'None selected.'}</Text>
              </View>
              <View style={styles.reviewCard}>
                <Text style={styles.reviewLabel}>Availability</Text>
                <Text style={styles.reviewValue}>{activeDays.join(', ') || '—'} · {startTime} – {endTime}</Text>
              </View>

              {submitError && <Text style={styles.error}>⚠️ {submitError}</Text>}
            </View>
          )}

          {stepError && <Text style={styles.error}>⚠️ {stepError}</Text>}
        </ScrollView>

        <View style={styles.footer}>
          <View style={styles.footerRow}>
            {step > 0 && (
              <Pressable style={styles.backBtn} onPress={goBack}>
                <Text style={styles.backBtnText}>← Back</Text>
              </Pressable>
            )}
            {stepId !== 'review' ? (
              <Pressable style={styles.button} onPress={goNext}>
                <Text style={styles.buttonText}>Continue →</Text>
              </Pressable>
            ) : (
              <Pressable style={[styles.button, !canSubmit && styles.buttonDisabled]} onPress={handleSubmit} disabled={!canSubmit}>
                {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{wasApproved && tradesChanged ? 'Submit for review' : 'Save changes'}</Text>}
              </Pressable>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  stepperHeader: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 10, backgroundColor: 'rgba(255,255,255,0.97)', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  stepperCount: { fontSize: 12, color: '#475569', fontWeight: '600' },
  stepperLabel: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginTop: 2 },
  stepperDots: { flexDirection: 'row', gap: 6, marginTop: 8 },
  stepDot: { flex: 1, height: 4, borderRadius: 2, backgroundColor: '#E2E8F0' },
  stepDotActive: { backgroundColor: '#16A34A' },
  scroll: { flex: 1 },
  container: { padding: 24, paddingBottom: 40, gap: 10 },
  footer: { padding: 16, paddingBottom: 24, borderTopWidth: 1, borderTopColor: '#E2E8F0', backgroundColor: '#fff' },
  footerRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  errorState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorStateText: { fontSize: 15, color: '#475569', textAlign: 'center', lineHeight: 22, marginBottom: 16 },
  retryBtn: { backgroundColor: '#16A34A', borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12 },
  retryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  title: { fontSize: 22, fontWeight: '800' },
  subtitle: { fontSize: 14, color: '#475569', fontWeight: '500', marginBottom: 8 },
  reviewNotice: {
    fontSize: 13, color: '#92400E', backgroundColor: 'rgba(255,251,235,0.95)', borderWidth: 1, borderColor: '#FDE68A',
    borderRadius: 10, padding: 10, lineHeight: 18, marginBottom: 10,
  },
  row: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  input: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.95)', paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  inputIconWrap: { position: 'relative', justifyContent: 'center' },
  inputIcon: { position: 'absolute', left: 14, fontSize: 15, zIndex: 1 },
  inputWithIcon: { paddingLeft: 38 },
  // Fixed "+64" country-code label for the mobile field — see matching
  // comment in TradieOnboardingScreen.tsx.
  phonePrefix: { position: 'absolute', left: 14, fontSize: 15, fontWeight: '700', color: '#475569', zIndex: 1 },
  inputWithPrefix: { paddingLeft: 48 },
  label: { fontSize: 14, fontWeight: '700', color: '#334155', marginTop: 14, marginBottom: 2 },
  hint: { fontSize: 12, color: '#475569', fontWeight: '500', marginBottom: 6, lineHeight: 17 },
  selectAllRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  selectAllLink: { color: '#2563EB', fontWeight: '700', fontSize: 13 },
  addressConfirmedWrap: { marginBottom: 4 },
  confirmedTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  changeBtn: { color: '#2563EB', fontWeight: '600', fontSize: 13 },
  addressConfirmedCard: {
    borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  addressConfirmedText: { fontSize: 15, fontWeight: '600', color: '#1E293B' },
  error: { color: '#DC2626', fontSize: 13 },
  photoPicker: {
    borderWidth: 1, borderColor: '#E2E8F0', borderStyle: 'dashed', backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 12,
    paddingVertical: 16, alignItems: 'center', justifyContent: 'center', marginTop: 4,
  },
  // Dedicated compact circular avatar picker for the profile photo, so the
  // tap target is exactly the size of the photo itself instead of the
  // profile pic sitting tiny in the middle of a huge full-width dashed
  // rectangle (the generic photoPicker card, sized for licence/driver's-
  // licence documents which are meant to look like a wide upload box).
  avatarPicker: {
    width: 96, height: 96, borderRadius: 48, alignSelf: 'center', overflow: 'hidden',
    borderWidth: 1, borderColor: '#E2E8F0', borderStyle: 'dashed', backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center', justifyContent: 'center', marginTop: 4,
  },
  avatarPickerText: { color: '#64748B', fontSize: 11, textAlign: 'center', lineHeight: 15 },
  avatarThumbWrap: { width: 96, height: 96, borderRadius: 48, overflow: 'hidden' },
  avatarThumb: { width: '100%', height: '100%' },
  photoPickerSmall: {
    borderWidth: 1, borderColor: '#E2E8F0', borderStyle: 'dashed', backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', justifyContent: 'center', marginTop: 10,
  },
  photoPickerText: { color: '#64748B', fontSize: 14 },
  // NZBN-or-driver's-licence explainer banner on the business step — see
  // matching style/comment in TradieOnboardingScreen.tsx.
  infoBanner: {
    backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', borderRadius: 12,
    padding: 12, marginTop: 12, marginBottom: 4,
  },
  infoBannerText: { color: '#92400E', fontSize: 13, lineHeight: 18, fontWeight: '600' },
  photoThumbWrap: { width: 64, height: 64, borderRadius: 12, overflow: 'hidden' },
  photoThumb: { width: '100%', height: '100%' },
  photoOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center',
  },
  selectedRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  selectedChip: { backgroundColor: '#DCFCE7', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  selectedChipText: { color: '#166534', fontWeight: '600', fontSize: 13 },
  tradeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  tradeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8,
  },
  tradeChipIcon: { fontSize: 16 },
  segmentChip: {
    borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8,
  },
  chipActive: { backgroundColor: '#16A34A', borderColor: '#16A34A' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#334155' },
  chipTextActive: { color: '#fff' },
  serviceBlock: {
    marginTop: 16, backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 14, padding: 14,
    shadowColor: '#0F172A', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  serviceBlockTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A', marginBottom: 8 },
  reviewCard: { borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 12, padding: 14, marginTop: 10 },
  reviewLabel: { fontSize: 12, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', marginBottom: 4 },
  reviewValue: { fontSize: 15, color: '#0F172A', fontWeight: '600' },
  button: { flex: 1, backgroundColor: '#16A34A', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  backBtn: { paddingVertical: 16, paddingHorizontal: 8 },
  backBtnText: { color: '#334155', fontWeight: '700', fontSize: 15 },
});
