import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { Notification } from '../models/Notification.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { escapeRegex } from '../utils/escapeRegex.js';
import { parsePagination, buildPageMeta } from '../utils/pagination.js';
import { safeDestroy } from '../config/cloudinary.js';
import { userRoom } from '../sockets/rooms.js';
import { detachUserFromConversations } from '../utils/conversationService.js';
import { writeAuditLog } from '../utils/adminAudit.js';
import {
  listReports as listReportsService,
  getReportDetail as getReportDetailService,
  reviewReport as reviewReportService,
} from '../utils/reportService.js';
import { serializeMessage } from '../utils/serializers.js';
import {
  ROLES,
  USER_STATUS,
  CONVERSATION_TYPES,
  MESSAGE_DELETED_FOR,
  ADMIN_AUDIT_ACTIONS,
  REPORT_TARGET_TYPES,
} from '../utils/constants.js';

const ADMIN_USER_PROJECTION =
  '_id username email displayName avatarUrl avatarPublicId bio role status isOnline lastSeenAt createdAt updatedAt';

const idEquals = (a, b) => String(a) === String(b);

const forceDisconnectUser = (req, userId) => {
  const io = req.app.get('io');
  if (!io) return;
  try {
    io.in(userRoom(userId)).disconnectSockets(true);
  } catch (err) {
    console.error('[admin] force-disconnect failed:', err);
  }
};

const cascadeAdminDelete = async (user) => {
  const userId = user._id;

  await Promise.all([
    detachUserFromConversations(userId),
    User.updateMany(
      { 'blockedUsers.user': userId },
      { $pull: { blockedUsers: { user: userId } } },
    ),
    Message.updateMany({ sender: userId }, { $set: { sender: null } }),
    Notification.deleteMany({
      $or: [{ recipient: userId }, { actor: userId }],
    }),
    user.avatarPublicId ? safeDestroy(user.avatarPublicId) : Promise.resolve(),
  ]);
};

// GET /api/admin/stats
export const getStats = asyncHandler(async (_req, res) => {
  const now = Date.now();
  const last24h = new Date(now - 24 * 60 * 60 * 1000);
  const last7d = new Date(now - 7 * 24 * 60 * 60 * 1000);

  const ReportModel = mongoose.models.Report ?? null;

  const [
    totalUsers,
    activeUsers,
    suspendedUsers,
    totalConversations,
    totalGroups,
    messagesLast24h,
    messagesLast7d,
    pendingReports,
  ] = await Promise.all([
    User.countDocuments({ status: { $ne: USER_STATUS.DELETED } }),
    User.countDocuments({
      status: USER_STATUS.ACTIVE,
      lastSeenAt: { $gte: last24h },
    }),
    User.countDocuments({ status: USER_STATUS.SUSPENDED }),
    Conversation.countDocuments({ isActive: true }),
    Conversation.countDocuments({
      type: CONVERSATION_TYPES.GROUP,
      isActive: true,
    }),
    Message.countDocuments({ createdAt: { $gte: last24h } }),
    Message.countDocuments({ createdAt: { $gte: last7d } }),
    ReportModel
      ? ReportModel.countDocuments({ status: 'pending' }).catch(() => 0)
      : Promise.resolve(0),
  ]);

  res.status(200).json({
    success: true,
    data: {
      totalUsers,
      activeUsers,
      suspendedUsers,
      totalConversations,
      totalGroups,
      messagesLast24h,
      messagesLast7d,
      pendingReports,
    },
  });
});

// GET /api/admin/users
export const listUsers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, {
    defaultLimit: 20,
    maxLimit: 50,
  });

  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.role) filter.role = req.query.role;

  const rawQ = String(req.query.q ?? '').trim();
  if (rawQ) {
    const pattern = new RegExp(escapeRegex(rawQ), 'i');
    filter.$or = [
      { username: pattern },
      { email: pattern },
      { displayName: pattern },
    ];
  }

  const [items, total] = await Promise.all([
    User.find(filter)
      .select(ADMIN_USER_PROJECTION)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data: {
      users: items,
      ...buildPageMeta({ total, page, limit }),
    },
  });
});

// GET /api/admin/users/:id
export const getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id)
    .select(ADMIN_USER_PROJECTION)
    .lean();

  if (!user) throw ApiError.notFound('User not found');

  res.status(200).json({
    success: true,
    data: { user },
  });
});

