import { body } from 'express-validator';
import { validate } from '../middlewares/validate.middleware.js';
import {
  REPORT_TARGET_TYPES,
  REPORT_REASONS,
  REPORT_DESCRIPTION_MAX_LENGTH,
} from '../utils/constants.js';

const TARGET_TYPE_VALUES = Object.values(REPORT_TARGET_TYPES);
const REASON_VALUES = Object.values(REPORT_REASONS);

export const validateReport = [
  body('targetType')
    .exists({ checkFalsy: true })
    .withMessage('targetType is required')
    .bail()
    .isIn(TARGET_TYPE_VALUES)
    .withMessage(`targetType must be one of ${TARGET_TYPE_VALUES.join(', ')}`),
  body('targetId')
    .exists({ checkFalsy: true })
    .withMessage('targetId is required')
    .bail()
    .isMongoId()
    .withMessage('targetId must be a valid id'),
  body('reason')
    .exists({ checkFalsy: true })
    .withMessage('reason is required')
    .bail()
    .isIn(REASON_VALUES)
    .withMessage(`reason must be one of ${REASON_VALUES.join(', ')}`),
  body('description')
    .optional()
    .isString()
    .withMessage('description must be a string')
    .bail()
    .trim()
    .isLength({ max: REPORT_DESCRIPTION_MAX_LENGTH })
    .withMessage(
      `description must be at most ${REPORT_DESCRIPTION_MAX_LENGTH} characters`,
    ),
  validate,
];
