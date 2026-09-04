import { v2 as cloudinary } from 'cloudinary';
import streamifier from 'streamifier';
import { env } from './env.js';

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure: true,
});

const ALLOWED_CLOUDINARY_PREFIXES = (() => {
  const cloudName = env.CLOUDINARY_CLOUD_NAME?.trim();
  if (!cloudName) return [];
  return Object.freeze([
    `https://res.cloudinary.com/${cloudName}/`,
    `http://res.cloudinary.com/${cloudName}/`,
  ]);
})();

export const isAllowedCloudinaryUrl = (url) => {
  if (typeof url !== 'string' || url.length === 0) return false;
  if (ALLOWED_CLOUDINARY_PREFIXES.length === 0) return false;
  return ALLOWED_CLOUDINARY_PREFIXES.some((prefix) => url.startsWith(prefix));
};

export const cloudinaryUrlValidator = (value) => {
  if (value === undefined || value === null || value === '') return true;
  if (!isAllowedCloudinaryUrl(value)) {
    throw new Error('URL must point to the configured Cloudinary CDN');
  }
  return true;
};

export const streamUpload = (buffer, folder) =>
  new Promise((resolve, reject) => {
    if (!Buffer.isBuffer(buffer)) {
      reject(new Error('streamUpload: buffer must be a Buffer instance.'));
      return;
    }
    if (!folder || typeof folder !== 'string') {
      reject(new Error('streamUpload: folder is required.'));
      return;
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        transformation: [{ quality: 'auto:good', fetch_format: 'auto' }],
      },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error('Cloudinary upload failed without a result.'));
          return;
        }
        resolve({ url: result.secure_url, publicId: result.public_id });
      },
    );

    streamifier.createReadStream(buffer).pipe(uploadStream);
  });

export const safeDestroy = async (publicId) => {
  if (!publicId || typeof publicId !== 'string') return;
  try {
    await cloudinary.uploader.destroy(publicId, { invalidate: true });
  } catch (error) {
    console.warn(`[cloudinary] failed to destroy ${publicId}:`, error?.message);
  }
};

export { cloudinary };
