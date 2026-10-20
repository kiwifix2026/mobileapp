import { useQuery } from '@tanstack/react-query';
import { getCustomerUnreadCount, getKiwifixUnread } from './extras';
import { useAuth } from '../auth/AuthContext';

// Unread counts for a job poster's two inbox feeds — the same two checks
// web's job-poster-dashboard.html runs for its bell/Messages badges
// (/customers/me/messages/unread-count for notifications, and the unread
// total of the pinned KiwiFix thread). Polled so a badge appears without the
// poster having to open anything; cleared by the screens that call the
// open+mark-read endpoints (they invalidate ['customerUnread', email]).
export function useCustomerUnread() {
  const { session } = useAuth();
  const enabled = !!session && session.role === 'customer';

  const { data } = useQuery({
    queryKey: ['customerUnread', session?.email],
    queryFn: async () => {
      const [notif, kf] = await Promise.all([
        getCustomerUnreadCount(session!.token).catch(() => ({ unreadCount: 0 })),
        getKiwifixUnread(session!.token).catch(() => ({ unreadCount: 0, messages: [] })),
      ]);
      return { notifications: Number(notif.unreadCount) || 0, kiwifix: Number(kf.unreadCount) || 0 };
    },
    enabled,
    refetchInterval: 20000,
  });

  // `loaded` lets callers tell "still loading" from a real zero (the device
  // notification hook must not treat the first load as new activity).
  return data ? { ...data, loaded: true } : { notifications: 0, kiwifix: 0, loaded: false };
}
