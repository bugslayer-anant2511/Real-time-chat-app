import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import toast from 'react-hot-toast';

import { useAuth } from './AuthContext.jsx';
import { useSocket } from './SocketContext.jsx';
import { usePreferences } from './PreferencesContext.jsx';
import { useNotificationPermission } from '../hooks/useNotificationPermission.js';
import * as notificationService from '../api/notification.service.js';
import { playNotificationSound } from '../utils/notificationSound.js';
import { NOTIFICATION_BUFFER_SIZE } from '../utils/constants.js';

const NotificationContext = createContext(null);

export const NotificationProvider = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const { subscribeToNotifications } = useSocket();
  const { preferences } = usePreferences();
  const { permission, request: requestPermission } = useNotificationPermission();

  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);

  const activeConversationRef = useRef(activeConversationId);
  const preferencesRef = useRef(preferences);
  const userRef = useRef(user);
  useEffect(() => { activeConversationRef.current = activeConversationId; }, [activeConversationId]);
  useEffect(() => { preferencesRef.current = preferences; }, [preferences]);
  useEffect(() => { userRef.current = user; }, [user]);

  useEffect(() => {
    if (!isAuthenticated) {
      setUnreadCount(0);
      setNotifications([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const result = await notificationService.listNotifications({
          page: 1,
          limit: NOTIFICATION_BUFFER_SIZE,
        });
        if (cancelled) return;
        const items = result?.data?.items ?? [];
        const count = result?.data?.unreadCount ?? 0;
        setNotifications(items);
        setUnreadCount(count);
      } catch {
        // Non-fatal
      }
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const unsubscribe = subscribeToNotifications((payload) => {
      if (!payload) return;

      const conversationId = payload.conversationId ?? payload.notification?.conversationId;
      const fromUser = payload.fromUser ?? payload.notification?.actor;
      const message = payload.message;

      const currentPrefs = preferencesRef.current;
      const currentUser = userRef.current;
      const activeId = activeConversationRef.current;

      if (conversationId && conversationId === activeId) return;

      if (currentPrefs?.notifications?.muteAll) return;
      const mutedList = currentUser?.mutedConversations ?? [];
      if (
        conversationId &&
        mutedList.some((id) => String(id) === String(conversationId))
      ) {
        return;
      }

      let body = message?.text || '';
      if (!body && message?.imageUrl) body = '📷 Photo';
      if (!body) body = 'New message';

      const title = fromUser?.displayName || 'New notification';

      const persisted = payload.notification ?? null;
      let isCollapse = false;
      setNotifications((prev) => {
        if (persisted?._id) {
          const idx = prev.findIndex((n) => n._id === persisted._id);
          if (idx !== -1) {
            isCollapse = true;
            const next = prev.slice();
            next.splice(idx, 1);
            return [persisted, ...next];
          }
          const next = [persisted, ...prev];
          return next.length > NOTIFICATION_BUFFER_SIZE
            ? next.slice(0, NOTIFICATION_BUFFER_SIZE)
            : next;
        }
        const entry = {
          _id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          conversationId,
          actor: fromUser ?? null,
          text: body,
          isRead: false,
          createdAt: new Date().toISOString(),
        };
        const next = [entry, ...prev];
        return next.length > NOTIFICATION_BUFFER_SIZE
          ? next.slice(0, NOTIFICATION_BUFFER_SIZE)
          : next;
      });
      if (!isCollapse) setUnreadCount((prev) => prev + 1);

      toast(`${title}: ${body}`, { icon: '💬' });

      if (currentPrefs?.notifications?.sound) {
        playNotificationSound();
      }

      if (
        currentPrefs?.notifications?.browser &&
        typeof window !== 'undefined' &&
        'Notification' in window &&
        Notification.permission === 'granted' &&
        document.visibilityState !== 'visible'
      ) {
        try {
          const notif = new Notification(title, {
            body,
            icon: fromUser?.avatarUrl || '/favicon.svg',
            tag: conversationId || undefined,
          });
          notif.onclick = () => {
            window.focus();
            notif.close();
          };
        } catch {
          // Permission revoked
        }
      }
    });

    return unsubscribe;
  }, [isAuthenticated, subscribeToNotifications]);

  const markRead = useCallback(async (id) => {
    setNotifications((prev) =>
      prev.map((n) => (n._id === id ? { ...n, isRead: true } : n)),
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
    if (typeof id === 'string' && id.startsWith('local-')) return;
    try {
      await notificationService.markRead(id);
    } catch (error) {
      try {
        const result = await notificationService.getUnreadCount();
        setUnreadCount(result?.data?.count ?? 0);
      } catch { /* ignore */ }
      throw error;
    }
  }, []);

  const markAllRead = useCallback(async () => {
    const previous = unreadCount;
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
    try {
      await notificationService.markAllRead();
    } catch (error) {
      setUnreadCount(previous);
      throw error;
    }
  }, [unreadCount]);

  const dismiss = useCallback(async (id) => {
    let snapshot;
    let wasUnread = false;
    setNotifications((prev) => {
      snapshot = prev;
      const target = prev.find((n) => n._id === id);
      wasUnread = Boolean(target && !target.isRead);
      return prev.filter((n) => n._id !== id);
    });
    if (wasUnread) setUnreadCount((prev) => Math.max(0, prev - 1));
    try {
      await notificationService.dismiss(id);
    } catch (error) {
      setNotifications(snapshot);
      if (wasUnread) setUnreadCount((prev) => prev + 1);
      throw error;
    }
  }, []);

  const value = useMemo(
    () => ({
      unreadCount,
      notifications,
      notificationPermission: permission,
      requestPermission,
      markRead,
      markAllRead,
      dismiss,
      activeConversationId,
      setActiveConversationId,
    }),
    [
      unreadCount,
      notifications,
      permission,
      requestPermission,
      markRead,
      markAllRead,
      dismiss,
      activeConversationId,
    ],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error('useNotifications must be used within a <NotificationProvider>');
  }
  return ctx;
};

export default NotificationContext;
