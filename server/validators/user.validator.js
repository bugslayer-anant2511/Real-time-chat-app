import { body, param, query } from 'express-validator';
import { validate } from '../middlewares/validate.middleware.js';
import {
  USERNAME_REGEX,
  USERNAME_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  THEME,
  FONT_SIZE,
  CONTENT_DENSITY,
} from '../utils/constants.js';

const SEARCH_MIN_LENGTH = 2;
const SEARCH_MAX_LENGTH = 30;

export const validateSearchQuery = [
  query('q')
    .exists({ checkFalsy: true })
    .withMessage('Query string "q" is required')
    .bail()
    .isString()
    .trim()
    .isLength({ min: SEARCH_MIN_LENGTH, max: SEARCH_MAX_LENGTH })
    .withMessage(
      `Query must be ${SEARCH_MIN_LENGTH}-${SEARCH_MAX_LENGTH} characters`,
    ),
  validate,
];

export const validateUsername = [
  param('username')
    .isString()
    .trim()
    .toLowerCase()
    .isLength({ min: USERNAME_MIN_LENGTH, max: USERNAME_MAX_LENGTH })
    .withMessage(
      `Username must be ${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} characters`,
    )
    .matches(USERNAME_REGEX)
    .withMessage('Username may only contain letters, numbers, and underscores'),
  validate,
];

const ALLOWED_PREFERENCE_KEYS = Object.freeze([
  'theme',
  'fontSize',
  'contentDensity',
  'animations',
  'enterToSend',
  'showReadReceipts',
  'showOnlineStatus',
  'notifications',
]);

const ALLOWED_NOTIFICATION_KEYS = Object.freeze([
  'browser',
  'sound',
  'muteAll',
]);

export const validatePreferences = [
  body('theme').optional().isIn(THEME).withMessage(`theme must be one of: ${THEME.join(', ')}`),
  body('fontSize').optional().isIn(FONT_SIZE).withMessage(`fontSize must be one of: ${FONT_SIZE.join(', ')}`),
  body('contentDensity')
    .optional()
    .isIn(CONTENT_DENSITY)
    .withMessage(`contentDensity must be one of: ${CONTENT_DENSITY.join(', ')}`),
  body('animations').optional().isBoolean().withMessage('animations must be boolean').toBoolean(),
  body('enterToSend').optional().isBoolean().withMessage('enterToSend must be boolean').toBoolean(),
  body('showReadReceipts').optional().isBoolean().withMessage('showReadReceipts must be boolean').toBoolean(),
  body('showOnlineStatus').optional().isBoolean().withMessage('showOnlineStatus must be boolean').toBoolean(),
  body('notifications').optional().isObject().withMessage('notifications must be an object'),
  body('notifications.browser').optional().isBoolean().withMessage('notifications.browser must be boolean').toBoolean(),
  body('notifications.sound').optional().isBoolean().withMessage('notifications.sound must be boolean').toBoolean(),
  body('notifications.muteAll').optional().isBoolean().withMessage('notifications.muteAll must be boolean').toBoolean(),
  body().custom((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Request body must be a JSON object');
    }
    const keys = Object.keys(value);
    if (keys.length === 0) {
      throw new Error('Provide at least one preference field to update');
    }

    const unknown = keys.filter((k) => !ALLOWED_PREFERENCE_KEYS.includes(k));
    if (unknown.length > 0) {
      throw new Error(`Unknown preference field(s): ${unknown.join(', ')}`);
    }

    if (value.notifications && typeof value.notifications === 'object') {
      const notifKeys = Object.keys(value.notifications);
      const unknownNotif = notifKeys.filter(
        (k) => !ALLOWED_NOTIFICATION_KEYS.includes(k),
      );
      if (unknownNotif.length > 0) {
        throw new Error(
          `Unknown notifications field(s): ${unknownNotif.join(', ')}`,
        );
      }
    }

    return true;
  }),
  validate,
];
