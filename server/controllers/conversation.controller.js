import mongoose from 'mongoose';
import { Conversation } from '../models/Conversation.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  findOrCreateDirectConversation,
  assertParticipant,
  assertGroupAdmin,
} from '../utils/conversationService.js';
import {
  createSystemMessage,
  buildSystemMessageText,
  markConversationAsRead,
} from '../utils/messageService.js';
import { parsePagination, buildPageMeta } from '../utils/pagination.js';
import {
  CONVERSATION_TYPES,
  GROUP_MAX_PARTICIPANTS,
  USER_STATUS,
} from '../utils/constants.js';

const { Types } = mongoose;

const emitSystemMessage = async (io, message) => {
  if (!io || !message) return;
  // Dynamic import or check to prevent circular reference or runtime errors when sockets layer is not built yet
  try {
    const socketsModule = await import('../sockets/message.socket.js');
    if (socketsModule?.broadcastNewMessage) {
      await socketsModule.broadcastNewMessage(io, { message });
    }
  } catch (err) {
    // Gracefully ignore since socket server might not be initialized yet in tests
  }
};

const PARTICIPANT_PROJECTION =
  '_id username displayName avatarUrl isOnline lastSeenAt preferences.showOnlineStatus status';

const idEquals = (a, b) => String(a) === String(b);

const serializeParticipant = (rawUser) => {
  if (!rawUser) return null;
  const user =
    typeof rawUser.toObject === 'function'
      ? rawUser.toObject({ virtuals: false, versionKey: false })
      : { ...rawUser };

  const showOnline = user?.preferences?.showOnlineStatus !== false;
  delete user.preferences;

  if (!showOnline) {
    user.isOnline = false;
    user.lastSeenAt = null;
  }
  return user;
};

const serializeConversation = (conv, viewerId) => {
  if (!conv) return null;
  const obj = conv.toObject({
    virtuals: false,
    versionKey: false,
    flattenMaps: true,
  });

  const viewer = String(viewerId);
  const unreadMap = obj.unreadCounts || {};
  const unreadCount = Number(unreadMap[viewer]) || 0;
  delete obj.unreadCounts;

  obj.unreadCount = unreadCount;
  obj.participants = (obj.participants || []).map(serializeParticipant);
  return obj;
};

const populateAndSerialize = async (conv, viewerId) => {
  await conv.populate({ path: 'participants', select: PARTICIPANT_PROJECTION });
  return serializeConversation(conv, viewerId);
};

const loadAndAssertUsable = async (targetIds, requester) => {
  const requesterId = String(requester._id);
  const requesterBlocks = new Set(
    (requester.blockedUsers || [])
      .map((entry) => entry?.user)
      .filter(Boolean)
      .map((id) => String(id)),
  );

  const users = await User.find({ _id: { $in: targetIds } })
    .select('blockedUsers status')
    .lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));

  for (const id of targetIds) {
    const user = byId.get(String(id));
    if (!user) throw ApiError.badRequest('One or more users do not exist');
    if (user.status !== USER_STATUS.ACTIVE) {
      throw ApiError.badRequest('One or more users are unavailable');
    }
    if (requesterBlocks.has(String(user._id))) {
      throw ApiError.forbidden('You have blocked one of the selected users');
    }
    const theyBlock = (user.blockedUsers || [])
      .map((entry) => String(entry?.user))
      .filter(Boolean);
    if (theyBlock.includes(requesterId)) {
      throw ApiError.forbidden('One of the selected users has blocked you');
    }
  }

  return users;
};

// GET /api/conversations
export const getConversations = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, {
    defaultLimit: 20,
    maxLimit: 50,
  });

  const wantsArchived = req.query.archived === 'true';
  const archivedIds = (req.user.archivedConversations || []).map(
    (id) => new Types.ObjectId(String(id)),
  );

  const filter = { participants: req.user._id, isActive: true };

  if (wantsArchived) {
    if (archivedIds.length === 0) {
      return res.status(200).json({
        success: true,
        data: { items: [], ...buildPageMeta({ total: 0, page, limit }) },
      });
    }
    filter._id = { $in: archivedIds };
  } else if (archivedIds.length > 0) {
    filter._id = { $nin: archivedIds };
  }

  const [items, total] = await Promise.all([
    Conversation.find(filter)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({ path: 'participants', select: PARTICIPANT_PROJECTION }),
    Conversation.countDocuments(filter),
  ]);

  const data = items.map((c) => serializeConversation(c, req.user._id));

  res.status(200).json({
    success: true,
    data: { items: data, ...buildPageMeta({ total, page, limit }) },
  });
});

