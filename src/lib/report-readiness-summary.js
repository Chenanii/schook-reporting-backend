export function reportReadinessSummary(reportCards) {
  return reportCards.map((card) => ({
    enrollment: { id: card.enrollment.id },
    student: {
      firstName: card.student?.firstName,
      middleName: card.student?.middleName,
      lastName: card.student?.lastName,
      admissionNumber: card.student?.admissionNumber,
    },
    complete: card.complete,
    ...(card.summary ? { summary: { requiredSubjects: card.summary.requiredSubjects } } : {}),
    ...(card.missingSubjects ? { missingSubjects: card.missingSubjects } : {}),
    ...(card.incompleteSubjects ? { incompleteSubjects: card.incompleteSubjects } : {}),
  }));
}
