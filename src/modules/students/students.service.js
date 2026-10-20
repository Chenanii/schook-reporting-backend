
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

export async function createStudent(data, actorId, req, schoolId) {
  try {
    return await prisma.$transaction(async (tx) => {
      const [term, classLevel] = await Promise.all([
        tx.term.findFirst({ where: { id: data.termId, schoolId }, select: { id: true, status: true } }),
        tx.classLevel.findFirst({ where: { id: data.classLevelId, schoolId }, select: { id: true } })
      ]);
      if (!term) throw httpError(404, 'TERM_NOT_FOUND', 'Academic term not found for this school.');
      if (!['DRAFT', 'OPEN'].includes(term.status)) {
        throw httpError(409, 'TERM_NOT_ACCEPTING_ENROLLMENTS', 'Enrolments can only be created for terms in DRAFT or OPEN status.');
      }
      if (!classLevel) throw httpError(404, 'CLASS_LEVEL_NOT_FOUND', 'Class level not found for this school.');

      const admissionNumber = `STU-${new Date().getFullYear()}-${randomUUID().toUpperCase()}`;
      const student = await tx.student.create({
        data: {
          admissionNumber,
          schoolId,
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

      const enrollment = await tx.enrollment.create({
        data: { studentId: student.id, termId: term.id, classLevelId: classLevel.id, schoolId },
        select: { id: true, studentId: true, termId: true, classLevelId: true, classGroupId: true, status: true }
      });

      for (const [index, contact] of data.parents.entries()) {
        const email = contact.email?.trim().toLowerCase() || null;
        let parent = email
          ? await tx.parent.findFirst({
              where: { schoolId, email: { equals: email, mode: 'insensitive' } }
            })
          : await tx.parent.findFirst({
              where: { schoolId, phone: contact.phone }
            });
        if (parent) {
          parent = await tx.parent.update({
            where: { id: parent.id },
            data: { firstName: contact.firstName, lastName: contact.lastName, phone: contact.phone, ...(email ? { email } : {}) }
          });
        }
        if (!parent) {
          parent = await tx.parent.create({
            data: { schoolId, firstName: contact.firstName, lastName: contact.lastName, phone: contact.phone, ...(email ? { email } : {}) }
          });
        }
        await tx.parentStudent.upsert({
          where: { parentId_studentId: { parentId: parent.id, studentId: student.id } },
          create: {
            parentId: parent.id,
            studentId: student.id,
            schoolId,
            relationship: contact.relationship || null,
            isPrimary: index === 0
          },
          update: { relationship: contact.relationship || null, isPrimary: index === 0 }
        });
      }

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

      await tx.auditLog.create({
        data: {
          actorId,
          action: 'ENROLLMENT_CREATED',
          entityType: 'Enrollment',
          entityId: enrollment.id,
          oldValues: undefined,
          newValues: { ...enrollment, classLevelId: classLevel.id },
          ipAddress: req.ip,
          userAgent: req.get('user-agent')?.slice(0, 500)
        }
      });

      return tx.student.findUnique({
        where: { id: student.id },
        include: {
          ...studentIncludes,
          enrollments: { select: { id: true, termId: true, classLevelId: true, classGroupId: true, status: true } },
          parents: { include: { parent: true } }
        }
      });
    });
  } catch (error) {
    handleDatabaseError(error);
  }
}

export async function listStudents(filters, teacherUserId = null) {
  const { page, limit, search, status, academicYearId, classLevelId, classGroupId, excludeEnrolledTermId } = filters;
  const teacherEnrollmentScope = [
    { classGroup: { assignments: { some: { teacher: { userId: teacherUserId } } } } },
    { classGroup: { formTutorAssignments: { some: { teacher: { userId: teacherUserId } } } } },
    { subjectStreams: { some: { status: 'ACTIVE', subjectStream: { teachingAssignments: { some: { teacher: { userId: teacherUserId } } } } } } }
  ];
  const enrollmentCriteria = {
    ...(classLevelId ? { classLevelId } : {}),
    ...(classGroupId ? { classGroupId } : {}),
    ...(academicYearId ? { term: { academicYearId } } : {}),
    ...(teacherUserId ? { OR: teacherEnrollmentScope } : {})
  };

  const where = {
    ...(teacherUserId || excludeEnrolledTermId || academicYearId || classLevelId || classGroupId
      ? {
          enrollments: {
            ...(teacherUserId || academicYearId || classLevelId || classGroupId ? { some: enrollmentCriteria } : {}),
            ...(excludeEnrolledTermId ? { none: { termId: excludeEnrolledTermId } } : {})
          },
        }
      : {}),
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
      include: {
        ...studentIncludes,
        enrollments: {
          where: enrollmentCriteria,
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            status: true,
            classLevel: { select: { id: true, name: true, levelOrder: true } },
            classGroup: { select: { id: true, name: true } },
            term: { select: { id: true, name: true, academicYear: { select: { id: true, name: true, isCurrent: true } } } }
          }
        },
        parents: {
          orderBy: { isPrimary: 'desc' },
          take: 1,
          select: { parent: { select: { phone: true } } }
        }
      }
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

export async function getStudentById(id, teacherUserId = null) {
  const teacherClassScope = teacherUserId
    ? {
        enrollments: {
          some: {
            OR: [
              { classGroup: { assignments: { some: { teacher: { userId: teacherUserId } } } } },
              { subjectStreams: { some: { status: 'ACTIVE', subjectStream: { teachingAssignments: { some: { teacher: { userId: teacherUserId } } } } } } }
            ]
          },
        },
      }
    : {};
  const student = await prisma.student.findFirst({
    where: { id, ...teacherClassScope },
    include: {
      ...studentIncludes,
      enrollments: {
        ...(teacherUserId
          ? {
              where: {
                OR: [
                  { classGroup: { assignments: { some: { teacher: { userId: teacherUserId } } } } },
                  { subjectStreams: { some: { status: 'ACTIVE', subjectStream: { teachingAssignments: { some: { teacher: { userId: teacherUserId } } } } } } }
                ]
              },
            }
          : {}),
        orderBy: { createdAt: 'desc' },
        include: {
          classLevel: { select: { id: true, name: true, levelOrder: true } },
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
      ...(teacherUserId ? {} : { parents: {
        include: {
          parent: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
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
      } }),
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
        where: { id },
        include: { parents: { include: { parent: true } } }
      });

      if (!existing) {
        throw httpError(404, 'STUDENT_NOT_FOUND', 'Student not found.');
      }

      if (data.parents !== undefined) {
        const currentParents = new Map(existing.parents.map(({ parent }) => [parent.id, parent]));
        const retainedParentIds = [];

        for (const [index, contact] of data.parents.entries()) {
          const email = contact.email?.trim().toLowerCase() || null;
          const phone = contact.phone?.trim() || null;
          let parent;

          if (contact.parentId) {
            parent = currentParents.get(contact.parentId);
            if (!parent) {
              throw httpError(400, 'INVALID_STUDENT_PARENT', 'A parent contact does not belong to this student.');
            }
            const matchingParent = email
              ? await tx.parent.findFirst({
                  where: { schoolId: existing.schoolId, id: { not: parent.id }, email: { equals: email, mode: 'insensitive' } }
                })
              : phone
                ? await tx.parent.findFirst({ where: { schoolId: existing.schoolId, id: { not: parent.id }, phone } })
                : null;

            if (matchingParent) {
              if (parent.userId && matchingParent.userId && parent.userId !== matchingParent.userId) {
                throw httpError(409, 'PARENT_ACCOUNTS_CANNOT_BE_MERGED', 'These contact details are linked to a different parent portal account. Contact the school to resolve the parent records.');
              }
              if (parent.userId && !matchingParent.userId) {
                await tx.parent.update({ where: { id: matchingParent.id }, data: { userId: parent.userId } });
              }
              parent = matchingParent;
            }

            parent = await tx.parent.update({
              where: { id: parent.id },
              data: { firstName: contact.firstName, lastName: contact.lastName, email, phone }
            });
            if (parent.userId) {
              await tx.user.update({
                where: { id: parent.userId },
                data: {
                  email,
                  firstName: contact.firstName,
                  lastName: contact.lastName
                }
              });
            }
          } else {
            parent = email
              ? await tx.parent.findFirst({
                  where: { schoolId: existing.schoolId, email: { equals: email, mode: 'insensitive' } }
                })
              : phone
                ? await tx.parent.findFirst({
                    where: { schoolId: existing.schoolId, phone }
                  })
                : null;

            if (parent) {
              parent = await tx.parent.update({
                where: { id: parent.id },
                data: { firstName: contact.firstName, lastName: contact.lastName, email, phone }
              });
              if (parent.userId) {
                await tx.user.update({
                  where: { id: parent.userId },
                  data: {
                    email,
                    firstName: contact.firstName,
                    lastName: contact.lastName
                  }
                });
              }
            } else {
              parent = await tx.parent.create({
                data: {
                  schoolId: existing.schoolId,
                  firstName: contact.firstName,
                  lastName: contact.lastName,
                  email,
                  phone
                }
              });
            }
          }

          retainedParentIds.push(parent.id);
          await tx.parentStudent.upsert({
            where: { parentId_studentId: { parentId: parent.id, studentId: id } },
            create: {
              parentId: parent.id,
              studentId: id,
              schoolId: existing.schoolId,
              relationship: contact.relationship || null,
              isPrimary: index === 0
            },
            update: {
              relationship: contact.relationship || null,
              isPrimary: index === 0
            }
          });
        }

        await tx.parentStudent.deleteMany({
          where: {
            studentId: id,
            ...(retainedParentIds.length ? { parentId: { notIn: retainedParentIds } } : {})
          }
        });
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
          {
            ...snapshot(existing),
            ...(data.parents !== undefined ? {
              parents: existing.parents.map(({ parent, relationship }) => ({
                id: parent.id,
                firstName: parent.firstName,
                lastName: parent.lastName,
                email: parent.email,
                phone: parent.phone,
                relationship
              }))
            } : {})
          },
          {
            ...snapshot(updated),
            ...(data.parents !== undefined ? {
              parents: data.parents.map(({ parentId, firstName, lastName, email, phone, relationship }) => ({
                id: parentId ?? null,
                firstName,
                lastName,
                email: email || null,
                phone: phone || null,
                relationship: relationship || null
              }))
            } : {})
          },
          req
        )
      });

      return data.parents === undefined
        ? updated
        : tx.student.findUnique({
            where: { id },
            include: { ...studentIncludes, parents: { include: { parent: true } } }
          });
    });
  } catch (error) {
    if (error.code === 'P2002' && data.parents !== undefined) {
      throw httpError(
        409,
        'PARENT_ACCOUNT_EMAIL_CONFLICT',
        'This email address is already used by another portal account. Use the parent contact already linked to that account or contact the school for help.'
      );
    }
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

export async function getStudentClassDistribution(schoolId) {
  if (!schoolId) throw httpError(400, 'SCHOOL_CONTEXT_REQUIRED', 'Select a school workspace to view student distribution.');

  const [terms, levels, groups] = await Promise.all([
    prisma.term.findMany({
      where: { schoolId },
      orderBy: [{ academicYear: { isCurrent: 'desc' } }, { academicYear: { startDate: 'desc' } }, { sequence: 'desc' }],
      select: { id: true, name: true, sequence: true, academicYear: { select: { id: true, name: true } } },
    }),
    prisma.classLevel.findMany({ where: { schoolId }, orderBy: { levelOrder: 'asc' }, select: { id: true, name: true, levelOrder: true } }),
    prisma.classGroup.findMany({ where: { schoolId }, orderBy: [{ classLevel: { levelOrder: 'asc' } }, { name: 'asc' }], select: { id: true, name: true, classLevelId: true } }),
  ]);
  const enrollmentGroups = terms.length ? await prisma.enrollment.groupBy({
      by: ['termId', 'classLevelId', 'classGroupId'],
      where: { schoolId, termId: { in: terms.map(({ id }) => id) }, status: 'ACTIVE', student: { status: 'ACTIVE' } },
      _count: { _all: true },
    }) : [];
  const term = terms.find(({ id }) => enrollmentGroups.some((row) => row.termId === id)) || terms[0] || null;
  const counts = term ? enrollmentGroups.filter((row) => row.termId === term.id) : [];

  const groupCounts = new Map();
  const levelCounts = new Map(levels.map((level) => [level.id, 0]));
  let unassignedStudents = 0;
  counts.forEach((row) => {
    const count = row._count._all;
    levelCounts.set(row.classLevelId, (levelCounts.get(row.classLevelId) || 0) + count);
    if (row.classGroupId) groupCounts.set(row.classGroupId, count);
    else unassignedStudents += count;
  });

  const groupsByLevel = new Map();
  groups.forEach((group) => {
    const levelGroups = groupsByLevel.get(group.classLevelId) || [];
    levelGroups.push({ id: group.id, name: group.name, students: groupCounts.get(group.id) || 0 });
    groupsByLevel.set(group.classLevelId, levelGroups);
  });

  const classes = levels.map((level) => ({
    ...level,
    students: levelCounts.get(level.id) || 0,
    groups: groupsByLevel.get(level.id) || [],
    unassignedStudents: counts
      .filter((row) => row.classLevelId === level.id && row.classGroupId === null)
      .reduce((total, row) => total + row._count._all, 0),
  }));

  return {
    term,
    totalStudents: classes.reduce((total, level) => total + level.students, 0),
    unassignedStudents,
    classGroupCount: groups.length,
    classes,
  };
}
