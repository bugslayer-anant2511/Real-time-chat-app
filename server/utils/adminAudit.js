import { AdminAuditLog } from '../models/AdminAuditLog.js';
import { isProduction } from '../config/env.js';
import { ADMIN_AUDIT_ACTIONS } from './constants.js';

const ALLOWED_ACTIONS = new Set(Object.values(ADMIN_AUDIT_ACTIONS));

export const writeAuditLog = async ({
  adminId,
  action,
  targetType = '',
  targetId = null,
  meta = {},
}) => {
  if (!adminId) return null;
  if (!ALLOWED_ACTIONS.has(action)) {
    if (!isProduction) {
      console.warn('[adminAudit] unknown action ignored:', action);
    }
    return null;
  }

  try {
    return await AdminAuditLog.create({
      adminId,
      action,
      targetType: typeof targetType === 'string' ? targetType : '',
      targetId: targetId ?? null,
      meta: meta && typeof meta === 'object' ? { ...meta } : {},
      at: new Date(),
    });
  } catch (err) {
    if (!isProduction) {
      console.warn('[adminAudit] write failed:', err?.message || err);
    }
    return null;
  }
};

export default writeAuditLog;
