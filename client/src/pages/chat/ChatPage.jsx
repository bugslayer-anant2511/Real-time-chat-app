import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';

import ChatHeader from '../../components/chat/ChatHeader.jsx';
import GroupSettingsModal from '../../components/chat/GroupSettingsModal.jsx';
import MessageComposer from '../../components/chat/MessageComposer.jsx';
import MessagesList from '../../components/chat/MessagesList.jsx';
import SearchInChatBar, {
  collectMatches,
} from '../../components/chat/SearchInChatBar.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useChatState } from '../../contexts/ChatStateContext.jsx';
import { useNotifications } from '../../contexts/NotificationContext.jsx';
import { usePreferences } from '../../contexts/PreferencesContext.jsx';
import { useSocket } from '../../contexts/SocketContext.jsx';
import * as conversationService from '../../api/conversation.service.js';
import * as messageService from '../../api/message.service.js';
import * as userService from '../../api/user.service.js';

const idOf = (value) => (value && value._id ? String(value._id) : String(value ?? ''));

const ChatPage = () => {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const { user, isAdmin, updateUser } = useAuth();
  const { preferences } = usePreferences();
  const { socket, isConnected, emit, typingByConversation } = useSocket();
  const { setActiveConversationId: setNotificationActive } = useNotifications();
  const {
    setActiveConversationId,
    upsertConversation,
    resetUnread,
    removeConversation,
  } = useChatState();

  const currentUserId = user?._id ? String(user._id) : null;

  const otherParticipant = useMemo(() => {
    if (!conversation || conversation.type !== 'direct') return null;
    return conversation.participants.find((p) => String(p._id || p) !== currentUserId);
  }, [conversation, currentUserId]);

  const isBlockedByMe = useMemo(() => {
    if (!otherParticipant) return false;
    return (user?.blockedUsers ?? []).some(
      (bu) => String(bu.user?._id || bu.user) === String(otherParticipant._id || otherParticipant)
    );
  }, [user?.blockedUsers, otherParticipant]);

  const handleUnblock = useCallback(async () => {
    const targetId = otherParticipant?._id || otherParticipant;
    if (!targetId) return;
    try {
      await userService.unblockUser(targetId);
      const name = otherParticipant?.displayName || otherParticipant?.username || 'User';
      toast.success(`${name} has been unblocked`);
      updateUser((prev) =>
        prev
          ? {
              ...prev,
              blockedUsers: (prev.blockedUsers ?? []).filter(
                (bu) => String(bu.user?._id || bu.user) !== String(targetId)
              ),
            }
          : prev,
      );
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not unblock user');
    }
  }, [otherParticipant, updateUser]);

  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [isGroupSettingsOpen, setIsGroupSettingsOpen] = useState(false);

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchIndex, setSearchIndex] = useState(0);

  const listRef = useRef(null);

  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    setConversation(null);
    setMessages([]);
    setHasMore(false);
    setError(null);
    setIsLoadingInitial(true);
    setIsLoadingOlder(false);
    setReplyTo(null);
    setIsGroupSettingsOpen(false);
    setIsSearchOpen(false);
    setSearchQuery('');
    setSearchIndex(0);
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return undefined;
    let cancelled = false;

    (async () => {
      try {
        const [convResult, msgResult] = await Promise.all([
          conversationService.getConversation(conversationId),
          messageService.getMessages(conversationId, { limit: 30 }),
        ]);
        if (cancelled) return;

        const convDoc = convResult?.data ?? null;
        const items = msgResult?.data?.items ?? [];
        const more = Boolean(msgResult?.data?.hasMore);

        if (!convDoc) {
          throw new Error('Conversation not found');
        }

        setConversation(convDoc);
        setMessages(items);
        setHasMore(more);
        upsertConversation({ ...convDoc, unreadCount: 0 });
        setActiveConversationId(idOf(convDoc));
      } catch (err) {
        if (cancelled) return;
        const status = err?.response?.status;
        setError(err);
        if (status === 404 || status === 403) {
          toast.error('Conversation is no longer available');
          removeConversation(conversationId);
          navigate('/chat', { replace: true });
        } else {
          toast.error(err?.response?.data?.message || 'Could not open conversation');
        }
      } finally {
        if (!cancelled) setIsLoadingInitial(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    conversationId,
    navigate,
    removeConversation,
    setActiveConversationId,
    upsertConversation,
  ]);

  useEffect(() => {
    if (!conversationId) return undefined;
    setNotificationActive(conversationId);
    setActiveConversationId(conversationId);
    resetUnread(conversationId);

    emit('conversation:open', { conversationId });
    emit('conversation:read', { conversationId });
    conversationService.markAsRead(conversationId).catch(() => {});

    return () => {
      emit('conversation:close', { conversationId });
      setNotificationActive((current) =>
        current === conversationId ? null : current,
      );
      setActiveConversationId((current) =>
        current === conversationId ? null : current,
      );
    };
  }, [
    conversationId,
    emit,
    resetUnread,
    setActiveConversationId,
    setNotificationActive,
  ]);

  useEffect(() => {
    if (!conversationId) return undefined;
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      emit('conversation:read', { conversationId });
      conversationService.markAsRead(conversationId).catch(() => {});
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [conversationId, emit]);

  useEffect(() => {
    if (!socket || !conversationId) return undefined;

    const handleMessageNew = (incoming) => {
      if (!incoming || String(incoming.conversationId) !== conversationId) return;

      setMessages((prev) => {
        const tempId = incoming.clientTempId;
        if (tempId) {
          const replaceIdx = prev.findIndex(
            (m) => m.clientTempId && m.clientTempId === tempId,
          );
          if (replaceIdx !== -1) {
            const next = prev.slice();
            next[replaceIdx] = { ...incoming, _pending: false };
            return next;
          }
        }

        if (incoming._id && prev.some((m) => m._id === incoming._id)) {
          return prev;
        }
        return [...prev, incoming];
      });

      const senderId = idOf(incoming.sender);
      if (senderId !== currentUserId) {
        emit('conversation:read', { conversationId });
        conversationService.markAsRead(conversationId).catch(() => {});
      }
    };

    const handleMessageEdited = (incoming) => {
      if (!incoming || String(incoming.conversationId) !== conversationId) return;
      setMessages((prev) =>
        prev.map((m) => (m._id === incoming._id ? { ...m, ...incoming } : m)),
      );
    };

    const handleMessageDeleted = ({ conversationId: cid, messageId, for: scope }) => {
      if (!cid || String(cid) !== conversationId) return;
      if (scope === 'self') {
        setMessages((prev) => prev.filter((m) => m._id !== messageId));
        return;
      }
      setMessages((prev) =>
        prev.map((m) =>
          m._id === messageId
            ? { ...m, deletedFor: 'everyone', text: '', imageUrl: '' }
            : m,
        ),
      );
    };

    const handleReactionUpdated = ({ messageId, conversationId: cid, reactions }) => {
      if (!cid || String(cid) !== conversationId) return;
      setMessages((prev) =>
        prev.map((m) => (m._id === messageId ? { ...m, reactions } : m)),
      );
    };

    const handleReadBy = ({ conversationId: cid, userId, readAt }) => {
      if (!cid || String(cid) !== conversationId) return;
      setMessages((prev) =>
        prev.map((m) => {
          if (idOf(m.sender) !== currentUserId) return m;
          const readers = Array.isArray(m.readBy) ? m.readBy : [];
          if (readers.some((entry) => idOf(entry.user) === String(userId))) return m;
          return { ...m, readBy: [...readers, { user: userId, at: readAt }] };
        }),
      );
    };

    socket.on('message:new', handleMessageNew);
    socket.on('message:edited', handleMessageEdited);
    socket.on('message:deleted', handleMessageDeleted);
    socket.on('message:reactionUpdated', handleReactionUpdated);
    socket.on('conversation:readBy', handleReadBy);

    return () => {
      socket.off('message:new', handleMessageNew);
      socket.off('message:edited', handleMessageEdited);
      socket.off('message:deleted', handleMessageDeleted);
      socket.off('message:reactionUpdated', handleReactionUpdated);
      socket.off('conversation:readBy', handleReadBy);
    };
  }, [conversationId, currentUserId, emit, socket]);

  useEffect(() => {
    if (!socket || !conversationId) return undefined;

    const handleGroupUpdated = ({ conversationId: cid, name, avatarUrl }) => {
      if (!cid || String(cid) !== conversationId) return;
      setConversation((prev) => {
        if (!prev) return prev;
        const next = { ...prev };
        if (typeof name === 'string') next.name = name;
        if (typeof avatarUrl === 'string') next.avatarUrl = avatarUrl;
        return next;
      });
    };

    const handleAdminChanged = ({ conversationId: cid, userId, isAdmin }) => {
      if (!cid || String(cid) !== conversationId) return;
      setConversation((prev) => {
        if (!prev) return prev;
        const current = (prev.admins || []).map((id) => String(id));
        const target = String(userId);
        const exists = current.includes(target);
        let nextAdmins = current;
        if (isAdmin && !exists) nextAdmins = [...current, target];
        if (!isAdmin && exists) {
          nextAdmins = current.filter((id) => id !== target);
        }
        if (nextAdmins === current) return prev;
        return { ...prev, admins: nextAdmins };
      });
    };

    const handleMembershipChange = async ({ conversationId: cid }) => {
      if (!cid || String(cid) !== conversationId) return;
      try {
        const result = await conversationService.getConversation(conversationId);
        const fresh = result?.data;
        if (fresh) setConversation(fresh);
      } catch (err) {
        // Ignored
      }
    };

    socket.on('group:updated', handleGroupUpdated);
    socket.on('group:adminChanged', handleAdminChanged);
    socket.on('group:memberAdded', handleMembershipChange);
    socket.on('group:memberRemoved', handleMembershipChange);

    return () => {
      socket.off('group:updated', handleGroupUpdated);
      socket.off('group:adminChanged', handleAdminChanged);
      socket.off('group:memberAdded', handleMembershipChange);
      socket.off('group:memberRemoved', handleMembershipChange);
    };
  }, [conversationId, socket]);

  const handleOptimisticAdd = useCallback((message) => {
    if (!message || !message.clientTempId) return;

    // Optimistically update conversation position and lastMessage in the sidebar list
    upsertConversation({
      _id: conversationId,
      lastMessage: {
        text: message.type === 'image' ? '[image]' : (message.text ?? ''),
        sender: message.sender ?? null,
        type: message.type ?? 'text',
        createdAt: message.createdAt ?? new Date().toISOString(),
      },
      updatedAt: message.createdAt ?? new Date().toISOString(),
    });

    setMessages((prev) => {
      const filtered = prev.filter(
        (m) => m.clientTempId !== message.clientTempId,
      );
      return [...filtered, message];
    });
  }, [conversationId, upsertConversation]);

  const handleOptimisticUpdate = useCallback((clientTempId, patch) => {
    if (!clientTempId || !patch) return;

    // Update conversation order/lastMessage in sidebar with final server message details
    upsertConversation({
      _id: conversationId,
      lastMessage: {
        text: patch.type === 'image' ? '[image]' : (patch.text ?? ''),
        sender: patch.sender ?? null,
        type: patch.type ?? 'text',
        createdAt: patch.createdAt ?? new Date().toISOString(),
      },
      updatedAt: patch.createdAt ?? new Date().toISOString(),
    });

    setMessages((prev) =>
      prev.map((m) => (m.clientTempId === clientTempId ? { ...m, ...patch } : m)),
    );
  }, [conversationId, upsertConversation]);

  const handleAfterSend = useCallback(() => {
    listRef.current?.scrollToBottom?.({ behavior: 'smooth' });
  }, []);

  const handleCancelReply = useCallback(() => setReplyTo(null), []);

  const handleOpenGroupSettings = useCallback(() => {
    setIsGroupSettingsOpen(true);
  }, []);

  const handleCloseGroupSettings = useCallback(() => {
    setIsGroupSettingsOpen(false);
  }, []);

  const handleConversationUpdated = useCallback((updated) => {
    if (!updated?._id) return;
    setConversation((prev) => (prev ? { ...prev, ...updated } : updated));
  }, []);

  const emitWithAck = useCallback(
    (event, payload, { timeoutMs = 6000 } = {}) =>
      new Promise((resolve, reject) => {
        if (!socket || !isConnected) {
          reject(new Error('disconnected'));
          return;
        }
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          reject(new Error('timeout'));
        }, timeoutMs);
        socket.emit(event, payload, (ack) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (ack && ack.success) {
            resolve(ack);
          } else {
            reject(new Error(ack?.message || 'Operation failed'));
          }
        });
      }),
    [isConnected, socket],
  );

  const handleReplyToMessage = useCallback((message) => {
    if (!message || !message._id) return;
    setReplyTo(message);
  }, []);

  const handleEditMessage = useCallback(
    async (message, nextText) => {
      if (!message?._id) return;
      try {
        let updated = null;
        try {
          const ack = await emitWithAck('message:edit', {
            messageId: String(message._id),
            text: nextText,
          });
          updated = ack.message;
        } catch (socketErr) {
          const reason = socketErr?.message || '';
          if (reason !== 'disconnected' && reason !== 'timeout') {
            throw socketErr;
          }
          const result = await messageService.editMessage(
            String(message._id),
            nextText,
          );
          updated = result?.data ?? null;
        }
        if (updated) {
          setMessages((prev) =>
            prev.map((m) => (m._id === updated._id ? { ...m, ...updated } : m)),
          );
        }
      } catch (err) {
        toast.error(err?.message || 'Could not edit message');
        throw err;
      }
    },
    [emitWithAck],
  );

  const handleDeleteMessage = useCallback(
    async (message, scope) => {
      if (!message?._id) return;
      try {
        try {
          await emitWithAck('message:delete', {
            messageId: String(message._id),
            for: scope,
          });
        } catch (socketErr) {
          const reason = socketErr?.message || '';
          if (reason !== 'disconnected' && reason !== 'timeout') {
            throw socketErr;
          }
          await messageService.deleteMessage(String(message._id), { scope });
        }

        if (scope === 'self') {
          setMessages((prev) => prev.filter((m) => m._id !== message._id));
        } else {
          setMessages((prev) =>
            prev.map((m) =>
              m._id === message._id
                ? { ...m, deletedFor: 'everyone', text: '', imageUrl: '' }
                : m,
            ),
          );
        }
      } catch (err) {
        toast.error(err?.message || 'Could not delete message');
        throw err;
      }
    },
    [emitWithAck],
  );

  const handleToggleReaction = useCallback(
    async (message, emoji) => {
      if (!message?._id || !emoji) return;
      try {
        let nextReactions = null;
        try {
          const ack = await emitWithAck('message:reaction', {
            messageId: String(message._id),
            emoji,
          });
          nextReactions = ack.reactions;
        } catch (socketErr) {
          const reason = socketErr?.message || '';
          if (reason !== 'disconnected' && reason !== 'timeout') {
            throw socketErr;
          }
          const result = await messageService.toggleReaction(
            String(message._id),
            emoji,
          );
          nextReactions = result?.data?.reactions ?? null;
        }
        if (Array.isArray(nextReactions)) {
          setMessages((prev) =>
            prev.map((m) =>
              m._id === message._id ? { ...m, reactions: nextReactions } : m,
            ),
          );
        }
      } catch (err) {
        toast.error(err?.message || 'Could not react to message');
        throw err;
      }
    },
    [emitWithAck],
  );

  const handleRetryMessage = useCallback(
    async (message) => {
      const clientTempId = message?.clientTempId;
      if (!clientTempId || !message?._failed) return;

      setMessages((prev) =>
        prev.map((m) =>
          m.clientTempId === clientTempId
            ? { ...m, _pending: true, _failed: false }
            : m,
        ),
      );

      const payload = {
        conversationId,
        type: message.type || 'text',
        text: message.text || '',
        imageUrl: message.imageUrl || '',
        imagePublicId: message.imagePublicId || '',
        replyTo: message.replyTo?._id ? String(message.replyTo._id) : null,
        clientTempId,
      };

      try {
        let serverMessage = null;
        try {
          const ack = await emitWithAck('message:send', payload, {
            timeoutMs: 8000,
          });
          serverMessage = ack.message;
        } catch (socketErr) {
          const reason = socketErr?.message || '';
          if (reason !== 'disconnected' && reason !== 'timeout') {
            throw socketErr;
          }
          const result = await messageService.sendMessage(conversationId, payload);
          serverMessage = result?.data ?? result;
        }
        if (serverMessage) {
          upsertConversation({
            _id: conversationId,
            lastMessage: {
              text: serverMessage.type === 'image' ? '[image]' : (serverMessage.text ?? ''),
              sender: serverMessage.sender ?? null,
              type: serverMessage.type ?? 'text',
              createdAt: serverMessage.createdAt ?? new Date().toISOString(),
            },
            updatedAt: serverMessage.createdAt ?? new Date().toISOString(),
          });
          setMessages((prev) =>
            prev.map((m) =>
              m.clientTempId === clientTempId
                ? {
                    ...serverMessage,
                    clientTempId,
                    _pending: false,
                    _failed: false,
                  }
                : m,
            ),
          );
        }
      } catch (err) {
        setMessages((prev) =>
          prev.map((m) =>
            m.clientTempId === clientTempId
              ? { ...m, _pending: false, _failed: true }
              : m,
          ),
        );
        toast.error(err?.message || 'Failed to resend message');
        throw err;
      }
    },
    [conversationId, emitWithAck, upsertConversation],
  );

  const composerDisabled =
    !conversationId ||
    isLoadingInitial ||
    Boolean(error) ||
    conversation?.isActive === false;
  const composerDisabledReason = !conversation?.isActive
    ? 'This conversation is no longer active.'
    : '';

  const handleLoadOlder = useCallback(async () => {
    if (!conversationId || isLoadingOlder || !hasMore) return;
    const oldest = messagesRef.current[0];
    if (!oldest?._id) return;

    setIsLoadingOlder(true);
    try {
      const result = await messageService.getMessages(conversationId, {
        before: oldest._id,
        limit: 30,
      });
      const items = result?.data?.items ?? [];
      const more = Boolean(result?.data?.hasMore);
      setMessages((prev) => {
        if (items.length === 0) return prev;
        const seen = new Set(prev.map((m) => m._id).filter(Boolean));
        const fresh = items.filter((m) => !m._id || !seen.has(m._id));
        return [...fresh, ...prev];
      });
      setHasMore(more);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not load older messages');
    } finally {
      setIsLoadingOlder(false);
    }
  }, [conversationId, hasMore, isLoadingOlder]);

  const searchMatchIds = useMemo(
    () => collectMatches(messages, searchQuery),
    [messages, searchQuery],
  );

  useEffect(() => {
    if (searchMatchIds.length === 0) {
      if (searchIndex !== 0) setSearchIndex(0);
      return;
    }
    if (searchIndex >= searchMatchIds.length) {
      setSearchIndex(0);
    }
  }, [searchMatchIds, searchIndex]);

  const highlightMessageId = useMemo(() => {
    if (!isSearchOpen || searchMatchIds.length === 0) return null;
    return searchMatchIds[Math.min(searchIndex, searchMatchIds.length - 1)] ?? null;
  }, [isSearchOpen, searchIndex, searchMatchIds]);

  const handleOpenSearch = useCallback(() => {
    setIsSearchOpen(true);
  }, []);

  const handleCloseSearch = useCallback(() => {
    setIsSearchOpen(false);
    setSearchQuery('');
    setSearchIndex(0);
  }, []);

  const handleSearchQueryChange = useCallback((next) => {
    setSearchQuery(next);
    setSearchIndex(0);
  }, []);

  const handleSearchNext = useCallback(() => {
    setSearchIndex((prev) => {
      if (searchMatchIds.length === 0) return 0;
      return (prev + 1) % searchMatchIds.length;
    });
  }, [searchMatchIds.length]);

  const handleSearchPrev = useCallback(() => {
    setSearchIndex((prev) => {
      if (searchMatchIds.length === 0) return 0;
      return (prev - 1 + searchMatchIds.length) % searchMatchIds.length;
    });
  }, [searchMatchIds.length]);

  const typingUsers = useMemo(() => {
    if (!conversationId) return [];
    const ids = typingByConversation.get(conversationId);
    if (!ids || ids.size === 0) return [];

    const participants = conversation?.participants ?? [];
    const list = [];
    for (const userId of ids) {
      if (String(userId) === currentUserId) continue;
      const found = participants.find((p) => idOf(p) === String(userId));
      list.push(
        found ?? { _id: userId, displayName: 'Someone', username: 'someone' },
      );
    }
    return list;
  }, [conversationId, conversation, currentUserId, typingByConversation]);

  if (error && !conversation && !isLoadingInitial) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          We couldn't open this conversation.
        </p>
        <button
          type="button"
          onClick={() => navigate('/chat')}
          className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-300"
        >
          Back to conversations
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-white dark:bg-gray-900">
      <ChatHeader
        conversation={conversation}
        isLoading={isLoadingInitial}
        onOpenSearch={handleOpenSearch}
        onOpenGroupSettings={handleOpenGroupSettings}
      />

      <SearchInChatBar
        open={isSearchOpen}
        query={searchQuery}
        onQueryChange={handleSearchQueryChange}
        matchCount={searchMatchIds.length}
        currentIndex={searchIndex}
        onNext={handleSearchNext}
        onPrev={handleSearchPrev}
        onClose={handleCloseSearch}
      />

      <MessagesList
        ref={listRef}
        messages={messages}
        currentUserId={currentUserId}
        isGroup={conversation?.type === 'group'}
        isAdmin={isAdmin}
        participants={conversation?.participants ?? []}
        isLoadingInitial={isLoadingInitial}
        isLoadingOlder={isLoadingOlder}
        hasMore={hasMore}
        onLoadOlder={handleLoadOlder}
        typingUsers={typingUsers}
        showReadReceipts={preferences?.showReadReceipts !== false}
        highlightMessageId={highlightMessageId}
        onReply={handleReplyToMessage}
        onEdit={handleEditMessage}
        onDelete={handleDeleteMessage}
        onReact={handleToggleReaction}
        onRetry={handleRetryMessage}
      />

      <MessageComposer
        conversationId={conversationId}
        replyTo={replyTo}
        onCancelReply={handleCancelReply}
        onOptimisticAdd={handleOptimisticAdd}
        onOptimisticUpdate={handleOptimisticUpdate}
        onAfterSend={handleAfterSend}
        disabled={composerDisabled}
        disabledReason={composerDisabledReason}
        isBlocked={isBlockedByMe}
        onUnblock={handleUnblock}
      />

      <GroupSettingsModal
        open={isGroupSettingsOpen}
        conversation={conversation}
        onClose={handleCloseGroupSettings}
        onConversationUpdated={handleConversationUpdated}
      />
    </div>
  );
};

export default ChatPage;
