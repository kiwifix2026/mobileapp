import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Platform, Modal } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';

// Native calendar picker for licence expiry — port of the web app's
// <input type="date" min={todayIsoDate()}> (app.js) which already blocks
// picking a past date at the OS-picker level, not just on submit. Mirrors
// that here via `minimumDate`, so a backdated expiry can't even be selected
// in the UI, on top of the existing isPastDate() check that still runs on
// Save & Continue as a second line of defence (e.g. against a stale device
// clock).
type Props = {
  value: string | null; // 'YYYY-MM-DD', same format the backend's Licence.expiry stores
  onChange: (iso: string) => void;
  placeholder?: string;
};

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDisplay(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function LicenceDateField({ value, onChange, placeholder = 'Select expiry date' }: Props) {
  const [open, setOpen] = useState(false);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const parsedValue = value ? new Date(value + 'T00:00:00') : null;
  const current = parsedValue && !isNaN(parsedValue.getTime()) ? parsedValue : today;

  function handleChange(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === 'android') {
      // Android's picker is a one-shot system dialog — it closes itself
      // after a pick or a cancel, so this component just needs to stop
      // rendering it and commit the value if the user actually confirmed
      // (event.type === 'set', not 'dismissed').
      setOpen(false);
      if (event.type === 'set' && selected) onChange(toIso(selected));
      return;
    }
    // iOS's spinner stays open and fires onChange continuously as the user
    // scrolls — commit each change, only close via the explicit Done button.
    if (selected) onChange(toIso(selected));
  }

  return (
    <View>
      <Pressable style={styles.field} onPress={() => setOpen(true)}>
        <Text style={value ? styles.valueText : styles.placeholderText}>
          {value ? formatDisplay(value) : placeholder}
        </Text>
        <Text style={styles.icon}>📅</Text>
      </Pressable>

      {open && Platform.OS === 'android' && (
        <DateTimePicker value={current} mode="date" display="default" minimumDate={today} onChange={handleChange} />
      )}

      {Platform.OS === 'ios' && (
        <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
          <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
            <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
              <DateTimePicker value={current} mode="date" display="spinner" minimumDate={today} onChange={handleChange} themeVariant="light" textColor="#0F172A" style={styles.picker} />
              <Pressable style={styles.doneBtn} onPress={() => setOpen(false)}>
                <Text style={styles.doneBtnText}>Done</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Explicit size + light theme: on a phone in dark mode the spinner drew
  // white text on this white sheet (only the grey selection pill showed).
  picker: { height: 216, alignSelf: 'stretch' },
  field: {
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  valueText: { fontSize: 15, color: '#0F172A', fontWeight: '600' },
  placeholderText: { fontSize: 15, color: '#94A3B8' },
  icon: { fontSize: 16 },
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 24 },
  doneBtn: { alignItems: 'center', paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#F1F5F9', marginHorizontal: 16, marginTop: 4 },
  doneBtnText: { color: '#16A34A', fontWeight: '700', fontSize: 16 },
});
