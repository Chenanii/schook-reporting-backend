import { prisma } from '../../lib/prisma.js';

const notificationSelect = {
  id: true,
  type: true,
  title: true,
  message: true,
  entityId: true,
  readAt: true,
  createdAt: true,
};

function httpError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

export async function getStudentAndParentUserIds(tx, { schoolId, studentIds }) {
  const uniqueStudentIds = [...new Set(studentIds)];
  if (!uniqueStudentIds.length) return [];

  const [studentAccounts, parentStudents] = await Promise.all([
    tx.studentAccount.findMany({
      where: { schoolId, studentId: { in: uniqueStudentIds } },
      select: { userId: true },
    }),
    tx.parentStudent.findMany({
      where: { schoolId, studentId: { in: uniqueStudentIds } },
      select: { parent: { select: { userId: true } } },
    }),
  ]);

  return [...new Set([
    ...studentAccounts.map(({ userId }) => userId),
    ...parentStudents.map(({ parent }) => parent.userId).filter(Boolean),
  ])];
}

export async function notifyActiveStudentsAndParents(tx, {
  schoolId,
  termId,
  classGroupId,
  subjectStreamId,
  type,
  title,
  message,
  entityId,
}) {
  const enrollments = await tx.enrollment.findMany({
    where: {
      schoolId,
      termId,
      status: 'ACTIVE',
      ...(subjectStreamId
        ? { subjectStreams: { some: { subjectStreamId, status: 'ACTIVE' } } }
        : { classGroupId }),
    },
    select: { studentId: true },
  });
  const userIds = await getStudentAndParentUserIds(tx, {
    schoolId,
    studentIds: enrollments.map(({ studentId }) => studentId),
  });
  await createNotifications(tx, { schoolId, userIds, type, title, message, entityId });
}

export async function createNotifications(tx, {
  schoolId,
  userIds,
  type,
  title,
  message,
  entityId,
}) {
  const recipients = [...new Set(userIds)].filter(Boolean);
  if (!recipients.length) return;

  await tx.notification.createMany({
    data: recipients.map((userId) => ({
      userId,
      schoolId,
      type,
      title,
      message,
      entityId: entityId ?? null,
    })),
  });
}

export async function listNotifications(userId, schoolId, { limit, cursor }) {
  if (cursor) {
    const cursorNotification = await prisma.notification.findFirst({
      where: { id: cursor, userId, schoolId },
      select: { id: true },
    });
    if (!cursorNotification) {
      throw httpError(400, 'INVALID_NOTIFICATION_CURSOR', 'The notification cursor is invalid.');
    }
  }

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId, schoolId },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: limit + 1,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: notificationSelect,
    }),
    prisma.notification.count({ where: { userId, schoolId, readAt: null } }),
  ]);

  const hasMore = notifications.length > limit;
  const data = hasMore ? notifications.slice(0, limit) : notifications;
  return {
    data,
    unreadCount,
    nextCursor: hasMore ? data.at(-1).id : null,
  };
}

export async function markNotificationRead(id, userId, schoolId) {
  const result = await prisma.notification.updateMany({
    where: { id, userId, schoolId, readAt: null },
    data: { readAt: new Date() },
  });
  const [notification, unreadCount] = await Promise.all([
    prisma.notification.findFirst({
      where: { id, userId, schoolId },
      select: notificationSelect,
    }),
    prisma.notification.count({ where: { userId, schoolId, readAt: null } }),
  ]);
  if (!notification) {
    throw httpError(404, 'NOTIFICATION_NOT_FOUND', 'Notification not found.');
  }
  return { notification, unreadCount, updated: result.count > 0 };
}

export async function markAllNotificationsRead(userId, schoolId) {
  const result = await prisma.notification.updateMany({
    where: { userId, schoolId, readAt: null },
    data: { readAt: new Date() },
  });
  const unreadCount = await prisma.notification.count({
    where: { userId, schoolId, readAt: null },
  });
  return { updatedCount: result.count, unreadCount };
}
