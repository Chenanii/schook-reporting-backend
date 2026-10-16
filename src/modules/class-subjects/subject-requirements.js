export function shouldIncludeReportSubject({ isActive, isRequired, selected, hasPublishedResult }) {
  return isActive && (isRequired || selected || hasPublishedResult);
}
