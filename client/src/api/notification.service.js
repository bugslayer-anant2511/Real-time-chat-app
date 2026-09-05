import api from './axios.js';

export const listNotifications = async ({ page = 1, limit = 20 } = {}) => {
  const { data } = await api.get('/notifications', { params: { page, limit } });
  return data;
};

export const markRead = async (id) => {
  const { data } = await api.patch(`/notifications/${id}/read`);
  return data;
};

export const markAllRead = async () => {
  const { data } = await api.patch('/notifications/read-all');
  return data;
};

export const dismiss = async (id) => {
  const { data } = await api.delete(`/notifications/${id}`);
  return data;
};

export const getUnreadCount = async () => {
  const { data } = await api.get('/notifications/unread-count');
  return data;
};
