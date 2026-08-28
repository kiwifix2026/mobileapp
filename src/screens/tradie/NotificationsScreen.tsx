import React, { useCallback } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, SafeAreaView, ActivityIndicator } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { TradieStackParamList } from '../../navigation/types';
import { openTradieMessages } from '../../api/tradies';
import { useAuth } from '../../auth/AuthContext';

type Props = NativeStackScreenProps<TradieStackParamList, 'Notifications'>;

function formatWhen(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? '' : 's'} ago`;
  return `${Math.floor(hrs / 24)} day${Math.floor(hrs / 24) === 1 ? '' : 's'} ago`;
}

// Admin notices (approval decisions, job invites, job-cancelled notices) —
// see src/api/tradies.ts's TradieMessage doc comment for why this is
// separate from Conversations. Uses the combined open+mark-read endpoint on
// mount, same as ChatThreadScreen does for conversation messages.
export default function NotificationsScreen({ navigation }: Props) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const tabBarHeight = useBottomTabBarHeight();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['tradieMessagesOpen', session!.email],
    queryFn: async () => {
      const result = await openTradieMessages(session!.token, session!.email);
      // Unread badge elsewhere (BrowseJobsScreen) should clear immediately
      // now that these have been marked read server-side.
      queryClient.invalidateQueries({ queryKey: ['tradieMessagesUnread', session!.email] });
      return result;
    },
  });

  // This screen lives inside a bottom-tab stack (ProfileTab), which React
  // Navigation keeps mounted across tab switches — so `refetchOnMount` only
  // ever fires once, on the very first visit. A notification created after
  // that (e.g. a profile-edit review notice, or a job invite) would sit
  // invisible until a full app restart, even though it exists server-side
  // and the badge elsewhere may already reflect it. Same fix as
  // ConversationsListScreen: refetch every time this screen gains focus.
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  return (
    <SafeAreaView style={styles.safe}>
      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={data?.messages || []}
          keyExtractor={(m) => m.id}
          contentContainerStyle={[styles.list, { paddingBottom: tabBarHeight + 20 }]}
          ListEmptyComponent={<Text style={styles.empty}>No notifications yet.</Text>}
          renderItem={({ item }) => {
            const wasUnread = !item.readAt;
            const content = (
              <View style={[styles.card, wasUnread && styles.cardUnread]}>
                <Text style={styles.body}>{item.body}</Text>
                <Text style={styles.time}>{formatWhen(item.createdAt)}</Text>
                {item.jobId && <Text style={styles.jobLink}>View job →</Text>}
              </View>
            );
            return item.jobId ? (
              <Pressable onPress={() => navigation.navigate('TradieJobDetail', { jobId: item.jobId! })}>
                {content}
              </Pressable>
            ) : (
              content
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  list: { padding: 16, paddingTop: 20 },
  empty: { fontSize: 14, color: '#94A3B8', textAlign: 'center', marginTop: 60 },
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  cardUnread: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  body: { fontSize: 14, color: '#1E293B', lineHeight: 20 },
  time: { fontSize: 12, color: '#94A3B8', marginTop: 6 },
  jobLink: { fontSize: 13, color: '#2563EB', fontWeight: '700', marginTop: 8 },
});
