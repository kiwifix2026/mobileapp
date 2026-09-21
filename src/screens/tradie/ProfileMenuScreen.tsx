import React, { useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, SafeAreaView, Image, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import type { TradieStackParamList } from '../../navigation/types';
import { getTradieByEmail } from '../../api/tradies';
import { getSignedUrl } from '../../api/uploads';
import { useAuth } from '../../auth/AuthContext';
import ScreenBackground from '../../components/ScreenBackground';

type Props = NativeStackScreenProps<TradieStackParamList, 'ProfileMenu'>;

// Root of the tradie app's "Profile" tab — a menu, not a form. Replaces the
// earlier avatar-dropdown-on-the-dashboard pattern now that Profile is its
// own bottom tab (a dedicated tab is the more standard place for this than
// a modal popover living on the Home tab).
//
// Restyled 2026-08-29 to match a reference mockup the user provided: a soft
// fern/NZ-map background, a ring-bordered avatar, and menu rows written as
// icon-in-circle + title + one-line subtitle cards instead of the old plain
// text-only rows. Purely visual — every row still navigates exactly where
// it did before.
//
// Updated 2026-08-29: this screen used to render its own full-opacity
// ImageBackground (assets/profile-fern-bg.png) instead of the shared
// <ScreenBackground> every other screen uses — exactly the kind of
// copy-pasted-markup drift flagged in kiwifix_duplicated_page_sidebars: a
// fix to the shared component (toning the fern image down with a white
// scrim) didn't propagate here because this screen wasn't using it. Now
// wired through <ScreenBackground> like the rest of the app so future
// background tweaks apply everywhere in one place.
function MenuRow({
  icon,
  iconTint,
  title,
  subtitle,
  onPress,
  danger,
  isLast,
}: {
  // A rendered icon element rather than a raw emoji string — lets each row
  // pick whichever icon actually fits its meaning (e.g. an eye for "View
  // Profile") instead of every row being stuck with a leaf/plant glyph.
  icon: React.ReactNode;
  iconTint: string;
  title: string;
  subtitle: string;
  onPress: () => void;
  danger?: boolean;
  isLast?: boolean;
}) {
  return (
    <Pressable
      style={[styles.menuItem, !isLast && styles.menuItemDivider]}
      onPress={onPress}
    >
      <View style={[styles.iconCircle, { backgroundColor: iconTint }]}>{icon}</View>
      <View style={styles.menuItemBody}>
        <Text style={[styles.menuItemTitle, danger && styles.menuItemTitleDanger]}>{title}</Text>
        <Text style={[styles.menuItemSubtitle, danger && styles.menuItemSubtitleDanger]}>{subtitle}</Text>
      </View>
      <Text style={[styles.chevron, danger && styles.chevronDanger]}>›</Text>
    </Pressable>
  );
}

export default function ProfileMenuScreen({ navigation }: Props) {
  const { session, signOut } = useAuth();
  const email = session!.email;

  const { data: tradie, refetch: refetchTradie } = useQuery({
    queryKey: ['myTradieProfile', email],
    queryFn: () => getTradieByEmail(email),
  });

  // Root of the Profile tab — the screen you land on right after saving an
  // edit. Refetch on focus so it's never showing what was true before the
  // edit (see kiwifix_mobile_stale_bottomtab_screens memory).
  useFocusEffect(
    useCallback(() => {
      refetchTradie();
    }, [refetchTradie]),
  );

  const { data: avatarUrl } = useQuery({
    queryKey: ['tradieAvatarUrl', tradie?.photoUrl],
    queryFn: () => getSignedUrl(tradie!.photoUrl!),
    enabled: !!tradie?.photoUrl,
  });

  const fullName = [tradie?.firstName, tradie?.lastName].filter(Boolean).join(' ') || email;
  const initials = (((tradie?.firstName || '')[0] || '') + ((tradie?.lastName || '')[0] || '')) || 'T';

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.header}>
            <View style={styles.avatarRing}>
              <View style={styles.avatar}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
                ) : (
                  <Text style={styles.avatarText}>{initials.toUpperCase()}</Text>
                )}
              </View>
            </View>
            <Text style={styles.name}>{fullName}</Text>
            <Text style={styles.sub}>{tradie?.businessName || 'Tradie'}</Text>
            <Ionicons name="briefcase-outline" size={16} color="#14251B" style={styles.subDivider} />
          </View>

          <View style={styles.menu}>
            <MenuRow
              icon={<Ionicons name="eye-outline" size={22} color="#16A34A" />}
              iconTint="rgba(22,163,74,0.12)"
              title="View Profile"
              subtitle="See your profile details"
              onPress={() => navigation.navigate('ViewProfile')}
            />
            <MenuRow
              icon={<Ionicons name="create-outline" size={22} color="#16A34A" />}
              iconTint="rgba(22,163,74,0.12)"
              title="Edit Profile"
              subtitle="Update your information"
              onPress={() => navigation.navigate('EditProfile')}
              isLast
            />
          </View>

          <View style={styles.signOutCard}>
            <MenuRow
              icon={<Ionicons name="log-out-outline" size={22} color="#DC2626" />}
              iconTint="rgba(220,38,38,0.14)"
              title="Sign Out"
              subtitle="Log out of your account"
              onPress={signOut}
              danger
              isLast
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },
  header: { alignItems: 'center', paddingTop: 24, paddingBottom: 20 },
  avatarRing: {
    width: 116, height: 116, borderRadius: 58, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
    borderWidth: 3, borderColor: '#BBF7D0',
    shadowColor: '#0F172A', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  avatar: {
    width: 104, height: 104, borderRadius: 52, backgroundColor: '#16A34A',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 36 },
  name: { fontSize: 24, fontWeight: '800', color: '#14251B' },
  // Was green (#16A34A) — changed to the same near-black used for the name,
  // per feedback, so the business-type line reads as plain info text rather
  // than a colored label.
  sub: { fontSize: 15, color: '#14251B', fontWeight: '600', marginTop: 4 },
  subDivider: { marginTop: 10, opacity: 0.8 },
  menu: {
    backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 20, overflow: 'hidden', marginBottom: 16,
    shadowColor: '#0F172A', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  signOutCard: {
    backgroundColor: 'rgba(254,226,226,0.75)', borderRadius: 20, overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 16, gap: 14,
  },
  menuItemDivider: { borderBottomWidth: 1, borderBottomColor: 'rgba(15,23,42,0.06)' },
  iconCircle: {
    width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center',
  },
  menuItemBody: { flex: 1 },
  menuItemTitle: { fontSize: 16, fontWeight: '800', color: '#14251B' },
  menuItemTitleDanger: { color: '#DC2626' },
  menuItemSubtitle: { fontSize: 13, color: '#64748B', marginTop: 2 },
  menuItemSubtitleDanger: { color: '#DC262699' },
  chevron: { fontSize: 22, color: '#16A34A', fontWeight: '700' },
  chevronDanger: { color: '#DC2626' },
});
