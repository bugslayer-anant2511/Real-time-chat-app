import api from './axios.js';

export const searchUsers = async (q, { limit = 10 } = {}) => {
  const { data } = await api.get('/users/search', { params: { q, limit } });
  return data;
};

export const getProfile = async (username) => {
  const { data } = await api.get(`/users/${encodeURIComponent(username)}`);
  return data;
};

export const updatePreferences = async (preferences) => {
  const { data } = await api.patch('/users/me/preferences', preferences);
  return data;
};

export const getBlockedUsers = async () => {
  const { data } = await api.get('/users/me/blocked');
  return data;
};

export const blockUser = async (userId) => {
  const { data } = await api.post(`/users/${userId}/block`);
  return data;
};

export const unblockUser = async (userId) => {
  const { data } = await api.delete(`/users/${userId}/block`);
  return data;
};

export const reportTarget = async (payload) => {
  const { data } = await api.post('/reports', payload);
  return data;
};
