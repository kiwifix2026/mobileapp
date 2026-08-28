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
import { getTradieByEmail, upsertTradie } from '../../api/tradies';
import { uploadPhoto, getSignedUrl } from '../../api/uploads';
import { ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import AddressAutocompleteField, { ConfirmedAddress } from '../../components/AddressAutocompleteField';
import { NZ_REGIONS } from '../../data/nzRegions';

type Props = NativeStackScreenProps<TradieStackParamList, 'EditProfile'>;

type UploadSlot = { uri: string; key?: string; uploading: boolean } | null;
const BUSINESS_TYPES = ['Sole Trader', 'Company', 'Partnership'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const TIME_OPTIONS = [
  '06:00 AM', '07:00 AM', '08:00 AM', '09:00 AM', '10:00 AM', '11:00 AM', '12:00 PM',
  '01:00 PM', '02:00 PM', '03:00 PM', '04:00 PM', '05:00 PM', '06:00 PM', '07:00 PM', '08:00 PM', '09:00 PM',
];

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

// Edits an EXISTING tradie's profile — deliberately narrower than the
// signup wizard (TradieOnboardingScreen). GET /tradies/:email DOES return
// licences/serviceAreas/teamMembers/services/customTrades/portfolioItems in
// full (they're Prisma composite types embedded in the document, not
// separate relation tables needing `include` — see the corrected
// kiwifix_tradie_relation_fields_not_returned memory). serviceAreas is now
// hydrated and editable here (see the prefill effect below — this used to
// start empty and silently wipe existing areas on save, see
// kiwifix_never_delete_on_edit). Licences, the specific-services checklist,
// team roster, and portfolio still aren't editable on this screen yet — not
// because the data is unreadable, just not built out here — so the payload
// this screen sends still leaves those keys `undefined`, which is what makes
// upsert() leave the stored values alone. Those stay a web-app-only edit for
// now, same disclosed limitation as the onboarding wizard's known trims.
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
  // Starts false (showing a confirmed-address card) once a saved address
  // exists, true (showing the search box) once the tradie taps Change, or
  // for a tradie who has no address on file yet. See the "why is my address
  // gone" fix below — this used to always render the search box, which
  // looked exactly like the address had been deleted even though
  // `addressText` (and the real stored value) were untouched.
  const [addressEditing, setAddressEditing] = useState(false);
  const [activeRegion, setActiveRegion] = useState<string | null>(null);
  const [activeDistrict, setActiveDistrict] = useState<string | null>(null);
  const [activeDays, setActiveDays] = useState<string[]>([]);
  const [startTime, setStartTime] = useState('07:00 AM');
  const [endTime, setEndTime] = useState('06:00 PM');
  const [acceptsEmergency, setAcceptsEmergency] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill once, the moment the real profile loads — signed URLs for any
  // existing photos are resolved separately below.
  useEffect(() => {
    if (!tradie || hydrated) return;
    setFirstName(tradie.firstName || '');
    setLastName(tradie.lastName || '');
    setMobile(tradie.mobile || '');
    setBusinessName(tradie.businessName || '');
    setSelectedTrades(tradie.trades || []);
    setActiveDays(tradie.workingDays || []);
    setStartTime(tradie.startTime || '07:00 AM');
    setEndTime(tradie.endTime || '06:00 PM');
    setAcceptsEmergency(!!tradie.acceptsEmergency);
    setBio(tradie.bio || '');
    setBusinessType(tradie.businessType || 'Sole Trader');
    setNzbn(tradie.nzbn || '');
    setAddressText(tradie.address || '');
    setAddressEditing(!tradie.address);
    // Was never prefilled — selectedServiceAreas started at its initial []
    // every time this screen opened, so tapping even ONE area flipped
    // areasTouched to true and Save then sent that lone area as the WHOLE
    // serviceAreas array, silently wiping out every previously saved area
    // (the backend treats an explicitly-sent array as a full replacement,
    // not a merge — same class of bug as kiwifix_never_delete_on_edit).
    // Confirmed 2026-08-27 after a report that picking one area appeared to
    // "require" re-picking the others — they weren't required again, they'd
    // just been silently deleted on the previous save.
    setSelectedServiceAreas((tradie.serviceAreas || []).map((a) => ({ region: a.region, district: a.district || '', area: a.area })));
    if (tradie.photoUrl) setPhoto({ uri: '', key: tradie.photoUrl, uploading: false });
    if (tradie.driverLicenceUrl) setDriverLicencePhoto({ uri: '', key: tradie.driverLicenceUrl, uploading: false });
    if (tradie.insuranceCertUrl) setInsuranceCertPhoto({ uri: '', key: tradie.insuranceCertUrl, uploading: false });
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

  const mobileDigits = mobile.replace(/\D/g, '');
  const mobileError = mobile.trim().length > 0 && (mobileDigits.length < 8 || mobileDigits.length > 11) ? 'Enter a valid mobile number.' : null;
  const nzbnError = nzbn.trim().length > 0 && !isValidNZBN(nzbn) ? 'Enter a valid 13-digit NZBN.' : null;
  const canSubmit = hydrated && firstName.trim().length > 0 && selectedTrades.length > 0 && !mobileError && !nzbnError && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
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
        // Only sent when this edit actually touched the areas step —
        // otherwise undefined, so TradiesService.upsert() leaves the stored
        // value alone. selectedServiceAreas is now hydrated from
        // tradie.serviceAreas on load (see the prefill effect above), so
        // "touched" always starts from the real saved list, not an empty one.
        serviceAreas: areasTouched ? selectedServiceAreas : undefined,
        workingDays: activeDays,
        startTime,
        endTime,
        acceptsEmergency,
        bio: bio.trim() || undefined,
        // Deliberately omitted: licences, services, customTrades,
        // teamMembers, hasTeam, portfolioItems — see file header comment.
      });
      await signIn({ role: 'tradie', token: result.accessToken, email: result.email });
      queryClient.invalidateQueries({ queryKey: ['myTradieProfile', email] });
      navigation.goBack();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save your changes. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // Same bug class as the job-detail screens: `hydrated` only ever flips to
  // true inside the prefill effect above, which is itself gated on `tradie`
  // being truthy — so a failed fetch left this screen on a spinner forever
  // with no error and no retry.
  if (tradieIsError) {
    return (
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
    );
  }
  if (tradieLoading || !hydrated) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView style={styles.scroll} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.notice}>
            Team roster, per-trade licences, your specific services list, and portfolio can't be edited here yet —
            manage those on the web app for now. Everything else on this screen is safe to change.
          </Text>

          <Pressable style={styles.photoPicker} onPress={pickProfilePhoto}>
            {photo?.uri || photoSignedUrl ? (
              <View style={styles.photoThumbWrap}>
                <Image source={{ uri: photo?.uri || photoSignedUrl }} style={styles.photoThumb} />
                {photo?.uploading && <View style={styles.photoOverlay}><ActivityIndicator color="#fff" /></View>}
              </View>
            ) : (
              <Text style={styles.photoPickerText}>📷 Add a profile photo</Text>
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

          {/* Tradie.address is only ever stored as one free-text string
              (no region/city/suburb/street breakdown), so this can't build
              the full ConfirmedAddress object AddressAutocompleteField's
              "confirmed card" view needs. It used to just always render
              the search box instead — which looked identical to the
              address having been deleted, even though addressText (and the
              real saved value) were completely untouched underneath. Now
              it shows a plain confirmed-style card with the real saved
              text until the tradie explicitly taps Change. */}
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
              onChange={(v) => {
                if (v?.display) {
                  setAddressText(v.display);
                  setAddressEditing(false);
                }
              }}
            />
          )}

          <Text style={styles.label}>Business name</Text>
          <TextInput style={styles.input} placeholder="Business name" value={businessName} onChangeText={setBusinessName} />
          <View style={styles.selectedRow}>
            {BUSINESS_TYPES.map((t) => (
              <Pressable key={t} style={[styles.segmentChip, businessType === t && styles.chipActive]} onPress={() => setBusinessType(t)}>
                <Text style={[styles.chipText, businessType === t && styles.chipTextActive]}>{t}</Text>
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

          <Text style={styles.label}>Your trade(s)</Text>
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
                  <Pressable key={t.name} style={[styles.tradeChip, active && styles.chipActive]} onPress={() => toggleTrade(t.name)}>
                    <Text style={styles.tradeChipIcon}>{t.icon}</Text>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{t.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          <Text style={styles.label}>Service areas</Text>
          <Text style={styles.currentValueHint}>
            Current: {tradie?.region || tradie?.areas?.length ? [tradie?.region, ...(tradie?.areas || [])].filter(Boolean).join(', ') : 'Not set yet'}
          </Text>
          <Text style={styles.hint}>Tap an area to add or remove it — your existing areas below are already selected.</Text>
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
          {selectedServiceAreas.length > 0 && (
            <View style={styles.selectedRow}>
              {selectedServiceAreas.map((a, i) => (
                <Pressable key={i} style={styles.selectedChip} onPress={() => toggleArea(a.region, a.district, a.area)}>
                  <Text style={styles.selectedChipText}>{a.area} ✕</Text>
                </Pressable>
              ))}
            </View>
          )}

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

          <Text style={styles.label}>Driver's licence (optional)</Text>
          <Pressable style={styles.photoPickerSmall} onPress={pickDriverLicence}>
            {driverLicencePhoto?.uri || driverLicenceSignedUrl ? (
              <View style={styles.photoThumbWrap}>
                <Image source={{ uri: driverLicencePhoto?.uri || driverLicenceSignedUrl }} style={styles.photoThumb} />
                {driverLicencePhoto?.uploading && <View style={styles.photoOverlay}><ActivityIndicator color="#fff" /></View>}
              </View>
            ) : (
              <Text style={styles.photoPickerText}>🪪 Upload driver's licence</Text>
            )}
          </Pressable>

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

          <Text style={styles.label}>About you (optional)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="A short blurb job posters will see on your profile"
            value={bio}
            onChangeText={setBio}
            multiline
          />

          {error && <Text style={styles.error}>⚠️ {error}</Text>}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable style={[styles.button, !canSubmit && styles.buttonDisabled]} onPress={handleSubmit} disabled={!canSubmit}>
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save changes</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  scroll: { flex: 1 },
  container: { padding: 24, paddingBottom: 40, gap: 10 },
  notice: {
    fontSize: 12, color: '#92400E', backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A',
    borderRadius: 10, padding: 10, lineHeight: 17, marginBottom: 6,
  },
  footer: { padding: 16, paddingBottom: 24, borderTopWidth: 1, borderTopColor: '#E2E8F0', backgroundColor: '#fff' },
  errorState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorStateText: { fontSize: 15, color: '#475569', textAlign: 'center', lineHeight: 22, marginBottom: 16 },
  retryBtn: { backgroundColor: '#16A34A', borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12 },
  retryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  row: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  input: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  label: { fontSize: 14, fontWeight: '700', color: '#334155', marginTop: 14, marginBottom: 2 },
  hint: { fontSize: 12, color: '#94A3B8', marginBottom: 6 },
  selectAllRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  selectAllLink: { color: '#2563EB', fontWeight: '700', fontSize: 13 },
  currentValueHint: { fontSize: 12, color: '#64748B', marginBottom: 4 },
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
    borderWidth: 1, borderColor: '#E2E8F0', borderStyle: 'dashed', borderRadius: 12,
    paddingVertical: 16, alignItems: 'center', justifyContent: 'center', marginTop: 4,
  },
  photoPickerSmall: {
    borderWidth: 1, borderColor: '#E2E8F0', borderStyle: 'dashed', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', justifyContent: 'center', marginTop: 6,
  },
  photoPickerText: { color: '#64748B', fontSize: 14 },
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
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8,
  },
  tradeChipIcon: { fontSize: 16 },
  segmentChip: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8 },
  chipActive: { backgroundColor: '#16A34A', borderColor: '#16A34A' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#334155' },
  chipTextActive: { color: '#fff' },
  button: { backgroundColor: '#16A34A', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
