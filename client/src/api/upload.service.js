import api from './axios.js';

const buildForm = (file) => {
  const form = new FormData();
  form.append('image', file);
  return form;
};

export const uploadAvatar = async (file) => {
  const { data } = await api.post('/upload/avatar', buildForm(file), {
    timeout: 60_000,
  });
  return data;
};

export const removeAvatar = async () => {
  const { data } = await api.delete('/upload/avatar');
  return data;
};

export const uploadMessageImage = async (file) => {
  const { data } = await api.post('/upload/message-image', buildForm(file), {
    timeout: 60_000,
  });
  return data;
};

export const uploadGroupAvatar = (file) => uploadMessageImage(file);
