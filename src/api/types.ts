// Shapes mirrored from the backend's actual response payloads (see
// AuthService.verifyOtp / verifyTradieLoginOtp, JobsService, etc. in
// kiwifix-backend-jobpost). Kept intentionally loose/partial rather than
// a full 1:1 Prisma model copy — the app only needs what it actually reads.

export type Customer = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  mobile?: string | null;
  country?: string | null;
};

export type Tradie = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  mobile?: string | null;
  businessName?: string | null;
  businessType?: string | null;
  nzbn?: string | null;
  address?: string | null;
  driverLicenceUrl?: string | null;
  workingDays?: string[];
  startTime?: string | null;
  endTime?: string | null;
  acceptsEmergency?: boolean;
  bio?: string | null;
  trades?: string[];
  photoUrl?: string | null;
  insuranceCertUrl?: string | null;
  approvalStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
  // Set via POST /tradies/:email/dismiss-approval-banner (TradiesService.
  // dismissApprovalBanner) once the tradie closes the approval-status
  // banner — records WHICH status it was dismissed for, so the banner
  // reappears the moment approvalStatus actually changes to something new
  // (pending → approved, approved → a later rejection, etc.) rather than
  // staying suppressed forever. Same field web's tradie-dashboard.html
  // reads for this exact purpose.
  approvalBannerDismissedForStatus?: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
  // Region/areas picker fields — `areas[0]` is what TradiesController's own
  // loadRealAreaJobs()-equivalent logic uses as the "nearby" suburb filter.
  // See TradiesService.findMatching for the same near/far split job-side.
  region?: string | null;
  areas?: string[];
  createdAt?: string;
  // Present only on GET /tradies (the job poster's matching-tradies search,
  // see TradiesService.findMatching) — true if this tradie's service area
  // overlaps the job's region/suburb. Absent on GET /tradies/:email.
  nearby?: boolean;
  // CORRECTED 2026-08-25 (was previously documented here as relation tables
  // needing an `include` that findByEmail/findMatching skip — that was
  // wrong). `licences`, `serviceAreas`, `services`, `teamMembers`, and
  // `portfolioItems` are all Prisma MongoDB *composite types* (`type X {...}`
  // in schema.prisma), not real `@relation` tables — composite types are
  // embedded directly in the Tradie document and come back on every plain
  // `findUnique`/`findMany` with no `include` needed. So GET /tradies/:email
  // DOES return all of these; they're just not currently READ into this
  // mobile app's own screens for most of them (EditProfileScreen still
  // avoids ROUND-TRIPPING licences/services/teamMembers on SAVE — seeing a
  // value here is safe, sending an edited one back is a separate question,
  // see kiwifix_never_delete_on_edit memory). See kiwifix_tradie_relation_fields_not_returned memory for the full correction.
  serviceAreas?: { region: string; district?: string; area: string }[];
  licences?: { label: string; number?: string; expiry?: string; documentUrl?: string }[];
  services?: { name: string; trade?: string; reviewStatus?: string }[];
  hasTeam?: boolean;
  teamMembers?: { firstName: string; lastName?: string; trades?: string[] }[];
  portfolioItems?: { photoUrl: string; caption?: string }[];
};

export type Job = {
  id: string;
  customerId: string;
  category: string;
  problem?: string | null;
  description: string;
  region?: string | null;
  city?: string | null;
  suburb?: string | null;
  address?: string | null;
  urgency?: string | null;
  // Real schema field (Job.contact) — a preferred-contact-method free text
  // ('Phone Call'/'Text Message'/'Email' by convention, same options web's
  // job-detail.html edit form offers). PostJobScreen never collects this on
  // create, so it's usually empty until set via EditJobScreen.
  contact?: string | null;
  status: 'OPEN' | 'MATCHED' | 'COMPLETED' | 'CANCELLED';
  photos?: string[];
  createdAt: string;
  assignedTradieId?: string | null;
  // Present on JobsController's findAll (job poster's My Jobs list) — a
  // computed Prisma relation count, not a stored field. See JobsService.findAllForCustomer.
  applicantsCount?: number;
  // Present on jobs-matching responses (findMatchingForTradie/findOneForTradie)
  // — whether this job's region/suburb overlaps one of the browsing tradie's
  // service areas. Absent on the job-poster-facing /jobs routes.
  nearby?: boolean;
  // Present on jobs-matching responses when a tradieEmail was supplied —
  // null if this tradie hasn't applied. See JobsService.findMatchingForTradie/findOneForTradie.
  myApplicationStatus?: 'pending' | 'accepted' | 'declined' | null;
  // Only present once THIS tradie's application on this job is ACCEPTED
  // (see buildAcceptedJobView in jobs.service.ts) — full job poster name,
  // and mobile number ONLY if the job poster agreed to share it via an
  // invite's shareContact flag.
  customerName?: string | null;
  customerMobile?: string | null;
};

