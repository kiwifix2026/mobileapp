import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Platform, Modal } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';

// Date + time pair for scheduling a job on the tradie calendar — the native
// equivalent of web's <input type="datetime-local"> in tradie-job-view.html /
// tradie-calendar.html. Same Android (one-shot dialog) / iOS (spinner in a
// bottom sheet) handling as LicenceDateField, but with no minimum date
// restriction beyond "today" for the date half.
type Props = {
  value: Date;
  onChange: (next: Date) => void;
  label?: string;
};

function PickerField({
  mode,
  value,
  onChange,
}: {
  mode: 'date' | 'time';
  value: Date;
  onChange: (next: Date) => void;
}) {
  const [open, setOpen] = useState(false);

  const display =
    mode === 'date'
      ? value.toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
      : value.toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' });

  function handleChange(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === 'android') {
      setOpen(false);
      if (event.type === 'set' && selected) onChange(selected);
      return;
    }
    if (selected) onChange(selected);
  }

  return (
    <View style={{ flex: 1 }}>
      <Pressable style={styles.field} onPress={() => setOpen(true)}>
        <Text style={styles.valueText}>{display}</Text>
        <Text style={styles.icon}>{mode === 'date' ? '📅' : '🕐'}</Text>
      </Pressable>

      {open && Platform.OS === 'android' && (
        <DateTimePicker value={value} mode={mode} display="default" onChange={handleChange} />
      )}

      {Platform.OS === 'ios' && (
        <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
          <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
            <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
              <DateTimePicker value={value} mode={mode} display="spinner" onChange={handleChange} themeVariant="light" textColor="#0F172A" style={styles.picker} />
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

export default function DateTimeField({ value, onChange, label }: Props) {
  return (
    <View>
      {!!label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.row}>
        <PickerField mode="date" value={value} onChange={onChange} />
        <PickerField mode="time" value={value} onChange={onChange} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Explicit size + light theme: on a phone in dark mode the spinner drew
  // white text on this white sheet (only the grey selection pill showed).
  picker: { height: 216, alignSelf: 'stretch' },
  label: { fontSize: 13, fontWeight: '700', color: '#334155', marginBottom: 6 },
  row: { flexDirection: 'row', gap: 10 },
  field: {
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, backgroundColor: '#fff',
    paddingHorizontal: 12, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6,
  },
  valueText: { fontSize: 14, color: '#0F172A', fontWeight: '600', flexShrink: 1 },
  icon: { fontSize: 14 },
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 24 },
  doneBtn: { alignItems: 'center', paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#F1F5F9', marginHorizontal: 16, marginTop: 4 },
  doneBtnText: { color: '#16A34A', fontWeight: '700', fontSize: 16 },
});
