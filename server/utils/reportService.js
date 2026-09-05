import mongoose from 'mongoose';
import { Report } from '../models/Report.js';
import { User } from '../models/User.js';
import { Message } from '../models/Message.js';
import { Conversation } from '../models/Conversation.js';
import { ApiError } from './apiError.js';
import {
  REPORT_TARGET_TYPES,
  REPORT_STATUSES,
  REPORT_DESCRIPTION_MAX_LENGTH,
  REPORT_REVIEW_NOTE_MAX_LENGTH,
  REPORT_COOLDOWN_MS,
  ROLES,
  USER_STATUS,
} from './constants.js';

const { Types } = mongoose;

const isValidObjectId = (value) =>
  typeof value === 'string' &&
  Types.ObjectId.isValid(value) &&
  /^[a-f0-9]{24}$/i.test(value);

const toIdString = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Types.ObjectId) return value.toString();
  if (value._id) return value._id.toString();
  return null;
};

const sanitizeReportText = (value, max) => {
  if (typeof value !== 'string') return '';
  const cleaned = value
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/[<>&"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, max);
};

const resolveAndValidateTarget = async ({ reporterId, targetType, targetId }) => {
  if (targetType === REPORT_TARGET_TYPES.USER) {
    if (toIdString(reporterId) === toIdString(targetId)) {
      throw ApiError.badRequest('You cannot report yourself');
    }
    const user = await User.findById(targetId).select('role status').lean();
    if (!user) throw ApiError.notFound('User not found');
    if (user.status === USER_STATUS.DELETED) {
      throw ApiError.badRequest('User is no longer available');
    }
    if (user.role === ROLES.ADMIN) {
      throw ApiError.forbidden('Admins cannot be reported via this endpoint');
    }
    return { type: REPORT_TARGET_TYPES.USER, doc: user };
  }

  if (targetType === REPORT_TARGET_TYPES.MESSAGE) {
    const message = await Message.findById(targetId)
      .select('conversationId sender')
      .lean();
    if (!message) throw ApiError.notFound('Message not found');

    const conversation = await Conversation.findById(message.conversationId)
      .select('participants')
      .lean();
    if (!conversation) throw ApiError.notFound('Conversation not found');

    const isParticipant = (conversation.participants || []).some(
      (p) => toIdString(p) === toIdString(reporterId),
    );
    if (!isParticipant) {
      throw ApiError.notFound('Message not found');
    }
    if (toIdString(message.sender) === toIdString(reporterId)) {
      throw ApiError.badRequest('You cannot report your own message');
    }
    return { type: REPORT_TARGET_TYPES.MESSAGE, doc: message };
  }

  if (targetType === REPORT_TARGET_TYPES.CONVERSATION) {
    const conversation = await Conversation.findById(targetId)
      .select('participants')
      .lean();
    if (!conversation) throw ApiError.notFound('Conversation not found');

    const isParticipant = (conversation.participants || []).some(
      (p) => toIdString(p) === toIdString(reporterId),
    );
    if (!isParticipant) {
      throw ApiError.notFound('Conversation not found');
    }
    return { type: REPORT_TARGET_TYPES.CONVERSATION, doc: conversation };
  }

  throw ApiError.badRequest('Invalid target type');
};

export const createReport = async ({
  reporterId,
  targetType,
  targetId,
  reason,
  description = '',
}) => {
  const rid = toIdString(reporterId);
  const tid = toIdString(targetId);

  if (!rid || !isValidObjectId(rid)) {
    throw ApiError.badRequest('Invalid reporter id');
  }
  if (!tid || !isValidObjectId(tid)) {
    throw ApiError.badRequest('Invalid target id');
  }

  await resolveAndValidateTarget({
    reporterId: rid,
    targetType,
    targetId: tid,
  });

  const cutoff = new Date(Date.now() - REPORT_COOLDOWN_MS);
  const recent = await Report.findOne({
    reporter: rid,
    targetType,
    targetId: tid,
    createdAt: { $gte: cutoff },
  })
    .select('_id createdAt')
    .lean();
  if (recent) {
    throw ApiError.tooMany(
      'You have already reported this target recently. Please wait before reporting again.',
    );
  }

  const safeDescription = sanitizeReportText(
    description,
    REPORT_DESCRIPTION_MAX_LENGTH,
  );

  const report = await Report.create({
    reporter: rid,
    targetType,
    targetId: tid,
    reason,
    description: safeDescription,
  });

  return report.toObject();
};

export const listReports = async ({
  page = 1,
  limit = 20,
  status = null,
  targetType = null,
}) => {
  const filter = {};
  if (status) filter.status = status;
  if (targetType) filter.targetType = targetType;

  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const skip = (safePage - 1) * safeLimit;

  const [items, total] = await Promise.all([
    Report.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .populate({ path: 'reporter', select: '_id username displayName avatarUrl' })
      .populate({ path: 'reviewedBy', select: '_id username displayName' })
      .lean(),
    Report.countDocuments(filter),
  ]);

  return {
    items,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.max(1, Math.ceil((total || 0) / safeLimit)),
  };
};

const TARGET_USER_PROJECTION =
  '_id username displayName avatarUrl email role status createdAt';

const TARGET_CONVERSATION_PROJECTION =
  '_id type name avatarUrl participants admins createdBy createdAt';

const populateReportTarget = async (report) => {
  if (!report) return null;
  const { targetType, targetId } = report;

  if (targetType === REPORT_TARGET_TYPES.USER) {
    const user = await User.findById(targetId)
      .select(TARGET_USER_PROJECTION)
      .lean();
    return user || null;
  }

  if (targetType === REPORT_TARGET_TYPES.MESSAGE) {
    const message = await Message.findById(targetId)
      .populate({ path: 'sender', select: '_id username displayName avatarUrl' })
      .lean();
    return message || null;
  }

  if (targetType === REPORT_TARGET_TYPES.CONVERSATION) {
    const conv = await Conversation.findById(targetId)
      .select(TARGET_CONVERSATION_PROJECTION)
      .populate({ path: 'participants', select: '_id username displayName avatarUrl' })
      .lean();
    return conv || null;
  }

  return null;
};

export const getReportDetail = async ({ reportId }) => {
  const id = toIdString(reportId);
  if (!id || !isValidObjectId(id)) {
    throw ApiError.badRequest('Invalid report id');
  }

  const report = await Report.findById(id)
    .populate({
      path: 'reporter',
      select: '_id username displayName avatarUrl email',
    })
    .populate({ path: 'reviewedBy', select: '_id username displayName' })
    .lean();

  if (!report) throw ApiError.notFound('Report not found');

  const target = await populateReportTarget(report);
  return { report, target };
};

export const reviewReport = async ({
  reportId,
  reviewerId,
  status,
  reviewNote = '',
}) => {
  const id = toIdString(reportId);
  const reviewer = toIdString(reviewerId);

  if (!id || !isValidObjectId(id)) {
    throw ApiError.badRequest('Invalid report id');
  }
  if (!reviewer || !isValidObjectId(reviewer)) {
    throw ApiError.badRequest('Invalid reviewer id');
  }

  if (!Object.values(REPORT_STATUSES).includes(status)) {
    throw ApiError.badRequest('Invalid status');
  }
  if (status === REPORT_STATUSES.PENDING) {
    throw ApiError.badRequest('Cannot revert a report to pending');
  }

  const safeNote = sanitizeReportText(reviewNote, REPORT_REVIEW_NOTE_MAX_LENGTH);

  const updated = await Report.findByIdAndUpdate(
    id,
    {
      $set: {
        status,
        reviewedBy: reviewer,
        reviewNote: safeNote,
      },
    },
    { new: true, runValidators: true },
  )
    .populate({ path: 'reporter', select: '_id username displayName avatarUrl' })
    .populate({ path: 'reviewedBy', select: '_id username displayName' })
    .lean();

  if (!updated) throw ApiError.notFound('Report not found');
  return updated;
};

export const _internals = {
  isValidObjectId,
  toIdString,
  sanitizeReportText,
  populateReportTarget,
};
