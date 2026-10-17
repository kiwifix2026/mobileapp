import React, { useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, SafeAreaView, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { openCustomerNotifications, openKiwifixMessages, type CustomerMessage } from '../../api/extras';
import { useAuth } from '../../auth/AuthContext';
import ScreenBackground from '../../components/ScreenBackground';

function formatWhen(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function MessageList({
  messages,
  emptyText,
  isLoading,
  kiwifix,
}: {
  messages: CustomerMessage[];
  emptyText: string;
  isLoading: boolean;
  kiwifix?: boolean;
}) {
  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safe}>
        {isLoading ? (
          <ActivityIndicator style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.list}
            ListEmptyComponent={<Text style={styles.empty}>{emptyText}</Text>}
            renderItem={({ item }) => (
              <View style={[styles.card, !item.readAt && styles.cardUnread]}>
                {kiwifix && <Text style={styles.sender}>KiwiFix team</Text>}
                <Text style={styles.body}>{item.body}</Text>
                <Text style={styles.time}>{formatWhen(item.createdAt)}</Text>
              </View>
            )}
          />
        )}
      </SafeAreaView>
    </ScreenBackground>
  );
}

// Poster notifications (e.g. "a tradie applied to your job") — mirrors the
// bell-icon Messages modal on web's job-poster-dashboard.html. Uses the
// combined open+mark-read endpoint, so badges clear the moment this opens.
export function PosterNotificationsScreen() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['customerNotificationsOpen', session!.email],
    queryFn: async () => {
      const result = await openCustomerNotifications(session!.token);
      queryClient.invalidateQueries({ queryKey: ['customerUnread', session!.email] });
      return result;
    },
  });
  // Tab-stack screens stay mounted — refetch on every focus (same fix as
  // the tradie NotificationsScreen).
  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));
  return <MessageList messages={data?.messages || []} isLoading={isLoading} emptyText="No notifications yet." />;
}

// The pinned, read-only "KiwiFix" team thread (replies to reports etc.) —
// mirrors messages.html's KiwiFix conversation. No reply box, same as web.
export function KiwiFixInboxScreen() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['kiwifixInboxOpen', session!.email],
    queryFn: async () => {
      const result = await openKiwifixMessages(session!.token);
      queryClient.invalidateQueries({ queryKey: ['customerUnread', session!.email] });
      return result;
    },
  });
  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));
  return (
    <MessageList
      messages={data?.messages || []}
      isLoading={isLoading}
      kiwifix
      emptyText="No messages from the KiwiFix team yet."
    />
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  list: { padding: 16, paddingTop: 20 },
  empty: { fontSize: 14, color: '#475569', fontWeight: '500', textAlign: 'center', marginTop: 60 },
  card: {
    backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 16, padding: 16, marginBottom: 10,
    shadowColor: '#0F172A', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  cardUnread: { backgroundColor: 'rgba(240,253,244,0.96)' },
  sender: { fontSize: 12, fontWeight: '800', color: '#16A34A', marginBottom: 4 },
  body: { fontSize: 14, color: '#1E293B', lineHeight: 20 },
  time: { fontSize: 12, color: '#94A3B8', marginTop: 6 },
});
