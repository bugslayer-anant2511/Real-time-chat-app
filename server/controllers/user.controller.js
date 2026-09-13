import { User } from '../models/User.js';
import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { escapeRegex } from '../utils/escapeRegex.js';
import { ROLES, USER_STATUS, CONVERSATION_TYPES, MESSAGE_TYPES } from '../utils/constants.js';
import { broadcastNewMessage } from '../sockets/message.socket.js';
import mongoose from 'mongoose';

const SEARCH_RESULT_LIMIT = 20;

const PREFERENCE_PATHS = Object.freeze([
  'theme',
  'fontSize',
  'contentDensity',
  'animations',
  'enterToSend',
  'showReadReceipts',
  'showOnlineStatus',
  'notifications.browser',
  'notifications.sound',
  'notifications.muteAll',
]);

const getByPath = (obj, path) => {
  if (!obj) return undefined;
  return path.split('.').reduce(
    (acc, key) => (acc == null ? undefined : acc[key]),
    obj,
  );
};

const PUBLIC_USER_PROJECTION =
  '_id username displayName avatarUrl bio isOnline lastSeenAt createdAt preferences.showOnlineStatus';

const maskPresence = (user) => {
  if (!user) return null;
  const showOnline = user?.preferences?.showOnlineStatus !== false;
  delete user.preferences;
  if (!showOnline) {
    user.isOnline = false;
    user.lastSeenAt = null;
  }
  return user;
};

const extractBlockedIds = (blockedUsers) =>
  (blockedUsers ?? [])
    .map((entry) => entry?.user)
    .filter(Boolean);

// GET /api/users/search?q=...
export const searchUsers = asyncHandler(async (req, res) => {
  const raw = String(req.query.q ?? '').trim();
  const pattern = new RegExp(`^${escapeRegex(raw)}`, 'i');

  const blockedIds = extractBlockedIds(req.user.blockedUsers);

  const users = await User.find({
    status: USER_STATUS.ACTIVE,
    _id: { $ne: req.user._id, $nin: blockedIds },
    'blockedUsers.user': { $ne: req.user._id },
    $or: [{ username: pattern }, { displayName: pattern }],
  })
    .select('_id username displayName avatarUrl isOnline preferences.showOnlineStatus')
    .limit(SEARCH_RESULT_LIMIT)
    .lean();

  const data = users.map((u) => {
    const showOnline = u?.preferences?.showOnlineStatus !== false;
    return {
      _id: u._id,
      username: u.username,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl ?? '',
      isOnline: showOnline ? Boolean(u.isOnline) : false,
    };
  });

  res.status(200).json({
    success: true,
    data: { users: data, count: data.length },
  });
});

// GET /api/users/:username
export const getPublicProfile = asyncHandler(async (req, res) => {
  const username = String(req.params.username ?? '').toLowerCase();

  const user = await User.findOne({
    username,
    status: USER_STATUS.ACTIVE,
  })
    .select(PUBLIC_USER_PROJECTION)
    .lean();

  if (!user) throw ApiError.notFound('User not found');

  const isSelf = String(user._id) === String(req.user._id);
  const viewerBlockedTarget = (req.user.blockedUsers ?? []).some(
    (entry) => String(entry?.user) === String(user._id),
  );

  const masked = maskPresence({ ...user });

  res.status(200).json({
    success: true,
    data: {
      user: masked,
      relationship: {
        isSelf,
        isBlockedByMe: viewerBlockedTarget,
      },
    },
  });
});

// PATCH /api/users/me/preferences
export const updatePreferences = asyncHandler(async (req, res) => {
  const $set = {};

  for (const path of PREFERENCE_PATHS) {
    const value = getByPath(req.body, path);
    if (value === undefined) continue;
    $set[`preferences.${path}`] = value;
  }

  if (Object.keys($set).length === 0) {
    throw ApiError.badRequest('No valid preference fields provided');
  }

  const updated = await User.findByIdAndUpdate(
    req.user._id,
    { $set },
    { new: true, runValidators: true },
  ).lean();

  if (!updated) throw ApiError.unauthorized('User no longer exists');

  res.status(200).json({
    success: true,
    message: 'Preferences updated',
    data: { preferences: updated.preferences },
  });
});

