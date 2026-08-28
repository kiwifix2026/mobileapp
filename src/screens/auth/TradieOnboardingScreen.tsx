import React, { useMemo, useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, SafeAreaView, ScrollView,
  ActivityIndicator, Image, KeyboardAvoidingView, Platform,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import type { AuthStackParamList } from '../../navigation/types';
import { getApprovedTrades, getAllTradeServices } from '../../api/trades';
import { upsertTradie, Licence, TeamMember, TradieService } from '../../api/tradies';
import { uploadPhoto } from '../../api/uploads';
import { ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import AddressAutocompleteField, { ConfirmedAddress } from '../../components/AddressAutocompleteField';
import LicenceDateField from '../../components/LicenceDateField';
import { NZ_REGIONS } from '../../data/nzRegions';

type Props = NativeStackScreenProps<AuthStackParamList, 'TradieOnboarding'>;

// Full 7-step wizard, ported step-for-step from the web app's onboarding
// flow (index.html #tradie-services/-personal/-business/-licence/-areas/
// -availability + the Review & Submit page, validated against app.js's
// validateStep()) — this replaces an earlier lean single-screen version
// that only collected a fraction of the fields. Known, deliberate trims
// vs the web app (disclosed, not silent):
//  - Years of experience / website / GST toggle on the Business step are
//    NOT collected — they're cosmetic-only on the web too, never in
//    UpsertTradieDto, never persisted.
//  - Licence documents/driver's licence/insurance cert use the phone's
//    photo library (expo-image-picker) — web also accepts PDF uploads via
//    a plain file input; mobile would need expo-document-picker (not
//    currently a dependency) to match that exactly.
//  - Web's "jump back into one step from Review, then return to Review"
//    shortcut (editingFromReview) isn't implemented — Back/Continue always
//    move one step at a time.
//  - Portfolio is a non-numbered "bonus step" on web (optional, outside
//    the 7-step stepper) — omitted here for the same reason web treats it
//    as skippable/lower-priority.
//
// 2026-08-25: added web's team-licence attribution, ported from app.js's
// renderLicenceSections()/useTeamLicensing — when businessType !== 'Sole
// Trader' and hasTeam is true with at least one team member, the Licence
// step now renders one section per (team member, trade) pair labelled
// "FirstName LastName — Trade" (Licence.label is a free string on the
// backend, so this needs no schema change — see licenceSections below).
// Also gated the "Do you have a team?" question to only show for Company/
// Partnership, matching web's onBusinessTypeChange() hiding it (and
// resetting hasTeam) for Sole Trader.

type UploadSlot = { uri: string; key?: string; uploading: boolean } | null;

const STEP_IDS = ['services', 'personal', 'business', 'licence', 'areas', 'availability', 'review'] as const;
type StepId = typeof STEP_IDS[number];
const STEP_LABELS: Record<StepId, string> = {
  services: 'Services',
  personal: 'Personal',
  business: 'Business',
  licence: 'Licence',
  areas: 'Areas',
  availability: 'Availability',
  review: 'Review & Submit',
};

const BUSINESS_TYPES = ['Sole Trader', 'Company', 'Partnership'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DEFAULT_ACTIVE_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const TIME_OPTIONS = [
  '06:00 AM', '07:00 AM', '08:00 AM', '09:00 AM', '10:00 AM', '11:00 AM', '12:00 PM',
  '01:00 PM', '02:00 PM', '03:00 PM', '04:00 PM', '05:00 PM', '06:00 PM', '07:00 PM', '08:00 PM', '09:00 PM',
];

// Direct port of app.js's isValidNZBN — GS1 Modulo-10 check digit.
function isValidNZBN(value: string): boolean {
  const digits = (value || '').replace(/\D/g, '');
  if (digits.length !== 13) return false;
  const checkDigit = parseInt(digits[12], 10);
  let sum = 0;
  for (let i = 11; i >= 0; i--) {
    const weight = (11 - i) % 2 === 0 ? 3 : 1;
    sum += parseInt(digits[i], 10) * weight;
  }
  const calculatedCheckDigit = (10 - (sum % 10)) % 10;
  return calculatedCheckDigit === checkDigit;
}

function isPastDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d.getTime() < today.getTime();
}

export default function TradieOnboardingScreen({ route }: Props) {
  const { email } = route.params;
  const { signIn } = useAuth();

  const [step, setStep] = useState(0);
  const stepId = STEP_IDS[step];
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);

  // --- Services ---
  const [selectedTrades, setSelectedTrades] = useState<string[]>([]);
  const [customTradeNames, setCustomTradeNames] = useState<string[]>([]);
  const [customTradeInput, setCustomTradeInput] = useState('');
  const [tradeQuery, setTradeQuery] = useState('');
  const [showAllTrades, setShowAllTrades] = useState(false);
  const [selectedServicesByTrade, setSelectedServicesByTrade] = useState<Record<string, string[]>>({});

  const { data: approvedTrades, isLoading: tradesLoading } = useQuery({
    queryKey: ['approvedTrades'],
    queryFn: getApprovedTrades,
  });
  const { data: allTradeServices } = useQuery({
    queryKey: ['allTradeServices'],
    queryFn: getAllTradeServices,
  });

  const allTrades = useMemo(() => [...selectedTrades, ...customTradeNames], [selectedTrades, customTradeNames]);

  const featured = useMemo(() => (approvedTrades || []).filter((t) => t.featuredForTradies), [approvedTrades]);
  const searchResults = useMemo(() => {
    const q = tradeQuery.trim().toLowerCase();
    if (!q) return [];
    return (approvedTrades || [])
      .filter((t) => t.name.toLowerCase().includes(q) || t.keywords.some((k) => k.toLowerCase().includes(q)))
      .slice(0, 8);
  }, [approvedTrades, tradeQuery]);
  const visibleTrades = tradeQuery.trim() ? searchResults : featured;

  function toggleTrade(name: string) {
    setSelectedTrades((prev) => (prev.includes(name) ? prev.filter((t) => t !== name) : [...prev, name]));
  }
  function addCustomTrade() {
    const name = customTradeInput.trim();
    if (!name || customTradeNames.includes(name)) return;
    setCustomTradeNames((prev) => [...prev, name]);
    setCustomTradeInput('');
  }
  function removeCustomTrade(name: string) {
    setCustomTradeNames((prev) => prev.filter((t) => t !== name));
  }
  function toggleService(trade: string, service: string) {
    setSelectedServicesByTrade((prev) => {
      const current = prev[trade] || [];
      const next = current.includes(service) ? current.filter((s) => s !== service) : [...current, service];
      return { ...prev, [trade]: next };
    });
  }

  // --- Personal ---
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [mobile, setMobile] = useState('');
  const [address, setAddress] = useState<ConfirmedAddress | null>(null);
  const [photo, setPhoto] = useState<UploadSlot>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [driverLicencePhoto, setDriverLicencePhoto] = useState<UploadSlot>(null);
  const [driverLicenceError, setDriverLicenceError] = useState<string | null>(null);

  const mobileDigits = mobile.replace(/\D/g, '');
  const mobileError =
    mobile.trim().length > 0 && (mobileDigits.length < 8 || mobileDigits.length > 11) ? 'Enter a valid mobile number.' : null;

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
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    onStart(asset.uri);
    try {
      const key = await uploadPhoto(asset.uri, asset.fileName || undefined, asset.mimeType || undefined);
      onDone(key, asset.uri);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Could not upload that photo. Please try again.');
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
    setDriverLicenceError(null);
    pickAndUpload(
      (uri) => setDriverLicencePhoto({ uri, uploading: true }),
      (key, uri) => setDriverLicencePhoto({ uri, key, uploading: false }),
      (msg) => { setDriverLicencePhoto(null); setDriverLicenceError(msg); },
    );
  }

  // --- Business ---
  const [businessName, setBusinessName] = useState('');
  const [businessType, setBusinessType] = useState('Sole Trader');
  const [nzbn, setNzbn] = useState('');
  const [hasTeam, setHasTeam] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  const nzbnError = nzbn.trim().length > 0 && !isValidNZBN(nzbn) ? 'Enter a valid 13-digit NZBN.' : null;

  // Matches web's onBusinessTypeChange(): the team question only makes
  // sense for Company/Partnership, and switching to Sole Trader clears
  // any team already entered rather than leaving it silently unused.
  function selectBusinessType(type: string) {
    setBusinessType(type);
    if (type === 'Sole Trader') {
      setHasTeam(false);
      setTeamMembers([]);
    }
  }

  function addTeamMember() {
    setTeamMembers((prev) => [...prev, { firstName: '', lastName: '', trades: [] }]);
  }
  function updateTeamMember(index: number, patch: Partial<TeamMember>) {
    setTeamMembers((prev) => prev.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  }
  function removeTeamMember(index: number) {
    setTeamMembers((prev) => prev.filter((_, i) => i !== index));
  }
  function toggleMemberTrade(index: number, trade: string) {
    setTeamMembers((prev) =>
      prev.map((m, i) => {
        if (i !== index) return m;
        const trades = m.trades || [];
        return { ...m, trades: trades.includes(trade) ? trades.filter((t) => t !== trade) : [...trades, trade] };
      }),
    );
  }

  // --- Licence ---
  // Keyed by a "section key" (see licenceSections below), not directly by
  // trade name — a solo tradie's sections are keyed by trade, but a team's
  // sections are keyed per (member, trade) pair since the same trade can
  // appear under multiple team members.
  const [licenceByKey, setLicenceByKey] = useState<Record<string, { number: string; expiry: string }>>({});
  const [licenceDocs, setLicenceDocs] = useState<Record<string, UploadSlot>>({});
  const [licenceErrors, setLicenceErrors] = useState<Record<string, string>>({});
  const [insuranceCertPhoto, setInsuranceCertPhoto] = useState<UploadSlot>(null);
  const [insuranceCertError, setInsuranceCertError] = useState<string | null>(null);

  // Port of app.js's useTeamLicensing gate (renderLicenceSections): only
  // switch to per-team-member licence sections once a team actually has
  // members, otherwise fall back to the normal per-trade sections.
  const useTeamLicensing = businessType !== 'Sole Trader' && hasTeam && teamMembers.length > 0;
  const licenceSections = useMemo(() => {
    if (useTeamLicensing) {
      // One section per (team member, trade) pair — a member with two
      // trades gets two sections, e.g. "John Smith — Plumbing" and
      // "John Smith — Gasfitting", matching app.js's licenceSectionHtml
      // calls inside teamMembers.flatMap(...).
      return teamMembers.flatMap((m, i) => {
        const name = [m.firstName, m.lastName].filter(Boolean).join(' ').trim() || `Team member ${i + 1}`;
        return (m.trades || []).map((trade) => ({
          key: `member-${i}-${trade}`,
          trade,
          label: `${name} — ${trade}`,
        }));
      });
    }
    return allTrades.map((trade) => ({ key: trade, trade, label: trade }));
  }, [useTeamLicensing, teamMembers, allTrades]);

  function pickLicenceDoc(key: string) {
    setLicenceErrors((p) => ({ ...p, [key]: '' }));
    pickAndUpload(
      (uri) => setLicenceDocs((p) => ({ ...p, [key]: { uri, uploading: true } })),
      (key2, uri) => setLicenceDocs((p) => ({ ...p, [key]: { uri, key: key2, uploading: false } })),
      (msg) => setLicenceErrors((p) => ({ ...p, [key]: msg })),
    );
  }
  function pickInsuranceCert() {
    setInsuranceCertError(null);
    pickAndUpload(
      (uri) => setInsuranceCertPhoto({ uri, uploading: true }),
      (key, uri) => setInsuranceCertPhoto({ uri, key, uploading: false }),
      (msg) => { setInsuranceCertPhoto(null); setInsuranceCertError(msg); },
    );
  }
  function licenceTierFor(trade: string) {
    return (approvedTrades || []).find((t) => t.name === trade)?.licenceTier || null;
  }

  // --- Areas ---
  const [selectedServiceAreas, setSelectedServiceAreas] = useState<{ region: string; district: string; area: string }[]>([]);
  const [activeRegion, setActiveRegion] = useState<string | null>(null);
  const [activeDistrict, setActiveDistrict] = useState<string | null>(null);

  function toggleArea(region: string, district: string, area: string) {
    setSelectedServiceAreas((prev) => {
      const exists = prev.some((a) => a.region === region && a.district === district && a.area === area);
      return exists
        ? prev.filter((a) => !(a.region === region && a.district === district && a.area === area))
        : [...prev, { region, district, area }];
    });
  }
  // Lets a tradie who genuinely covers an entire district (e.g. all of
  // "Hamilton") add every suburb in one tap instead of hunting each one
  // down individually — toggles the whole district's suburb list together;
  // re-tapping when all are already selected clears just that district.
  function isDistrictFullySelected(region: string, district: string, areas: string[]) {
    return areas.length > 0 && areas.every((area) => selectedServiceAreas.some((a) => a.region === region && a.district === district && a.area === area));
  }
  function toggleAllInDistrict(region: string, district: string, areas: string[]) {
    setSelectedServiceAreas((prev) => {
      const withoutDistrict = prev.filter((a) => !(a.region === region && a.district === district));
      if (isDistrictFullySelected(region, district, areas)) return withoutDistrict;
      return [...withoutDistrict, ...areas.map((area) => ({ region, district, area }))];
    });
  }

  // --- Availability ---
  const [activeDays, setActiveDays] = useState<string[]>(DEFAULT_ACTIVE_DAYS);
  const [startTime, setStartTime] = useState('07:00 AM');
  const [endTime, setEndTime] = useState('06:00 PM');
  const [acceptsEmergency, setAcceptsEmergency] = useState(true);

  function toggleDay(day: string) {
    setActiveDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  }

  // --- Per-step validation, mirroring app.js's validateStep() ---
  function validateCurrentStep(): string | null {
    if (stepId === 'services') {
      if (allTrades.length === 0) return 'Select at least one trade to continue.';
      return null;
    }
    if (stepId === 'personal') {
      if (!firstName.trim() || !lastName.trim() || !mobile.trim()) return 'First name, last name and mobile are required.';
      if (mobileError) return mobileError;
      if (!photo?.key) return 'A profile photo is required.';
      if (!address) return 'Select your home address from the search results.';
      return null;
    }
    if (stepId === 'business') {
      if (!businessName.trim()) return 'Business name is required.';
      if (nzbnError) return nzbnError;
      return null;
    }
    if (stepId === 'licence') {
      for (const section of licenceSections) {
        const l = licenceByKey[section.key];
        const doc = licenceDocs[section.key];
        const anyFilled = !!(l?.number || l?.expiry || doc?.key);
        if (!anyFilled) continue;
        if (!l?.number || !l?.expiry || !doc?.key) {
          return `${section.label}: licence number, expiry and document are all required once one is filled in (or leave all blank and use Skip).`;
        }
        if (isPastDate(l.expiry)) return `${section.label}: licence expiry can't be in the past.`;
      }
      return null;
    }
    if (stepId === 'availability') {
      if (activeDays.length === 0) return 'Select at least one working day.';
      return null;
    }
    return null; // areas: soft/optional, same as web
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
  function skipStep() {
    setStepError(null);
    setStep((s) => Math.min(s + 1, STEP_IDS.length - 1));
  }

  async function handleSubmit() {
    if (submitting) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const region = selectedServiceAreas[0]?.region;
      const areas = [...new Set(selectedServiceAreas.map((a) => a.area))];
      const licences: Licence[] = licenceSections
        .map((section): Licence | null => {
          const l = licenceByKey[section.key];
          const doc = licenceDocs[section.key];
          if (!l?.number && !l?.expiry && !doc?.key) return null;
          return { label: section.label, number: l?.number || undefined, expiry: l?.expiry || undefined, documentUrl: doc?.key || undefined };
        })
        .filter((l): l is Licence => l !== null);
      const services: TradieService[] = Object.entries(selectedServicesByTrade).flatMap(([trade, names]) =>
        names.map((name) => ({ trade, name, custom: false })),
      );
      const customTrades: TradieService[] = customTradeNames.map((name) => ({ name, custom: true }));

      const result = await upsertTradie({
        email,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        mobile: mobile.trim(),
        businessName: businessName.trim(),
        businessType,
        photoUrl: photo?.key,
        driverLicenceUrl: driverLicencePhoto?.key,
        insuranceCertUrl: insuranceCertPhoto?.key,
        address: address?.display,
        nzbn: nzbn.trim() || undefined,
        hasTeam,
        teamMembers: hasTeam ? teamMembers.filter((m) => m.firstName.trim()) : undefined,
        region,
        areas,
        trades: allTrades,
        serviceAreas: selectedServiceAreas,
        licences,
        services,
        customTrades,
        workingDays: DAYS.filter((d) => activeDays.includes(d)),
        startTime,
        endTime,
        acceptsEmergency,
      });
      await signIn({ role: 'tradie', token: result.accessToken, email: result.email });
      // No explicit navigation needed — RootNavigator swaps to TradieNavigator
      // automatically once AuthContext's session updates, same as OtpScreen.
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Could not create your profile. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
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
          {stepId === 'services' && (
            <View>
              <Text style={styles.title}>What trade(s) do you do?</Text>
              <Text style={styles.subtitle}>Select every trade you want to be matched on.</Text>

              <TextInput style={styles.input} placeholder="Search trades…" value={tradeQuery} onChangeText={setTradeQuery} />
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
                      <Pressable key={t.name} style={[styles.tradeChip, active && styles.tradeChipActive]} onPress={() => toggleTrade(t.name)}>
                        <Text style={styles.tradeChipIcon}>{t.icon}</Text>
                        <Text style={[styles.tradeChipText, active && styles.tradeChipTextActive]}>{t.name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
              {!tradeQuery.trim() && (
                <Pressable onPress={() => setShowAllTrades((v) => !v)}>
                  <Text style={styles.moreLink}>{showAllTrades ? 'Hide full list' : 'Browse all trades →'}</Text>
                </Pressable>
              )}
              {showAllTrades && !tradeQuery.trim() && (
                <View style={styles.tradeGrid}>
                  {(approvedTrades || [])
                    .filter((t) => !t.featuredForTradies)
                    .map((t) => {
                      const active = selectedTrades.includes(t.name);
                      return (
                        <Pressable key={t.name} style={[styles.tradeChip, active && styles.tradeChipActive]} onPress={() => toggleTrade(t.name)}>
                          <Text style={styles.tradeChipIcon}>{t.icon}</Text>
                          <Text style={[styles.tradeChipText, active && styles.tradeChipTextActive]}>{t.name}</Text>
                        </Pressable>
                      );
                    })}
                </View>
              )}

              <Text style={styles.label}>Don't see your trade?</Text>
              <View style={styles.row}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Type a custom trade name"
                  value={customTradeInput}
                  onChangeText={setCustomTradeInput}
                />
                <Pressable style={styles.addBtn} onPress={addCustomTrade}>
                  <Text style={styles.addBtnText}>+ Add</Text>
                </Pressable>
              </View>
              {customTradeNames.length > 0 && (
                <View style={styles.selectedRow}>
                  {customTradeNames.map((name) => (
                    <Pressable key={name} style={styles.selectedChip} onPress={() => removeCustomTrade(name)}>
                      <Text style={styles.selectedChipText}>{name} ✕</Text>
                    </Pressable>
                  ))}
                </View>
              )}

              {selectedTrades.map((trade) => {
                const options = allTradeServices?.[trade] || [];
                if (!options.length) return null;
                const chosen = selectedServicesByTrade[trade] || [];
                return (
                  <View key={trade} style={styles.serviceBlock}>
                    <Text style={styles.serviceBlockTitle}>{trade} — specific services (optional)</Text>
                    <View style={styles.tradeGrid}>
                      {options.map((s) => {
                        const active = chosen.includes(s.name);
                        return (
                          <Pressable key={s.name} style={[styles.serviceChip, active && styles.tradeChipActive]} onPress={() => toggleService(trade, s.name)}>
                            <Text style={[styles.tradeChipText, active && styles.tradeChipTextActive]}>{s.name}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {stepId === 'personal' && (
            <View>
              <Text style={styles.title}>Your details</Text>
              <Text style={styles.subtitle}>This is what job posters and admin will see.</Text>

              <Pressable style={styles.photoPicker} onPress={pickProfilePhoto}>
                {photo ? (
                  <View style={styles.photoThumbWrap}>
                    <Image source={{ uri: photo.uri }} style={styles.photoThumb} />
                    {photo.uploading && <View style={styles.photoOverlay}><ActivityIndicator color="#fff" /></View>}
                  </View>
                ) : (
                  <Text style={styles.photoPickerText}>📷 Add a profile photo (required)</Text>
                )}
              </Pressable>
              {photoError && <Text style={styles.error}>⚠️ {photoError}</Text>}

              <View style={styles.row}>
                <TextInput style={[styles.input, styles.half]} placeholder="First name" value={firstName} onChangeText={setFirstName} />
                <TextInput style={[styles.input, styles.half]} placeholder="Last name" value={lastName} onChangeText={setLastName} />
              </View>
              <TextInput
                style={styles.input}
                placeholder="Mobile number"
                keyboardType="phone-pad"
                maxLength={16}
                value={mobile}
                onChangeText={(t) => setMobile(t.replace(/[^\d+ ]/g, ''))}
              />
              {mobileError && <Text style={styles.error}>⚠️ {mobileError}</Text>}

              {/* AddressAutocompleteField renders its own "Home address"
                  label internally — this used to duplicate it with a second
                  Text right above, showing "Home address" twice stacked. */}
              <View style={{ marginTop: 14 }}>
                <AddressAutocompleteField label="Home address" value={address} onChange={setAddress} />
              </View>

              <Pressable style={styles.photoPickerSmall} onPress={pickDriverLicence}>
                {driverLicencePhoto ? (
                  <View style={styles.photoThumbWrap}>
                    <Image source={{ uri: driverLicencePhoto.uri }} style={styles.photoThumb} />
                    {driverLicencePhoto.uploading && <View style={styles.photoOverlay}><ActivityIndicator color="#fff" /></View>}
                  </View>
                ) : (
                  <Text style={styles.photoPickerText}>🪪 Driver's licence (optional)</Text>
                )}
              </Pressable>
              {driverLicenceError && <Text style={styles.error}>⚠️ {driverLicenceError}</Text>}
            </View>
          )}

          {stepId === 'business' && (
            <View>
              <Text style={styles.title}>Your business</Text>
              <TextInput style={styles.input} placeholder="Business name" value={businessName} onChangeText={setBusinessName} />

              <Text style={styles.label}>Business type</Text>
              <View style={styles.selectedRow}>
                {BUSINESS_TYPES.map((t) => (
                  <Pressable key={t} style={[styles.segmentChip, businessType === t && styles.tradeChipActive]} onPress={() => selectBusinessType(t)}>
                    <Text style={[styles.tradeChipText, businessType === t && styles.tradeChipTextActive]}>{t}</Text>
                  </Pressable>
                ))}
              </View>

              <TextInput
                style={styles.input}
                placeholder="NZBN (optional)"
                keyboardType="number-pad"
                maxLength={13}
                value={nzbn}
                onChangeText={(t) => setNzbn(t.replace(/\D/g, ''))}
              />
              {nzbnError && <Text style={styles.error}>⚠️ {nzbnError}</Text>}

              {businessType !== 'Sole Trader' && (
                <View>
                  <Text style={styles.label}>Do you have a team working with you?</Text>
                  <Text style={styles.subtitle}>Add each person by name and trade — you'll add a licence for each of them next.</Text>
                  <View style={styles.selectedRow}>
                    <Pressable style={[styles.segmentChip, hasTeam && styles.tradeChipActive]} onPress={() => setHasTeam(true)}>
                      <Text style={[styles.tradeChipText, hasTeam && styles.tradeChipTextActive]}>Yes, me + a team</Text>
                    </Pressable>
                    <Pressable style={[styles.segmentChip, !hasTeam && styles.tradeChipActive]} onPress={() => { setHasTeam(false); setTeamMembers([]); }}>
                      <Text style={[styles.tradeChipText, !hasTeam && styles.tradeChipTextActive]}>Just me</Text>
                    </Pressable>
                  </View>

                  {hasTeam && (
                    <View>
                      {teamMembers.map((m, i) => (
                        <View key={i} style={styles.teamCard}>
                          <View style={styles.row}>
                            <TextInput
                              style={[styles.input, styles.half]}
                              placeholder="First name"
                              value={m.firstName}
                              onChangeText={(t) => updateTeamMember(i, { firstName: t })}
                            />
                            <TextInput
                              style={[styles.input, styles.half]}
                              placeholder="Last name (optional)"
                              value={m.lastName}
                              onChangeText={(t) => updateTeamMember(i, { lastName: t })}
                            />
                          </View>
                          <View style={styles.tradeGrid}>
                            {allTrades.map((trade) => {
                              const active = (m.trades || []).includes(trade);
                              return (
                                <Pressable key={trade} style={[styles.tradeChip, active && styles.tradeChipActive]} onPress={() => toggleMemberTrade(i, trade)}>
                                  <Text style={[styles.tradeChipText, active && styles.tradeChipTextActive]}>{trade}</Text>
                                </Pressable>
                              );
                            })}
                          </View>
                          {!(m.trades || []).length && (
                            <Text style={styles.hint}>Select at least one trade for {m.firstName.trim() || 'this person'} so they get a licence section on the next step.</Text>
                          )}
                          <Pressable onPress={() => removeTeamMember(i)}>
                            <Text style={styles.removeLink}>Remove team member</Text>
                          </Pressable>
                        </View>
                      ))}
                      <Pressable onPress={addTeamMember}>
                        <Text style={styles.moreLink}>+ Add team member</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              )}
            </View>
          )}

          {stepId === 'licence' && (
            <View>
              <Text style={styles.title}>Licences & certification</Text>
              <Text style={styles.subtitle}>
                {useTeamLicensing
                  ? "One licence per person, per trade — we verify each team member's licence individually before your business goes live."
                  : "Optional overall — skip if you don't have these yet. But if you start filling one trade in, its number, expiry and document all need to be added."}
              </Text>

              {useTeamLicensing && licenceSections.length === 0 && (
                <Text style={styles.hint}>No trades selected for your team members yet — go back to the Business step and give each person at least one trade.</Text>
              )}

              {licenceSections.map((section) => {
                const tier = licenceTierFor(section.trade);
                const l = licenceByKey[section.key] || { number: '', expiry: '' };
                const doc = licenceDocs[section.key];
                return (
                  <View key={section.key} style={styles.serviceBlock}>
                    <Text style={styles.serviceBlockTitle}>
                      {section.label}{tier && tier !== 'none' ? '  ⚠️ Licence recommended' : ''}
                    </Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Licence number"
                      value={l.number}
                      onChangeText={(t) => setLicenceByKey((p) => ({ ...p, [section.key]: { ...p[section.key], number: t, expiry: p[section.key]?.expiry || '' } }))}
                    />
                    <LicenceDateField
                      value={l.expiry || null}
                      onChange={(iso) => setLicenceByKey((p) => ({ ...p, [section.key]: { ...p[section.key], expiry: iso, number: p[section.key]?.number || '' } }))}
                    />
                    <Pressable style={styles.photoPickerSmall} onPress={() => pickLicenceDoc(section.key)}>
                      {doc ? (
                        <View style={styles.photoThumbWrap}>
                          <Image source={{ uri: doc.uri }} style={styles.photoThumb} />
                          {doc.uploading && <View style={styles.photoOverlay}><ActivityIndicator color="#fff" /></View>}
                        </View>
                      ) : (
                        <Text style={styles.photoPickerText}>📄 Upload licence document</Text>
                      )}
                    </Pressable>
                    {!!licenceErrors[section.key] && <Text style={styles.error}>⚠️ {licenceErrors[section.key]}</Text>}
                  </View>
                );
              })}

              <Text style={styles.label}>Public liability insurance (optional)</Text>
              <Pressable style={styles.photoPickerSmall} onPress={pickInsuranceCert}>
                {insuranceCertPhoto ? (
                  <View style={styles.photoThumbWrap}>
                    <Image source={{ uri: insuranceCertPhoto.uri }} style={styles.photoThumb} />
                    {insuranceCertPhoto.uploading && <View style={styles.photoOverlay}><ActivityIndicator color="#fff" /></View>}
                  </View>
                ) : (
                  <Text style={styles.photoPickerText}>🛡️ Upload insurance certificate</Text>
                )}
              </Pressable>
              {insuranceCertError && <Text style={styles.error}>⚠️ {insuranceCertError}</Text>}
            </View>
          )}

          {stepId === 'areas' && (
            <View>
              <Text style={styles.title}>Where do you work?</Text>
              <Text style={styles.subtitle}>Pick every region, district and suburb you cover.</Text>

              <View style={styles.tradeGrid}>
                {Object.keys(NZ_REGIONS).map((region) => (
                  <Pressable
                    key={region}
                    style={[styles.tradeChip, activeRegion === region && styles.tradeChipActive]}
                    onPress={() => { setActiveRegion(region); setActiveDistrict(null); }}
                  >
                    <Text style={[styles.tradeChipText, activeRegion === region && styles.tradeChipTextActive]}>{region}</Text>
                  </Pressable>
                ))}
              </View>

              {activeRegion && (
                <View style={styles.serviceBlock}>
                  <Text style={styles.serviceBlockTitle}>{activeRegion} — district</Text>
                  <View style={styles.tradeGrid}>
                    {NZ_REGIONS[activeRegion].map((d) => (
                      <Pressable
                        key={d.district}
                        style={[styles.tradeChip, activeDistrict === d.district && styles.tradeChipActive]}
                        onPress={() => setActiveDistrict(d.district)}
                      >
                        <Text style={[styles.tradeChipText, activeDistrict === d.district && styles.tradeChipTextActive]}>{d.district}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}

              {activeRegion && activeDistrict && (
                <View style={styles.serviceBlock}>
                  <View style={styles.selectAllRow}>
                    <Text style={styles.serviceBlockTitle}>{activeDistrict} — suburbs</Text>
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
                        <Pressable key={area} style={[styles.tradeChip, active && styles.tradeChipActive]} onPress={() => toggleArea(activeRegion, activeDistrict, area)}>
                          <Text style={[styles.tradeChipText, active && styles.tradeChipTextActive]}>{area}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}

              {selectedServiceAreas.length > 0 && (
                <View>
                  <Text style={styles.label}>Selected areas</Text>
                  <View style={styles.selectedRow}>
                    {selectedServiceAreas.map((a, i) => (
                      <Pressable key={i} style={styles.selectedChip} onPress={() => toggleArea(a.region, a.district, a.area)}>
                        <Text style={styles.selectedChipText}>{a.area} ✕</Text>
                      </Pressable>
                    ))}
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
                    <Pressable key={d} style={[styles.segmentChip, active && styles.tradeChipActive]} onPress={() => toggleDay(d)}>
                      <Text style={[styles.tradeChipText, active && styles.tradeChipTextActive]}>{d}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.label}>Start time</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.timeRow}>
                {TIME_OPTIONS.map((t) => (
                  <Pressable key={t} style={[styles.segmentChip, startTime === t && styles.tradeChipActive]} onPress={() => setStartTime(t)}>
                    <Text style={[styles.tradeChipText, startTime === t && styles.tradeChipTextActive]}>{t}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              <Text style={styles.label}>End time</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.timeRow}>
                {TIME_OPTIONS.map((t) => (
                  <Pressable key={t} style={[styles.segmentChip, endTime === t && styles.tradeChipActive]} onPress={() => setEndTime(t)}>
                    <Text style={[styles.tradeChipText, endTime === t && styles.tradeChipTextActive]}>{t}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              <Text style={styles.label}>Accept emergency call-outs?</Text>
              <View style={styles.selectedRow}>
                <Pressable style={[styles.segmentChip, acceptsEmergency && styles.tradeChipActive]} onPress={() => setAcceptsEmergency(true)}>
                  <Text style={[styles.tradeChipText, acceptsEmergency && styles.tradeChipTextActive]}>Yes</Text>
                </Pressable>
                <Pressable style={[styles.segmentChip, !acceptsEmergency && styles.tradeChipActive]} onPress={() => setAcceptsEmergency(false)}>
                  <Text style={[styles.tradeChipText, !acceptsEmergency && styles.tradeChipTextActive]}>No</Text>
                </Pressable>
              </View>
            </View>
          )}

          {stepId === 'review' && (
            <View>
              <Text style={styles.title}>Review & submit</Text>
              <Text style={styles.subtitle}>Everything below gets sent to your new tradie profile. You can edit all of it later on the web app.</Text>

              <View style={styles.reviewCard}>
                <Text style={styles.reviewLabel}>Trades</Text>
                <Text style={styles.reviewValue}>{allTrades.join(', ') || '—'}</Text>
              </View>
              <View style={styles.reviewCard}>
                <Text style={styles.reviewLabel}>Name</Text>
                <Text style={styles.reviewValue}>{[firstName, lastName].filter(Boolean).join(' ') || '—'}</Text>
                <Text style={styles.reviewValue}>{mobile || '—'}</Text>
              </View>
              <View style={styles.reviewCard}>
                <Text style={styles.reviewLabel}>Home address</Text>
                <Text style={styles.reviewValue}>{address?.display || '—'}</Text>
              </View>
              <View style={styles.reviewCard}>
                <Text style={styles.reviewLabel}>Business</Text>
                <Text style={styles.reviewValue}>{businessName || '—'} ({businessType})</Text>
                {hasTeam && <Text style={styles.reviewValue}>{teamMembers.length} team member(s)</Text>}
              </View>
              <View style={styles.reviewCard}>
                <Text style={styles.reviewLabel}>Licences</Text>
                <Text style={styles.reviewValue}>
                  {licenceSections.filter((s) => licenceByKey[s.key]?.number).length} of {licenceSections.length} {useTeamLicensing ? 'team licence section(s)' : 'trade(s)'} with licence info added
                </Text>
              </View>
              <View style={styles.reviewCard}>
                <Text style={styles.reviewLabel}>Service areas</Text>
                <Text style={styles.reviewValue}>{selectedServiceAreas.length ? selectedServiceAreas.map((a) => a.area).join(', ') : 'None selected yet — you can add these later.'}</Text>
              </View>
              <View style={styles.reviewCard}>
                <Text style={styles.reviewLabel}>Availability</Text>
                <Text style={styles.reviewValue}>{activeDays.join(', ')} · {startTime} – {endTime}</Text>
                <Text style={styles.reviewValue}>Emergency call-outs: {acceptsEmergency ? 'Yes' : 'No'}</Text>
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
            {stepId === 'licence' && (
              <Pressable style={styles.skipBtn} onPress={skipStep}>
                <Text style={styles.skipBtnText}>Skip →</Text>
              </Pressable>
            )}
            {stepId !== 'review' ? (
              <Pressable style={styles.button} onPress={goNext}>
                <Text style={styles.buttonText}>Save & Continue →</Text>
              </Pressable>
            ) : (
              <Pressable style={[styles.button, submitting && styles.buttonDisabled]} onPress={handleSubmit} disabled={submitting}>
                {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create profile →</Text>}
              </Pressable>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  stepperHeader: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  stepperCount: { fontSize: 12, color: '#94A3B8', fontWeight: '600' },
  stepperLabel: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginTop: 2 },
  stepperDots: { flexDirection: 'row', gap: 6, marginTop: 8 },
  stepDot: { flex: 1, height: 4, borderRadius: 2, backgroundColor: '#E2E8F0' },
  stepDotActive: { backgroundColor: '#16A34A' },
  scroll: { flex: 1 },
  container: { padding: 24, paddingBottom: 40, gap: 10 },
  footer: { padding: 16, paddingBottom: 24, borderTopWidth: 1, borderTopColor: '#E2E8F0', backgroundColor: '#fff' },
  footerRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '800' },
  subtitle: { fontSize: 14, color: '#64748B', marginBottom: 8 },
  row: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  input: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  label: { fontSize: 14, fontWeight: '700', color: '#334155', marginTop: 14, marginBottom: 2 },
  hint: { fontSize: 12, color: '#94A3B8', marginTop: 6, lineHeight: 17 },
  error: { color: '#DC2626', fontSize: 13 },
  photoPicker: { borderWidth: 1, borderColor: '#E2E8F0', borderStyle: 'dashed', borderRadius: 12, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  photoPickerSmall: { borderWidth: 1, borderColor: '#E2E8F0', borderStyle: 'dashed', borderRadius: 12, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  photoPickerText: { color: '#64748B', fontSize: 14 },
  photoThumbWrap: { width: 64, height: 64, borderRadius: 12, overflow: 'hidden' },
  photoThumb: { width: '100%', height: '100%' },
  photoOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  selectedRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  selectedChip: { backgroundColor: '#DCFCE7', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  selectedChipText: { color: '#166534', fontWeight: '600', fontSize: 13 },
  tradeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  tradeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8 },
  tradeChipActive: { backgroundColor: '#16A34A', borderColor: '#16A34A' },
  tradeChipIcon: { fontSize: 16 },
  tradeChipText: { fontSize: 13, fontWeight: '600', color: '#334155' },
  tradeChipTextActive: { color: '#fff' },
  serviceChip: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8 },
  segmentChip: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  moreLink: { color: '#2563EB', fontWeight: '600', fontSize: 13, marginTop: 10 },
  removeLink: { color: '#DC2626', fontWeight: '600', fontSize: 13, marginTop: 8 },
  addBtn: { backgroundColor: '#F1F5F9', borderRadius: 12, paddingHorizontal: 16, justifyContent: 'center' },
  addBtnText: { color: '#334155', fontWeight: '700', fontSize: 14 },
  serviceBlock: { marginTop: 16, borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 12 },
  serviceBlockTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A', marginBottom: 8 },
  selectAllRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  selectAllLink: { color: '#2563EB', fontWeight: '700', fontSize: 13, marginBottom: 8 },
  teamCard: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 12, marginTop: 10, gap: 8 },
  timeRow: { marginTop: 8 },
  reviewCard: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 14, marginTop: 10 },
  reviewLabel: { fontSize: 12, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', marginBottom: 4 },
  reviewValue: { fontSize: 15, color: '#0F172A', fontWeight: '600' },
  button: { flex: 1, backgroundColor: '#16A34A', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  backBtn: { paddingVertical: 16, paddingHorizontal: 8 },
  backBtnText: { color: '#334155', fontWeight: '700', fontSize: 15 },
  skipBtn: { paddingVertical: 16, paddingHorizontal: 8 },
  skipBtnText: { color: '#64748B', fontWeight: '700', fontSize: 15 },
});
