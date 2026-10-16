import test from 'node:test';
import assert from 'node:assert/strict';

import { teacherAssessmentScope } from '../../src/modules/assessments/assessment-access.js';

test('teacher assessment scope is limited to assignments linked to their user', () => {
  assert.deepEqual(teacherAssessmentScope('teacher-user-1'), {
    teachingAssignment: {
      teacher: {
        userId: 'teacher-user-1'
      }
    }
  });
});

test('non-teacher assessment queries are not restricted by teacher assignment', () => {
  assert.deepEqual(teacherAssessmentScope(null), {});
});
