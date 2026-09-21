import { apiFetch } from './client';
import type { Tradie } from './types';

// Public pre-login existence check / self-profile lookup — see
// TradiesController.findByEmail. Used here purely to get this tradie's own
// `trades`/region/areas so BrowseJobsScreen can filter jobs-matching by
// their actual trades, mirroring tradie-dashboard.html's
// hydrateTradeCategoryMap()/loadRealAreaJobs().
export function getTradieByEmail(email: string) {
  return apiFetch<Tradie>(`/tradies/${encodeURIComponent(email)}`);
}

// Persists that this tradie has closed the approval-status banner for
// their CURRENT approvalStatus — see TradiesService.dismissApprovalBanner
// and the approvalBannerDismissedForStatus field comment on the Tradie
// type. TradieAuthGuard-protected with a self-only check server-side, same
// as every other tradie-private route.
export function dismissApprovalBanner(token: string, email: string) {
  return apiFetch<Tradie>(`/tradies/${encodeURIComponent(email)}/dismiss-approval-banner`, {
    method: 'POST',
    token,
  });
}

// Job poster's "Tradies for X" search on a job's detail screen — mirrors
// job-detail.html's loadMatchingTradies(). `trade` must be the real trade
// NAME (Tradie.trades element), not the job-facing category label — the
// backend does an exact `{ has: trade }` array match (see
// TradiesService.findMatching), so callers need to translate the job's
// category through the approved-trades jobLabel->name map first (same as
// PostJobScreen does the other direction when building the category grid).
export function listMatchingTradies(params: { trade?: string; region?: string; suburb?: string }) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, v]) => !!v) as [string, string][],
  ).toString();
  return apiFetch<Tradie[]>(`/tradies${query ? `?${query}` : ''}`);
}

// Mirrors UpsertTradieDto's TeamMemberDto/ServiceAreaDto/LicenceDto/ServiceDto
// exactly — see upsert-tradie.dto.ts. Kept as separate named types (rather
// than inlined) since the onboarding wizard's Business/Areas/Licence/Services
// steps each build one of these arrays independently.
export type TeamMember = { firstName: string; lastName?: string; trades?: string[] };
export type ServiceArea = { region: string; district: string; area: string };
export type Licence = { label: string; number?: string; expiry?: string; documentUrl?: string };
export type PortfolioItem = { photoUrl: string; caption?: string };
export type TradieService = {
  trade?: string;
  name: string;
  custom?: boolean;
  tier?: string | null;
  uploaded?: boolean;
  qualificationDeclared?: boolean;
  reviewStatus?: string;
};

export type UpsertTradieInput = {
  email: string;
  firstName?: string;
  lastName?: string;
  mobile?: string;
  businessName?: string;
  businessType?: string;
  photoUrl?: string;
  driverLicenceUrl?: string;
  insuranceCertUrl?: string;
  address?: string;
  nzbn?: string;
  hasTeam?: boolean;
  teamMembers?: TeamMember[];
  region?: string;
  areas?: string[];
  trades?: string[];
  serviceAreas?: ServiceArea[];
  licences?: Licence[];
  services?: TradieService[];
  customTrades?: TradieService[];
  workingDays?: string[];
  startTime?: string;
  endTime?: string;
  acceptsEmergency?: boolean;
  bio?: string;
  portfolioItems?: PortfolioItem[];
};

// POST /tradies — see UpsertTradieDto: only `email` is actually required
// server-side, everything else is optional. This now sends the FULL payload
// shape the web app's 7-step wizard builds (see
// kiwifix_mobile_app_backend_alignment memory + tradie onboarding rebuild) —
// years-of-experience/website/GST-toggle fields from the web UI are
// deliberately still omitted here since they're cosmetic-only on the web
// side too (never in UpsertTradieDto, never persisted). The backend hands
// back a real tradie accessToken in the same response on first create, per
// TradiesController.upsert's own comment, so no separate login step is
// needed right after signing up.
export function upsertTradie(input: UpsertTradieInput) {
  return apiFetch<Tradie & { accessToken: string }>('/tradies', { method: 'POST', body: input });
}

// Admin-to-tradie notices (approval notes, "please upload your licence",
// job-cancelled notices, job invites) — see TradieMessage in schema.prisma.
// Distinct from Conversations (customer<->tradie chat); this is the only
// place a rejected tradie can see WHY (admin's note), and the only place
// job invites show up as anything other than a regular matching job.
export type TradieMessage = {
  id: string;
  tradieId: string;
  body: string;
  readAt?: string | null;
  createdAt: string;
  jobId?: string | null;
  shareContact?: boolean | null;
};

export function listTradieMessages(token: string, email: string) {
  return apiFetch<{ messages: TradieMessage[]; unreadCount: number }>(
    `/tradies/${encodeURIComponent(email)}/messages`,
    { token },
  );
}

// Fetches AND marks everything read in one request — same open+read
// pattern as conversations.openConversation, for the same reason (a
// separate fire-and-forget mark-read call can silently fail and leave the
// badge stuck).
export function openTradieMessages(token: string, email: string) {
  return apiFetch<{ messages: TradieMessage[]; unreadCount: number }>(
    `/tradies/${encodeURIComponent(email)}/messages/open`,
    { method: 'POST', token },
  );
}

// --- Job invites ("Tradies for X" from the poster's side, this is the
// tradie's own inbox of jobs a poster specifically invited them to) ---
// Mirrors web's tradie-job-invites.html — see TradiesService.listInvites.
// Distinct from a plain TradieMessage notification (which also gets sent
// alongside every invite, see JobsService.inviteTradie): this is a real,
// filtered, job-shaped list (redactJobForTradie + invitedAt/myApplicationStatus/
// invitedRead), scoped to jobs still OPEN — matched/completed/cancelled jobs
// drop off automatically even if the original invite message still exists.
export type TradieInvite = {
  id: string;
  category: string;
  problem?: string | null;
  description: string;
  region?: string | null;
  city?: string | null;
  suburb?: string | null;
  urgency?: string | null;
  matchedServices?: string[];
  otherServices?: string[];
  photos?: string[];
  status: 'OPEN' | 'MATCHED' | 'COMPLETED' | 'CANCELLED';
  createdAt: string;
  invitedAt: string;
  myApplicationStatus?: 'pending' | 'accepted' | 'declined' | null;
  invitedRead: boolean;
};

export function listTradieInvites(token: string, email: string) {
  return apiFetch<TradieInvite[]>(`/tradies/${encodeURIComponent(email)}/invites`, { token });
}

// Accepting an invite is just the normal apply flow (see applyToJob in
// jobs.ts) — JobApplicationsService.apply() auto-detects an existing invite
// server-side and accepts straight to MATCHED, no separate accept endpoint.
// This one only clears the "new invite" badge state for a single job.
export function markInviteRead(token: string, email: string, jobId: string) {
  return apiFetch<{ ok: boolean; updated: number }>(
    `/tradies/${encodeURIComponent(email)}/invites/${jobId}/read`,
    { method: 'POST', token },
  );
}