// POST /api/conversations/direct
export const createDirect = asyncHandler(async (req, res) => {
  const { userId } = req.body;

  if (idEquals(userId, req.user._id)) {
    throw ApiError.badRequest('Cannot create a direct conversation with yourself');
  }

  await loadAndAssertUsable([userId], req.user);

  const conversation = await findOrCreateDirectConversation(req.user._id, userId);
  const data = await populateAndSerialize(conversation, req.user._id);

  res.status(200).json({ success: true, data });
});

// POST /api/conversations/group
export const createGroup = asyncHandler(async (req, res) => {
  const { name, participantIds, avatarUrl = '' } = req.body;

  const requesterId = String(req.user._id);
  const uniqueOthers = Array.from(
    new Set(participantIds.map((id) => String(id))),
  ).filter((id) => id !== requesterId);

  if (uniqueOthers.length === 0) {
    throw ApiError.badRequest('Group requires at least one other participant');
  }
  if (uniqueOthers.length + 1 > GROUP_MAX_PARTICIPANTS) {
    throw ApiError.badRequest(
      `Group cannot exceed ${GROUP_MAX_PARTICIPANTS} participants`,
    );
  }

  await loadAndAssertUsable(uniqueOthers, req.user);

  const participants = [requesterId, ...uniqueOthers];

  const created = await Conversation.create({
    type: CONVERSATION_TYPES.GROUP,
    name: name.trim(),
    avatarUrl: avatarUrl || '',
    participants,
    admins: [requesterId],
    createdBy: requesterId,
  });

  const data = await populateAndSerialize(created, req.user._id);

  const io = req.app.get('io');
  if (io) {
    try {
      const groupSocket = await import('../sockets/group.socket.js');
      if (groupSocket?.emitGroupCreated) {
        groupSocket.emitGroupCreated(io, { conversation: data, memberIds: participants });
      }
    } catch (err) {
      // Ignored
    }
  }

  res.status(201).json({ success: true, data });
});

// GET /api/conversations/:id
export const getConversation = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findById(req.params.id).populate({
    path: 'participants',
    select: PARTICIPANT_PROJECTION,
  });
  assertParticipant(conversation, req.user._id);

  res
    .status(200)
    .json({ success: true, data: serializeConversation(conversation, req.user._id) });
});

// PATCH /api/conversations/:id
export const updateConversation = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findById(req.params.id);
  assertParticipant(conversation, req.user._id);

  if (conversation.type !== CONVERSATION_TYPES.GROUP) {
    throw ApiError.badRequest('Only group conversations can be updated');
  }
  assertGroupAdmin(conversation, req.user._id);

  const ALLOWED = ['name', 'avatarUrl'];
  let touched = false;
  let renamedFrom = null;
  let renamedTo = null;
  for (const key of ALLOWED) {
    if (Object.prototype.hasOwnProperty.call(req.body, key)) {
      const value = req.body[key];
      if (key === 'name') {
        const trimmed = typeof value === 'string' ? value.trim() : '';
        if (trimmed.length === 0) continue;
        if (trimmed !== conversation.name) {
          renamedFrom = conversation.name;
          renamedTo = trimmed;
        }
        conversation.name = trimmed;
      } else {
        conversation.avatarUrl = typeof value === 'string' ? value : '';
      }
      touched = true;
    }
  }

  if (!touched) {
    throw ApiError.badRequest('No valid fields provided to update');
  }

  await conversation.save();

  const io = req.app.get('io');

  if (renamedTo) {
    const sysMsg = await createSystemMessage({
      conversationId: conversation._id,
      text: buildSystemMessageText(
        '{actor} renamed the group from "{from}" to "{to}"',
        { actor: req.user.displayName, from: renamedFrom, to: renamedTo },
      ),
    });
    await emitSystemMessage(io, sysMsg);
  }

  const data = await populateAndSerialize(conversation, req.user._id);

  if (io) {
    const changes = {};
    for (const key of ALLOWED) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) {
        changes[key] = key === 'name' ? conversation.name : conversation.avatarUrl;
      }
    }
    if (Object.keys(changes).length > 0) {
      try {
        const groupSocket = await import('../sockets/group.socket.js');
        if (groupSocket?.emitGroupUpdated) {
          groupSocket.emitGroupUpdated(io, {
            conversationId: conversation._id,
            changes,
            byUserId: req.user._id,
          });
        }
      } catch (err) {
        // Ignored
      }
    }
  }

  res.status(200).json({ success: true, data });
});

