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
  academicYearId: 'year-1'
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

test('requires an academic year instead of a single term for new assignments', () => {
  const { academicYearId, ...assignment } = validAssignment;
  assert.equal(createTeachingAssignmentSchema.safeParse({ ...assignment, termId: 'term-1' }).success, false);
  assert.equal(createTeachingAssignmentSchema.safeParse({ ...assignment, academicYearId }).success, true);
});

test('accepts a term from which a teacher change takes effect', () => {
  assert.equal(updateTeachingAssignmentSchema.safeParse({
    teacherId: 'teacher-2',
    effectiveFromTermId: 'term-2'
  }).success, true);
});
