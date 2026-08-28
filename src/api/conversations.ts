import { apiFetch } from './client';
import type { Conversation, ConversationMessage, ConversationSummary } from './types';

// Real customer<->tradie chat. Two parallel sets of routes on the backend —
// /conversations/* (customer, JwtAuthGuard) and /tradies/:email/conversations/*
// (tradie, TradieAuthGuard) — see ConversationsController and the chat block
// in TradiesController. Every function below takes the caller's role
// explicitly so the screens can stay role-agnostic.

export type ChatRole = 'customer' | 'tradie';

function basePath(role: ChatRole, tradieEmail?: string): string {
  if (role === 'customer') return '/conversations';
  return `/tradies/${encodeURIComponent(tradieEmail!)}/conversations`;
}

export function listConversations(role: ChatRole, token: string, tradieEmail?: string) {
  return apiFetch<ConversationSummary[]>(basePath(role, tradieEmail), { token });
}

export function getConversationsUnreadCount(role: ChatRole, token: string, tradieEmail?: string) {
  return apiFetch<number>(`${basePath(role, tradieEmail)}/unread-count`, { token });
}

// Job poster starting (or resuming) a thread with a specific tradie about a
// job — body shape differs slightly per role since the tradie side already
// knows who it is from the :email path param.
export function startConversation(
  role: ChatRole,
  token: string,
  jobId: string,
  opts: { tradieId?: string; tradieEmail?: string },
) {
  if (role === 'customer') {
    return apiFetch<Conversation>('/conversations/start', {
      method: 'POST',
      token,
      body: { jobId, tradieId: opts.tradieId },
    });
  }
  return apiFetch<Conversation>(`/tradies/${encodeURIComponent(opts.tradieEmail!)}/conversations/start`, {
    method: 'POST',
    token,
    body: { jobId },
  });
}

export function getConversationMessages(role: ChatRole, token: string, conversationId: string, tradieEmail?: string) {
  return apiFetch<ConversationMessage[]>(`${basePath(role, tradieEmail)}/${conversationId}/messages`, { token });
}

export function sendConversationMessage(
  role: ChatRole,
  token: string,
  conversationId: string,
  body: string,
  tradieEmail?: string,
) {
  return apiFetch<ConversationMessage>(`${basePath(role, tradieEmail)}/${conversationId}/messages`, {
    method: 'POST',
    token,
    body: { body },
  });
}

// Fetches the thread AND marks it read in one call — mirrors what the web
// app's messages.html / tradie-messages.html do on open (see
// ConversationsService.openConversation).
export function openConversation(role: ChatRole, token: string, conversationId: string, tradieEmail?: string) {
  return apiFetch<{ conversation: Conversation; messages: ConversationMessage[] }>(
    `${basePath(role, tradieEmail)}/${conversationId}/open`,
    { method: 'POST', token },
  );
}

// "Delete for me" — only hides it from this side's own inbox; see
// ConversationsService.deleteConversation.
export function deleteConversation(role: ChatRole, token: string, conversationId: string, tradieEmail?: string) {
  return apiFetch<{ ok: boolean; permanentlyDeleted: boolean }>(
    `${basePath(role, tradieEmail)}/${conversationId}/delete`,
    { method: 'POST', token },
  );
}