// POST /api/conversations/:id/members
export const addMembers = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findById(req.params.id);
  assertParticipant(conversation, req.user._id);

  if (conversation.type !== CONVERSATION_TYPES.GROUP) {
    throw ApiError.badRequest('Only group conversations accept new members');
  }
  assertGroupAdmin(conversation, req.user._id);

  const existing = new Set(conversation.participants.map((p) => String(p)));
  const requestedIds = Array.from(
    new Set(req.body.userIds.map((id) => String(id))),
  ).filter((id) => !existing.has(id));

  if (requestedIds.length === 0) {
    throw ApiError.badRequest('All provided users are already members');
  }

  if (existing.size + requestedIds.length > GROUP_MAX_PARTICIPANTS) {
    throw ApiError.badRequest(
      `Group cannot exceed ${GROUP_MAX_PARTICIPANTS} participants`,
    );
  }

  await loadAndAssertUsable(requestedIds, req.user);

  conversation.participants.push(...requestedIds);
  await conversation.save();

  const io = req.app.get('io');

  const addedDocs = await User.find({ _id: { $in: requestedIds } })
    .select('displayName')
    .lean();
  for (const added of addedDocs) {
    const sysMsg = await createSystemMessage({
      conversationId: conversation._id,
      text: buildSystemMessageText('{actor} added {target} to the group', {
        actor: req.user.displayName,
        target: added.displayName,
      }),
    });
    await emitSystemMessage(io, sysMsg);
  }

  const data = await populateAndSerialize(conversation, req.user._id);

  if (io) {
    const addedUsers = (data.participants || []).filter((p) =>
      requestedIds.includes(String(p._id)),
    );
    try {
      const groupSocket = await import('../sockets/group.socket.js');
      if (groupSocket?.emitGroupMemberAdded) {
        groupSocket.emitGroupMemberAdded(io, {
          conversation: data,
          addedUsers,
          addedUserIds: requestedIds,
          byUserId: req.user._id,
        });
      }
    } catch (err) {
      // Ignored
    }
  }

  res.status(200).json({ success: true, data });
});

const removeParticipant = async ({ conversation, targetId }) => {
  const tid = String(targetId);
  const remaining = conversation.participants
    .map((p) => String(p))
    .filter((id) => id !== tid);

  if (remaining.length === 0) {
    return Conversation.findByIdAndUpdate(
      conversation._id,
      {
        $pull: { participants: tid, admins: tid },
        $unset: { [`unreadCounts.${tid}`]: '' },
        $set: { isActive: false },
      },
      { new: true },
    );
  }

  if (remaining.length < 2) {
    return Conversation.findByIdAndUpdate(
      conversation._id,
      {
        $pull: { participants: tid, admins: tid },
        $unset: { [`unreadCounts.${tid}`]: '' },
        $set: { isActive: false },
      },
      { new: true },
    );
  }

  const wasAdmin = conversation.admins.some((a) => String(a) === tid);
  const remainingAdmins = conversation.admins
    .map((a) => String(a))
    .filter((id) => id !== tid);

  const nextAdmins = (wasAdmin && remainingAdmins.length === 0)
    ? [remaining[0]]
    : remainingAdmins;

  const update = {
    $pull: { participants: tid },
    $set: { admins: nextAdmins.map(id => new Types.ObjectId(id)) },
    $unset: { [`unreadCounts.${tid}`]: '' },
  };

  return Conversation.findByIdAndUpdate(conversation._id, update, { new: true });
};

// DELETE /api/conversations/:id/members/:userId
export const removeMember = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findById(req.params.id);
  assertParticipant(conversation, req.user._id);

  if (conversation.type !== CONVERSATION_TYPES.GROUP) {
    throw ApiError.badRequest('Only group memberships can be removed');
  }

  const targetId = req.params.userId;
  const isSelf = idEquals(targetId, req.user._id);

  if (!isSelf) {
    assertGroupAdmin(conversation, req.user._id);
  }

  const targetIsParticipant = conversation.participants.some((p) =>
    idEquals(p, targetId),
  );
  if (!targetIsParticipant) {
    throw ApiError.badRequest('Target user is not a member of this group');
  }

  const updated = await removeParticipant({ conversation, targetId });

  const io = req.app.get('io');

  if (io && updated?.isActive) {
    try {
      const groupSocket = await import('../sockets/group.socket.js');
      if (groupSocket?.emitGroupMemberRemoved) {
        groupSocket.emitGroupMemberRemoved(io, {
          conversationId: updated._id,
          userId: targetId,
          byUserId: req.user._id,
          reason: isSelf ? 'left' : 'removed',
        });
      }
    } catch (err) {
      // Ignored
    }
  }

  if (updated?.isActive) {
    let sysMsg;
    if (isSelf) {
      sysMsg = await createSystemMessage({
        conversationId: updated._id,
        text: buildSystemMessageText('{actor} left the group', {
          actor: req.user.displayName,
        }),
      });
    } else {
      const target = await User.findById(targetId).select('displayName').lean();
      sysMsg = await createSystemMessage({
        conversationId: updated._id,
        text: buildSystemMessageText('{actor} removed {target} from the group', {
          actor: req.user.displayName,
          target: target?.displayName,
        }),
      });
    }
    await emitSystemMessage(io, sysMsg);
  }

  await updated.populate({
    path: 'participants',
    select: PARTICIPANT_PROJECTION,
  });

  res
    .status(200)
    .json({ success: true, data: serializeConversation(updated, req.user._id) });
});

