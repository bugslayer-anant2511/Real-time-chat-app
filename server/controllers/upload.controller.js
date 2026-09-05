import { streamUpload, safeDestroy } from '../config/cloudinary.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const AVATAR_FOLDER = 'chat-app/avatars';
const MESSAGE_FOLDER = 'chat-app/messages';

// POST /api/upload/avatar
export const uploadAvatarController = asyncHandler(async (req, res) => {
  if (!req.file?.buffer) {
    throw ApiError.badRequest('Image file is required (field name "image")');
  }

  const previousPublicId = req.user.avatarPublicId;

  const { url, publicId } = await streamUpload(req.file.buffer, AVATAR_FOLDER);

  await User.updateOne(
    { _id: req.user._id },
    { $set: { avatarUrl: url, avatarPublicId: publicId } },
  );

  if (previousPublicId && previousPublicId !== publicId) {
    safeDestroy(previousPublicId);
  }

  res.status(201).json({
    success: true,
    message: 'Avatar uploaded',
    data: { url, publicId },
  });
});

// DELETE /api/upload/avatar
export const deleteAvatarController = asyncHandler(async (req, res) => {
  const previousPublicId = req.user.avatarPublicId;
  const hadAvatar = Boolean(req.user.avatarUrl || previousPublicId);

  if (!hadAvatar) {
    return res.status(200).json({
      success: true,
      message: 'No avatar to remove',
      data: { removed: false },
    });
  }

  await User.updateOne(
    { _id: req.user._id },
    { $set: { avatarUrl: '', avatarPublicId: '' } },
  );

  if (previousPublicId) {
    safeDestroy(previousPublicId);
  }

  return res.status(200).json({
    success: true,
    message: 'Avatar removed',
    data: { removed: true },
  });
});

// POST /api/upload/message-image
export const uploadMessageImageController = asyncHandler(async (req, res) => {
  if (!req.file?.buffer) {
    throw ApiError.badRequest('Image file is required (field name "image")');
  }

  const { url, publicId } = await streamUpload(req.file.buffer, MESSAGE_FOLDER);

  res.status(201).json({
    success: true,
    message: 'Image uploaded',
    data: { url, publicId },
  });
});
