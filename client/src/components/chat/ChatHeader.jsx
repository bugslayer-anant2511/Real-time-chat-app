import { useCallback, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import {
  Archive,
  Bell,
  BellOff,
  ChevronLeft,
  Clock,
  Flag,
  LogOut,
  MoreVertical,
  Search,
  ShieldOff,
  Star,
  Users,
} from 'lucide-react';

import Avatar from '../common/Avatar.jsx';
import PresenceDot from './PresenceDot.jsx';
import Spinner from '../common/Spinner.jsx';
import StarredMessagesModal from './StarredMessagesModal.jsx';
import ScheduledMessagesModal from './ScheduledMessagesModal.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useChatState } from '../../contexts/ChatStateContext.jsx';
import { useSocket } from '../../contexts/SocketContext.jsx';
import { useOnClickOutside } from '../../hooks/useOnClickOutside.js';
import * as conversationService from '../../api/conversation.service.js';
import * as userService from '../../api/user.service.js';
import { formatLastSeen } from '../../utils/formatDate.js';

const idOf = (value) => (value && value._id ? String(value._id) : String(value ?? ''));

const ChatHeader = ({
  conversation,
  isLoading = false,
  onOpenSearch,
  onOpenGroupSettings,
  onJumpToMessage,
}) => {
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();
  const { onlineUserIds } = useSocket();
  const { upsertConversation, removeConversation, refreshConversations } = useChatState();

  const [menuOpen, setMenuOpen] = useState(false);
  const [showStarred, setShowStarred] = useState(false);
  const [showScheduled, setShowScheduled] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [isBlocking, setIsBlocking] = useState(false);
  const menuRef = useRef(null);
  useOnClickOutside(menuRef, () => setMenuOpen(false));

  const currentUserId = user?._id ? String(user._id) : null;

  const isGroup = conversation?.type === 'group';
  const otherParticipant = useMemo(() => {
    if (!conversation || isGroup) return null;
    return (
      (conversation.participants ?? []).find(
        (p) => idOf(p) !== currentUserId,
      ) ?? null
    );
  }, [conversation, currentUserId, isGroup]);

  const otherShowsPresence =
    !!otherParticipant && otherParticipant.showOnlineStatus !== false;

  const isOnline = useMemo(() => {
    if (isGroup || !otherParticipant) return false;
    if (!otherShowsPresence) return false;
    if (onlineUserIds.has(String(otherParticipant._id))) return true;
    return Boolean(otherParticipant.isOnline);
  }, [isGroup, onlineUserIds, otherParticipant, otherShowsPresence]);

  const presenceText = useMemo(() => {
    if (isGroup) {
      const count = conversation?.participants?.length ?? 0;
      return `${count} member${count === 1 ? '' : 's'}`;
    }
    if (!otherParticipant || !otherShowsPresence) return '';
    if (isOnline) return 'Online';
    if (otherParticipant.lastSeenAt) {
      return `Last seen ${formatLastSeen(otherParticipant.lastSeenAt)}`;
    }
    return '';
  }, [conversation, isGroup, isOnline, otherParticipant, otherShowsPresence]);

  const displayName = isGroup
    ? conversation?.name || 'Untitled group'
    : otherParticipant?.displayName || otherParticipant?.username || 'Conversation';

  const avatarSrc = isGroup
    ? conversation?.avatarUrl
    : otherParticipant?.avatarUrl;

  const conversationId = conversation?._id ? String(conversation._id) : null;
  const isMuted = useMemo(() => {
    if (!conversationId) return false;
    const list = user?.mutedConversations ?? [];
    return list.some((id) => String(id) === conversationId);
  }, [conversationId, user?.mutedConversations]);

  const handleToggleMute = useCallback(async () => {
    if (!conversationId || isMutating) return;
    setIsMutating(true);
    updateUser((prev) => {
      if (!prev) return prev;
      const list = prev.mutedConversations ?? [];
      const exists = list.some((id) => String(id) === conversationId);
      const nextList = exists
        ? list.filter((id) => String(id) !== conversationId)
        : [...list, conversationId];
      return { ...prev, mutedConversations: nextList };
    });
    try {
      const result = await conversationService.toggleMute(conversationId);
      const serverList = result?.data?.mutedConversations;
      if (Array.isArray(serverList)) {
        updateUser({ mutedConversations: serverList });
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not update mute');
      updateUser((prev) => {
        if (!prev) return prev;
        const list = prev.mutedConversations ?? [];
        const exists = list.some((id) => String(id) === conversationId);
        const nextList = exists
          ? list.filter((id) => String(id) !== conversationId)
          : [...list, conversationId];
        return { ...prev, mutedConversations: nextList };
      });
    } finally {
      setIsMutating(false);
    }
  }, [conversationId, isMutating, updateUser]);

  const isBlocked = useMemo(() => {
    if (!otherParticipant) return false;
    return (user?.blockedUsers ?? []).some(
      (bu) => String(bu.user?._id || bu.user) === String(otherParticipant._id)
    );
  }, [user?.blockedUsers, otherParticipant]);

  const handleBlockUser = useCallback(async () => {
    if (!otherParticipant?._id || isBlocking) return;
    const ok = window.confirm(
      `Block ${displayName}? They won't be able to message you anymore.`,
    );
    if (!ok) return;
    setIsBlocking(true);
    setMenuOpen(false);
    try {
      await userService.blockUser(otherParticipant._id);
      toast.success(`${displayName} has been blocked`);
      updateUser((prev) =>
        prev
          ? {
              ...prev,
              blockedUsers: [
                ...(prev.blockedUsers ?? []),
                { user: otherParticipant._id, blockedAt: new Date().toISOString() },
              ],
            }
          : prev,
      );
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not block user');
    } finally {
      setIsBlocking(false);
    }
  }, [displayName, isBlocking, otherParticipant, updateUser]);

  const handleUnblockUser = useCallback(async () => {
    if (!otherParticipant?._id || isBlocking) return;
    setIsBlocking(true);
    setMenuOpen(false);
    try {
      await userService.unblockUser(otherParticipant._id);
      toast.success(`${displayName} has been unblocked`);
      updateUser((prev) =>
        prev
          ? {
              ...prev,
              blockedUsers: (prev.blockedUsers ?? []).filter(
                (bu) => String(bu.user?._id || bu.user) !== String(otherParticipant._id)
              ),
            }
          : prev,
      );
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not unblock user');
    } finally {
      setIsBlocking(false);
    }
  }, [displayName, isBlocking, otherParticipant, updateUser]);

  const isArchived = useMemo(() => {
    if (!conversationId) return false;
    const list = user?.archivedConversations ?? [];
    return list.some((id) => String(id) === conversationId);
  }, [conversationId, user?.archivedConversations]);

  const handleToggleArchive = useCallback(async () => {
    if (!conversationId || isMutating) return;
    setIsMutating(true);
    setMenuOpen(false);

    // Optimistically toggle
    updateUser((prev) => {
      if (!prev) return prev;
      const list = prev.archivedConversations ?? [];
      const exists = list.some((id) => String(id) === conversationId);
      const nextList = exists
        ? list.filter((id) => String(id) !== conversationId)
        : [...list, conversationId];
      return { ...prev, archivedConversations: nextList };
    });

    try {
      const res = await conversationService.toggleArchive(conversationId);
      const wasArchived = res?.data?.archived;
      toast.success(wasArchived ? 'Conversation archived' : 'Conversation unarchived');
      
      removeConversation(conversationId);
      await refreshConversations();
      navigate('/chat');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not update archive status');
      // Revert
      updateUser((prev) => {
        if (!prev) return prev;
        const list = prev.archivedConversations ?? [];
        const exists = list.some((id) => String(id) === conversationId);
        const nextList = exists
          ? list.filter((id) => String(id) !== conversationId)
          : [...list, conversationId];
        return { ...prev, archivedConversations: nextList };
      });
    } finally {
      setIsMutating(false);
    }
  }, [conversationId, isMutating, navigate, removeConversation, refreshConversations, updateUser]);

  const handleLeaveGroup = useCallback(async () => {
    if (!conversationId || isLeaving) return;
    const ok = window.confirm(`Leave the group "${displayName}"?`);
    if (!ok) return;
    setIsLeaving(true);
    setMenuOpen(false);
    try {
      await conversationService.leaveOrDeleteConversation(conversationId);
      removeConversation(conversationId);
      toast.success('You left the group');
      navigate('/chat', { replace: true });
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not leave group');
    } finally {
      setIsLeaving(false);
    }
  }, [conversationId, displayName, isLeaving, navigate, removeConversation]);

  const handleReport = useCallback(() => {
    setMenuOpen(false);
    toast(
      'Reporting will arrive with the moderation modal in a later step.',
      { icon: 'ℹ️' },
    );
  }, []);

  const handleHeaderClick = useCallback(() => {
    if (isGroup && onOpenGroupSettings) onOpenGroupSettings();
  }, [isGroup, onOpenGroupSettings]);

  const peerProfileTo = useMemo(() => {
    if (isGroup) return null;
    const username = otherParticipant?.username;
    return username ? `/u/${encodeURIComponent(username)}` : null;
  }, [isGroup, otherParticipant?.username]);

  const headerInteractive = isGroup
    ? Boolean(onOpenGroupSettings)
    : Boolean(peerProfileTo);

  const headerSharedClass = clsx(
    'flex min-w-0 flex-1 items-center gap-3 rounded-md p-1 text-left transition-colors',
    headerInteractive
      ? 'cursor-pointer hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:bg-gray-800 dark:focus-visible:bg-gray-800'
      : 'cursor-default',
  );

  const headerInner = (
    <>
      <span className="relative shrink-0">
        <Avatar src={avatarSrc} name={displayName} size="md" />
        {!isGroup && otherShowsPresence ? (
          <span className="absolute right-0 bottom-0">
            <PresenceDot online={isOnline} size="sm" />
          </span>
        ) : null}
        {isGroup ? (
          <span className="absolute -right-1 -bottom-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-gray-200 text-gray-600 ring-2 ring-white dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-900">
            <Users className="h-2.5 w-2.5" aria-hidden="true" />
          </span>
        ) : null}
      </span>

      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-semibold text-gray-900 dark:text-white">
          {isLoading ? '…' : displayName}
        </span>
        {presenceText ? (
          <span
            className={clsx(
              'truncate text-[11px]',
              isOnline
                ? 'font-medium text-emerald-600 dark:text-emerald-400'
                : 'text-gray-500 dark:text-gray-400',
            )}
          >
            {presenceText}
          </span>
        ) : null}
      </span>
    </>
  );

  return (
    <header
      className="relative z-50 flex h-14 shrink-0 items-center gap-2 px-2 bg-white/95 dark:bg-[#16162a]/95 backdrop-blur-md"
      style={{
        borderBottom: '1px solid rgba(124,58,237,0.15)',
      }}
    >
      <Link
        to="/chat"
        aria-label="Back to conversations"
        className="rounded-xl p-2 transition-colors md:hidden"
        style={{ color: '#6b6b8a' }}
        onMouseEnter={e => { e.currentTarget.style.color = '#a78bfa'; e.currentTarget.style.background = 'rgba(124,58,237,0.12)'; }}
        onMouseLeave={e => { e.currentTarget.style.color = '#6b6b8a'; e.currentTarget.style.background = ''; }}
      >
        <ChevronLeft className="h-5 w-5" aria-hidden="true" />
      </Link>

      {isGroup ? (
        <button
          type="button"
          onClick={handleHeaderClick}
          disabled={!headerInteractive}
          aria-label={`Open settings for ${displayName}`}
          className={headerSharedClass}
        >
          {headerInner}
        </button>
      ) : peerProfileTo ? (
        <Link
          to={peerProfileTo}
          aria-label={`Open profile of ${displayName}`}
          className={headerSharedClass}
        >
          {headerInner}
        </Link>
      ) : (
        <span className={headerSharedClass}>{headerInner}</span>
      )}

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={handleToggleMute}
          disabled={isMutating || !conversationId}
          aria-pressed={isMuted}
          aria-label={isMuted ? 'Unmute conversation' : 'Mute conversation'}
          title={isMuted ? 'Unmute conversation' : 'Mute conversation'}
          className="rounded-xl p-2 transition-all duration-200 disabled:opacity-50"
          style={{ color: '#6b6b8a' }}
          onMouseEnter={e => { e.currentTarget.style.color = '#a78bfa'; e.currentTarget.style.background = 'rgba(124,58,237,0.12)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#6b6b8a'; e.currentTarget.style.background = ''; }}
        >
          {isMutating ? (
            <Spinner size="sm" />
          ) : isMuted ? (
            <BellOff className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Bell className="h-4 w-4" aria-hidden="true" />
          )}
        </button>

        <button
          type="button"
          onClick={onOpenSearch}
          aria-label="Search in conversation"
          title="Search in conversation"
          className="hidden rounded-xl p-2 transition-all duration-200 sm:inline-flex"
          style={{ color: '#6b6b8a' }}
          onMouseEnter={e => { e.currentTarget.style.color = '#a78bfa'; e.currentTarget.style.background = 'rgba(124,58,237,0.12)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#6b6b8a'; e.currentTarget.style.background = ''; }}
        >
          <Search className="h-4 w-4" aria-hidden="true" />
        </button>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Conversation actions"
            className="rounded-xl p-2 transition-all duration-200"
            style={{ color: '#6b6b8a' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#a78bfa'; e.currentTarget.style.background = 'rgba(124,58,237,0.12)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#6b6b8a'; e.currentTarget.style.background = ''; }}
          >
            <MoreVertical className="h-4 w-4" aria-hidden="true" />
          </button>
          {menuOpen ? (
            <div
              role="menu"
              className="absolute right-0 z-10 mt-1.5 w-52 overflow-hidden rounded-xl ww-scale-in"
              style={{
                background: 'rgba(22,22,42,0.97)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(124,58,237,0.22)',
                boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
              }}
            >
              {!isGroup && otherParticipant ? (
                <button
                  type="button"
                  role="menuitem"
                  disabled={isBlocking}
                  onClick={isBlocked ? handleUnblockUser : handleBlockUser}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm transition-colors disabled:opacity-50"
                  style={{ color: '#fb7185' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(244,63,94,0.10)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                >
                  <ShieldOff className="h-4 w-4" aria-hidden="true" />
                  <span>{isBlocked ? 'Unblock user' : 'Block user'}</span>
                </button>
              ) : null}

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  setShowStarred(true);
                }}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm transition-colors"
                style={{ color: '#fbbf24' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(251,191,36,0.10)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = ''; }}
              >
                <Star className="h-4 w-4" aria-hidden="true" />
                <span>Starred messages</span>
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  setShowScheduled(true);
                }}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm transition-colors"
                style={{ color: '#818cf8' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(129,140,248,0.10)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = ''; }}
              >
                <Clock className="h-4 w-4" aria-hidden="true" />
                <span>Scheduled messages</span>
              </button>

              {isGroup ? (
                <button
                  type="button"
                  role="menuitem"
                  disabled={isLeaving}
                  onClick={handleLeaveGroup}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm transition-colors disabled:opacity-50"
                  style={{ color: '#fb7185' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(244,63,94,0.10)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  <span>Leave group</span>
                </button>
              ) : null}
              <button
                type="button"
                role="menuitem"
                disabled={isMutating}
                onClick={handleToggleArchive}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm transition-colors"
                style={{ color: '#c4b5fd' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(124,58,237,0.12)'; e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = '#c4b5fd'; }}
              >
                <Archive className="h-4 w-4" aria-hidden="true" />
                <span>{isArchived ? 'Unarchive chat' : 'Archive chat'}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={handleReport}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm transition-colors"
                style={{ color: '#c4b5fd' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(124,58,237,0.12)'; e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = '#c4b5fd'; }}
              >
                <Flag className="h-4 w-4" aria-hidden="true" />
                <span>Report</span>
              </button>
            </div>
            ) : null}
        </div>
      </div>
      
      {showStarred && conversationId ? (
        <StarredMessagesModal
          conversationId={conversationId}
          onClose={() => setShowStarred(false)}
          onJumpToMessage={onJumpToMessage}
        />
      ) : null}

      {showScheduled && conversationId ? (
        <ScheduledMessagesModal
          conversationId={conversationId}
          onClose={() => setShowScheduled(false)}
        />
      ) : null}
    </header>
  );
};

export default ChatHeader;