export type JobApplication = {
  id: string;
  // Only actually present on the job-poster-side JobsService.listApplicants
  // response (raw Prisma JobApplication records). The tradie-side
  // JobApplicationsService.listForTradie response (MyApplicationsScreen)
  // remaps into { id, status, message, createdAt, job } and never sends a
  // top-level jobId — use `job.id` there instead. Confirmed 2026-08-25
  // after item.jobId being undefined on the tradie side caused a silent
  // "Job not found." when tapping into My Applications.
  jobId: string;
  tradieId: string;
  message?: string | null;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED';
  createdAt: string;
  // Present on the tradie-facing list once a job poster reveals contact
  // details post-acceptance (see JobApplicationsService.listForTradie).
  job?: Job;
  // Present on JobsController's listApplicants (job-poster side) — true if
  // this applicant was ever sent a job-poster invite for this job, distinct
  // from applying on their own. See JobsService.listApplicants.
  wasInvited?: boolean;
  // Present on the job-poster's listApplicants view — the applicant's real
  // tradie profile (name/business/trades/photo), included so the poster can
  // decide who to hire. See JobsService.listApplicants's `include: { tradie: true }`.
  tradie?: Tradie;
};

// --- Real customer<->tradie chat (Conversations) ---
// See ConversationsService in kiwifix-backend-jobpost for the source of
// truth for all of these shapes.

export type ConversationSenderType = 'CUSTOMER' | 'TRADIE' | 'SYSTEM';

export type ConversationMessage = {
  id: string;
  conversationId: string;
  senderType: ConversationSenderType;
  body: string;
  createdAt: string;
  readByCustomerAt?: string | null;
  readByTradieAt?: string | null;
};

// One row from GET /conversations or GET /tradies/:email/conversations —
// enriched with job/customer/tradie preview fields + last message + unread
// count, so the inbox list can render without a request per row. See
// ConversationsService.listConversations.
export type ConversationSummary = {
  id: string;
  jobId: string;
  job: {
    id: string;
    category: string;
    suburb?: string | null;
    region?: string | null;
    status: Job['status'];
  };
  customer: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    photoUrl?: string | null;
  };
  tradie: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    businessName?: string | null;
    photoUrl?: string | null;
  };
  lastMessage: { body: string; createdAt: string; senderType: ConversationSenderType } | null;
  unreadCount: number;
  updatedAt: string;
};

// Raw Conversation row — returned by POST .../conversations/start and as
// the `conversation` field of POST .../conversations/:id/open. No
// job/customer/tradie relations included (unlike ConversationSummary above).
export type Conversation = {
  id: string;
  jobId: string;
  customerId: string;
  tradieId: string;
  createdAt: string;
  updatedAt: string;
  deletedByCustomerAt?: string | null;
  deletedByTradieAt?: string | null;
};

export type SendOtpResponse = {
  sent: boolean;
  isExistingCustomer?: boolean;
  firstName?: string | null;
  lastName?: string | null;
  expiresInMinutes: number;
  devCode?: string; // only present when no real mail provider is configured server-side
};

export type VerifyCustomerOtpResponse = {
  accessToken: string;
  customer: Customer;
};

export type VerifyTradieLoginOtpResponse = {
  accessToken: string;
  tradie: Tradie;
};
