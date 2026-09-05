import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';

import { useAuth } from './AuthContext.jsx';

const SocketContext = createContext(null);

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL;

const setWith = (prev, value) => {
  const next = new Set(prev);
  next.add(value);
  return next;
};
const setWithout = (prev, value) => {
  const next = new Set(prev);
  next.delete(value);
  return next;
};

export const SocketProvider = ({ children }) => {
  const { token, logout } = useAuth();

  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  const [onlineUserIds, setOnlineUserIds] = useState(() => new Set());
  const [typingByConversation, setTypingByConversation] = useState(() => new Map());

  const notificationSubscribersRef = useRef(new Set());

  const subscribeToNotifications = useCallback((handler) => {
    notificationSubscribersRef.current.add(handler);
    return () => {
      notificationSubscribersRef.current.delete(handler);
    };
  }, []);

  const socketRef = useRef(null);
  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);

  const emit = useCallback((event, payload, ack) => {
    const live = socketRef.current;
    if (!live || !live.connected) return false;
    if (typeof ack === 'function') {
      live.emit(event, payload, ack);
    } else {
      live.emit(event, payload);
    }
    return true;
  }, []);

  useEffect(() => {
    if (!token) {
      setSocket(null);
      setIsConnected(false);
      setOnlineUserIds(new Set());
      setTypingByConversation(new Map());
      return undefined;
    }

    if (!SOCKET_URL) {
      console.warn('[SocketContext] VITE_SOCKET_URL is not set; sockets disabled.');
      return undefined;
    }

    const instance = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });

    instance.on('connect', () => {
      setIsConnected(true);
    });

    instance.on('disconnect', (reason) => {
      setIsConnected(false);
      if (reason === 'io server disconnect') {
        toast.error('Your session has ended.');
        logout();
      }
    });

    instance.on('connect_error', (err) => {
      const message = err?.message || '';
      if (message === 'Unauthorized') {
        toast.error('Session expired. Please log in again.');
        logout();
      }
    });

    instance.on('userOnline', ({ userId }) => {
      if (!userId) return;
      setOnlineUserIds((prev) => setWith(prev, String(userId)));
    });

    instance.on('userOffline', ({ userId }) => {
      if (!userId) return;
      setOnlineUserIds((prev) => setWithout(prev, String(userId)));
    });

    instance.on('typing:start', ({ conversationId, userId }) => {
      if (!conversationId || !userId) return;
      setTypingByConversation((prev) => {
        const next = new Map(prev);
        const inner = new Set(next.get(conversationId) ?? []);
        inner.add(String(userId));
        next.set(conversationId, inner);
        return next;
      });
    });

    instance.on('typing:stop', ({ conversationId, userId }) => {
      if (!conversationId || !userId) return;
      setTypingByConversation((prev) => {
        const inner = prev.get(conversationId);
        if (!inner) return prev;
        const nextInner = new Set(inner);
        nextInner.delete(String(userId));
        const next = new Map(prev);
        if (nextInner.size === 0) {
          next.delete(conversationId);
        } else {
          next.set(conversationId, nextInner);
        }
        return next;
      });
    });

    instance.on('notification:new', (payload) => {
      notificationSubscribersRef.current.forEach((handler) => {
        try {
          handler(payload);
        } catch (err) {
          if (import.meta.env.DEV) {
            console.warn('[SocketContext] notification subscriber threw:', err);
          }
        }
      });
    });

    setSocket(instance);

    return () => {
      instance.removeAllListeners();
      instance.disconnect();
      setSocket(null);
      setIsConnected(false);
      setOnlineUserIds(new Set());
      setTypingByConversation(new Map());
    };
  }, [token, logout]);

  const value = useMemo(
    () => ({
      socket,
      isConnected,
      onlineUserIds,
      typingByConversation,
      emit,
      subscribeToNotifications,
    }),
    [socket, isConnected, onlineUserIds, typingByConversation, emit, subscribeToNotifications],
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};

export const useSocket = () => {
  const ctx = useContext(SocketContext);
  if (!ctx) {
    throw new Error('useSocket must be used within a <SocketProvider>');
  }
  return ctx;
};

export default SocketContext;
