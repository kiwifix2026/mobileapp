import { Platform } from 'react-native';
import * as Calendar from 'expo-calendar/legacy';

// Saves an event straight into the phone's own calendar (iCloud/Google/
// Samsung — whichever the person already uses), so the app doesn't need a
// calendar of its own. Asks for calendar permission the first time.
export class CalendarPermissionError extends Error {
  constructor() {
    super('Calendar access was not allowed. Enable it for KiwiFix in your phone settings to add jobs to your calendar.');
  }
}

async function pickWritableCalendarId(): Promise<string> {
  if (Platform.OS === 'ios') {
    const def = await Calendar.getDefaultCalendarAsync();
    if (def?.allowsModifications) return def.id;
  }
  const all = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const writable = all.filter((c) => c.allowsModifications);
  const chosen = writable.find((c) => c.isPrimary) || writable[0];
  if (!chosen) throw new Error('No calendar on this phone can accept new events.');
  return chosen.id;
}

export async function addToPhoneCalendar(input: {
  title: string;
  start: Date;
  end?: Date | null;
  location?: string;
  notes?: string;
}): Promise<string> {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  if (status !== 'granted') throw new CalendarPermissionError();
  const calendarId = await pickWritableCalendarId();
  const end = input.end ?? new Date(input.start.getTime() + 60 * 60 * 1000);
  return Calendar.createEventAsync(calendarId, {
    title: input.title,
    startDate: input.start,
    endDate: end,
    location: input.location || undefined,
    notes: input.notes || undefined,
    alarms: [{ relativeOffset: -60 }],
  });
}
