import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useHeaderHeight } from '@react-navigation/elements';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ChatStackParams } from '../../navigation/types';
import type { ConversationMessage } from '../../api/types';
import { openConversation, sendConversationMessage } from '../../api/conversations';
import { useAuth } from '../../auth/AuthContext';
import { ApiError } from '../../api/client';

type Props = NativeStackScreenProps<ChatStackParams, 'ChatThread'>;

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// WhatsApp-style ticks on my own outgoing bubbles — single grey check once
// the message is persisted server-side (we don't optimistically render
// before that, so every message we draw already counts as "sent"), double
// grey once it's reached the thread at all (same moment, since there's no
// separate delivered-vs-sent signal from the backend), double blue once the
// other side has actually opened the conversation and read it.
function ReadReceipt({ read }: { read: boolean }) {
  return <Text style={[styles.ticks, read && styles.ticksRead]}>✓✓</Text>;
}

export default function ChatThreadScreen({ route, navigation }: Props) {
  const { conversationId, jobCategory, counterpartName } = route.params;
  // The stack header's actual rendered height (varies by device/notch/Dynamic
  // Island) — a hardcoded offset here is what was letting the keyboard sit
  // slightly over the input row, since it didn't match the real header on
  // every device. See useHeaderHeight docs: this is the standard fix for
  // KeyboardAvoidingView + a native-stack header.
  const headerHeight = useHeaderHeight();
  const { session } = useAuth();
  const role = session!.role;
  const tradieEmail = role === 'tradie' ? session!.email : undefined;
  const queryClient = useQueryClient();
  const listRef = useRef<FlatList<ConversationMessage>>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  React.useLayoutEffect(() => {
    navigation.setOptions({ title: counterpartName });
  }, [navigation, counterpartName]);

  // openConversation both fetches the thread AND marks everything unread-by-me
  // as read (mirrors the web app's messages.html/tradie-messages.html) — see
  // ConversationsService.openConversation. Polling on an interval (rather
  // than fetching once) is what makes both new incoming messages AND the
  // other side's read receipt (readByCustomerAt/readByTradieAt) show up
  // live while this screen is open, WhatsApp-style — there's no push
  // channel, so a short poll is the simplest way to get that.
  const { data: messages, isLoading } = useQuery({
    queryKey: ['conversationMessages', conversationId],
    queryFn: async () => {
      const result = await openConversation(role, session!.token, conversationId, tradieEmail);
      return result.messages;
    },
    refetchInterval: 5000,
  });

  const send = useMutation({
    mutationFn: (body: string) => sendConversationMessage(role, session!.token, conversationId, body, tradieEmail),
    onSuccess: () => {
      setDraft('');
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['conversationMessages', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not send that message. Please try again.'),
  });

  const mySenderType = role === 'customer' ? 'CUSTOMER' : 'TRADIE';

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={headerHeight}
    >
      <SafeAreaView style={styles.safe}>
        <View style={styles.jobBanner}>
          <Text style={styles.jobBannerText}>📋 {jobCategory}</Text>
        </View>

        {isLoading ? (
          <ActivityIndicator style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            ref={listRef}
            data={messages || []}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.list}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            renderItem={({ item }) => {
              if (item.senderType === 'SYSTEM') {
                return (
                  <View style={styles.systemBubble}>
                    <Text style={styles.systemText}>{item.body}</Text>
                  </View>
                );
              }
              const mine = item.senderType === mySenderType;
              // Whether the OTHER side has read this — i.e. if I'm the
              // customer, did the tradie read it (readByTradieAt), and
              // vice versa. Only meaningful for my own outgoing messages.
              const readByOther = !!(mySenderType === 'CUSTOMER' ? item.readByTradieAt : item.readByCustomerAt);
              return (
                <View style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
                  <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                    <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{item.body}</Text>
                    <View style={styles.bubbleMeta}>
                      <Text style={[styles.bubbleTime, mine && styles.bubbleTimeMine]}>{formatTime(item.createdAt)}</Text>
                      {mine && <ReadReceipt read={readByOther} />}
                    </View>
                  </View>
                </View>
              );
            }}
          />
        )}

        {error && <Text style={styles.error}>⚠️ {error}</Text>}

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Type a message…"
            value={draft}
            onChangeText={setDraft}
            multiline
          />
          <Pressable
            style={[styles.sendBtn, (!draft.trim() || send.isPending) && styles.sendBtnDisabled]}
            disabled={!draft.trim() || send.isPending}
            onPress={() => send.mutate(draft.trim())}
          >
            <Text style={styles.sendBtnText}>{send.isPending ? '…' : 'Send'}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  jobBanner: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#EFF6FF', borderBottomWidth: 1, borderBottomColor: '#DBEAFE' },
  jobBannerText: { fontSize: 13, color: '#2563EB', fontWeight: '600' },
  list: { padding: 16, gap: 10 },
  systemBubble: { alignSelf: 'center', backgroundColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 4, maxWidth: '90%' },
  systemText: { fontSize: 13, color: '#334155', textAlign: 'center' },
  bubbleRow: { flexDirection: 'row', marginBottom: 4 },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubbleRowTheirs: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '78%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMine: { backgroundColor: '#16A34A' },
  bubbleTheirs: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0' },
  bubbleText: { fontSize: 15, color: '#1E293B' },
  bubbleTextMine: { color: '#fff' },
  bubbleMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 4 },
  bubbleTime: { fontSize: 11, color: '#94A3B8' },
  bubbleTimeMine: { color: 'rgba(255,255,255,0.75)' },
  ticks: { fontSize: 13, color: 'rgba(255,255,255,0.75)', letterSpacing: -2 },
  ticksRead: { color: '#7DD3FC' },
  error: { color: '#DC2626', fontSize: 13, paddingHorizontal: 16, paddingBottom: 4 },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10, padding: 12,
    borderTopWidth: 1, borderTopColor: '#E2E8F0', backgroundColor: '#fff',
  },
  input: {
    flex: 1, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, maxHeight: 100,
  },
  sendBtn: { backgroundColor: '#16A34A', borderRadius: 20, paddingHorizontal: 18, paddingVertical: 10 },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
