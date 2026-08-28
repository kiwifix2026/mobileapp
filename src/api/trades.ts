import { apiFetch } from './client';

// The full trade catalog — nothing about "which trades/categories exist" is
// hardcoded anywhere anymore (mobile or web). See ApprovedTradesController
// in kiwifix-backend-jobpost: predefined + admin-approved custom trades
// alike, ordered by featuredOrder then name.
export type ApprovedTrade = {
  name: string;
  icon: string;
  jobLabel: string; // falls back to `name` server-side already
  licenceTier: string | null;
  licenceNote: string | null;
  featuredForTradies: boolean;
  featuredForJobPosters: boolean;
  jobIcon: string | null;
  featuredOrder: number;
  keywords: string[];
  searchOnly: boolean;
};

export function getApprovedTrades() {
  return apiFetch<ApprovedTrade[]>('/approved-trades');
}

export type TradeService = {
  name: string;
  licenceTier: string | null;
  licenceNote: string | null;
  licenceType: string | null;
  keywords: string[];
};

// No ?trade= query — full catalog grouped by trade, same shape
// TradeServicesController.list() returns for that case. Used to build a
// search index so typing a specific service (e.g. "heat pump") surfaces the
// trade that offers it, mirroring the web app's SERVICE_KEYWORD_INDEX.
export function getAllTradeServices() {
  return apiFetch<Record<string, TradeService[]>>('/trade-services');
}
