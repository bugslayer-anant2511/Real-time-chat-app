export const STORAGE_KEYS = Object.freeze({
  TOKEN: 'token',
  GUEST_PREFERENCES: 'guestPreferences',
});

export const ROUTES = Object.freeze({
  HOME: '/',
  LOGIN: '/login',
  REGISTER: '/register',
  CHAT: '/chat',
  PROFILE: '/profile',
  SETTINGS: '/settings',
  ADMIN: '/admin',
});

export const THEMES = Object.freeze(['light', 'dark', 'system']);
export const FONT_SIZES = Object.freeze(['sm', 'md', 'lg']);
export const CONTENT_DENSITIES = Object.freeze(['compact', 'comfortable']);

export const DEFAULT_PREFERENCES = Object.freeze({
  theme: 'system',
  fontSize: 'md',
  contentDensity: 'comfortable',
  animations: true,
  enterToSend: true,
  showReadReceipts: true,
  showOnlineStatus: true,
  notifications: {
    browser: true,
    sound: true,
    muteAll: false,
  },
});

export const AUTH_RULES = Object.freeze({
  USERNAME_REGEX: /^[a-zA-Z0-9_]+$/,
  USERNAME_MIN_LENGTH: 3,
  USERNAME_MAX_LENGTH: 20,
  DISPLAY_NAME_MIN_LENGTH: 2,
  DISPLAY_NAME_MAX_LENGTH: 40,
  PASSWORD_MIN_LENGTH: 8,
  PASSWORD_COMPLEXITY: /^(?=.*[A-Za-z])(?=.*\d).+$/,
});

export const PROFILE_RULES = Object.freeze({
  BIO_MAX_LENGTH: 200,
  AVATAR_MAX_SIZE_MB: 5,
});

export const REPORT_REASONS = Object.freeze([
  { value: 'spam', label: 'Spam or scam' },
  { value: 'harassment', label: 'Harassment or hate speech' },
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'other', label: 'Something else' },
]);

export const REPORT_DETAILS_MAX_LENGTH = 500;

export const GROUP_RULES = Object.freeze({
  NAME_MAX_LENGTH: 50,
  MAX_PARTICIPANTS: 100,
  AVATAR_MAX_SIZE_MB: 5,
});

export const NOTIFICATION_SOUND_URL = '/notification-sound.mp3';

export const NOTIFICATION_BUFFER_SIZE = 20;

export const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ||
  import.meta.env.VITE_SERVER_URL ||
  'http://localhost:5001';

export const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  `${BACKEND_URL.replace(/\/+$/, '')}/api`;

export const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ||
  BACKEND_URL.replace(/\/+$/, '');