// POST /api/conversations/:id/admins/:userId
export const promoteAdmin = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findById(req.params.id);
  assertParticipant(conversation, req.user._id);

  if (conversation.type !== CONVERSATION_TYPES.GROUP) {
    throw ApiError.badRequest('Only group conversations have admins');
  }
  assertGroupAdmin(conversation, req.user._id);

  const { userId } = req.params;
  const targetIsParticipant = conversation.participants.some((p) =>
    idEquals(p, userId),
  );
  if (!targetIsParticipant) {
    throw ApiError.badRequest('User is not a member of this group');
  }

  const alreadyAdmin = conversation.admins.some((a) => idEquals(a, userId));
  if (alreadyAdmin) {
    throw ApiError.conflict('User is already an admin');
  }

  const updated = await Conversation.findByIdAndUpdate(
    conversation._id,
    { $addToSet: { admins: new Types.ObjectId(userId) } },
    { new: true },
  ).populate({ path: 'participants', select: PARTICIPANT_PROJECTION });

  const io = req.app.get('io');
  if (io) {
    try {
      const groupSocket = await import('../sockets/group.socket.js');
      if (groupSocket?.emitGroupAdminChanged) {
        groupSocket.emitGroupAdminChanged(io, {
          conversationId: updated._id,
          userId,
          isAdmin: true,
          byUserId: req.user._id,
        });
      }
    } catch (err) {
      // Ignored
    }
  }

  const target = await User.findById(userId).select('displayName').lean();
  const sysMsg = await createSystemMessage({
    conversationId: updated._id,
    text: buildSystemMessageText('{actor} promoted {target} to admin', {
      actor: req.user.displayName,
      target: target?.displayName,
    }),
  });
  await emitSystemMessage(io, sysMsg);

  res
    .status(200)
    .json({ success: true, data: serializeConversation(updated, req.user._id) });
});

// DELETE /api/conversations/:id/admins/:userId
export const demoteAdmin = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findById(req.params.id);
  assertParticipant(conversation, req.user._id);

  if (conversation.type !== CONVERSATION_TYPES.GROUP) {
    throw ApiError.badRequest('Only group conversations have admins');
  }
  assertGroupAdmin(conversation, req.user._id);

  const { userId } = req.params;
  const isAdmin = conversation.admins.some((a) => idEquals(a, userId));
  if (!isAdmin) {
    throw ApiError.badRequest('User is not an admin of this group');
  }

  if (conversation.admins.length === 1) {
    throw ApiError.badRequest(
      'Cannot demote the last admin; promote another admin first or leave the group',
    );
  }

  const updated = await Conversation.findByIdAndUpdate(
    conversation._id,
    { $pull: { admins: new Types.ObjectId(userId) } },
    { new: true },
  ).populate({ path: 'participants', select: PARTICIPANT_PROJECTION });

  const io = req.app.get('io');
  if (io) {
    try {
      const groupSocket = await import('../sockets/group.socket.js');
      if (groupSocket?.emitGroupAdminChanged) {
        groupSocket.emitGroupAdminChanged(io, {
          conversationId: updated._id,
          userId,
          isAdmin: false,
          byUserId: req.user._id,
        });
      }
    } catch (err) {
      // Ignored
    }
  }

  const target = await User.findById(userId).select('displayName').lean();
  const sysMsg = await createSystemMessage({
    conversationId: updated._id,
    text: buildSystemMessageText('{actor} removed admin from {target}', {
      actor: req.user.displayName,
      target: target?.displayName,
    }),
  });
  await emitSystemMessage(io, sysMsg);

  res
    .status(200)
    .json({ success: true, data: serializeConversation(updated, req.user._id) });
});

