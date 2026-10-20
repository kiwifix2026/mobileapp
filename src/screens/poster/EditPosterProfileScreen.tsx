import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, SafeAreaView, ScrollView, ActivityIndicator,
  Image, KeyboardAvoidingView, Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { PosterStackParamList } from '../../navigation/types';
import { getMyCustomerProfile, updateMyCustomerProfile } from '../../api/extras';
import { getSignedUrl, uploadPhoto } from '../../api/uploads';
import { ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import ScreenBackground from '../../components/ScreenBackground';
import AddressAutocompleteField, { ConfirmedAddress } from '../../components/AddressAutocompleteField';

type Props = NativeStackScreenProps<PosterStackParamList, 'EditPosterProfile'>;

// Port of the web app's profile.html ("Edit profile") — same fields, same
// PATCH /customers/me payload: name, mobile, landline, photo, a CONFIRMED
// full home address (picked from suggestions, never free text) and the
// unit/gate/parking notes that prefill the next posted job.
export default function EditPosterProfileScreen({ navigation }: Props) {
  const { session } = useAuth();
  const queryClient = useQueryClient();

  const { data: profile, isLoading } = useQuery({
    queryKey: ['customerProfile', session!.email],
    queryFn: () => getMyCustomerProfile(session!.token),
  });

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [mobile, setMobile] = useState('');
  const [landline, setLandline] = useState('');
  const [unitNum, setUnitNum] = useState('');
  const [gateCode, setGateCode] = useState('');
  const [parking, setParking] = useState('');
  const [photoKey, setPhotoKey] = useState<string | null>(null);
  const [localPhotoUri, setLocalPhotoUri] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  // The saved address only comes back as display/region/city/suburb (no
  // street/number split), so an already-saved address is shown as a plain
  // card until "Change" is tapped, which swaps in the real autocomplete.
  const [address, setAddress] = useState<{ display: string; region: string; city: string; suburb: string } | null>(null);
  const [changingAddress, setChangingAddress] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  // Prefill once from the server copy.
  useEffect(() => {
    if (!profile) return;
    setFirstName(profile.firstName || '');
    setLastName(profile.lastName || '');
    setMobile(profile.mobile || '');
    setLandline(profile.landline || '');
    setUnitNum(profile.unitNum || '');
    setGateCode(profile.gateCode || '');
    setParking(profile.parking || '');
    setPhotoKey(profile.photoUrl || null);
    setAddress(
      profile.address
        ? { display: profile.address, region: profile.region || '', city: profile.city || '', suburb: profile.suburb || '' }
        : null,
    );
  }, [profile]);

  const { data: signedPhoto } = useQuery({
    queryKey: ['customerAvatarUrl', photoKey],
    queryFn: () => getSignedUrl(photoKey!),
    enabled: !!photoKey && !localPhotoUri,
  });
  const avatarUri = localPhotoUri || signedPhoto || null;

  async function pickPhoto() {
    setError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Photo library access is needed to choose a photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      // iOS: force the picker to hand back a JPEG instead of the original
      // HEIC (the backend can't read HEIC). Android ignores this.
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    setLocalPhotoUri(asset.uri);
    setPhotoUploading(true);
    try {
      const key = await uploadPhoto(asset.uri, asset.fileName || undefined, asset.mimeType || undefined);
      setPhotoKey(key);
    } catch (err) {
      setLocalPhotoUri(null);
      console.error('[EditPosterProfileScreen] photo upload failed:', err);
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
          ? `Could not upload that photo: ${err.message}`
          : 'Could not upload that photo. Please try again.',
      );
    } finally {
      setPhotoUploading(false);
    }
  }

  function onAddressPicked(a: ConfirmedAddress | null) {
    if (!a) return;
    setAddress({ display: a.display, region: a.region, city: a.city, suburb: a.suburb });
    setChangingAddress(false);
  }

  async function save() {
    setError(null);
    setSaved(false);
    if (photoUploading) {
      setError('Your photo is still uploading — please wait for it to finish, then save.');
      return;
    }
    setSaving(true);
    try {
      await updateMyCustomerProfile(session!.token, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        mobile: mobile.trim(),
        landline: landline.trim(),
        photoUrl: photoKey || undefined,
        address: address?.display || '',
        region: address?.region || '',
        city: address?.city || '',
        suburb: address?.suburb || '',
        unitNum: unitNum.trim(),
        gateCode: gateCode.trim(),
        parking: parking.trim(),
      });
      queryClient.invalidateQueries({ queryKey: ['customerProfile'] });
      queryClient.invalidateQueries({ queryKey: ['customerAvatarUrl'] });
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save your profile. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const initials = (((firstName || '')[0] || '') + ((lastName || '')[0] || '')) || (session?.email?.[0] || '?');

  return (
    <ScreenBackground plain>
      <SafeAreaView style={styles.safe}>
        {isLoading ? (
          <ActivityIndicator style={{ marginTop: 40 }} />
        ) : (
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
              <View style={styles.photoRow}>
                <Pressable onPress={pickPhoto} style={styles.avatarRing}>
                  <View style={styles.avatar}>
                    {avatarUri ? (
                      <Image source={{ uri: avatarUri }} style={styles.avatarImg} />
                    ) : (
                      <Text style={styles.avatarText}>{initials.toUpperCase()}</Text>
                    )}
                  </View>
                </Pressable>
                <Pressable onPress={pickPhoto} disabled={photoUploading}>
                  <Text style={styles.changePhoto}>
                    {photoUploading ? 'Uploading…' : avatarUri ? 'Change photo' : 'Add a photo'}
                  </Text>
                </Pressable>
              </View>

              <View style={styles.card}>
                <Text style={styles.label}>First name</Text>
                <TextInput style={styles.input} value={firstName} onChangeText={setFirstName} autoCapitalize="words" />
                <Text style={styles.label}>Last name</Text>
                <TextInput style={styles.input} value={lastName} onChangeText={setLastName} autoCapitalize="words" />
                <Text style={styles.label}>Mobile</Text>
                <TextInput style={styles.input} value={mobile} onChangeText={setMobile} keyboardType="phone-pad" />
                <Text style={styles.label}>Landline (optional)</Text>
                <TextInput style={styles.input} value={landline} onChangeText={setLandline} keyboardType="phone-pad" />
              </View>

              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Home / property address</Text>
                {address && !changingAddress ? (
                  <View>
                    <View style={styles.addrCard}>
                      <Text style={styles.addrText}>✓ {address.display}</Text>
                    </View>
                    <Pressable onPress={() => setChangingAddress(true)}>
                      <Text style={styles.changeLink}>Change address</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View>
                    <AddressAutocompleteField label="Address" value={null} onChange={onAddressPicked} />
                    {address && (
                      <Pressable onPress={() => setChangingAddress(false)}>
                        <Text style={styles.changeLink}>Keep current address</Text>
                      </Pressable>
                    )}
                  </View>
                )}
                <Text style={styles.label}>Unit / apartment (optional)</Text>
                <TextInput style={styles.input} value={unitNum} onChangeText={setUnitNum} />
                <Text style={styles.label}>Gate code (optional)</Text>
                <TextInput style={styles.input} value={gateCode} onChangeText={setGateCode} />
                <Text style={styles.label}>Parking notes (optional)</Text>
                <TextInput style={styles.input} value={parking} onChangeText={setParking} />
              </View>

              {error && <Text style={styles.error}>⚠️ {error}</Text>}
              {saved && <Text style={styles.success}>✓ Profile saved.</Text>}

              <Pressable
                style={[styles.saveBtn, (saving || photoUploading) && styles.saveBtnDisabled]}
                onPress={save}
                disabled={saving || photoUploading}
              >
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save profile</Text>}
              </Pressable>
              <Pressable style={styles.cancelBtn} onPress={() => navigation.goBack()}>
                <Text style={styles.cancelBtnText}>Back</Text>
              </Pressable>
            </ScrollView>
          </KeyboardAvoidingView>
        )}
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: 20, paddingBottom: 60 },
  photoRow: { alignItems: 'center', marginBottom: 16, gap: 8 },
  avatarRing: {
    width: 100, height: 100, borderRadius: 50, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#BBF7D0',
  },
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: '#16A34A', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 30 },
  changePhoto: { color: '#16A34A', fontWeight: '700', fontSize: 14 },
  card: {
    backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 16, padding: 16, marginBottom: 14,
    shadowColor: '#0F172A', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#14251B', marginBottom: 10 },
  label: { fontSize: 13, fontWeight: '700', color: '#334155', marginTop: 12, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, backgroundColor: '#fff',
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
  },
  addrCard: { borderWidth: 1, borderColor: '#BBF7D0', backgroundColor: '#F0FDF4', borderRadius: 12, padding: 12 },
  addrText: { fontSize: 14, fontWeight: '600', color: '#14532D' },
  changeLink: { color: '#2563EB', fontWeight: '600', fontSize: 13, marginTop: 8 },
  error: { color: '#DC2626', fontSize: 13, marginBottom: 10 },
  success: { color: '#16A34A', fontSize: 14, fontWeight: '700', marginBottom: 10 },
  saveBtn: { backgroundColor: '#16A34A', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  cancelBtn: { alignItems: 'center', paddingVertical: 14 },
  cancelBtnText: { color: '#64748B', fontWeight: '600', fontSize: 14 },
});
