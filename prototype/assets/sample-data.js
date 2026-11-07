/* Synthetic sample data for the design preview ONLY.
   Every name, number and record here is invented. Nothing is copied from the
   live database, and the shapes match the existing API responses so the same
   rendering code runs in sample and live mode. */
(function () {
  'use strict';
  const now = Date.now();
  const minsAgo = (m) => new Date(now - m * 60000).toISOString();
  const daysAhead = (d) => new Date(now + d * 86400000).toISOString().slice(0, 10);
  const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });

  window.NovaSample = {
    school: 'Sample School (demo)',
    admin: {
      user: { name: 'Sample Admin', sub: 'School administrator' },
      overview: {
        totalStudents: 412, totalTeachers: 28, feeCollectionPct: 78.4, attendancePct: 91.2,
        enrollmentByGrade: [
          { grade: 'Grade 1', count: 38 }, { grade: 'Grade 2', count: 36 }, { grade: 'Grade 3', count: 41 },
          { grade: 'Grade 4', count: 35 }, { grade: 'Grade 5', count: 39 }, { grade: 'Grade 6', count: 34 },
          { grade: 'Grade 7', count: 33 }, { grade: 'Grade 8', count: 37 }, { grade: 'Grade 9', count: 32 },
          { grade: 'Grade 10', count: 30 }, { grade: 'Grade 11', count: 29 }, { grade: 'Grade 12', count: 28 },
        ],
        students: { active: 405, suspended: 2, newThisMonth: 14 },
        teachers: { active: 27, suspended: 0, newThisMonth: 1 },
        parents: { total: 356, active: 341 }, staff: { total: 9, active: 8, invited: 1 },
        pendingAdmissions: 3, pendingTeacherApps: 2,
        courses: { total: 48, published: 41, draft: 7, subjects: 14 },
        totalClasses: 24, activeExams: 5, totalAssignments: 132, pendingSubmissions: 19, resultsRecorded: 2840,
        activity: { dau: 187, wau: 352 },
      },
      approvals: { items: [
        { label: 'Student admissions', count: 3, page: 'overview', anchor: 'admissions' },
        { label: 'Teacher applications', count: 2, page: 'overview', anchor: 'teacher-applications' },
        { label: 'Staff invitations pending activation', count: 1, page: 'management', anchor: 'staff' },
        { label: 'Fee payments awaiting confirmation', count: 3, page: 'overview', anchor: 'fees' },
      ] },
      live: { sessions: [
        { id: 1, teacherName: 'Teacher A. Sample', sectionCode: '8-A', startedAt: minsAgo(18) },
        { id: 2, teacherName: 'Teacher B. Sample', sectionCode: '10-B', startedAt: minsAgo(6) },
      ] },
      notifications: { unreadCount: 2, notifications: [
        { id: 1, type: 'admission', message: 'New admission application received (sample).', priority: 'normal', read: false, createdAt: minsAgo(40) },
        { id: 2, type: 'security', message: '3+ failed sign-in attempts for a sample account.', priority: 'critical', read: false, createdAt: minsAgo(130) },
        { id: 3, type: 'fees', message: 'A parent marked an invoice as paid (sample).', priority: 'normal', read: true, createdAt: minsAgo(60 * 26) },
      ] },
      announcements: { announcements: [
        { id: 1, title: 'Mid-term exam timetable published', body: 'Sample announcement text.', audience: 'all', created_at: minsAgo(60 * 5) },
        { id: 2, title: 'Parent–teacher meeting on Saturday', body: 'Sample announcement text.', audience: 'parents', created_at: minsAgo(60 * 30) },
        { id: 3, title: 'Science week: Virtual Lab challenge', body: 'Sample announcement text.', audience: 'students', created_at: minsAgo(60 * 54) },
      ] },
      admissions: { applications: [
        { id: 101, applicantName: 'Applicant One (sample)', gradeApplied: 'Grade 6', parentEmail: 'parent.one@example.com', contactPhone: '0300-0000001', status: 'pending', submittedAt: minsAgo(60 * 3), hasPhoto: true, documentFilename: 'birth-certificate.pdf', entranceScore: 78 },
        { id: 102, applicantName: 'Applicant Two (sample)', gradeApplied: 'Grade 9', parentEmail: 'parent.two@example.com', contactPhone: '0300-0000002', status: 'pending', submittedAt: minsAgo(60 * 20), hasPhoto: false, documentFilename: null, entranceScore: null },
        { id: 103, applicantName: 'Applicant Three (sample)', gradeApplied: 'Grade 1', parentEmail: 'parent.three@example.com', contactPhone: '0300-0000003', status: 'pending', submittedAt: minsAgo(60 * 44), hasPhoto: true, documentFilename: 'school-leaving.pdf', entranceScore: 64 },
      ] },
      teacherApps: { applications: [
        { id: 201, applicantName: 'Teacher Applicant A (sample)', subjectApplied: 'Physics', email: 'applicant.a@example.com', phone: '0300-0000010', status: 'pending', submittedAt: minsAgo(60 * 6), documentFilename: 'cv.pdf', entranceScore: 82 },
        { id: 202, applicantName: 'Teacher Applicant B (sample)', subjectApplied: 'English', email: 'applicant.b@example.com', phone: '0300-0000011', status: 'pending', submittedAt: minsAgo(60 * 30), documentFilename: 'cv.pdf', entranceScore: null },
      ] },
      feeClaims: { invoices: [
        { id: 301, term: 'Term 2', amountDue: 18000, dueDate: '2026-11-16', paymentNote: 'Bank transfer, ref 0000 (sample)', claimedAt: minsAgo(60 * 2), studentName: 'Sample Child One', admissionNo: 'S-1001' },
        { id: 302, term: 'Term 2', amountDue: 15000, dueDate: '2026-11-16', paymentNote: null, claimedAt: minsAgo(60 * 9), studentName: 'Sample Child Three', admissionNo: 'S-1014' },
        { id: 303, term: 'Term 2', amountDue: 16500, dueDate: '2026-11-16', paymentNote: 'Paid at office counter (sample)', claimedAt: minsAgo(60 * 26), studentName: 'Sample Child Four', admissionNo: 'S-1022' },
      ] },
      staff: { staff: [
        { id: 401, firstName: 'Office', lastName: 'Assistant (sample)', email: 'office@example.com', status: 'invited', roleName: 'Accounts', invitedAt: minsAgo(60 * 50) },
        { id: 402, firstName: 'Front', lastName: 'Desk (sample)', email: 'desk@example.com', status: 'active', roleName: 'Reception', invitedAt: minsAgo(60 * 400) },
      ] },
      sections: { sections: [
        { sectionCode: '1-A', grade: 1, sectionName: 'A', studentCount: 38, capacity: 40, classTeacher: 'Teacher C. Sample' },
        { sectionCode: '4-B', grade: 4, sectionName: 'B', studentCount: 35, capacity: 40, classTeacher: 'Teacher D. Sample' },
        { sectionCode: '8-A', grade: 8, sectionName: 'A', studentCount: 37, capacity: 40, classTeacher: 'Teacher A. Sample' },
        { sectionCode: '9-B', grade: 9, sectionName: 'B', studentCount: 32, capacity: 40, classTeacher: 'Unassigned' },
        { sectionCode: '10-A', grade: 10, sectionName: 'A', studentCount: 30, capacity: 35, classTeacher: 'Teacher B. Sample' },
        { sectionCode: '12-A', grade: 12, sectionName: 'A', studentCount: 28, capacity: 35, classTeacher: 'Teacher E. Sample' },
      ] },
      exams: { exams: [
        { id: 1, title: 'Algebra quiz 3', subject: 'Mathematics', sectionCode: '8-A', durationMinutes: 30, isPublished: true, questionCount: 15, pendingGrading: 4 },
        { id: 2, title: 'Cell structure test', subject: 'Biology', sectionCode: '9-B', durationMinutes: 45, isPublished: true, questionCount: 20, pendingGrading: 0 },
        { id: 3, title: 'Essay writing', subject: 'English', sectionCode: '10-A', durationMinutes: 60, isPublished: false, questionCount: 3, pendingGrading: 0 },
      ] },
    },
    teacher: {
      user: { name: 'Sample Teacher', sub: 'Mathematics teacher' },
      dashboard: {
        teacher: { name: 'Sample Teacher', subject: 'Mathematics' }, day: dayName,
        todaysClasses: [
          { id: 1, start_time: '08:30:00', subject: 'Mathematics', section_code: '8-A', room: 'Online', meeting_link: null },
          { id: 2, start_time: '10:00:00', subject: 'Mathematics', section_code: '9-B', room: 'Online', meeting_link: null },
          { id: 3, start_time: '12:15:00', subject: 'Mathematics', section_code: '10-A', room: 'Online', meeting_link: null },
        ],
        gradingQueue: [
          { assignment_id: 1, title: 'Linear equations worksheet', section_code: '8-A', pending: 7 },
          { assignment_id: 2, title: 'Geometry proofs', section_code: '10-A', pending: 3 },
        ],
        roster: { section: '8-A', students: Array.from({ length: 24 }, (_, i) => ({ first_name: 'Student', last_name: String.fromCharCode(65 + i), admission_no: 'S-' + (1001 + i) })) },
        messages: [
          { from: 'Sample Parent (Parent)', body: 'Could you share this week’s homework?', sentAt: minsAgo(55) },
          { from: 'Sample Student (Student)', body: 'I submitted the worksheet.', sentAt: minsAgo(180) },
        ],
        mySections: ['8-A', '9-B', '10-A'],
      },
      exams: { exams: [
        { id: 1, title: 'Algebra quiz 3', subject: 'Mathematics', sectionCode: '8-A', isPublished: true, pendingGrading: 4 },
        { id: 2, title: 'Fractions check', subject: 'Mathematics', sectionCode: '9-B', isPublished: false, pendingGrading: 0 },
      ] },
      live: { activeSections: [] },
    },
    student: {
      user: { name: 'Sample Student', sub: 'Grade 8 · Section 8-A' },
      dashboard: {
        student: { name: 'Sample Student', section: '8-A' }, day: dayName,
        timetable: [
          { start_time: '08:30:00', subject: 'Mathematics', room: 'Online', meeting_link: null },
          { start_time: '09:30:00', subject: 'English', room: 'Online', meeting_link: null },
          { start_time: '11:00:00', subject: 'Science', room: 'Online', meeting_link: null },
          { start_time: '12:15:00', subject: 'Urdu', room: 'Online', meeting_link: null },
        ],
        attendancePct: 94,
        homeworkDue: [
          { id: 1, title: 'Linear equations worksheet', subject: 'Mathematics', due_date: daysAhead(1) },
          { id: 2, title: 'Book review: chapter 4', subject: 'English', due_date: daysAhead(3) },
        ],
        recentGrades: [
          { subject: 'Mathematics', assessment: 'Quiz 2', score: 86 },
          { subject: 'Science', assessment: 'Lab report', score: 92 },
          { subject: 'English', assessment: 'Essay', score: 74 },
          { subject: 'Urdu', assessment: 'Test 1', score: 81 },
        ],
        announcements: [
          { title: 'Science week: Virtual Lab challenge', body: 'Sample announcement text.', created_at: minsAgo(60 * 54) },
        ],
      },
      courses: { courses: [
        { id: 1, subject: 'Mathematics', title: 'Grade 8 Mathematics', lessonCount: 24, completedCount: 15 },
        { id: 2, subject: 'Science', title: 'Grade 8 General Science', lessonCount: 20, completedCount: 8 },
        { id: 3, subject: 'English', title: 'Grade 8 English', lessonCount: 18, completedCount: 12 },
      ] },
      materials: { grade: 8, materials: [
        { id: 1, subject: 'Mathematics', title: 'Linear equations — worked examples', materialType: 'document', createdAt: minsAgo(60 * 20), uploadedBy: 'Teacher A. Sample' },
        { id: 2, subject: 'Science', title: 'Plant cell diagram', materialType: 'image', createdAt: minsAgo(60 * 50), uploadedBy: 'Teacher F. Sample' },
        { id: 3, subject: 'English', title: 'Reading: chapter 4 audio', materialType: 'video', createdAt: minsAgo(60 * 70), uploadedBy: 'Teacher G. Sample' },
      ] },
      lab: { experiments: [
        { id: 1, title: 'Simple pendulum', subject: 'Physics', topic: 'Oscillations', estimatedMinutes: 15, bestScore: 80, attemptCount: 2 },
        { id: 2, title: 'Acid–base titration', subject: 'Chemistry', topic: 'Neutralisation', estimatedMinutes: 20, bestScore: null, attemptCount: 0 },
        { id: 3, title: 'Ohm\u2019s law circuit', subject: 'Physics', topic: 'Electricity', estimatedMinutes: 15, bestScore: null, attemptCount: 0 },
      ] },
      exams: { exams: [
        { id: 1, title: 'Algebra quiz 3', subject: 'Mathematics', durationMinutes: 30, maxMarks: 30, status: 'not_started', totalScore: null },
        { id: 2, title: 'Cell structure test', subject: 'Science', durationMinutes: 45, maxMarks: 40, status: 'graded', totalScore: 34 },
        { id: 3, title: 'Vocabulary check', subject: 'English', durationMinutes: 20, maxMarks: 20, status: 'not_started', totalScore: null },
      ] },
    },
    parent: {
      user: { name: 'Sample Parent', sub: 'Parent' },
      children: { parent: { name: 'Sample Parent' }, children: [
        { id: 1, first_name: 'Sample', last_name: 'Child One', grade: 'Grade 8', section_name: 'A', section_code: '8-A' },
        { id: 2, first_name: 'Sample', last_name: 'Child Two', grade: 'Grade 4', section_name: 'B', section_code: '4-B' },
      ] },
      dashboards: {
        1: { attendanceTrend: [{ week: 'W1', pct: 100 }, { week: 'W2', pct: 80 }, { week: 'W3', pct: 100 }, { week: 'W4', pct: 100 }, { week: 'W5', pct: 90 }, { week: 'W6', pct: 100 }],
             grades: [{ subject: 'Mathematics', assessment: 'Quiz 2', score: 86 }, { subject: 'Science', assessment: 'Lab report', score: 92 }, { subject: 'English', assessment: 'Essay', score: 74 }],
             invoice: { id: 11, term: 'Term 2', amount_due: 18000, amount_paid: 9000, due_date: daysAhead(9), status: 'pending' } },
        2: { attendanceTrend: [{ week: 'W1', pct: 100 }, { week: 'W2', pct: 100 }, { week: 'W3', pct: 90 }, { week: 'W4', pct: 100 }],
             grades: [{ subject: 'Mathematics', assessment: 'Test 1', score: 90 }, { subject: 'English', assessment: 'Spelling', score: 88 }],
             invoice: { id: 12, term: 'Term 2', amount_due: 15000, amount_paid: 15000, due_date: daysAhead(9), status: 'paid' } },
      },
      fees: { totalDue: 9000, nearestDueDate: daysAhead(9), invoices: [] },
      announcements: { announcements: [
        { title: 'Parent–teacher meeting on Saturday', body: 'Sample announcement text.', created_at: minsAgo(60 * 30) },
        { title: 'Mid-term exam timetable published', body: 'Sample announcement text.', created_at: minsAgo(60 * 5) },
      ] },
    },
  };
})();