const toggleUserArrayMembership = async ({ user, conversationId, field }) => {
  const cid = new Types.ObjectId(conversationId);
  const fresh = await User.findById(user._id).select(field).lean();
  const current = (fresh?.[field] || []).map((id) => String(id));
  const isMember = current.includes(String(cid));

  const op = isMember
    ? { $pull: { [field]: cid } }
    : { $addToSet: { [field]: cid } };

  await User.updateOne({ _id: user._id }, op);

  const list = isMember
    ? current.filter((id) => id !== String(cid))
    : [...current, String(cid)];

  return { active: !isMember, list };
};

// POST /api/conversations/:id/mute
export const toggleMute = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findById(req.params.id).select(
    'participants',
  );
  assertParticipant(conversation, req.user._id);

  const { active, list } = await toggleUserArrayMembership({
    user: req.user,
    conversationId: req.params.id,
    field: 'mutedConversations',
  });

  res
    .status(200)
    .json({ success: true, data: { muted: active, mutedConversations: list } });
});

// POST /api/conversations/:id/archive
export const toggleArchive = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findById(req.params.id).select(
    'participants',
  );
  assertParticipant(conversation, req.user._id);

  const { active, list } = await toggleUserArrayMembership({
    user: req.user,
    conversationId: req.params.id,
    field: 'archivedConversations',
  });

  res.status(200).json({
    success: true,
    data: { archived: active, archivedConversations: list },
  });
});

// POST /api/conversations/:id/read
export const markRead = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findById(req.params.id).select(
    'participants type',
  );
  assertParticipant(conversation, req.user._id);

  const result = await markConversationAsRead({
    conversationId: req.params.id,
    userId: req.user._id,
  });

  const broadcast = req.user.preferences?.showReadReceipts !== false;
  const readAt = new Date().toISOString();

  const io = req.app.get('io');
  if (io && broadcast) {
    try {
      const msgSocket = await import('../sockets/message.socket.js');
      if (msgSocket?.broadcastReadReceipt) {
        msgSocket.broadcastReadReceipt(io, {
          conversationId: conversation._id,
          userId: req.user._id,
          readAt,
        });
      }
    } catch (err) {
      // Ignored
    }
  }

  res.status(200).json({
    success: true,
    data: {
      conversationId: String(conversation._id),
      readAt,
      messagesUpdated: result.modified,
      broadcast,
    },
  });
});

// GET /api/conversations/unread-summary
export const getUnreadSummary = asyncHandler(async (req, res) => {
  const userIdStr = String(req.user._id);
  const unreadPath = `$unreadCounts.${userIdStr}`;

  const archivedIds = (req.user.archivedConversations || []).map(
    (id) => new Types.ObjectId(String(id)),
  );

  const match = { participants: req.user._id, isActive: true };
  if (archivedIds.length > 0) {
    match._id = { $nin: archivedIds };
  }

  const rows = await Conversation.aggregate([
    { $match: match },
    {
      $project: {
        _id: 1,
        count: {
          $convert: {
            input: { $ifNull: [unreadPath, 0] },
            to: 'int',
            onError: 0,
            onNull: 0,
          },
        },
      },
    },
    { $match: { count: { $gt: 0 } } },
    { $sort: { count: -1, _id: -1 } },
  ]);

  const perConversation = rows.map((row) => ({
    conversationId: String(row._id),
    count: row.count,
  }));
  const total = perConversation.reduce((sum, row) => sum + row.count, 0);

  res.status(200).json({
    success: true,
    data: { total, perConversation },
  });
});

// DELETE /api/conversations/:id
export const deleteConversation = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findById(req.params.id);
  assertParticipant(conversation, req.user._id);

  if (conversation.type !== CONVERSATION_TYPES.GROUP) {
    throw ApiError.badRequest(
      'Direct conversations cannot be deleted; archive instead',
    );
  }

  const updated = await removeParticipant({
    conversation,
    targetId: req.user._id,
  });

  const io = req.app.get('io');

  if (updated?.isActive) {
    if (io) {
      try {
        const groupSocket = await import('../sockets/group.socket.js');
        if (groupSocket?.emitGroupMemberRemoved) {
          groupSocket.emitGroupMemberRemoved(io, {
            conversationId: updated._id,
            userId: req.user._id,
            byUserId: req.user._id,
            reason: 'left',
          });
        }
      } catch (err) {
        // Ignored
      }
    }

    const sysMsg = await createSystemMessage({
      conversationId: updated._id,
      text: buildSystemMessageText('{actor} left the group', {
        actor: req.user.displayName,
      }),
    });
    await emitSystemMessage(io, sysMsg);
  }

  res.status(200).json({
    success: true,
    message: updated?.isActive ? 'Left conversation' : 'Conversation closed',
  });
});
