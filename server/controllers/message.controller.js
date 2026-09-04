import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  createMessage,
  listMessages,
  editMessage,
  deleteMessage,
  toggleReaction,
  searchMessages,
} from '../utils/messageService.js';
import { MESSAGE_TYPES } from '../utils/constants.js';
import { safeDestroy } from '../config/cloudinary.js';
import { serializeMessage } from '../utils/serializers.js';

// GET /api/conversations/:id/messages
export const getMessages = asyncHandler(async (req, res) => {
  const { before, limit } = req.query;

  const { items, hasMore, nextCursor } = await listMessages({
    conversationId: req.params.id,
    userId: req.user._id,
    before: before || null,
    limit: limit ?? 30,
  });

  res.status(200).json({
    success: true,
    data: {
      items: items.map(serializeMessage),
      hasMore,
      nextCursor,
    },
  });
});

// POST /api/conversations/:id/messages
export const sendMessage = asyncHandler(async (req, res) => {
  const {
    type = MESSAGE_TYPES.TEXT,
    text = '',
    imageUrl = '',
    imagePublicId = '',
    replyTo = null,
  } = req.body;

  const message = await createMessage({
    conversationId: req.params.id,
    senderId: req.user._id,
    type,
    text,
    imageUrl,
    imagePublicId,
    replyTo,
  });

  const io = req.app.get('io');
  if (io) {
    try {
      const msgSocket = await import('../sockets/message.socket.js');
      if (msgSocket?.broadcastNewMessage) {
        msgSocket.broadcastNewMessage(io, { message }).catch(() => {});
      }
    } catch (err) {}
  }

  res.status(201).json({ success: true, data: serializeMessage(message) });
});

// PATCH /api/messages/:id
export const editMessageController = asyncHandler(async (req, res) => {
  const updated = await editMessage({
    messageId: req.params.id,
    actor: req.user,
    text: req.body.text,
  });

  const io = req.app.get('io');
  if (io) {
    try {
      const msgSocket = await import('../sockets/message.socket.js');
      if (msgSocket?.broadcastEditedMessage) {
        msgSocket.broadcastEditedMessage(io, { message: updated });
      }
    } catch (err) {}
  }

  res.status(200).json({ success: true, data: serializeMessage(updated) });
});

// DELETE /api/messages/:id
export const deleteMessageController = asyncHandler(async (req, res) => {
  const scope = req.body?.for;
  const result = await deleteMessage({
    messageId: req.params.id,
    actor: req.user,
    scope,
  });

  const io = req.app.get('io');
  const conversationId = String(result.message.conversationId);

  if (result.scope === 'self') {
    if (io) {
      try {
        const msgSocket = await import('../sockets/message.socket.js');
        if (msgSocket?.broadcastDeletedMessage) {
          msgSocket.broadcastDeletedMessage(io, {
            conversationId,
            messageId: req.params.id,
            scope: 'self',
            actorUserId: req.user._id,
          });
        }
      } catch (err) {}
    }
    return res
      .status(200)
      .json({ success: true, data: { id: req.params.id, scope: 'self' } });
  }

  if (io) {
    try {
      const msgSocket = await import('../sockets/message.socket.js');
      if (msgSocket?.broadcastDeletedMessage) {
        msgSocket.broadcastDeletedMessage(io, {
          conversationId,
          messageId: req.params.id,
          scope: 'everyone',
        });
      }
    } catch (err) {}
  }

  if (result.imagePublicId) {
    safeDestroy(result.imagePublicId);
  }

  res.status(200).json({
    success: true,
    data: {
      scope: 'everyone',
      message: serializeMessage(result.message),
    },
  });
});

// POST /api/messages/:id/reactions
export const toggleReactionController = asyncHandler(async (req, res) => {
  const { action, message } = await toggleReaction({
    messageId: req.params.id,
    actor: req.user,
    emoji: req.body.emoji,
  });

  const io = req.app.get('io');
  if (io) {
    try {
      const msgSocket = await import('../sockets/message.socket.js');
      if (msgSocket?.broadcastReactionUpdated) {
        msgSocket.broadcastReactionUpdated(io, { message });
      }
    } catch (err) {}
  }

  res.status(200).json({
    success: true,
    data: {
      action,
      reactions: message.reactions,
      message: serializeMessage(message),
    },
  });
});

// GET /api/conversations/:id/messages/search
export const searchMessagesController = asyncHandler(async (req, res) => {
  const { q, limit } = req.query;
  if (typeof q !== 'string') {
    throw ApiError.badRequest('Search term is required');
  }

  const { items, total } = await searchMessages({
    conversationId: req.params.id,
    userId: req.user._id,
    q,
    limit: limit ?? 30,
  });

  res.status(200).json({
    success: true,
    data: { items: items.map(serializeMessage), total },
  });
});
