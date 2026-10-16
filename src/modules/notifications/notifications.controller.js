import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from './notifications.service.js';
import { notificationListQuerySchema } from './notifications.validation.js';

function getSchoolId(req, res) {
  if (req.schoolId) return req.schoolId;
  res.status(400).json({
    success: false,
    error: {
      code: 'SCHOOL_CONTEXT_REQUIRED',
      message: 'Select a school workspace to view notifications.',
    },
  });
  return null;
}

export async function listNotificationsController(req, res, next) {
  const schoolId = getSchoolId(req, res);
  if (!schoolId) return;

  const parsed = notificationListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'The notification list parameters are invalid.',
        details: parsed.error.issues,
      },
    });
  }

  try {
    const result = await listNotifications(req.user.id, schoolId, parsed.data);
    return res.status(200).json({
      success: true,
      message: 'Notifications retrieved successfully.',
      ...result,
    });
  } catch (error) {
    return next(error);
  }
}

export async function markNotificationReadController(req, res, next) {
  const schoolId = getSchoolId(req, res);
  if (!schoolId) return;

  try {
    const result = await markNotificationRead(req.params.id, req.user.id, schoolId);
    return res.status(200).json({
      success: true,
      message: 'Notification marked as read.',
      data: result.notification,
      unreadCount: result.unreadCount,
    });
  } catch (error) {
    return next(error);
  }
}

export async function markAllNotificationsReadController(req, res, next) {
  const schoolId = getSchoolId(req, res);
  if (!schoolId) return;

  try {
    const result = await markAllNotificationsRead(req.user.id, schoolId);
    return res.status(200).json({
      success: true,
      message: 'All notifications marked as read.',
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}
