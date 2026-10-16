
import { randomUUID } from 'node:crypto';
import { prisma } from '../../lib/prisma.js';

function httpError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function auditData(actorId, action, studentId, oldValues, newValues, req) {
  return {
    actorId,
    action,
    entityType: 'Student',
    entityId: studentId,
    oldValues: oldValues ?? undefined,
    newValues: newValues ?? undefined,
    ipAddress: req.ip,
    userAgent: req.get('user-agent')?.slice(0, 500)
  };
}

function snapshot(student) {
  return {
    admissionNumber: student.admissionNumber,
    firstName: student.firstName,
    middleName: student.middleName,
    lastName: student.lastName,
    dateOfBirth: student.dateOfBirth
      ? student.dateOfBirth.toISOString().slice(0, 10)
      : null,
    gender: student.gender,
    status: student.status
  };
}

function handleDatabaseError(error) {
  if (error.code === 'P2002') {
    throw httpError(
      409,
      'STUDENT_ALREADY_EXISTS',
      'A student with this admission number already exists.'
    );
  }

  throw error;
}

const studentIncludes = {
  _count: {
    select: {
      enrollments: true,
      annualResults: true,
      parents: true
    }
  }
};

export async function createStudent(data, actorId, req) {
  try {
    return await prisma.$transaction(async (tx) => {
      const admissionNumber = `STU-${new Date().getFullYear()}-${randomUUID().toUpperCase()}`;
      const student = await tx.student.create({
        data: {
          admissionNumber,
          firstName: data.firstName,
          ...(data.middleName !== undefined
            ? { middleName: data.middleName }
            : {}),
          lastName: data.lastName,
          ...(data.dateOfBirth !== undefined
            ? {
                dateOfBirth: data.dateOfBirth
                  ? new Date(`${data.dateOfBirth}T00:00:00.000Z`)
                  : null
              }
            : {}),
          ...(data.gender !== undefined ? { gender: data.gender } : {}),
          ...(data.status ? { status: data.status } : {})
        },
        include: studentIncludes
      });

      await tx.auditLog.create({
        data: auditData(
          actorId,
          'STUDENT_CREATED',
          student.id,
          null,
          snapshot(student),
          req
        )
      });

      return student;
    });
  } catch (error) {
    handleDatabaseError(error);
  }
}

export async function listStudents(filters) {
  const { page, limit, search, status } = filters;

  const where = {
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            {
              admissionNumber: {
                contains: search,
                mode: 'insensitive'
              }
            },
            {
              firstName: {
                contains: search,
                mode: 'insensitive'
              }
            },
            {
              middleName: {
                contains: search,
                mode: 'insensitive'
              }
            },
            {
              lastName: {
                contains: search,
                mode: 'insensitive'
              }
            }
          ]
        }
      : {})
  };

  const [students, total] = await prisma.$transaction([
    prisma.student.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [
        { lastName: 'asc' },
        { firstName: 'asc' }
      ],
      include: studentIncludes
    }),
    prisma.student.count({ where })
  ]);

  return {
    data: students,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

export async function getStudentById(id) {
  const student = await prisma.student.findUnique({
    where: { id },
    include: {
      ...studentIncludes,
      enrollments: {
        orderBy: { createdAt: 'desc' },
        include: {
          term: {
            select: {
              id: true,
              name: true,
              sequence: true,
              status: true,
              academicYear: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          },
          classGroup: {
            select: {
              id: true,
              name: true,
              classLevel: {
                select: {
                  id: true,
                  name: true,
                  levelOrder: true
                }
              }
            }
          }
        }
      },
      parents: {
        include: {
          parent: {
            select: {
              id: true,
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true
                }
              }
            }
          }
        }
      }
    }
  });

  if (!student) {
    throw httpError(404, 'STUDENT_NOT_FOUND', 'Student not found.');
  }

  return student;
}

export async function updateStudent(id, data, actorId, req) {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.student.findUnique({
        where: { id }
      });

      if (!existing) {
        throw httpError(404, 'STUDENT_NOT_FOUND', 'Student not found.');
      }

      const updated = await tx.student.update({
        where: { id },
        data: {
          ...(data.firstName !== undefined
            ? { firstName: data.firstName }
            : {}),
          ...(data.middleName !== undefined
            ? { middleName: data.middleName }
            : {}),
          ...(data.lastName !== undefined
            ? { lastName: data.lastName }
            : {}),
          ...(data.dateOfBirth !== undefined
            ? {
                dateOfBirth: data.dateOfBirth
                  ? new Date(`${data.dateOfBirth}T00:00:00.000Z`)
                  : null
              }
            : {}),
          ...(data.gender !== undefined ? { gender: data.gender } : {})
        },
        include: studentIncludes
      });

      await tx.auditLog.create({
        data: auditData(
          actorId,
          'STUDENT_UPDATED',
          id,
          snapshot(existing),
          snapshot(updated),
          req
        )
      });

      return updated;
    });
  } catch (error) {
    handleDatabaseError(error);
  }
}

export async function updateStudentStatus(id, status, actorId, req) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.student.findUnique({
      where: { id }
    });

    if (!existing) {
      throw httpError(404, 'STUDENT_NOT_FOUND', 'Student not found.');
    }

    const updated = await tx.student.update({
      where: { id },
      data: { status },
      include: studentIncludes
    });

    await tx.auditLog.create({
      data: auditData(
        actorId,
        'STUDENT_STATUS_UPDATED',
        id,
        snapshot(existing),
        snapshot(updated),
        req
      )
    });

    return updated;
  });
}
