import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createStudentSchema,
  updateStudentSchema
} from '../../src/modules/students/students.validation.js';

const validStudent = {
  firstName: 'Jordan',
  lastName: 'Moyo'
};

test('accepts student creation without an admission number', () => {
  assert.equal(createStudentSchema.safeParse(validStudent).success, true);
});

test('rejects a client-supplied admission number during student creation', () => {
  assert.equal(
    createStudentSchema.safeParse({
      ...validStudent,
      admissionNumber: 'MANUAL-001'
    }).success,
    false
  );
});

test('rejects changing the system-generated admission number', () => {
  assert.equal(
    updateStudentSchema.safeParse({ admissionNumber: 'MANUAL-001' }).success,
    false
  );
});

test('accepts parent contact edits when updating a student', () => {
  assert.equal(updateStudentSchema.safeParse({
    parents: [{
      firstName: 'Amina',
      lastName: 'Moyo',
      phone: '0991234567',
      relationship: 'Mother'
    }]
  }).success, true);
  assert.equal(updateStudentSchema.safeParse({
    parents: [{
      firstName: 'Amina',
      lastName: 'Moyo',
      email: 'amina@example.com'
    }]
  }).success, true);
  assert.equal(updateStudentSchema.safeParse({ parents: [] }).success, true);
});

test('requires an email or phone for each parent contact edit', () => {
  assert.equal(updateStudentSchema.safeParse({
    parents: [{
      firstName: 'Amina',
      lastName: 'Moyo',
      phone: '',
      email: ''
    }]
  }).success, false);
});
