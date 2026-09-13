import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import EmojiPicker, { EmojiStyle, Theme as EmojiTheme } from 'emoji-picker-react';
import { ImagePlus, Keyboard, Send, Smile, X, Clock } from 'lucide-react';

import Spinner from '../common/Spinner.jsx';
import Tooltip from '../common/Tooltip.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { usePreferences } from '../../contexts/PreferencesContext.jsx';
import { useSocket } from '../../contexts/SocketContext.jsx';
import { useOnClickOutside } from '../../hooks/useOnClickOutside.js';
import * as messageService from '../../api/message.service.js';
import { uploadMessageImage } from '../../api/upload.service.js';

const MAX_TEXT_LENGTH = 4000;
const MAX_IMAGE_MB = 5;
const MAX_TEXTAREA_ROWS = 6;
const TYPING_IDLE_MS = 3000;
const SEND_ACK_TIMEOUT_MS = 8000;
const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const ACCEPT_ATTRIBUTE = ALLOWED_IMAGE_MIMES.join(',');

const generateTempId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const trimEnd = (value) => (typeof value === 'string' ? value.replace(/\s+$/, '') : '');

const isImageFile = (file) =>
  file && typeof file === 'object' && ALLOWED_IMAGE_MIMES.includes(file.type);

const onelinePreview = (text, max = 140) => {
  if (typeof text !== 'string' || text.length === 0) return '';
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length > max ? `${collapsed.slice(0, max)}…` : collapsed;
};

