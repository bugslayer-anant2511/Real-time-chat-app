import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import * as conversationService from '../api/conversation.service.js';
import { useAuth } from './AuthContext.jsx';

const ChatStateContext = createContext(null);

const sortByRecency = (a, b) => {
  const ta = new Date(a.updatedAt ?? a.lastMessageAt ?? 0).getTime();
  const tb = new Date(b.updatedAt ?? b.lastMessageAt ?? 0).getTime();
  return tb - ta;
};

const idOf = (value) => (value && value._id ? String(value._id) : String(value ?? ''));

export const ChatStateProvider = ({ children }) => {
  const { isAuthenticated } = useAuth();

  const [conversations, setConversations] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeConversationId, setActiveConversationId] = useState(null);

  const [activeComposer, setActiveComposer] = useState(null);

  const bootstrappedRef = useRef(false);

  const fetchConversations = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await conversationService.getConversations();
      const items = result?.data?.items ?? [];
      setConversations([...items].sort(sortByRecency));
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      bootstrappedRef.current = false;
      setConversations([]);
      setActiveConversationId(null);
      setActiveComposer(null);
      setError(null);
      setIsLoading(false);
      return;
    }
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    fetchConversations();
  }, [isAuthenticated, fetchConversations]);

  const openNewChat = useCallback(() => setActiveComposer('chat'), []);
  const openNewGroup = useCallback(() => setActiveComposer('group'), []);
  const closeComposer = useCallback(() => setActiveComposer(null), []);

  const upsertConversation = useCallback((incoming) => {
    if (!incoming || !incoming._id) return;
    setConversations((prev) => {
      const id = idOf(incoming);
      const existing = prev.find((c) => idOf(c) === id);
      const merged = existing ? { ...existing, ...incoming } : incoming;
      const others = prev.filter((c) => idOf(c) !== id);
      return [merged, ...others].sort(sortByRecency);
    });
  }, []);

  const removeConversation = useCallback((id) => {
    if (!id) return;
    const target = idOf(id);
    setConversations((prev) => prev.filter((c) => idOf(c) !== target));
    setActiveConversationId((prev) => (prev === target ? null : prev));
  }, []);

  const incrementUnread = useCallback((id, by = 1) => {
    if (!id) return;
    const target = idOf(id);
    setConversations((prev) =>
      prev.map((c) =>
        idOf(c) === target
          ? { ...c, unreadCount: Math.max(0, Number(c.unreadCount) || 0) + by }
          : c,
      ),
    );
  }, []);

  const resetUnread = useCallback((id) => {
    if (!id) return;
    const target = idOf(id);
    setConversations((prev) =>
      prev.map((c) => (idOf(c) === target ? { ...c, unreadCount: 0 } : c)),
    );
  }, []);

  const value = useMemo(
    () => ({
      conversations,
      isLoading,
      error,
      activeConversationId,
      setActiveConversationId,
      upsertConversation,
      removeConversation,
      incrementUnread,
      resetUnread,
      refreshConversations: fetchConversations,
      activeComposer,
      isNewChatOpen: activeComposer === 'chat',
      isNewGroupOpen: activeComposer === 'group',
      openNewChat,
      openNewGroup,
      closeComposer,
    }),
    [
      conversations,
      isLoading,
      error,
      activeConversationId,
      upsertConversation,
      removeConversation,
      incrementUnread,
      resetUnread,
      fetchConversations,
      activeComposer,
      openNewChat,
      openNewGroup,
      closeComposer,
    ],
  );

  return <ChatStateContext.Provider value={value}>{children}</ChatStateContext.Provider>;
};

export const useChatState = () => {
  const ctx = useContext(ChatStateContext);
  if (!ctx) {
    throw new Error('useChatState must be used within a <ChatStateProvider>');
  }
  return ctx;
};

export default ChatStateContext;
