import React, { useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, SafeAreaView, Image } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import type { TradieStackParamList } from '../../navigation/types';
import { getTradieByEmail, listTradieMessages } from '../../api/tradies';
import { getSignedUrl } from '../../api/uploads';
import { useAuth } from '../../auth/AuthContext';

type Props = NativeStackScreenProps<TradieStackParamList, 'ProfileMenu'>;

// Root of the tradie app's "Profile" tab — a menu, not a form. Replaces the
// earlier avatar-dropdown-on-the-dashboard pattern now that Profile is its
// own bottom tab (a dedicated tab is the more standard place for this than
// a modal popover living on the Home tab).
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
  const { data: messagesData } = useQuery({
    queryKey: ['tradieMessagesUnread', email],
    queryFn: () => listTradieMessages(session!.token, email),
  });
  const unreadMessages = messagesData?.unreadCount || 0;

  const fullName = [tradie?.firstName, tradie?.lastName].filter(Boolean).join(' ') || email;
  const initials = (((tradie?.firstName || '')[0] || '') + ((tradie?.lastName || '')[0] || '')) || 'T';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          {avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.avatarImg} /> : <Text style={styles.avatarText}>{initials.toUpperCase()}</Text>}
        </View>
        <Text style={styles.name}>{fullName}</Text>
        <Text style={styles.sub}>{tradie?.businessName || 'Tradie'}</Text>
      </View>

      <View style={styles.menu}>
        <Pressable style={styles.menuItem} onPress={() => navigation.navigate('ViewProfile')}>
          <Text style={styles.menuItemText}>👁️ View Profile</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
        <Pressable style={styles.menuItem} onPress={() => navigation.navigate('EditProfile')}>
          <Text style={styles.menuItemText}>✏️ Edit Profile</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
        <Pressable style={[styles.menuItem, styles.menuItemLast]} onPress={() => navigation.navigate('Notifications')}>
          <Text style={styles.menuItemText}>🔔 Notifications</Text>
          <View style={styles.menuItemRight}>
            {unreadMessages > 0 && (
              <View style={styles.badge}><Text style={styles.badgeText}>{unreadMessages}</Text></View>
            )}
            <Text style={styles.chevron}>›</Text>
          </View>
        </Pressable>
      </View>

      <Pressable style={styles.signOutBtn} onPress={signOut}>
        <Text style={styles.signOutText}>🚪 Sign Out</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { alignItems: 'center', paddingTop: 32, paddingBottom: 24 },
  avatar: {
    width: 76, height: 76, borderRadius: 38, backgroundColor: '#16A34A',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 10,
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 26 },
  name: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  sub: { fontSize: 13, color: '#64748B', marginTop: 2 },
  menu: {
    marginHorizontal: 20, backgroundColor: '#fff', borderRadius: 14,
    borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  menuItemLast: { borderBottomWidth: 0 },
  menuItemText: { fontSize: 15, fontWeight: '600', color: '#0F172A' },
  menuItemRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chevron: { fontSize: 20, color: '#CBD5E1' },
  badge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  signOutBtn: {
    marginHorizontal: 20, marginTop: 20, backgroundColor: '#fff', borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', borderWidth: 1, borderColor: '#FECACA',
  },
  signOutText: { color: '#DC2626', fontWeight: '700', fontSize: 15 },
});