// PATCH /api/admin/users/:id/status
export const updateUserStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (idEquals(id, req.user._id)) {
    throw ApiError.forbidden('You cannot change your own status');
  }

  const target = await User.findById(id).select('role status');
  if (!target) throw ApiError.notFound('User not found');

  if (target.role === ROLES.ADMIN) {
    throw ApiError.forbidden('Admin accounts cannot be moderated via this endpoint');
  }

  if (target.status === status) {
    return res.status(200).json({
      success: true,
      message: 'User status unchanged',
      data: { id, status: target.status },
    });
  }

  const previousStatus = target.status;
  target.status = status;
  await target.save({ validateBeforeSave: false });

  if (status === USER_STATUS.SUSPENDED) {
    forceDisconnectUser(req, id);
  }

  writeAuditLog({
    adminId: req.user._id,
    action:
      status === USER_STATUS.SUSPENDED
        ? ADMIN_AUDIT_ACTIONS.USER_SUSPEND
        : ADMIN_AUDIT_ACTIONS.USER_REINSTATE,
    targetType: 'user',
    targetId: id,
    meta: { previousStatus, newStatus: target.status },
  });

  res.status(200).json({
    success: true,
    message: `User ${status === USER_STATUS.SUSPENDED ? 'suspended' : 'reinstated'}`,
    data: { id, status: target.status },
  });
});

// PATCH /api/admin/users/:id/role
export const updateUserRole = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  if (idEquals(id, req.user._id)) {
    throw ApiError.forbidden('You cannot change your own role');
  }

  const target = await User.findById(id).select('role status');
  if (!target) throw ApiError.notFound('User not found');

  if (target.status === USER_STATUS.DELETED) {
    throw ApiError.badRequest('Cannot change role of a deleted account');
  }

  if (target.role === role) {
    return res.status(200).json({
      success: true,
      message: 'User role unchanged',
      data: { id, role: target.role },
    });
  }

  if (target.role === ROLES.ADMIN && role === ROLES.USER) {
    const remainingAdmins = await User.countDocuments({
      role: ROLES.ADMIN,
      status: { $ne: USER_STATUS.DELETED },
      _id: { $ne: id },
    });
    if (remainingAdmins < 1) {
      throw ApiError.forbidden('At least one admin must remain');
    }
  }

  const previousRole = target.role;
  target.role = role;
  await target.save({ validateBeforeSave: false });

  writeAuditLog({
    adminId: req.user._id,
    action: ADMIN_AUDIT_ACTIONS.USER_ROLE_CHANGE,
    targetType: 'user',
    targetId: id,
    meta: { previousRole, newRole: target.role },
  });

  res.status(200).json({
    success: true,
    message: `User role updated to ${target.role}`,
    data: { id, role: target.role },
  });
});

// DELETE /api/admin/users/:id
export const deleteUser = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (idEquals(id, req.user._id)) {
    throw ApiError.forbidden('You cannot delete your own account from the admin panel');
  }

  const target = await User.findById(id).select(
    'role status avatarPublicId',
  );
  if (!target) throw ApiError.notFound('User not found');

  if (target.role === ROLES.ADMIN) {
    const remainingAdmins = await User.countDocuments({
      role: ROLES.ADMIN,
      status: { $ne: USER_STATUS.DELETED },
      _id: { $ne: id },
    });
    if (remainingAdmins < 1) {
      throw ApiError.forbidden('At least one admin must remain');
    }
  }

  forceDisconnectUser(req, id);

  await cascadeAdminDelete(target);
  await target.deleteOne();

  writeAuditLog({
    adminId: req.user._id,
    action: ADMIN_AUDIT_ACTIONS.USER_DELETE,
    targetType: 'user',
    targetId: id,
    meta: {
      previousRole: target.role,
      previousStatus: target.status,
      hadAvatar: Boolean(target.avatarPublicId),
    },
  });

  res.status(200).json({
    success: true,
    message: 'User deleted',
    data: { id },
  });
});

// GET /api/admin/reports
export const listReports = asyncHandler(async (req, res) => {
  const { page, limit } = parsePagination(req.query, {
    defaultLimit: 20,
    maxLimit: 50,
  });

  const status = req.query.status ? String(req.query.status) : null;
  const targetType = req.query.targetType ? String(req.query.targetType) : null;

  const result = await listReportsService({ page, limit, status, targetType });

  res.status(200).json({
    success: true,
    data: {
      reports: result.items,
      ...buildPageMeta({ total: result.total, page, limit }),
    },
  });
});

