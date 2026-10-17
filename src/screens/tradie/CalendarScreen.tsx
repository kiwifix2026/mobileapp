import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet, SafeAreaView, ActivityIndicator, Modal, TextInput, Alert,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TradieStackParamList } from '../../navigation/types';
import {
  listCalendarEvents, updateCalendarEvent, deleteCalendarEvent, type CalendarEvent,
} from '../../api/extras';
import { ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import ScreenBackground from '../../components/ScreenBackground';
import DateTimeField from '../../components/DateTimeField';

type Props = NativeStackScreenProps<TradieStackParamList, 'Calendar'>;

function formatRange(ev: CalendarEvent): string {
  const start = new Date(ev.startAt);
  const date = start.toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const t = (d: Date) => d.toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' });
  return ev.endAt ? `${date} · ${t(start)} – ${t(new Date(ev.endAt))}` : `${date} · ${t(start)}`;
}

// Port of tradie-calendar.html — the tradie's own schedule of accepted jobs
// they've added to their calendar (see "Add to calendar" on a job), with
// reschedule/notes edit and remove, exactly the operations the web page has.
export default function CalendarScreen({ navigation }: Props) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const tabBarHeight = useBottomTabBarHeight();
  const email = session!.email;

  const { data: events, isLoading, refetch } = useQuery({
    queryKey: ['calendarEvents', email],
    queryFn: () => listCalendarEvents(session!.token, email),
  });
  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const sorted = [...(events || [])].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
    return {
      upcoming: sorted.filter((e) => new Date(e.endAt || e.startAt).getTime() >= now),
      past: sorted.filter((e) => new Date(e.endAt || e.startAt).getTime() < now).reverse(),
    };
  }, [events]);

  // Edit modal state
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [startAt, setStartAt] = useState(new Date());
  const [endAt, setEndAt] = useState<Date | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  function openEdit(ev: CalendarEvent) {
    setEditing(ev);
    setStartAt(new Date(ev.startAt));
    setEndAt(ev.endAt ? new Date(ev.endAt) : null);
    setNotes(ev.notes || '');
    setError(null);
  }

  const save = useMutation({
    mutationFn: () =>
      updateCalendarEvent(session!.token, email, editing!.id, {
        startAt: startAt.toISOString(),
        endAt: endAt ? endAt.toISOString() : null,
        notes: notes.trim() || null,
      }),
    onSuccess: () => {
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ['calendarEvents', email] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not save changes.'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteCalendarEvent(session!.token, email, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['calendarEvents', email] }),
    onError: (err) => Alert.alert('Could not remove event', err instanceof ApiError ? err.message : 'Please try again.'),
  });

  function confirmRemove(ev: CalendarEvent) {
    Alert.alert('Remove from calendar', 'Remove this job from your calendar? The job itself is not affected.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => remove.mutate(ev.id) },
    ]);
  }

  const renderEvent = (ev: CalendarEvent, dim?: boolean) => (
    <View key={ev.id} style={[styles.card, dim && styles.cardDim]}>
      <Pressable onPress={() => navigation.navigate('TradieJobDetail', { jobId: ev.jobId })}>
        <Text style={styles.title}>{ev.title}</Text>
      </Pressable>
      <Text style={styles.when}>🗓 {formatRange(ev)}</Text>
      {!!ev.customerName && <Text style={styles.meta}>👤 {ev.customerName}</Text>}
      {!!ev.location && <Text style={styles.meta}>📍 {ev.location}</Text>}
      {!!ev.notes && <Text style={styles.notes}>📝 {ev.notes}</Text>}
      <View style={styles.actions}>
        <Pressable style={styles.actionBtn} onPress={() => openEdit(ev)}>
          <Text style={styles.actionText}>Edit</Text>
        </Pressable>
        <Pressable style={[styles.actionBtn, styles.removeBtn]} onPress={() => confirmRemove(ev)}>
          <Text style={[styles.actionText, styles.removeText]}>Remove</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safe}>
        {isLoading ? (
          <ActivityIndicator style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={[{ key: 'content' }]}
            keyExtractor={(i) => i.key}
            contentContainerStyle={[styles.list, { paddingBottom: tabBarHeight + 20 }]}
            renderItem={() => (
              <View>
                <Text style={styles.sectionTitle}>📅 Your schedule</Text>
                {!upcoming.length && (
                  <Text style={styles.empty}>
                    Nothing scheduled yet. Open an accepted job and tap "Add to calendar".
                  </Text>
                )}
                {upcoming.map((e) => renderEvent(e))}
                {!!past.length && (
                  <View>
                    <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Past</Text>
                    {past.map((e) => renderEvent(e, true))}
                  </View>
                )}
              </View>
            )}
          />
        )}

        <Modal visible={!!editing} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
          <View style={styles.overlay}>
            <View style={styles.sheet}>
              <Text style={styles.sheetTitle}>Edit event</Text>
              <DateTimeField label="Starts" value={startAt} onChange={setStartAt} />
              <View style={{ height: 12 }} />
              {endAt ? (
                <View>
                  <DateTimeField label="Ends" value={endAt} onChange={setEndAt} />
                  <Pressable onPress={() => setEndAt(null)}>
                    <Text style={styles.link}>Remove end time</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable onPress={() => setEndAt(new Date(startAt.getTime() + 60 * 60 * 1000))}>
                  <Text style={styles.link}>+ Add end time</Text>
                </Pressable>
              )}
              <Text style={[styles.label, { marginTop: 12 }]}>Notes</Text>
              <TextInput
                style={styles.textarea}
                value={notes}
                onChangeText={setNotes}
                multiline
                placeholder="Anything to remember for this job"
              />
              {error && <Text style={styles.error}>⚠️ {error}</Text>}
              <View style={styles.sheetActions}>
                <Pressable style={[styles.sheetBtn, styles.sheetCancel]} onPress={() => setEditing(null)}>
                  <Text style={styles.sheetCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.sheetBtn, styles.sheetSave, save.isPending && { opacity: 0.5 }]}
                  disabled={save.isPending}
                  onPress={() => save.mutate()}
                >
                  <Text style={styles.sheetSaveText}>{save.isPending ? 'Saving…' : 'Save'}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  list: { padding: 16, paddingTop: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#14251B', marginBottom: 10 },
  empty: { fontSize: 14, color: '#475569', fontWeight: '500', marginBottom: 12, lineHeight: 20 },
  card: {
    backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 16, padding: 16, marginBottom: 10,
    shadowColor: '#0F172A', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  cardDim: { opacity: 0.7 },
  title: { fontSize: 16, fontWeight: '800', color: '#14251B' },
  when: { fontSize: 14, color: '#16A34A', fontWeight: '700', marginTop: 6 },
  meta: { fontSize: 13, color: '#475569', marginTop: 4 },
  notes: { fontSize: 13, color: '#334155', marginTop: 6 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  actionBtn: { borderWidth: 1, borderColor: '#BBF7D0', backgroundColor: '#F0FDF4', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 },
  actionText: { color: '#16A34A', fontWeight: '700', fontSize: 13 },
  removeBtn: { borderColor: '#FECACA', backgroundColor: '#FEF2F2' },
  removeText: { color: '#DC2626' },
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 },
  sheetTitle: { fontSize: 18, fontWeight: '800', marginBottom: 14, color: '#14251B' },
  label: { fontSize: 13, fontWeight: '700', color: '#334155', marginBottom: 6 },
  link: { color: '#2563EB', fontWeight: '600', fontSize: 13, marginTop: 8 },
  textarea: {
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, minHeight: 70, textAlignVertical: 'top',
  },
  error: { color: '#DC2626', fontSize: 13, marginTop: 10 },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  sheetBtn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  sheetCancel: { backgroundColor: '#F1F5F9' },
  sheetCancelText: { color: '#475569', fontWeight: '700' },
  sheetSave: { backgroundColor: '#16A34A' },
  sheetSaveText: { color: '#fff', fontWeight: '700' },
});
