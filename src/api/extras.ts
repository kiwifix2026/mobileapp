import { apiFetch } from './client';
import type { Job } from './types';

// Endpoints the web app already uses that the mobile app was missing —
// saved jobs, tradie calendar, poster profile (/customers/me) and the
// poster's KiwiFix/notification inbox. All of these exist on the backend
// today (SavedJobsController, CalendarController, CustomersController);
// nothing here needs a backend change.

// --- Saved jobs (tradie) — mirrors tradie-dashboard.html's toggleSaveJob() ---

export type SavedJob = Job & { savedAt: string };

export function listSavedJobs(token: string, email: string) {
  return apiFetch<SavedJob[]>(`/tradies/${encodeURIComponent(email)}/saved-jobs`, { token });
}

export function saveJob(token: string, email: string, jobId: string) {
  return apiFetch<{ saved: boolean }>(`/tradies/${encodeURIComponent(email)}/saved-jobs`, {
    method: 'POST',
    token,
    body: { jobId },
  });
}

export function unsaveJob(token: string, email: string, jobId: string) {
  return apiFetch<{ saved: boolean }>(
    `/tradies/${encodeURIComponent(email)}/saved-jobs/${encodeURIComponent(jobId)}`,
    { method: 'DELETE', token },
  );
}

// --- Calendar (tradie) — mirrors tradie-calendar.html / tradie-job-view.html ---

export type CalendarEvent = {
  id: string;
  tradieId: string;
  jobId: string;
  title: string;
  description: string;
  location?: string | null;
  customerName?: string | null;
  notes?: string | null;
  startAt: string;
  endAt?: string | null;
};

export function listCalendarEvents(token: string, email: string) {
  return apiFetch<CalendarEvent[]>(`/tradies/${encodeURIComponent(email)}/calendar`, { token });
}

export function createCalendarEvent(
  token: string,
  email: string,
  input: { jobId: string; startAt: string; endAt?: string; notes?: string },
) {
  return apiFetch<CalendarEvent>(`/tradies/${encodeURIComponent(email)}/calendar`, {
    method: 'POST',
    token,
    body: input,
  });
}

export function updateCalendarEvent(
  token: string,
  email: string,
  id: string,
  input: { startAt?: string; endAt?: string | null; notes?: string | null },
) {
  return apiFetch<CalendarEvent>(`/tradies/${encodeURIComponent(email)}/calendar/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    token,
    body: input,
  });
}

export function deleteCalendarEvent(token: string, email: string, id: string) {
  return apiFetch<unknown>(`/tradies/${encodeURIComponent(email)}/calendar/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    token,
  });
}

// --- Job poster profile — mirrors profile.html (GET/PATCH /customers/me) ---

export type CustomerProfile = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  mobile?: string | null;
  landline?: string | null;
  photoUrl?: string | null;
  address?: string | null;
  region?: string | null;
  city?: string | null;
  suburb?: string | null;
  unitNum?: string | null;
  gateCode?: string | null;
  parking?: string | null;
};

export function getMyCustomerProfile(token: string) {
  return apiFetch<CustomerProfile>('/customers/me', { token });
}

export type UpdateCustomerInput = Partial<Omit<CustomerProfile, 'id' | 'email'>>;

export function updateMyCustomerProfile(token: string, input: UpdateCustomerInput) {
  return apiFetch<CustomerProfile>('/customers/me', { method: 'PATCH', token, body: input });
}

// --- Job poster inbox — mirrors messages.html / job-poster-dashboard.html ---
// Two separate feeds on the backend: regular notifications (e.g. a tradie
// applied) and the pinned read-only "KiwiFix" team thread.

export type CustomerMessage = {
  id: string;
  body: string;
  fromKiwiFix?: boolean | null;
  readAt?: string | null;
  createdAt: string;
};

export function getCustomerUnreadCount(token: string) {
  return apiFetch<{ unreadCount: number }>('/customers/me/messages/unread-count', { token });
}

// Fetches AND marks read in one request (same reasoning as the tradie side).
export function openCustomerNotifications(token: string) {
  return apiFetch<{ messages: CustomerMessage[]; unreadCount: number }>('/customers/me/messages/open', {
    method: 'POST',
    token,
  });
}

export function getKiwifixUnread(token: string) {
  return apiFetch<{ messages: CustomerMessage[]; unreadCount: number }>('/customers/me/messages/kiwifix', { token });
}

export function openKiwifixMessages(token: string) {
  return apiFetch<{ messages: CustomerMessage[]; unreadCount: number }>('/customers/me/messages/kiwifix/open', {
    method: 'POST',
    token,
  });
}

// --- Delete a posted job (poster) — web's deleteJob() ---

export function deleteJob(token: string, jobId: string) {
  return apiFetch<unknown>(`/jobs/${jobId}`, { method: 'DELETE', token });
}