// GET /api/admin/reports/:id
export const getReport = asyncHandler(async (req, res) => {
  const { report, target } = await getReportDetailService({
    reportId: req.params.id,
  });

  res.status(200).json({
    success: true,
    data: { report, target },
  });
});

// PATCH /api/admin/reports/:id
export const reviewReport = asyncHandler(async (req, res) => {
  const { status, reviewNote = '' } = req.body;

  const updated = await reviewReportService({
    reportId: req.params.id,
    reviewerId: req.user._id,
    status,
    reviewNote,
  });

  writeAuditLog({
    adminId: req.user._id,
    action: ADMIN_AUDIT_ACTIONS.REPORT_REVIEW,
    targetType: 'report',
    targetId: updated._id,
    meta: {
      newStatus: updated.status,
      reportTargetType: updated.targetType,
      reportTargetId: String(updated.targetId),
      hasNote: Boolean(updated.reviewNote),
    },
  });

  res.status(200).json({
    success: true,
    message: 'Report updated',
    data: { report: updated },
  });
});

// DELETE /api/admin/messages/:id
export const forceDeleteMessage = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const message = await Message.findById(id);
  if (!message) throw ApiError.notFound('Message not found');

  if (message.deletedFor === MESSAGE_DELETED_FOR.EVERYONE) {
    return res.status(200).json({
      success: true,
      message: 'Message was already deleted',
      data: { id, conversationId: String(message.conversationId) },
    });
  }

  const previousImagePublicId = message.imagePublicId || '';
  const previousType = message.type;
  const previousSenderId = message.sender ? String(message.sender) : null;
  const conversationId = String(message.conversationId);

  message.deletedFor = MESSAGE_DELETED_FOR.EVERYONE;
  message.imagePublicId = '';
  await message.save();

  const io = req.app.get('io');
  if (io) {
    try {
      const msgSocket = await import('../sockets/message.socket.js');
      if (msgSocket?.broadcastDeletedMessage) {
        msgSocket.broadcastDeletedMessage(io, {
          conversationId,
          messageId: id,
          scope: 'everyone',
        });
      }
    } catch (err) {
      console.error('[admin] force-delete broadcast failed:', err);
    }
  }

  if (previousImagePublicId) {
    safeDestroy(previousImagePublicId);
  }

  writeAuditLog({
    adminId: req.user._id,
    action: ADMIN_AUDIT_ACTIONS.MESSAGE_FORCE_DELETE,
    targetType: 'message',
    targetId: id,
    meta: {
      conversationId,
      previousType,
      previousSenderId,
      hadImage: Boolean(previousImagePublicId),
    },
  });

  res.status(200).json({
    success: true,
    message: 'Message force-deleted',
    data: { id, conversationId },
  });
});

// GET /api/admin/conversations/:id/messages
export const adminGetConversationMessages = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const conversation = await Conversation.findById(id)
    .select('_id type name participants')
    .lean();
  if (!conversation) throw ApiError.notFound('Conversation not found');

  const { page, limit, skip } = parsePagination(req.query, {
    defaultLimit: 30,
    maxLimit: 50,
  });

  const filter = { conversationId: id };

  const [items, total] = await Promise.all([
    Message.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({ path: 'sender', select: '_id username displayName avatarUrl' })
      .lean(),
    Message.countDocuments(filter),
  ]);

  writeAuditLog({
    adminId: req.user._id,
    action: ADMIN_AUDIT_ACTIONS.CONVERSATION_VIEW,
    targetType: 'conversation',
    targetId: conversation._id,
    meta: {
      conversationType: conversation.type,
      participantCount: conversation.participants?.length ?? 0,
      page,
      limit,
    },
  });

  res.status(200).json({
    success: true,
    data: {
      conversation: {
        _id: String(conversation._id),
        type: conversation.type,
        name: conversation.name || '',
        participantCount: conversation.participants?.length ?? 0,
      },
      items: items.reverse().map((m) => serializeMessage(m)),
      ...buildPageMeta({ total, page, limit }),
    },
  });
});

export const _adminInternals = {
  REPORT_TARGET_TYPES,
  ADMIN_AUDIT_ACTIONS,
};
