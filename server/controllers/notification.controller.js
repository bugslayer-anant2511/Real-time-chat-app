import { asyncHandler } from '../utils/asyncHandler.js';
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  getUnreadNotificationCount,
} from '../utils/notificationService.js';
import { serializeNotification } from '../utils/serializers.js';
import { buildPageMeta, parsePagination } from '../utils/pagination.js';

// GET /api/notifications
export const getNotifications = asyncHandler(async (req, res) => {
  const { page, limit } = parsePagination(req.query, {
    defaultLimit: 20,
    maxLimit: 50,
  });

  const { items, total, unreadCount } = await listNotifications({
    userId: req.user._id,
    page,
    limit,
  });

  res.status(200).json({
    success: true,
    data: {
      items: items.map(serializeNotification),
      unreadCount,
      ...buildPageMeta({ total, page, limit }),
    },
  });
});

// GET /api/notifications/unread-count
export const getUnreadCount = asyncHandler(async (req, res) => {
  const count = await getUnreadNotificationCount({ userId: req.user._id });
  res.status(200).json({ success: true, data: { count } });
});

// PATCH /api/notifications/:id/read
export const markAsRead = asyncHandler(async (req, res) => {
  const updated = await markNotificationRead({
    notificationId: req.params.id,
    userId: req.user._id,
  });

  res.status(200).json({
    success: true,
    data: serializeNotification(updated),
  });
});

// PATCH /api/notifications/read-all
export const markAllAsRead = asyncHandler(async (req, res) => {
  const { modified } = await markAllNotificationsRead({
    userId: req.user._id,
  });

  res.status(200).json({
    success: true,
    data: { modified },
  });
});

// DELETE /api/notifications/:id
export const dismissNotification = asyncHandler(async (req, res) => {
  const { id } = await deleteNotification({
    notificationId: req.params.id,
    userId: req.user._id,
  });

  res.status(200).json({
    success: true,
    data: { id },
  });
});
