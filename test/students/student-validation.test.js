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
