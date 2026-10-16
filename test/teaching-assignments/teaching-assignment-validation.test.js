import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createTeachingAssignmentSchema,
  updateTeachingAssignmentSchema
} from '../../src/modules/teaching-assignments/teaching-assignments.validation.js';

const validAssignment = {
  teacherId: 'teacher-1',
  classGroupId: 'class-group-1',
  subjectId: 'subject-1',
  termId: 'term-1'
};

test('accepts a teaching assignment for a standalone subject', () => {
  assert.equal(createTeachingAssignmentSchema.safeParse(validAssignment).success, true);
});

test('rejects teaching assignments without a subject', () => {
  const { subjectId, ...assignment } = validAssignment;
  assert.equal(createTeachingAssignmentSchema.safeParse(assignment).success, false);
});

test('rejects legacy classSubjectId input instead of a subjectId', () => {
  const { subjectId, ...assignment } = validAssignment;
  assert.equal(
    createTeachingAssignmentSchema.safeParse({
      ...assignment,
      classSubjectId: 'class-subject-1'
    }).success,
    false
  );
});

test('allows updating the assigned subject directly', () => {
  assert.equal(updateTeachingAssignmentSchema.safeParse({ subjectId: 'subject-2' }).success, true);
});