const MessageComposer = ({
  conversationId,
  replyTo = null,
  onCancelReply,
  onOptimisticAdd,
  onOptimisticUpdate,
  onAfterSend,
  disabled = false,
  disabledReason = '',
  isBlocked = false,
  onUnblock = null,
}) => {
  const { user } = useAuth();
  const { preferences } = usePreferences();
  const { isConnected, emit, socket } = useSocket();

  const enterToSend = preferences?.enterToSend !== false;
  const emojiTheme =
    preferences?.theme === 'dark' ? EmojiTheme.DARK : EmojiTheme.LIGHT;

  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [attachmentPreview, setAttachmentPreview] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);
  const [scheduledFor, setScheduledFor] = useState('');
  const [customDate, setCustomDate] = useState('');
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);

  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const emojiContainerRef = useRef(null);

  const typingActiveRef = useRef(false);
  const typingTimerRef = useRef(null);

  const isMobile = useMemo(() => {
    return /Mobi|Android/i.test(navigator.userAgent) || window.innerWidth < 768;
  }, []);

  const handleEmojiToggle = useCallback(() => {
    setIsEmojiOpen((prev) => {
      const next = !prev;
      if (isMobile) {
        if (next) {
          textareaRef.current?.blur();
        } else {
          textareaRef.current?.focus();
        }
      }
      return next;
    });
  }, [isMobile]);

  const handleTextareaFocus = useCallback(() => {
    setIsEmojiOpen(false);
  }, []);

  const clearTypingTimer = useCallback(() => {
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
  }, []);

  const stopTyping = useCallback(() => {
    clearTypingTimer();
    if (!typingActiveRef.current) return;
    typingActiveRef.current = false;
    if (conversationId) {
      emit('typing:stop', { conversationId });
    }
  }, [clearTypingTimer, conversationId, emit]);

  const pingTyping = useCallback(() => {
    if (!conversationId || disabled) return;
    if (!typingActiveRef.current) {
      typingActiveRef.current = true;
      emit('typing:start', { conversationId });
    }
    clearTypingTimer();
    typingTimerRef.current = setTimeout(() => {
      stopTyping();
    }, TYPING_IDLE_MS);
  }, [clearTypingTimer, conversationId, disabled, emit, stopTyping]);

  useEffect(() => {
    setText('');
    setAttachment(null);
    setAttachmentPreview('');
    setIsEmojiOpen(false);
    setIsSending(false);
    setIsUploading(false);
    stopTyping();
  }, [conversationId]);

  useEffect(() => {
    return () => {
      stopTyping();
    };
  }, [stopTyping]);

  useEffect(() => {
    if (!socket) {
      typingActiveRef.current = false;
      clearTypingTimer();
    }
  }, [socket, clearTypingTimer]);

  useEffect(() => {
    if (!attachment) {
      setAttachmentPreview('');
      return undefined;
    }
    const url = URL.createObjectURL(attachment);
    setAttachmentPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [attachment]);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const lineHeight = parseFloat(window.getComputedStyle(el).lineHeight) || 20;
    const maxHeight = lineHeight * MAX_TEXTAREA_ROWS;
    const next = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [text, attachmentPreview, replyTo]);

  useOnClickOutside(
    emojiContainerRef,
    useCallback(() => {
      setIsEmojiOpen(false);
    }, []),
  );

  const trimmedText = useMemo(() => trimEnd(text), [text]);
  const hasText = trimmedText.length > 0;
  const hasAttachment = Boolean(attachment);
  const isOverLimit = trimmedText.length > MAX_TEXT_LENGTH;
  const canSend =
    !disabled &&
    !isSending &&
    !isUploading &&
    Boolean(conversationId) &&
    (hasText || hasAttachment) &&
    !isOverLimit;

  const handleEmojiSelect = useCallback(
    (emojiData) => {
      const insert = emojiData?.emoji ?? '';
      if (!insert) return;
      const el = textareaRef.current;
      const start = el?.selectionStart ?? text.length;
      const end = el?.selectionEnd ?? text.length;
      const next = `${text.slice(0, start)}${insert}${text.slice(end)}`;
      if (next.length > MAX_TEXT_LENGTH) {
        toast.error(`Message too long (max ${MAX_TEXT_LENGTH} characters).`);
        return;
      }
      setText(next);
      requestAnimationFrame(() => {
        if (!el) return;
        el.focus();
        const caret = start + insert.length;
        el.setSelectionRange(caret, caret);
      });
      pingTyping();
    },
    [pingTyping, text],
  );

  const handleAttachClick = useCallback(() => {
    if (disabled || isSending || isUploading) return;
    fileInputRef.current?.click();
  }, [disabled, isSending, isUploading]);

  const handleFileChange = useCallback((event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!isImageFile(file)) {
      toast.error('Only JPG, PNG or WEBP images are allowed.');
      return;
    }
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      toast.error(`Image too large. Max ${MAX_IMAGE_MB} MB.`);
      return;
    }
    setAttachment(file);
    setIsEmojiOpen(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  const clearAttachment = useCallback(() => {
    setAttachment(null);
  }, []);

  const buildOptimisticMessage = useCallback(
    ({ clientTempId, type, body, imageUrl }) => {
      const senderProjection = user
        ? {
            _id: user._id,
            username: user.username,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl ?? '',
          }
        : null;
      return {
        _id: undefined,
        clientTempId,
        conversationId,
        type,
        text: body,
        imageUrl: imageUrl ?? '',
        sender: senderProjection,
        createdAt: new Date().toISOString(),
        replyTo: replyTo ?? null,
        reactions: [],
        readBy: [],
        editedAt: null,
        deletedFor: 'none',
        _pending: true,
        _failed: false,
      };
    },
    [conversationId, replyTo, user],
  );

  const sendOverSocket = useCallback(
    (payload) =>
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
        }, SEND_ACK_TIMEOUT_MS);

        socket.emit('message:send', payload, (ack) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (ack && ack.success && ack.message) {
            resolve(ack.message);
          } else {
            reject(new Error(ack?.message || 'Send failed'));
          }
        });
      }),
    [isConnected, socket],
  );

  const sendOverRest = useCallback(
    async (payload) => {
      const result = await messageService.sendMessage(conversationId, payload);
      const wire = result?.data ?? result;
      if (!wire) throw new Error('Empty response from server');
      return wire;
    },
    [conversationId],
  );

  const handleSubmit = useCallback(async () => {
    if (!canSend) return;

    const clientTempId = generateTempId();
    const trimmed = trimmedText;
    const replyToId = replyTo?._id ? String(replyTo._id) : null;

    setIsSending(true);
    setIsEmojiOpen(false);
    stopTyping();

    let optimistic = null;
    let imageUrl = '';
    let imagePublicId = '';

    try {
      if (hasAttachment) {
        setIsUploading(true);
        try {
          const uploaded = await uploadMessageImage(attachment);
          const data = uploaded?.data ?? uploaded;
          imageUrl = data?.url || '';
          imagePublicId = data?.publicId || '';
          if (!imageUrl) throw new Error('Upload did not return a URL');
        } finally {
          setIsUploading(false);
        }
      }

      const type = imageUrl ? 'image' : 'text';
      optimistic = buildOptimisticMessage({
        clientTempId,
        type,
        body: trimmed,
        imageUrl,
      });
      let calculatedScheduledFor = null;
      if (scheduledFor === 'custom' && customDate) {
        calculatedScheduledFor = new Date(customDate).toISOString();
      } else if (scheduledFor && scheduledFor !== 'custom') {
        calculatedScheduledFor = new Date(Date.now() + parseInt(scheduledFor, 10) * 60000).toISOString();
      }

      const payload = {
        conversationId,
        type,
        text: trimmed,
        imageUrl,
        imagePublicId,
        replyTo: replyToId,
        clientTempId,
        scheduledFor: calculatedScheduledFor,
      };

      const isScheduled = Boolean(calculatedScheduledFor);

      if (!isScheduled) {
        onOptimisticAdd?.(optimistic);
      }

      let serverMessage = null;
      try {
        if (isScheduled) {
          // Scheduled messages must go over REST, not socket
          serverMessage = await sendOverRest(payload);
        } else {
          try {
            serverMessage = await sendOverSocket(payload);
          } catch (socketErr) {
            const reason = socketErr?.message || '';
            const isRecoverable = reason === 'disconnected' || reason === 'timeout';
            if (!isRecoverable) throw socketErr;
            serverMessage = await sendOverRest(payload);
          }
        }
      } catch (err) {
        throw err;
      }

      if (isScheduled) {
        toast.success('Message scheduled successfully');
        setScheduledFor('');
        setCustomDate('');
        setIsScheduleOpen(false);
      } else {
        onOptimisticUpdate?.(clientTempId, {
          ...serverMessage,
          clientTempId,
          _pending: false,
          _failed: false,
        });
      }
      
      setText('');
      setAttachment(null);
      onCancelReply?.();
      onAfterSend?.();
    } catch (err) {
      const message =
        err?.response?.data?.message || err?.message || 'Failed to send message';
      toast.error(message);
        if (optimistic && !isScheduled) {
          onOptimisticUpdate?.(clientTempId, {
            _pending: false,
            _failed: true,
          });
        }
    } finally {
      setIsSending(false);
      const isMobile = /Mobi|Android/i.test(navigator.userAgent);
      if (!isMobile) {
        requestAnimationFrame(() => textareaRef.current?.focus());
      }
    }
  }, [
    attachment,
    buildOptimisticMessage,
    canSend,
    conversationId,
    hasAttachment,
    onAfterSend,
    onCancelReply,
    onOptimisticAdd,
    onOptimisticUpdate,
    replyTo,
    scheduledFor,
    customDate,
    sendOverRest,
    sendOverSocket,
    stopTyping,
    trimmedText,
  ]);

  const handleKeyDown = useCallback(
    (event) => {
      if (event.key !== 'Enter') return;
      if (event.nativeEvent?.isComposing) return;

      if (enterToSend) {
        if (event.shiftKey) return;
        event.preventDefault();
        handleSubmit();
      } else if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        handleSubmit();
      }
    },
    [enterToSend, handleSubmit],
  );

  const handleTextChange = useCallback(
    (event) => {
      const value = event.target.value;
      if (value.length > MAX_TEXT_LENGTH * 1.1) {
        toast.error(`Message too long (max ${MAX_TEXT_LENGTH} characters).`);
        return;
      }
      setText(value);
      pingTyping();
    },
    [pingTyping],
  );

  const handlePaste = useCallback(
    (event) => {
      const items = event.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file && isImageFile(file) && file.size <= MAX_IMAGE_MB * 1024 * 1024) {
            event.preventDefault();
            setAttachment(file);
            return;
          }
        }
      }
    },
    [],
  );

  if (isBlocked) {
    return (
      <div className="flex items-center justify-center gap-2 border-t border-gray-200 bg-gray-50 px-4 py-3 text-center text-xs text-gray-500 dark:border-gray-800 dark:bg-gray-900/60 dark:text-gray-400">
        <span>You have blocked this contact.</span>
        <button
          type="button"
          onClick={onUnblock}
          className="font-semibold text-brand-600 hover:underline dark:text-brand-400"
        >
          Unblock
        </button>
      </div>
    );
  }

  if (disabled) {
    return (
      <div className="border-t border-gray-200 bg-gray-50 px-4 py-3 text-center text-xs text-gray-500 dark:border-gray-800 dark:bg-gray-900/60 dark:text-gray-400">
        {disabledReason || 'You cannot send messages in this conversation.'}
      </div>
    );
  }

  const remaining = MAX_TEXT_LENGTH - trimmedText.length;
  const showCounter = trimmedText.length > MAX_TEXT_LENGTH * 0.8;

  const sendTooltipLabel = !isConnected
    ? 'Offline — will try to send over HTTP'
    : '';
  const sendVisuallyMuted = canSend && !isConnected;

  return (
    <div
      className="relative bg-white/95 dark:bg-[#16162a]/95 backdrop-blur-md"
      style={{
        borderTop: '1px solid rgba(124,58,237,0.16)',
      }}
    >
      {replyTo ? (
        <div
          className="flex items-start gap-2 px-3 py-2 bg-brand-50/50 dark:bg-[rgba(124,58,237,0.06)]"
          style={{ borderBottom: '1px solid rgba(124,58,237,0.12)' }}
        >
          <span className="mt-0.5 inline-block h-full w-0.5 self-stretch rounded ww-gradient-bg" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-brand-600 dark:text-[#a78bfa]">
              Replying to {replyTo?.sender?.displayName || replyTo?.sender?.username || 'message'}
            </p>
            <p className="truncate text-xs text-gray-600 dark:text-[#6b6b8a]">
              {onelinePreview(replyTo?.text) ||
                (replyTo?.type === 'image' ? '📷 Photo' : 'Message')}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            className="rounded-full p-1 transition-colors text-gray-500 hover:text-brand-600 hover:bg-brand-100 dark:text-[#6b6b8a] dark:hover:text-[#a78bfa] dark:hover:bg-[rgba(124,58,237,0.12)]"
            aria-label="Cancel reply"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {attachmentPreview ? (
        <div
          className="flex items-center gap-3 px-3 py-2 bg-gray-50 dark:bg-[#16162a]/80"
          style={{ borderBottom: '1px solid rgba(124,58,237,0.12)' }}
        >
          <div className="relative">
            <img
              src={attachmentPreview}
              alt="Attachment preview"
              className="h-16 w-16 rounded-xl object-cover"
              style={{ border: '1px solid rgba(124,58,237,0.30)' }}
            />
            {isUploading ? (
              <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/50">
                <Spinner size="sm" />
              </span>
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium" style={{ color: '#c4b5fd' }}>
              {attachment?.name || 'Image'}
            </p>
            <p className="text-[11px]" style={{ color: '#6b6b8a' }}>
              Add an optional caption below, then send.
            </p>
          </div>
          <button
            type="button"
            onClick={clearAttachment}
            disabled={isUploading || isSending}
            className="rounded-full p-1 transition-colors disabled:opacity-50"
            style={{ color: '#6b6b8a' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#fb7185'; e.currentTarget.style.background = 'rgba(244,63,94,0.10)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#6b6b8a'; e.currentTarget.style.background = ''; }}
            aria-label="Remove attachment"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {isEmojiOpen && !isMobile ? (
        <div
          ref={emojiContainerRef}
          className="absolute bottom-full right-2 z-30 mb-2 overflow-hidden rounded-xl shadow-2xl"
        >
          <EmojiPicker
            onEmojiClick={handleEmojiSelect}
            theme={emojiTheme}
            emojiStyle={EmojiStyle.NATIVE}
            lazyLoadEmojis
            searchPlaceholder="Search emoji"
            previewConfig={{ showPreview: false }}
            width={320}
            height={380}
          />
        </div>
      ) : null}

      <form
        className="flex items-end gap-2 px-3 py-2.5"
        onSubmit={(event) => {
          event.preventDefault();
          handleSubmit();
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          className="hidden"
          onChange={handleFileChange}
          aria-hidden="true"
          tabIndex={-1}
        />

        <Tooltip content="Attach image" position="top">
          <button
            type="button"
            onClick={handleAttachClick}
            disabled={isSending || isUploading}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 text-gray-500 hover:text-brand-600 hover:bg-brand-100 dark:text-[#6b6b8a] dark:hover:text-[#a78bfa] dark:hover:bg-[rgba(124,58,237,0.12)]"
            aria-label="Attach image"
          >
            <ImagePlus className="h-5 w-5" aria-hidden="true" />
          </button>
        </Tooltip>

        <div
          className="flex min-w-0 flex-1 items-end gap-1 rounded-2xl px-3 py-1.5 bg-gray-100/50 dark:bg-[rgba(255,255,255,0.06)] border border-gray-200 dark:border-[rgba(124,58,237,0.20)]"
        >
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onBlur={stopTyping}
            onFocus={handleTextareaFocus}
            placeholder={hasAttachment ? 'Add a caption…' : 'Message…'}
            rows={1}
            maxLength={Math.floor(MAX_TEXT_LENGTH * 1.1)}
            aria-label="Message text"
            className="scrollbar-thin max-h-40 min-h-6 w-full resize-none bg-transparent text-sm text-gray-900 dark:text-[#e2e2f0] caret-brand-600 dark:caret-[#a78bfa] !border-0 !outline-none !ring-0 !shadow-none focus:!border-transparent focus:!ring-0 focus:!outline-none focus:!shadow-none focus-visible:!shadow-none focus-visible:!ring-0"
          />

          <Tooltip content={isEmojiOpen ? 'Show keyboard' : 'Choose emoji'} position="top">
            <button
              type="button"
              onClick={handleEmojiToggle}
              disabled={isSending}
              className={clsx(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50',
                isEmojiOpen 
                  ? 'bg-brand-100 text-brand-600 dark:bg-[rgba(124,58,237,0.20)] dark:text-[#a78bfa]'
                  : 'text-gray-500 hover:text-brand-600 hover:bg-brand-100 dark:text-[#6b6b8a] dark:hover:text-[#a78bfa] dark:hover:bg-[rgba(124,58,237,0.10)]'
              )}
              aria-label={isEmojiOpen ? 'Show keyboard' : 'Insert emoji'}
              aria-expanded={isEmojiOpen}
            >
              {isEmojiOpen ? (
                <Keyboard className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Smile className="h-5 w-5" aria-hidden="true" />
              )}
            </button>
          </Tooltip>
        </div>

        {isScheduleOpen && (
          <div className="absolute bottom-full right-12 z-30 mb-2 rounded-xl bg-white p-2 shadow-2xl dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
              Schedule Message
            </label>
            <select
              value={scheduledFor}
              onChange={(e) => setScheduledFor(e.target.value)}
              className="w-full rounded border-gray-300 bg-gray-50 p-1 text-xs text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            >
              <option value="" disabled>Select time</option>
              <option value="5">In 5 minutes</option>
              <option value="15">In 15 minutes</option>
              <option value="30">In 30 minutes</option>
              <option value="60">In 1 hour</option>
              <option value="120">In 2 hours</option>
              <option value="360">In 6 hours</option>
              <option value="custom">Custom...</option>
            </select>
            {scheduledFor === 'custom' && (
              <div className="mt-2">
                <input
                  type="datetime-local"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="w-full rounded border-gray-300 bg-gray-50 p-1 text-xs text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>
            )}
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setScheduledFor('');
                  setCustomDate('');
                  setIsScheduleOpen(false);
                }}
                className="rounded px-2 py-1 text-[10px] text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setIsScheduleOpen(false)}
                className="rounded bg-indigo-500 px-2 py-1 text-[10px] text-white hover:bg-indigo-600"
              >
                Set
              </button>
            </div>
          </div>
        )}

        <Tooltip label={scheduledFor ? 'Scheduled time set' : 'Schedule message'} position="top">
          <button
            type="button"
            onClick={() => setIsScheduleOpen(!isScheduleOpen)}
            disabled={isSending || isUploading || !canSend}
            className={clsx(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50',
              scheduledFor
                ? 'bg-pink-100 text-pink-500 dark:bg-[rgba(236,72,153,0.15)] dark:text-[#ec4899]'
                : 'text-gray-500 hover:text-pink-500 hover:bg-pink-50 dark:text-[#6b6b8a] dark:hover:text-[#ec4899] dark:hover:bg-[rgba(236,72,153,0.12)]'
            )}
            aria-label="Schedule message"
          >
            <Clock className="h-5 w-5" aria-hidden="true" />
          </button>
        </Tooltip>

        <Tooltip label={sendTooltipLabel} position="top">
          <button
            type="submit"
            disabled={!canSend}
            onMouseDown={(e) => e.preventDefault()}
            aria-disabled={!canSend || sendVisuallyMuted}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-200 ww-send-pop"
            style={!canSend
              ? { background: 'rgba(255,255,255,0.06)', color: '#4a4a6a', cursor: 'not-allowed' }
              : sendVisuallyMuted
              ? { background: 'rgba(245,158,11,0.85)', color: '#fff' }
              : {
                  background: 'linear-gradient(135deg, #7c3aed, #ec4899)',
                  boxShadow: '0 2px 12px rgba(124,58,237,0.50)',
                  color: '#fff',
                }}
            aria-label={
              sendVisuallyMuted ? 'Send message (offline)' : 'Send message'
            }
            title={sendVisuallyMuted ? 'Offline — will try to send over HTTP' : 'Send message'}
          >
            {isSending || isUploading ? (
              <Spinner size="sm" className="border-white/40 border-t-white" />
            ) : (
              <Send className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </Tooltip>
      </form>

      {(showCounter || isOverLimit || !isConnected) ? (
        <div className="flex items-center justify-between gap-2 px-4 pb-1.5 text-[10px]">
          <span
            className="truncate"
            style={{ color: isConnected ? '#4a4a6a' : '#f59e0b' }}
          >
            {isConnected ? '' : 'Offline — message will be sent over HTTP.'}
          </span>
          {showCounter || isOverLimit ? (
            <span
              className="tabular-nums"
              style={{ color: isOverLimit ? '#fb7185' : '#4a4a6a', fontWeight: isOverLimit ? 500 : 400 }}
            >
              {remaining}
            </span>
          ) : null}
        </div>
      ) : null}

      {isEmojiOpen && isMobile ? (
        <div
          className="w-full flex justify-center py-2 shrink-0"
          style={{ borderTop: '1px solid rgba(124,58,237,0.15)' }}
        >
          <EmojiPicker
            onEmojiClick={handleEmojiSelect}
            theme={emojiTheme}
            emojiStyle={EmojiStyle.NATIVE}
            lazyLoadEmojis
            searchPlaceholder="Search emoji"
            previewConfig={{ showPreview: false }}
            width="100%"
            height={280}
          />
        </div>
      ) : null}
    </div>
  );
};

export default memo(MessageComposer);
