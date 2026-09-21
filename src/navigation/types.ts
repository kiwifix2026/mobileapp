import type { Role } from '../auth/AuthContext';

export type AuthStackParamList = {
  RoleSelect: undefined;
  EmailEntry: { role: Role };
  Otp: { role: Role; email: string };
  // New-tradie signup branch — reached from EmailEntry when
  // sendTradieLoginOtp comes back "No tradie account found for this email"
  // instead of dead-ending on that error.
  TradieVerifyOtp: { email: string };
  TradieOnboarding: { email: string };
};

// Shared by both PosterStackParamList and TradieStackParamList — the
// ConversationsList/ChatThread screens are role-agnostic (see
// src/screens/shared) and read the caller's role off useAuth() rather than
// a route param.
export type ChatStackParams = {
  Conversations: undefined;
  ChatThread: { conversationId: string; jobCategory: string; counterpartName: string };
};

// One flat param-list type shared by every nested Stack.Navigator inside
// PosterNavigator's bottom tabs — a screen's route/param shape doesn't
// change depending on which tab pushed it, so screens keep importing this
// one type regardless of which tab-stack they're actually registered in.
// Each tab's Stack.Navigator only registers the subset of these screens it
// needs (see PosterNavigator.tsx) — "Home" and "MyJobs" are two different
// screens (dashboard vs full posted-jobs list) so both tabs can have their
// own root while still being able to push shared destinations like
// JobDetail/PostJob/ChatThread from either one.
export type PosterStackParamList = {
  Home: undefined;
  MyJobs: undefined;
  PostJob: undefined;
  JobDetail: { jobId: string };
  EditJob: { jobId: string };
  Profile: undefined;
} & ChatStackParams;

export type PosterTabParamList = {
  HomeTab: undefined;
  JobsTab: undefined;
  MessagesTab: undefined;
  ProfileTab: undefined;
};

// Same flat-shared-type approach as PosterStackParamList above, for
// TradieNavigator's bottom tabs.
export type TradieStackParamList = {
  BrowseJobs: undefined;
  TradieJobDetail: { jobId: string };
  // Optional filter mirrors web's tradie-jobs.html?type=active|completed —
  // reached by tapping the "Active Jobs"/"Jobs Completed" stat cards on the
  // dashboard. Omitted (plain navigation from the Jobs tab) shows everything,
  // same as before.
  MyApplications: { filter?: 'active' | 'completed' } | undefined;
  TradieJobInvites: undefined;
  Notifications: undefined;
  EditProfile: undefined;
  ViewProfile: undefined;
  ProfileMenu: undefined;
} & ChatStackParams;

export type TradieTabParamList = {
  HomeTab: undefined;
  JobsTab: undefined;
  MessagesTab: undefined;
  ProfileTab: undefined;
};
