import { prisma } from "../../lib/prisma.js";

function httpError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}
export async function getParentPortalOverview(userId, schoolId, db = prisma) {
  if (!schoolId) {
    throw httpError(
      400,
      "SCHOOL_CONTEXT_REQUIRED",
      "This parent account is not linked to a school workspace.",
    );
  }

  const [school, parentLinks] = await Promise.all([
    db.school.findFirst({
      where: { id: schoolId, status: "ACTIVE" },
      select: { id: true, name: true, slug: true, logoDataUrl: true },
    }),
    db.parent.findMany({
      where: { userId, schoolId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        students: {
          where: { schoolId },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            relationship: true,
            student: {
              select: {
                id: true,
                admissionNumber: true,
                firstName: true,
                middleName: true,
                lastName: true,
                dateOfBirth: true,
                gender: true,
                enrollments: {
                  where: { schoolId },
                  orderBy: [{ createdAt: "desc" }],
                  select: {
                    id: true,
                    termId: true,
                    classGroupId: true,
                    status: true,
                    classLevel: { select: { name: true } },
                    classGroup: { select: { name: true } },
                    term: {
                      select: {
                        id: true,
                        name: true,
                        sequence: true,
                        status: true,
                        academicYear: {
                          select: { id: true, name: true, isCurrent: true },
                        },
                      },
                    },
                    termResults: {
                      where: { status: "PUBLISHED" },
                      orderBy: { subject: { name: "asc" } },
                      select: {
                        id: true,
                        finalMark: true,
                        grade: true,
                        gradeDescription: true,
                        teacherComment: true,
                        publishedAt: true,
                        subject: {
                          select: { id: true, name: true, code: true },
                        },
                      },
                    },
                  },
                },
                annualResults: {
                  where: { schoolId, status: "PUBLISHED" },
                  orderBy: { academicYear: { startDate: "desc" } },
                  select: {
                    id: true,
                    finalMark: true,
                    grade: true,
                    gradeDescription: true,
                    academicYear: { select: { id: true, name: true } },
                    subject: { select: { id: true, name: true, code: true } },
                  },
                },
              },
            },
          },
        },
      },
    }),
  ]);

  if (!school)
    throw httpError(
      404,
      "SCHOOL_NOT_FOUND",
      "The school workspace is unavailable.",
    );
  if (!parentLinks.length)
    throw httpError(
      403,
      "PARENT_STUDENT_LINK_REQUIRED",
      "No students are linked to this parent account.",
    );

  const enrollmentScopes = parentLinks.flatMap(({ students }) => students.flatMap(({ student }) => (
    student?.enrollments
      .filter(({ classGroupId }) => classGroupId)
      .map(({ termId, classGroupId }) => ({ termId, classGroupId })) || []
  )));
  const publications = enrollmentScopes.length
    ? await db.reportPublication.findMany({
      where: {
        type: { in: ["MID_TERM", "END_OF_TERM"] },
        OR: enrollmentScopes,
      },
      select: { termId: true, classGroupId: true, type: true, publishedAt: true },
    })
    : [];
  const publicationByScope = new Map(publications.map((publication) => [
    `${publication.type}:${publication.termId}:${publication.classGroupId}`,
    publication.publishedAt,
  ]));

  const studentsById = new Map();
  for (const link of parentLinks) {
    for (const parentStudent of link.students) {
      const student = parentStudent.student;
      if (!student) continue;
      const existing = studentsById.get(student.id);
      const currentEnrollment =
        student.enrollments.find(
          (enrollment) => enrollment.status === "ACTIVE",
        ) ||
        student.enrollments[0] ||
        null;
      const enrollmentsWithMidTermPublication = student.enrollments.map((enrollment) => ({
        ...enrollment,
        midTermPublishedAt: enrollment.classGroupId
          ? publicationByScope.get(`MID_TERM:${enrollment.termId}:${enrollment.classGroupId}`) ?? null
          : null,
        endOfTermPublishedAt: enrollment.classGroupId
          ? publicationByScope.get(`END_OF_TERM:${enrollment.termId}:${enrollment.classGroupId}`) ?? null
          : null,
      }));
      if (!existing) {
        studentsById.set(student.id, {
          id: student.id,
          admissionNumber: student.admissionNumber,
          firstName: student.firstName,
          middleName: student.middleName,
          lastName: student.lastName,
          dateOfBirth: student.dateOfBirth,
          gender: student.gender,
          relationship: parentStudent.relationship,
          currentEnrollment: currentEnrollment
            ? enrollmentsWithMidTermPublication.find(({ id }) => id === currentEnrollment.id)
            : null,
          enrollments: enrollmentsWithMidTermPublication,
          annualResults: student.annualResults,
        });
      }
    }
  }

  return {
    school,
    parent: {
      firstName: parentLinks[0].firstName,
      lastName: parentLinks[0].lastName,
    },
    students: [...studentsById.values()].sort((left, right) =>
      `${left.lastName} ${left.firstName}`.localeCompare(
        `${right.lastName} ${right.firstName}`,
      ),
    ),
  };
}
