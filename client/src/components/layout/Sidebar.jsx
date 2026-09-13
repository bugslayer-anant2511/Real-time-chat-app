import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useMatch, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import {
  ChevronDown,
  Loader2,
  LogOut,
  MessageCircle,
  MessageSquarePlus,
  Plus,
  Search,
  Settings as SettingsIcon,
  UserPlus,
  Users,
  X,
  Star,
} from 'lucide-react';

import { useAuth } from '../../contexts/AuthContext.jsx';
import { useChatState } from '../../contexts/ChatStateContext.jsx';
import { useSocket } from '../../contexts/SocketContext.jsx';
import { useDebounce } from '../../hooks/useDebounce.js';
import { useOnClickOutside } from '../../hooks/useOnClickOutside.js';
import * as conversationService from '../../api/conversation.service.js';
import * as userService from '../../api/user.service.js';
import Avatar from '../common/Avatar.jsx';
import Badge from '../common/Badge.jsx';
import EmptyState from '../common/EmptyState.jsx';
import ConversationListSkeleton from '../common/skeletons/ConversationListSkeleton.jsx';
import Tooltip from '../common/Tooltip.jsx';
import ConversationListItem from '../chat/ConversationListItem.jsx';
import PresenceDot from '../chat/PresenceDot.jsx';

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'archived', label: 'Archived' },
];

const idOf = (value) => (value && value._id ? String(value._id) : String(value ?? ''));

const getOtherParticipant = (conversation, currentUserId) => {
  if (!conversation || !Array.isArray(conversation.participants)) return null;
  return (
    conversation.participants.find((p) => idOf(p) !== String(currentUserId)) ?? null
  );
};

