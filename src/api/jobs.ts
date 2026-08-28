import { apiFetch } from './client';
import type { Job, JobApplication } from './types';

// --- Job poster side (JwtAuthGuard — customer Bearer token required) ---

export type CreateJobInput = {
  category: string;
  description: string;
  problem?: string;
  region?: string;
  city?: string;
  suburb?: string;
  address?: string;
  urgency?: string;
  photos?: string[];
  // A job-poster-typed category that isn't already in the trade catalog —
  // queued for admin review (see JobsService.submitCustomOtherServices).
  // Safe to always send when the "type your own" path was used; the
  // backend silently no-ops if it turns out to already be a known trade.
  customOtherServices?: string[];
};

export function createJob(token: string, input: CreateJobInput) {
  return apiFetch<Job>('/jobs', { method: 'POST', token, body: input });
}

export function listMyJobs(token: string) {
  return apiFetch<Job[]>('/jobs', { token });
}

export function getMyJob(token: string, jobId: string) {
  return apiFetch<Job>(`/jobs/${jobId}`, { token });
}

export function listApplicants(token: string, jobId: string) {
  return apiFetch<JobApplication[]>(`/jobs/${jobId}/applicants`, { token });
}

export function acceptApplicant(token: string, jobId: string, applicationId: string) {
  return apiFetch<JobApplication[]>(`/jobs/${jobId}/applicants/${applicationId}/accept`, {
    method: 'PATCH',
    token,
  });
}

export function declineApplicant(token: string, jobId: string, applicationId: string) {
  return apiFetch<JobApplication[]>(`/jobs/${jobId}/applicants/${applicationId}/decline`, {
    method: 'PATCH',
    token,
  });
}

// Job poster marking a MATCHED job as done. Backend rejects this unless the
// job currently has an accepted tradie (see JobsService.complete).
export function completeJob(token: string, jobId: string) {
  return apiFetch<Job>(`/jobs/${jobId}/complete`, { method: 'PATCH', token });
}

// Job poster proactively reaching out to a tradie who hasn't applied yet —
// sends them a TradieMessage notification (see JobsService.inviteTradie),
// same system admin uses. `shareContact` controls whether this poster's
// phone/exact address get revealed to the tradie if they go on to accept —
// see buildAcceptedJobView on the backend for exactly what it unlocks.
export function inviteTradie(token: string, jobId: string, tradieId: string, shareContact: boolean) {
  return apiFetch<{ ok: boolean }>(`/jobs/${jobId}/invite`, {
    method: 'POST',
    token,
    body: { tradieId, shareContact },
  });
}

// --- Tradie side ---

// Not JWT-guarded on the backend (see JobsMatchingController) — mirrors
// the web tradie-dashboard's own browsing call.
export function findMatchingJobs(params: { category?: string; region?: string; suburb?: string; tradieEmail?: string }) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, v]) => !!v) as [string, string][],
  ).toString();
  return apiFetch<Job[]>(`/jobs-matching${query ? `?${query}` : ''}`);
}

export function getMatchingJob(jobId: string, tradieEmail?: string) {
  const query = tradieEmail ? `?tradieEmail=${encodeURIComponent(tradieEmail)}` : '';
  return apiFetch<Job>(`/jobs-matching/${jobId}${query}`);
}

// TradieAuthGuard-protected — tradie Bearer token required.
export function applyToJob(token: string, jobId: string, tradieEmail: string, message?: string) {
  return apiFetch<JobApplication>(`/jobs/${jobId}/apply`, {
    method: 'POST',
    token,
    body: { tradieEmail, message },
  });
}

export function listMyApplications(token: string, tradieEmail: string) {
  return apiFetch<JobApplication[]>(`/tradies/${encodeURIComponent(tradieEmail)}/applications`, { token });
}
