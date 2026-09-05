import mongoose from 'mongoose';
import { Conversation } from '../models/Conversation.js';
import { User } from '../models/User.js';
import { isProduction } from '../config/env.js';
import {
  CONVERSATION_TYPES,
  MESSAGE_TYPES,
  MESSAGE_DELETED_FOR,
  USER_STATUS,
} from '../utils/constants.js';
import {
  createMessage,
  editMessage,
  deleteMessage,
  toggleReaction,
  markConversationAsRead,
} from '../utils/messageService.js';
import { safeDestroy } from '../config/cloudinary.js';
import {
  serializeMessage,
  serializeNotification,
  serializePublicUser,
} from '../utils/serializers.js';
import { persistMessageNotification } from '../utils/notificationService.js';
import { convRoom, userRoom } from './rooms.js';
import {
  addActiveViewer,
  removeActiveViewer,
  isUserActiveInConversation,
} from './activeConversations.js';

const { Types } = mongoose;

const isValidObjectId = (value) =>
  typeof value === 'string' &&
  /^[a-f0-9]{24}$/i.test(value) &&
  Types.ObjectId.isValid(value);

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const pickAllowedKeys = (payload, allowed) => {
  if (!isPlainObject(payload)) return null;
  const out = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      out[key] = payload[key];
    }
  }
  return out;
};

const withAck = (rawAck, label) => {
  const ack = typeof rawAck === 'function' ? rawAck : () => {};
  return {
    success: (data) => ack({ success: true, ...data }),
    failure: (message, err) => {
      if (!isProduction && err) {
        console.warn(`[socket:${label}]`, err?.message || err);
      }
      ack({ success: false, message });
    },
  };
};

const assertActorActive = async (userId) => {
  const fresh = await User.findById(userId).select('status').lean();
  return fresh?.status === USER_STATUS.ACTIVE;
};

const loadConversationContext = async (conversationId, senderId) => {
  const [conversation, fromUser] = await Promise.all([
    Conversation.findById(conversationId).select('participants type'),
    User.findById(senderId).select('username displayName avatarUrl').lean(),
  ]);
  if (!conversation) return { conversation: null, recipientIds: [], fromUser: null };
  const recipientIds = (conversation.participants || [])
    .map((p) => String(p))
    .filter((id) => id !== String(senderId));
  return { conversation, recipientIds, fromUser };
};

const emitNotifications = async ({
  io,
  conversationId,
  recipientIds,
  message,
  fromUser,
}) => {
  if (!Array.isArray(recipientIds) || recipientIds.length === 0) return;

  const candidateIds = recipientIds.filter(
    (id) => !isUserActiveInConversation(conversationId, id),
  );
  if (candidateIds.length === 0) return;

  const mutedRows = await User.find(
    {
      _id: { $in: candidateIds },
      mutedConversations: new Types.ObjectId(String(conversationId)),
    },
    { _id: 1 },
  ).lean();
  const mutedSet = new Set(mutedRows.map((u) => String(u._id)));

  const senderIdString = message?.sender?._id ? String(message.sender._id) : null;
  const messageIdString = message?._id ? String(message._id) : null;
  const fromUserWire = serializePublicUser(fromUser);

  await Promise.all(
    candidateIds.map(async (recipientId) => {
      if (mutedSet.has(recipientId)) return;

      let notificationWire = null;
      try {
        const persisted = await persistMessageNotification({
          recipientId,
          conversationId,
          messageId: messageIdString,
          actorId: senderIdString,
          message,
          fromUser,
        });
        notificationWire = serializeNotification(persisted);
      } catch (err) {
        if (!isProduction) {
          console.warn('[emitNotifications] persist failed:', err?.message || err);
        }
      }

      io.to(userRoom(recipientId)).emit('notification:new', {
        conversationId: String(conversationId),
        message,
        fromUser: fromUserWire,
        notification: notificationWire,
      });
    }),
  );
};

export const broadcastNewMessage = async (
  io,
  { message, conversation = null, fromUser = null, excludeSocketId = null },
) => {
  if (!io || !message) return;
  const conversationId = String(message.conversationId);
  const wire = serializeMessage(message);

  const target = excludeSocketId
    ? io.to(convRoom(conversationId)).except(excludeSocketId)
    : io.to(convRoom(conversationId));
  target.emit('message:new', wire);

  const senderId = wire?.sender?._id ? String(wire.sender._id) : null;
  if (!senderId) return;

  let ctx = { conversation, recipientIds: null, fromUser };
  if (!conversation || !fromUser) {
    ctx = await loadConversationContext(conversationId, senderId);
  } else {
    ctx.recipientIds = (conversation.participants || [])
      .map((p) => String(p))
      .filter((id) => id !== senderId);
  }

  if (!ctx.recipientIds || ctx.recipientIds.length === 0) return;

  await emitNotifications({
    io,
    conversationId,
    recipientIds: ctx.recipientIds,
    message: wire,
    fromUser: ctx.fromUser,
  });
};

