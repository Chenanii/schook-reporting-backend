import { attendanceClassesSchema, attendanceReportQuerySchema, attendanceSheetQuerySchema, saveAttendanceSchema } from './attendance.validation.js';
import { getAttendanceReport, getAttendanceSheet, listAttendanceClasses, saveAttendance } from './attendance.service.js';

function xmlEscape(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function excelReport(report) {
  const headers = ['Student name', 'Admission number', 'Class level', 'Class group', 'Term', 'Academic year', 'Total days present', 'Total days absent', 'Percentage attendance'];
  const rows = report.rows.map((row) => [row.studentName, row.admissionNumber, row.classLevel, row.classGroup, row.term, row.academicYear, row.totalDaysPresent, row.totalDaysAbsent, `${row.percentageAttendance}%`]);
  const table = [headers, ...rows].map((row) => `<Row>${row.map((cell) => `<Cell><Data ss:Type="String">${xmlEscape(cell)}</Data></Cell>`).join('')}</Row>`).join('');
  return `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Attendance"><Table>${table}</Table></Worksheet></Workbook>`;
}

function pdfText(value) {
  return String(value ?? '').normalize('NFKD').replace(/[^\x20-\x7E]/g, '').replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
}

function pdfReport(report) {
  const lines = [
    `Attendance report - ${report.term.name} / ${report.term.academicYear}`,
    'Student | Admission no. | Level | Group | Present | Absent | Attendance',
    ...report.rows.map((row) => `${row.studentName} | ${row.admissionNumber} | ${row.classLevel} | ${row.classGroup} | ${row.totalDaysPresent} | ${row.totalDaysAbsent} | ${row.percentageAttendance}%`)
  ];
  const chunks = [];
  while (lines.length) chunks.push(lines.splice(0, 44));
  if (!chunks.length) chunks.push(['Attendance report']);
  const objects = [];
  const pageIds = chunks.map((_, i) => 4 + i * 2);
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  chunks.forEach((pageLines, index) => {
    const pageId = pageIds[index];
    const contentId = pageId + 1;
    const commands = ['BT', '/F1 8 Tf', '36 806 Td', '11 TL', ...pageLines.map((line, lineIndex) => `${lineIndex ? 'T* ' : ''}(${pdfText(line).slice(0, 150)}) Tj`), 'ET'].join('\n');
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${Buffer.byteLength(commands)} >>\nstream\n${commands}\nendstream`;
  });
  let output = '%PDF-1.4\n';
  const offsets = [0];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = Buffer.byteLength(output);
    output += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(output);
}

function validationError(res, error) {
  return res.status(400).json({
    success: false,
    error: { code: 'VALIDATION_ERROR', message: 'Request validation failed.', details: error.issues }
  });
}

export async function listAttendanceClassesController(req, res, next) {
  try {
    const parsed = attendanceClassesSchema.safeParse(req.query);
    if (!parsed.success) return validationError(res, parsed.error);
    const data = await listAttendanceClasses(parsed.data.termId, parsed.data.date, req.user, req.schoolId);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getAttendanceSheetController(req, res, next) {
  try {
    const parsed = attendanceSheetQuerySchema.safeParse(req.query);
    if (!parsed.success) return validationError(res, parsed.error);
    const data = await getAttendanceSheet(parsed.data, req.user, req.schoolId);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function saveAttendanceController(req, res, next) {
  try {
    const parsed = saveAttendanceSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    const data = await saveAttendance(parsed.data, req.user, req.schoolId, req);
    return res.status(200).json({ success: true, message: 'Class attendance saved.', data });
  } catch (error) {
    next(error);
  }
}

export async function attendanceReportController(req, res, next) {
  try {
    const parsed = attendanceReportQuerySchema.safeParse(req.query);
    if (!parsed.success) return validationError(res, parsed.error);
    const { format, ...filters } = parsed.data;
    const report = await getAttendanceReport(filters, req.schoolId);
    if (!format) return res.status(200).json({ success: true, data: report });
    const scope = filters.studentId ? 'student' : filters.classGroupId ? 'class' : 'school';
    const filename = `attendance-${scope}-${filters.studentId || filters.classGroupId || filters.termId}.${format === 'excel' ? 'xls' : 'pdf'}`;
    if (format === 'excel') {
      res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(excelReport(report));
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(pdfReport(report));
  } catch (error) {
    next(error);
  }
}
