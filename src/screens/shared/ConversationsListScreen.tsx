import React, { useCallback } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, SafeAreaView, ActivityIndicator, RefreshControl } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useQuery } from '@tanstack/react-query';
import type { ChatStackParams } from '../../navigation/types';
import type { ConversationSummary } from '../../api/types';
import { listConversations } from '../../api/conversations';
import { useAuth } from '../../auth/AuthContext';
import ScreenBackground from '../../components/ScreenBackground';
import { useCustomerUnread } from '../../api/useCustomerUnread';

type Props = NativeStackScreenProps<ChatStackParams, 'Conversations'>;

function counterpartName(role: 'customer' | 'tradie', item: ConversationSummary): string {
  if (role === 'customer') {
    return item.tradie.businessName || [item.tradie.firstName, item.tradie.lastName].filter(Boolean).join(' ') || 'Tradie';
  }
  return [item.customer.firstName, item.customer.lastName].filter(Boolean).join(' ') || 'Job poster';
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function ConversationsListScreen({ navigation }: Props) {
  const { session } = useAuth();
  const role = session!.role;
  const tradieEmail = role === 'tradie' ? session!.email : undefined;
  const tabBarHeight = useBottomTabBarHeight();
  // Job posters get two pinned rows above their chats — the read-only
  // KiwiFix team thread and their notifications (mirrors web's messages.html
  // pinned KiwiFix conversation + the dashboard bell). Tradies have their own
  // Notifications screen reached from the Home bell, so nothing is pinned.
  const customerUnread = useCustomerUnread();

  const { data: conversations, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => listConversations(role, session!.token, tradieEmail),
  });

  // Bottom-tab screens stay mounted across tab switches, so `refetchOnMount`
  // never fires again after the first visit — a new message arriving (or
  // being sent from a freshly-started conversation, see
  // TradieJobDetailScreen's startChat which doesn't invalidate this query
  // either) would sit unseen until a manual pull-to-refresh, even though the
  // tab's own unread badge keeps polling and updating correctly. Refetch on
  // every focus so opening this tab always shows the latest previews.
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  return (
    <ScreenBackground>
    <SafeAreaView style={styles.safe}>
      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={conversations || []}
          keyExtractor={(c) => c.id}
          contentContainerStyle={[styles.list, { paddingBottom: tabBarHeight + 20 }]}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
          ListHeaderComponent={
            role === 'customer' ? (
              <View>
                <Pressable style={styles.card} onPress={() => navigation.navigate('KiwiFixInbox')}>
                  <View style={styles.cardTop}>
                    <Text style={styles.name}>KiwiFix</Text>
                    {customerUnread.kiwifix > 0 && (
                      <View style={styles.unreadBadge}>
                        <Text style={styles.unreadBadgeText}>{customerUnread.kiwifix}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.jobCategory}>Official messages from the KiwiFix team</Text>
                </Pressable>
                <Pressable style={styles.card} onPress={() => navigation.navigate('PosterNotifications')}>
                  <View style={styles.cardTop}>
                    <Text style={styles.name}>Notifications</Text>
                    {customerUnread.notifications > 0 && (
                      <View style={styles.unreadBadge}>
                        <Text style={styles.unreadBadgeText}>{customerUnread.notifications}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.jobCategory}>Applications, invites and job updates</Text>
                </Pressable>
              </View>
            ) : null
          }
          ListEmptyComponent={<Text style={styles.empty}>No messages yet.</Text>}
          renderItem={({ item }) => {
            const name = counterpartName(role, item);
            return (
              <Pressable
                style={styles.card}
                onPress={() =>
                  navigation.navigate('ChatThread', {
                    conversationId: item.id,
                    jobCategory: item.job.category,
                    counterpartName: name,
                  })
                }
              >
                <View style={styles.cardTop}>
                  <Text style={styles.name} numberOfLines={1}>{name}</Text>
                  {item.lastMessage && (
                    <Text style={styles.time}>{formatWhen(item.lastMessage.createdAt)}</Text>
                  )}
                </View>
                <Text style={styles.jobCategory}>{item.job.category}</Text>
                <View style={styles.previewRow}>
                  <Text style={styles.preview} numberOfLines={1}>
                    {item.lastMessage ? item.lastMessage.body : 'No messages yet'}
                  </Text>
                  {item.unreadCount > 0 && (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadBadgeText}>{item.unreadCount}</Text>
                    </View>
                  )}
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  list: { padding: 16 },
  empty: { fontSize: 14, color: '#475569', fontWeight: '500', textAlign: 'center', marginTop: 60 },
  card: {
    backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 16, padding: 16, marginBottom: 12,
    shadowColor: '#0F172A', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 16, fontWeight: '700', flexShrink: 1 },
  time: { fontSize: 12, color: '#94A3B8' },
  jobCategory: { fontSize: 13, color: '#2563EB', fontWeight: '600', marginTop: 2, marginBottom: 6 },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  preview: { fontSize: 14, color: '#475569', flex: 1, marginRight: 8 },
  unreadBadge: { backgroundColor: '#16A34A', borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  unreadBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
