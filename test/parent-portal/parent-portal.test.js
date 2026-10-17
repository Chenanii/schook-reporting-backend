import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeParentIdentifier } from '../../src/modules/parent-portal/contact.js';
import {
  createParentPortalAccountSchema,
  requestParentPortalVerificationSchema,
} from '../../src/modules/parent-portal/parent-auth.validation.js';
import { getParentPortalOverview } from '../../src/modules/parent-portal/parent-portal.service.js';

test('normalizes parent email and local phone identifiers', () => {
  assert.deepEqual(normalizeParentIdentifier('  Parent@School.MW '), {
    type: 'email',
    value: 'parent@school.mw',
    variants: ['parent@school.mw'],
  });
  const phone = normalizeParentIdentifier('0991 234 567');
  assert.equal(phone.type, 'phone');
  assert.equal(phone.value, '+265991234567');
  assert.ok(phone.variants.includes('0991234567'));
});

test('validates parent contact verification and strong password registration', () => {
  assert.equal(requestParentPortalVerificationSchema.safeParse({ identifier: 'parent@school.mw' }).success, true);
  assert.equal(requestParentPortalVerificationSchema.safeParse({ identifier: '123' }).success, false);
  assert.equal(createParentPortalAccountSchema.safeParse({
    challengeId: 'f37b531d-8aca-4faf-8101-0c29c44cecb0',
    identifier: '+265991234567',
    code: '120045',
    password: 'long-enough-password',
  }).success, true);
  assert.equal(createParentPortalAccountSchema.safeParse({
    challengeId: 'f37b531d-8aca-4faf-8101-0c29c44cecb0',
    identifier: '+265991234567',
    code: 'bad',
    password: 'short',
  }).success, false);
});

test('scopes the family portal to the authenticated parent and returns profile records', async () => {
  let parentQuery;
  const db = {
    school: {
      async findFirst({ where }) {
        assert.deepEqual(where, { id: 'school-1', status: 'ACTIVE' });
        return { id: 'school-1', name: 'Example School', slug: 'example', logoDataUrl: null };
      },
    },
    parent: {
      async findMany(query) {
        parentQuery = query;
        return [{
          id: 'parent-1',
          firstName: 'Amina',
          lastName: 'Guardian',
          students: [{
            id: 'link-1',
            relationship: 'Mother',
            student: {
              id: 'student-1',
              admissionNumber: 'STU-1',
              firstName: 'Maya',
              middleName: null,
              lastName: 'Learner',
              dateOfBirth: new Date('2012-01-01T00:00:00.000Z'),
              gender: 'Female',
              enrollments: [{
                id: 'enrollment-1',
                status: 'ACTIVE',
                classLevel: { name: 'Grade 8' },
                classGroup: { name: 'Blue' },
                term: { id: 'term-1', name: 'Term 1', sequence: 1, academicYear: { id: 'year-1', name: '2026', isCurrent: true } },
                termResults: [{ id: 'result-1', finalMark: '82.5', grade: 'A', subject: { id: 'subject-1', name: 'Science', code: 'SCI' } }],
              }],
              annualResults: [],
            },
          }],
        }];
      },
    },
  };

  const result = await getParentPortalOverview('parent-user-1', 'school-1', db);
  assert.deepEqual(parentQuery.where, { userId: 'parent-user-1', schoolId: 'school-1' });
  assert.equal(parentQuery.select.students.select.student.select.enrollments.select.termResults.where.status, 'PUBLISHED');
  assert.equal(parentQuery.select.students.select.student.select.annualResults.where.status, 'PUBLISHED');
  assert.equal(result.students.length, 1);
  assert.equal(result.students[0].currentEnrollment.termResults[0].subject.name, 'Science');
});
