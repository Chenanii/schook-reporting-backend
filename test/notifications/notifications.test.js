import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createNotifications,
  getStudentAndParentUserIds,
} from '../../src/modules/notifications/notifications.service.js';
import { notificationListQuerySchema } from '../../src/modules/notifications/notifications.validation.js';

test('notification list query applies defaults and caps page size', () => {
  assert.deepEqual(notificationListQuerySchema.parse({}), { limit: 20 });
  assert.deepEqual(notificationListQuerySchema.parse({ limit: '50', cursor: 'next' }), {
    limit: 50,
    cursor: 'next',
  });
  assert.equal(notificationListQuerySchema.safeParse({ limit: '51' }).success, false);
  assert.equal(notificationListQuerySchema.safeParse({ limit: '0' }).success, false);
});

test('collects distinct student and linked parent accounts', async () => {
  const studentWhere = [];
  const tx = {
    studentAccount: {
      async findMany({ where }) {
        studentWhere.push(where);
        return [{ userId: 'student-user' }, { userId: 'student-user' }];
      },
    },
    parentStudent: {
      async findMany({ where }) {
        studentWhere.push(where);
        return [
          { parent: { userId: 'parent-user' } },
          { parent: { userId: null } },
        ];
      },
    },
  };

  const userIds = await getStudentAndParentUserIds(tx, {
    schoolId: 'school-1',
    studentIds: ['student-1', 'student-1'],
  });

  assert.deepEqual(userIds, ['student-user', 'parent-user']);
  assert.equal(studentWhere.length, 2);
  assert.deepEqual(studentWhere[0].studentId.in, ['student-1']);
});

test('creates one notification per distinct valid recipient', async () => {
  let createdRows;
  const tx = {
    notification: {
      async createMany({ data }) {
        createdRows = data;
        return { count: data.length };
      },
    },
  };

  await createNotifications(tx, {
    schoolId: 'school-1',
    userIds: ['user-1', 'user-1', null, 'user-2'],
    type: 'TERM_RESULT_PUBLISHED',
    title: 'Result available',
    message: 'Your result is ready.',
  });

  assert.deepEqual(createdRows.map(({ userId }) => userId), ['user-1', 'user-2']);
  assert.ok(createdRows.every(({ schoolId }) => schoolId === 'school-1'));
});