const Sidebar = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { socket, onlineUserIds } = useSocket();
  const {
    conversations,
    isLoading,
    error,
    refreshConversations,
    upsertConversation,
    removeConversation,
    incrementUnread,
    resetUnread,
    openNewChat,
    openNewGroup,
  } = useChatState();

  const totalUnreadChats = useMemo(() => {
    return conversations.filter((c) => (Number(c.unreadCount) || 0) > 0).length;
  }, [conversations]);

  const activeMatch = useMatch('/chat/:conversationId');
  const activeConversationId = activeMatch?.params?.conversationId ?? null;

  const currentUserId = user?._id ? String(user._id) : null;
  const mutedSet = useMemo(
    () => new Set((user?.mutedConversations ?? []).map((id) => String(id))),
    [user?.mutedConversations],
  );

  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query.trim(), 300);
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [creatingDirectId, setCreatingDirectId] = useState(null);

  useEffect(() => {
    if (!debouncedQuery) {
      setSearchResults([]);
      setIsSearching(false);
      return undefined;
    }
    let cancelled = false;
    setIsSearching(true);
    (async () => {
      try {
        const result = await userService.searchUsers(debouncedQuery, { limit: 8 });
        if (cancelled) return;
        setSearchResults(result?.data?.users ?? []);
      } catch {
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  const [activeTab, setActiveTab] = useState('all');
  const [archivedConversations, setArchivedConversations] = useState([]);
  const [isLoadingArchived, setIsLoadingArchived] = useState(false);

  useEffect(() => {
    if (activeTab !== 'archived') return undefined;
    let cancelled = false;
    setIsLoadingArchived(true);
    (async () => {
      try {
        const result = await conversationService.getConversations({
          archived: true,
          limit: 50,
        });
        if (cancelled) return;
        setArchivedConversations(result?.data?.items ?? []);
      } catch {
        if (!cancelled) setArchivedConversations([]);
      } finally {
        if (!cancelled) setIsLoadingArchived(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  const visibleConversations = useMemo(() => {
    let filtered = conversations;
    if (activeTab === 'archived') {
      filtered = archivedConversations;
    } else if (activeTab === 'unread') {
      filtered = conversations.filter((c) => Number(c.unreadCount) > 0);
    }
    
    return [...filtered].sort((a, b) => {
      const aPinned = a.pinnedBy?.includes(currentUserId);
      const bPinned = b.pinnedBy?.includes(currentUserId);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      
      const aTime = new Date(a.updatedAt || a.createdAt).getTime();
      const bTime = new Date(b.updatedAt || b.createdAt).getTime();
      return bTime - aTime;
    });
  }, [activeTab, archivedConversations, conversations, currentUserId]);

  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const newMenuRef = useRef(null);
  useOnClickOutside(newMenuRef, () => setNewMenuOpen(false));

  const activeRef = useRef(activeConversationId);
  const userIdRef = useRef(currentUserId);
  useEffect(() => {
    activeRef.current = activeConversationId;
  }, [activeConversationId]);
  useEffect(() => {
    userIdRef.current = currentUserId;
  }, [currentUserId]);

  useEffect(() => {
    if (!socket) return undefined;

    const handleMessageNew = (message) => {
      if (!message?.conversationId) return;
      const conversationId = String(message.conversationId);
      const senderId = message?.sender?._id ? String(message.sender._id) : null;

      const lastMessage = {
        text: message.type === 'image' ? '[image]' : (message.text ?? ''),
        sender: message.sender ?? null,
        type: message.type ?? 'text',
        createdAt: message.createdAt ?? new Date().toISOString(),
      };

      upsertConversation({
        _id: conversationId,
        lastMessage,
        updatedAt: lastMessage.createdAt,
      });

      const isOwnMessage = senderId && senderId === userIdRef.current;
      const isActive = conversationId === activeRef.current;
      if (!isOwnMessage && !isActive) {
        incrementUnread(conversationId, 1);
      }
    };

    const handleReadBy = ({ conversationId, userId }) => {
      if (!conversationId || !userId) return;
      if (String(userId) === userIdRef.current) {
        resetUnread(conversationId);
      }
    };

    const handleGroupCreated = ({ conversation }) => {
      if (!conversation?._id) return;
      upsertConversation(conversation);
    };

    const handleGroupUpdated = ({ conversationId, name, avatarUrl }) => {
      if (!conversationId) return;
      const patch = { _id: String(conversationId) };
      if (typeof name === 'string') patch.name = name;
      if (typeof avatarUrl === 'string') patch.avatarUrl = avatarUrl;
      upsertConversation(patch);
    };

    const handleMembershipChange = () => {
      refreshConversations();
    };

    const handleYouWereRemoved = ({ conversationId }) => {
      if (!conversationId) return;
      removeConversation(conversationId);
      if (String(conversationId) === activeRef.current) {
        toast('You were removed from a group.', { icon: '⚠️' });
        navigate('/chat', { replace: true });
      }
    };

    socket.on('message:new', handleMessageNew);
    socket.on('conversation:readBy', handleReadBy);
    socket.on('group:created', handleGroupCreated);
    socket.on('group:updated', handleGroupUpdated);
    socket.on('group:memberAdded', handleMembershipChange);
    socket.on('group:memberRemoved', handleMembershipChange);
    socket.on('group:youWereRemoved', handleYouWereRemoved);

    return () => {
      socket.off('message:new', handleMessageNew);
      socket.off('conversation:readBy', handleReadBy);
      socket.off('group:created', handleGroupCreated);
      socket.off('group:updated', handleGroupUpdated);
      socket.off('group:memberAdded', handleMembershipChange);
      socket.off('group:memberRemoved', handleMembershipChange);
      socket.off('group:youWereRemoved', handleYouWereRemoved);
    };
  }, [
    socket,
    upsertConversation,
    incrementUnread,
    resetUnread,
    refreshConversations,
    removeConversation,
    navigate,
  ]);

  const handleConversationClick = useCallback(
    (conversationId) => {
      resetUnread(conversationId);
    },
    [resetUnread],
  );

  const handleTogglePin = useCallback(async (conversationId) => {
    try {
      const result = await conversationService.togglePinConversation(conversationId);
      upsertConversation(result?.data);
    } catch (err) {
      toast.error('Failed to toggle pin');
    }
  }, [upsertConversation]);

  const handleSearchResultClick = useCallback(
    async (target) => {
      if (!target?._id || creatingDirectId) return;
      setCreatingDirectId(String(target._id));
      try {
        const result = await conversationService.createDirect(target._id);
        const conversation = result?.data ?? null;
        if (!conversation?._id) {
          throw new Error('Conversation could not be opened');
        }
        upsertConversation(conversation);
        setQuery('');
        setSearchResults([]);
        navigate(`/chat/${conversation._id}`);
      } catch (err) {
        toast.error(err?.response?.data?.message || 'Could not open chat');
      } finally {
        setCreatingDirectId(null);
      }
    },
    [creatingDirectId, navigate, upsertConversation],
  );

  const clearSearch = useCallback(() => {
    setQuery('');
    setSearchResults([]);
  }, []);

  const showSearchResults = debouncedQuery.length > 0;

  const renderListBody = () => {
    if (showSearchResults) {
      if (isSearching) {
        return <ConversationListSkeleton rows={4} />;
      }
      if (searchResults.length === 0) {
        return (
          <EmptyState
            icon={Search}
            title="No users found"
            description={`No accounts matched "${debouncedQuery}". Try a different name or @username.`}
            className="py-8"
          />
        );
      }
      return (
        <ul className="space-y-1">
          {searchResults.map((target) => {
            const isCreating = creatingDirectId === String(target._id);
            const online = onlineUserIds.has(String(target._id));
            return (
              <li key={target._id}>
                <button
                  type="button"
                  disabled={Boolean(creatingDirectId)}
                  onClick={() => handleSearchResultClick(target)}
                  className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-all duration-200 disabled:opacity-60"
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(124,58,237,0.12)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                >
                  <span className="relative shrink-0">
                    <Avatar
                      src={target.avatarUrl}
                      name={target.displayName || target.username}
                      size="md"
                    />
                    {online ? (
                      <span className="absolute right-0 bottom-0">
                        <PresenceDot online size="sm" />
                      </span>
                    ) : null}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium" style={{ color: '#e2e2f0' }}>
                      {target.displayName || target.username}
                    </span>
                    {target.username ? (
                      <span className="truncate text-xs" style={{ color: '#6b6b8a' }}>
                        @{target.username}
                      </span>
                    ) : null}
                  </span>
                  {isCreating ? (
                    <Loader2 className="h-4 w-4 animate-spin" style={{ color: '#a78bfa' }} aria-label="Opening chat" />
                  ) : (
                    <UserPlus className="h-4 w-4" style={{ color: '#6b6b8a' }} aria-hidden="true" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      );
    }

    if (activeTab === 'archived' && isLoadingArchived) {
      return <ConversationListSkeleton rows={5} />;
    }

    if (isLoading && conversations.length === 0) {
      return <ConversationListSkeleton rows={6} />;
    }

    if (error && conversations.length === 0) {
      return (
        <div className="px-3 py-6 text-center">
          <p className="text-xs" style={{ color: '#6b6b8a' }}>
            Couldn&apos;t load your conversations.
          </p>
          <button
            type="button"
            onClick={refreshConversations}
            className="mt-2 text-xs font-medium hover:underline"
            style={{ color: '#a78bfa' }}
          >
            Try again
          </button>
        </div>
      );
    }

    if (visibleConversations.length === 0) {
      const emptyCopy = {
        all: {
          title: 'No conversations yet',
          description: 'Start a chat with the "+ New" button or search for someone above.',
          action: openNewChat,
          actionLabel: 'Start a chat',
        },
        unread: {
          title: "You're all caught up",
          description: 'New messages will appear here as soon as they arrive.',
        },
        archived: {
          title: 'No archived chats',
          description: 'Conversations you archive show up here for safekeeping.',
        },
      }[activeTab];
      return (
        <EmptyState
          icon={MessageCircle}
          title={emptyCopy.title}
          description={emptyCopy.description}
          action={emptyCopy.action}
          actionLabel={emptyCopy.actionLabel}
          className="py-8"
        />
      );
    }

    return (
      <ul className="space-y-0.5">
        {visibleConversations.map((conversation) => {
          const conversationId = idOf(conversation);
          const isGroup = conversation.type === 'group';
          const other = isGroup ? null : getOtherParticipant(conversation, currentUserId);
          const isOnline = other ? onlineUserIds.has(String(other._id)) : false;
          return (
            <li key={conversationId}>
              <ConversationListItem
                conversation={conversation}
                to={`/chat/${conversationId}`}
                isActive={conversationId === activeConversationId}
                isMuted={mutedSet.has(conversationId)}
                isPinned={conversation.pinnedBy?.includes(currentUserId)}
                otherParticipant={other}
                isGroup={isGroup}
                isOnline={isOnline}
                unreadCount={Number(conversation.unreadCount) || 0}
                onClick={() => handleConversationClick(conversationId)}
                onTogglePin={(e) => {
                  e.preventDefault();
                  handleTogglePin(conversationId);
                }}
              />
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <aside
      className="flex h-full w-full flex-col bg-white dark:bg-ww-surface"
      style={{
        borderRight: '1px solid rgba(124,58,237,0.15)',
      }}
    >
      {/* ── Header ── */}
      <div
        className="flex items-center justify-between gap-2 px-3 py-3"
        style={{ borderBottom: '1px solid rgba(124,58,237,0.12)' }}
      >
        <Link
          to="/chat"
          className="flex items-center gap-2.5 transition-opacity hover:opacity-85"
        >
          <span
            className="flex h-8 w-8 items-center justify-center rounded-xl text-white shadow-md"
            style={{
              background: 'linear-gradient(135deg, #7c3aed, #ec4899)',
              boxShadow: '0 2px 12px rgba(124,58,237,0.45)',
            }}
          >
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
          </span>
          <span
            className="text-sm font-bold tracking-tight"
            style={{ fontFamily: "'Plus Jakarta Sans', Inter, sans-serif" }}
          >
            <span style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              Whisper
            </span>
            <span className="text-gray-900 dark:text-white">Wire</span>
          </span>
          {totalUnreadChats > 0 ? (
            <span
              className="ml-0.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #ec4899)' }}
            >
              {totalUnreadChats}
            </span>
          ) : null}
        </Link>

        <div className="flex items-center gap-1">
          <div className="relative" ref={newMenuRef}>
            <Tooltip content="Start new chat/group" position="bottom">
              <button
                type="button"
                onClick={() => setNewMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={newMenuOpen}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white transition-all duration-200"
                style={{
                  background: 'linear-gradient(135deg, #7c3aed, #ec4899)',
                  boxShadow: '0 2px 10px rgba(124,58,237,0.40)',
                }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(124,58,237,0.60)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 2px 10px rgba(124,58,237,0.40)'; e.currentTarget.style.transform = ''; }}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>New</span>
                <ChevronDown className="h-3 w-3" aria-hidden="true" />
              </button>
            </Tooltip>

            {newMenuOpen ? (
              <div
                role="menu"
                className="absolute right-0 z-10 mt-1.5 w-48 overflow-hidden rounded-xl"
                style={{
                  background: 'rgba(22,22,42,0.95)',
                  backdropFilter: 'blur(16px)',
                  border: '1px solid rgba(124,58,237,0.22)',
                  boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
                }}
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { setNewMenuOpen(false); openNewChat(); }}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm transition-colors"
                  style={{ color: '#c4b5fd' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(124,58,237,0.15)'; e.currentTarget.style.color = '#fff'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = '#c4b5fd'; }}
                >
                  <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
                  <span>New chat</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { setNewMenuOpen(false); openNewGroup(); }}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm transition-colors"
                  style={{ color: '#c4b5fd' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(124,58,237,0.15)'; e.currentTarget.style.color = '#fff'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = '#c4b5fd'; }}
                >
                  <Users className="h-4 w-4" aria-hidden="true" />
                  <span>New group</span>
                </button>
              </div>
            ) : null}
          </div>

          <Tooltip content="Starred Messages" position="left">
            <Link
              to="/chat/starred"
              aria-label="Starred Messages"
              className="rounded-lg p-1.5 transition-colors"
              style={{ color: '#6b6b8a' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#eab308'; e.currentTarget.style.background = 'rgba(234,179,8,0.12)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#6b6b8a'; e.currentTarget.style.background = ''; }}
            >
              <Star className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Tooltip>
          <Tooltip content="Settings" position="left">
            <Link
              to="/settings"
              aria-label="Settings"
              className="rounded-lg p-1.5 transition-colors"
              style={{ color: '#6b6b8a' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#a78bfa'; e.currentTarget.style.background = 'rgba(124,58,237,0.12)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#6b6b8a'; e.currentTarget.style.background = ''; }}
            >
              <SettingsIcon className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Tooltip>
        </div>
      </div>

      {/* ── Search ── */}
      <div className="px-3 py-2.5">
        <label className="relative block">
          <span className="sr-only">Search users</span>
          <div className="absolute top-1/2 left-3 -translate-y-1/2">
            <Search className="h-4 w-4" style={{ color: '#6b6b8a' }} aria-hidden="true" />
          </div>
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search users…"
            className="w-full rounded-xl py-2 pr-8 pl-9 text-sm transition-all duration-200 outline-none text-gray-900 dark:text-[#e2e2f0] bg-[rgba(124,58,237,0.04)] dark:bg-[rgba(255,255,255,0.05)] border border-[rgba(124,58,237,0.18)] focus:border-[rgba(124,58,237,0.55)] focus:ring-[3px] focus:ring-[rgba(124,58,237,0.10)] focus:bg-white dark:focus:bg-[rgba(255,255,255,0.08)] placeholder:text-gray-400 dark:placeholder:text-[#6b6b8a]"
            aria-label="Search users"
          />
          {query ? (
            <button
              type="button"
              onClick={clearSearch}
              aria-label="Clear search"
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-0.5 transition-colors"
              style={{ color: '#6b6b8a' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#a78bfa'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#6b6b8a'; }}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </label>
      </div>

      {!showSearchResults ? (
        <div
          role="tablist"
          aria-label="Conversation filter"
          className="flex items-center gap-1 px-3 pb-2.5"
          style={{ borderBottom: '1px solid rgba(124,58,237,0.10)' }}
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  "rounded-lg px-3 py-1 text-xs font-semibold transition-all duration-200",
                  isActive
                    ? "text-white shadow-md ww-gradient-bg"
                    : "text-gray-600 dark:text-[#6b6b8a] hover:text-brand-600 dark:hover:text-[#a78bfa] hover:bg-brand-50 dark:hover:bg-[rgba(124,58,237,0.10)]"
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {renderListBody()}
      </div>

      {/* ── User Strip ── */}
      <div
        className="flex items-center gap-2 px-3 py-2.5"
        style={{ borderTop: '1px solid rgba(124,58,237,0.12)' }}
      >
        <Link
          to={user?.username ? `/u/${user.username}` : '/settings/profile'}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl p-1.5 transition-colors"
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(124,58,237,0.10)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = ''; }}
        >
          <Avatar
            src={user?.avatarUrl}
            name={user?.displayName || user?.username}
            size="sm"
          />
          <span className="min-w-0 truncate text-sm font-medium text-gray-900 dark:text-[#e2e2f0]">
            {user?.displayName || user?.username || 'You'}
          </span>
        </Link>
        <button
          type="button"
          onClick={() => logout()}
          aria-label="Log out"
          className="rounded-lg p-1.5 transition-colors"
          style={{ color: '#6b6b8a' }}
          onMouseEnter={e => { e.currentTarget.style.color = '#fb7185'; e.currentTarget.style.background = 'rgba(244,63,94,0.10)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#6b6b8a'; e.currentTarget.style.background = ''; }}
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