export const broadcastEditedMessage = (io, { message, excludeSocketId = null }) => {
  if (!io || !message) return;
  const conversationId = String(message.conversationId);
  const wire = serializeMessage(message);
  const target = excludeSocketId
    ? io.to(convRoom(conversationId)).except(excludeSocketId)
    : io.to(convRoom(conversationId));
  target.emit('message:edited', wire);
};

export const broadcastDeletedMessage = (
  io,
  { conversationId, messageId, scope, actorUserId = null, excludeSocketId = null },
) => {
  if (!io || !conversationId || !messageId) return;

  const payload = {
    conversationId: String(conversationId),
    messageId: String(messageId),
    for: scope,
  };

  if (scope === 'self') {
    if (!actorUserId) return;
    const target = excludeSocketId
      ? io.to(userRoom(actorUserId)).except(excludeSocketId)
      : io.to(userRoom(actorUserId));
    target.emit('message:deleted', payload);
    return;
  }

  const target = excludeSocketId
    ? io.to(convRoom(conversationId)).except(excludeSocketId)
    : io.to(convRoom(conversationId));
  target.emit('message:deleted', payload);
};

export const broadcastReactionUpdated = (
  io,
  { message, excludeSocketId = null },
) => {
  if (!io || !message) return;
  const conversationId = String(message.conversationId);
  io.to(convRoom(conversationId))
    .except(excludeSocketId || [])
    .emit('message:reactionUpdated', {
      messageId: String(message._id),
      conversationId,
      reactions: message.reactions || [],
    });
};

export const broadcastReadReceipt = (
  io,
  { conversationId, userId, readAt, excludeSocketId = null },
) => {
  if (!io || !conversationId || !userId) return;
  const payload = {
    conversationId: String(conversationId),
    userId: String(userId),
    readAt: typeof readAt === 'string' ? readAt : new Date(readAt).toISOString(),
  };
  const target = excludeSocketId
    ? io.to(convRoom(conversationId)).except(excludeSocketId)
    : io.to(convRoom(conversationId));
  target.emit('conversation:readBy', payload);
};

const SEND_KEYS = [
  'conversationId',
  'type',
  'text',
  'imageUrl',
  'imagePublicId',
  'replyTo',
  'clientTempId',
];
const EDIT_KEYS = ['messageId', 'text'];
const DELETE_KEYS = ['messageId', 'for'];
const REACTION_KEYS = ['messageId', 'emoji'];
const CONV_ID_KEYS = ['conversationId'];

