// Report card data for one student, shared by the student's own view and a
// linked parent's view. Callers must check access before calling this.
function isLowerGrade(sectionGrade) {
  const m = (sectionGrade || '').match(/(\d+)/);
  return m ? parseInt(m[1], 10) <= 8 : false; // non-numeric labels (O Level, A Level) count as higher
}

async function buildReportCard({ get, all }, student) {
  const section = await get('SELECT grade FROM sections WHERE section_code = $1', [student.section_code]);
  const lower = isLowerGrade(section ? section.grade : '');

  const grades = await all('SELECT subject, assessment, score, recorded_at FROM grades WHERE student_id = $1 ORDER BY subject, recorded_at', [student.id]);
  const attendanceRows = await all('SELECT status FROM attendance WHERE student_id = $1', [student.id]);
  const total = attendanceRows.length;
  const present = attendanceRows.filter(r => r.status === 'present').length;
  const attendancePct = total ? Math.round((present / total) * 100) : null;

  const settings = await get('SELECT exam_authority_status, exam_authority_name FROM school_settings WHERE id = 1');
  const schoolIsAuthority = settings && settings.exam_authority_status === 'registered';

  // Only numeric "x/y" scores can feed the charts; letter grades stay in the table.
  const numericGrades = grades
    .map(g => {
      const m = /(\d+)\s*\/\s*(\d+)/.exec(g.score);
      return m ? { subject: g.subject, pct: (Number(m[1]) / Number(m[2])) * 100, recordedAt: g.recorded_at } : null;
    })
    .filter(Boolean);

  const bySubject = {};
  numericGrades.forEach(g => {
    if (!bySubject[g.subject]) bySubject[g.subject] = [];
    bySubject[g.subject].push(g.pct);
  });
  const subjectAverages = Object.entries(bySubject).map(([subject, pcts]) => ({
    subject, avgPct: Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length)
  }));

  const byMonth = {};
  numericGrades.forEach(g => {
    const month = new Date(g.recordedAt).toISOString().slice(0, 7);
    if (!byMonth[month]) byMonth[month] = [];
    byMonth[month].push(g.pct);
  });
  const monthlyHistory = Object.entries(byMonth)
    .map(([month, pcts]) => ({ month, avgPct: Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) }))
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-6);

  return {
    student: { name: `${student.first_name} ${student.last_name}`, admissionNo: student.admission_no, section: student.section_code, grade: section ? section.grade : '' },
    officiallyIssued: lower || schoolIsAuthority,
    examAuthorityStatus: settings ? settings.exam_authority_status : 'not_registered',
    examAuthorityName: settings ? settings.exam_authority_name : null,
    grades,
    attendancePct,
    subjectAverages,
    monthlyHistory
  };
}

module.exports = { buildReportCard, isLowerGrade };
