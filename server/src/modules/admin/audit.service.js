import { AuditLog } from '../../models/index.js';
import { logger } from '../../config/logger.js';
import { getRequestId } from '../../middleware/requestContext.js';

/**
 * Writes one row to the audit trail.
 *
 * Every consequential admin action goes through here: handing out credits,
 * suspending an account, changing a role, creating or withdrawing a plan. An
 * admin panel that can do those things without leaving a record is a liability
 * — "who suspended this account, and when" has to be answerable.
 *
 * Never throws. A failed audit write must not undo the action it describes, and
 * an operator staring at a 500 after a change that actually succeeded is worse
 * than a missing line. Failures are logged instead.
 */
export async function recordAudit({
  actor,
  action,
  subjectType,
  subjectId = null,
  onBehalfOfUserId = null,
  changes = [],
  reason = null,
  result = 'success',
}) {
  try {
    await AuditLog.create({
      actorId: actor?._id ?? null,
      actorRole: actor?.role ?? null,
      onBehalfOfUserId,
      action,
      subjectType,
      subjectId,
      changes,
      reason,
      result,
      requestId: getRequestId() ?? null,
    });
  } catch (error) {
    logger.error({ action, code: error?.code }, 'Could not write an audit entry');
  }
}

export default { recordAudit };