export const registerMessageHandlers = (io, socket) => {
  const userId = String(socket.user._id);

  socket.on('message:send', async (raw, rawAck) => {
    const ack = withAck(rawAck, 'message:send');
    try {
      const payload = pickAllowedKeys(raw, SEND_KEYS);
      if (!payload) return ack.failure('Invalid payload');
      if (!isValidObjectId(payload.conversationId)) {
        return ack.failure('Invalid conversation id');
      }

      const clientTempId =
        typeof payload.clientTempId === 'string' && payload.clientTempId.length <= 64
          ? payload.clientTempId
          : null;

      if (!(await assertActorActive(userId))) {
        return ack.failure('Account is not active');
      }

      const persisted = await createMessage({
        conversationId: payload.conversationId,
        senderId: userId,
        type: payload.type,
        text: payload.text,
        imageUrl: payload.imageUrl,
        imagePublicId: payload.imagePublicId,
        replyTo: payload.replyTo ?? null,
      });

      await broadcastNewMessage(io, {
        message: persisted,
        excludeSocketId: socket.id,
      });

      const wire = serializeMessage(
        persisted,
        clientTempId ? { clientTempId } : null,
      );
      return ack.success({ message: wire });
    } catch (err) {
      const message = err?.statusCode ? err.message : 'Failed to send message';
      return ack.failure(message, err);
    }
  });

  socket.on('message:edit', async (raw, rawAck) => {
    const ack = withAck(rawAck, 'message:edit');
    try {
      const payload = pickAllowedKeys(raw, EDIT_KEYS);
      if (!payload) return ack.failure('Invalid payload');
      if (!isValidObjectId(payload.messageId)) {
        return ack.failure('Invalid message id');
      }

      if (!(await assertActorActive(userId))) {
        return ack.failure('Account is not active');
      }

      const updated = await editMessage({
        messageId: payload.messageId,
        actor: socket.user,
        text: payload.text,
      });

      broadcastEditedMessage(io, {
        message: updated,
        excludeSocketId: socket.id,
      });

      return ack.success({ message: serializeMessage(updated) });
    } catch (err) {
      const message = err?.statusCode ? err.message : 'Failed to edit message';
      return ack.failure(message, err);
    }
  });

  socket.on('message:delete', async (raw, rawAck) => {
    const ack = withAck(rawAck, 'message:delete');
    try {
      const payload = pickAllowedKeys(raw, DELETE_KEYS);
      if (!payload) return ack.failure('Invalid payload');
      if (!isValidObjectId(payload.messageId)) {
        return ack.failure('Invalid message id');
      }
      if (payload.for !== 'self' && payload.for !== 'everyone') {
        return ack.failure("'for' must be 'self' or 'everyone'");
      }

      if (!(await assertActorActive(userId))) {
        return ack.failure('Account is not active');
      }

      const result = await deleteMessage({
        messageId: payload.messageId,
        actor: socket.user,
        scope: payload.for,
      });

      const conversationId = String(result.message.conversationId);

      broadcastDeletedMessage(io, {
        conversationId,
        messageId: payload.messageId,
        scope: result.scope,
        actorUserId: userId,
        excludeSocketId: socket.id,
      });

      if (result.scope === 'everyone' && result.imagePublicId) {
        safeDestroy(result.imagePublicId);
      }

      return ack.success({
        messageId: String(payload.messageId),
        conversationId,
        for: result.scope,
      });
    } catch (err) {
      const message = err?.statusCode ? err.message : 'Failed to delete message';
      return ack.failure(message, err);
    }
  });

  socket.on('message:reaction', async (raw, rawAck) => {
    const ack = withAck(rawAck, 'message:reaction');
    try {
      const payload = pickAllowedKeys(raw, REACTION_KEYS);
      if (!payload) return ack.failure('Invalid payload');
      if (!isValidObjectId(payload.messageId)) {
        return ack.failure('Invalid message id');
      }
      if (typeof payload.emoji !== 'string' || payload.emoji.trim().length === 0) {
        return ack.failure('emoji is required');
      }

      if (!(await assertActorActive(userId))) {
        return ack.failure('Account is not active');
      }

      const { action, message } = await toggleReaction({
        messageId: payload.messageId,
        actor: socket.user,
        emoji: payload.emoji,
      });

      broadcastReactionUpdated(io, { message, excludeSocketId: socket.id });

      return ack.success({
        action,
        messageId: String(message._id),
        conversationId: String(message.conversationId),
        reactions: message.reactions,
      });
    } catch (err) {
      const message = err?.statusCode ? err.message : 'Failed to react to message';
      return ack.failure(message, err);
    }
  });

  socket.on('conversation:read', async (raw, rawAck) => {
    const ack = withAck(rawAck, 'conversation:read');
    try {
      const payload = pickAllowedKeys(raw, CONV_ID_KEYS);
      if (!payload) return ack.failure('Invalid payload');
      if (!isValidObjectId(payload.conversationId)) {
        return ack.failure('Invalid conversation id');
      }

      await markConversationAsRead({
        conversationId: payload.conversationId,
        userId,
      });

      const fresh = await User.findById(userId)
        .select('preferences.showReadReceipts')
        .lean();
      const allowsBroadcast = fresh?.preferences?.showReadReceipts !== false;
      const readAt = new Date().toISOString();

      if (allowsBroadcast) {
        broadcastReadReceipt(io, {
          conversationId: payload.conversationId,
          userId,
          readAt,
          excludeSocketId: socket.id,
        });
      }

      return ack.success({
        conversationId: String(payload.conversationId),
        readAt,
        broadcast: allowsBroadcast,
      });
    } catch (err) {
      const message = err?.statusCode ? err.message : 'Failed to mark as read';
      return ack.failure(message, err);
    }
  });

  socket.on('conversation:open', async (raw, rawAck) => {
    const ack = withAck(rawAck, 'conversation:open');
    try {
      const payload = pickAllowedKeys(raw, CONV_ID_KEYS);
      if (!payload) return ack.failure('Invalid payload');
      if (!isValidObjectId(payload.conversationId)) {
        return ack.failure('Invalid conversation id');
      }

      const conversation = await Conversation.findOne(
        { _id: payload.conversationId, participants: userId, isActive: true },
        '_id',
      ).lean();
      if (!conversation) return ack.failure('Conversation not found');

      const previous = socket.data.activeConversationId;
      if (previous && previous !== payload.conversationId) {
        removeActiveViewer(previous, userId);
      }

      socket.data.activeConversationId = payload.conversationId;
      addActiveViewer(payload.conversationId, userId);

      return ack.success({ conversationId: String(payload.conversationId) });
    } catch (err) {
      return ack.failure('Failed to open conversation', err);
    }
  });

  socket.on('conversation:close', async (raw, rawAck) => {
    const ack = withAck(rawAck, 'conversation:close');
    try {
      const payload = pickAllowedKeys(raw, CONV_ID_KEYS);
      const targetId = payload?.conversationId;
      const active = socket.data.activeConversationId;

      if (!targetId) {
        if (active) {
          removeActiveViewer(active, userId);
          socket.data.activeConversationId = null;
        }
        return ack.success({});
      }

      if (!isValidObjectId(targetId)) {
        return ack.failure('Invalid conversation id');
      }

      if (active === targetId) {
        removeActiveViewer(active, userId);
        socket.data.activeConversationId = null;
      }
      return ack.success({});
    } catch (err) {
      return ack.failure('Failed to close conversation', err);
    }
  });
};

export default registerMessageHandlers;

export const _internals = {
  pickAllowedKeys,
  isValidObjectId,
  emitNotifications,
  MESSAGE_TYPES,
  MESSAGE_DELETED_FOR,
  CONVERSATION_TYPES,
};