// GET /api/users/me/blocked
export const getBlockedUsers = asyncHandler(async (req, res) => {
  const me = await User.findById(req.user._id)
    .populate({
      path: 'blockedUsers.user',
      select: '_id username displayName avatarUrl',
      match: { status: { $ne: USER_STATUS.DELETED } },
    })
    .select('blockedUsers')
    .lean();

  const blocked = (me?.blockedUsers ?? [])
    .filter((entry) => entry?.user)
    .map((entry) => ({
      ...entry.user,
      blockedAt: entry.blockedAt,
    }));

  res.status(200).json({
    success: true,
    data: { users: blocked, count: blocked.length },
  });
});

const loadBlockTarget = async ({ requesterId, targetId }) => {
  if (String(requesterId) === String(targetId)) {
    throw ApiError.badRequest('You cannot block yourself');
  }
  const target = await User.findById(targetId).select('role status').lean();
  if (!target) throw ApiError.notFound('User not found');
  if (target.status !== USER_STATUS.ACTIVE) {
    throw ApiError.badRequest('User is not available');
  }
  if (target.role === ROLES.ADMIN) {
    throw ApiError.forbidden('Admins cannot be blocked');
  }
  return target;
};

// POST /api/users/:userId/block
export const blockUser = asyncHandler(async (req, res) => {
  const { userId: targetId } = req.params;
  const requesterId = req.user._id;

  await loadBlockTarget({
    requesterId,
    targetId,
  });

  const result = await User.updateOne(
    { _id: requesterId, 'blockedUsers.user': { $ne: targetId } },
    { $push: { blockedUsers: { user: targetId, blockedAt: new Date() } } },
  );

  const alreadyBlocked = result.modifiedCount === 0;

  if (!alreadyBlocked) {
    const conversation = await Conversation.findOne({
      type: CONVERSATION_TYPES.DIRECT,
      participants: { $all: [requesterId, targetId] },
    });
    if (conversation) {
      const sysMsg = await Message.create({
        conversationId: conversation._id,
        sender: null,
        type: MESSAGE_TYPES.SYSTEM,
        text: 'You have blocked this contact',
        hiddenFor: [new mongoose.Types.ObjectId(String(targetId))],
      });
      const io = req.app.get('io');
      if (io) {
        await broadcastNewMessage(io, {
          message: sysMsg,
          conversation,
          fromUser: req.user,
        });
      }
    }
  }

  res.status(alreadyBlocked ? 200 : 201).json({
    success: true,
    message: alreadyBlocked ? 'User was already blocked' : 'User blocked',
    data: { userId: targetId, alreadyBlocked },
  });
});

// DELETE /api/users/:userId/block
export const unblockUser = asyncHandler(async (req, res) => {
  const { userId: targetId } = req.params;
  const requesterId = req.user._id;

  if (String(requesterId) === String(targetId)) {
    throw ApiError.badRequest('You cannot unblock yourself');
  }

  const result = await User.updateOne(
    { _id: requesterId },
    { $pull: { blockedUsers: { user: targetId } } },
  );

  const wasBlocked = result.modifiedCount > 0;

  if (wasBlocked) {
    const conversation = await Conversation.findOne({
      type: CONVERSATION_TYPES.DIRECT,
      participants: { $all: [requesterId, targetId] },
    });
    if (conversation) {
      if (!conversation.isAccepted) {
        conversation.isAccepted = true;
        await conversation.save();
      }
      const sysMsg = await Message.create({
        conversationId: conversation._id,
        sender: null,
        type: MESSAGE_TYPES.SYSTEM,
        text: 'You have unblocked this contact',
        hiddenFor: [new mongoose.Types.ObjectId(String(targetId))],
      });
      const io = req.app.get('io');
      if (io) {
        await broadcastNewMessage(io, {
          message: sysMsg,
          conversation,
          fromUser: req.user,
        });
      }
    }
  }

  res.status(200).json({
    success: true,
    message: wasBlocked ? 'User unblocked' : 'User was not blocked',
    data: { userId: targetId, wasBlocked },
  });
});
