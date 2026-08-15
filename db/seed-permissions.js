// Seeds the permission catalog and default management-team roles.
// Fully idempotent (ON CONFLICT DO NOTHING) — safe to run on every server
// start, including against an already-populated live database. Never
// touches students/teachers/courses or any existing data.

const { pool } = require('./index');

const PERMISSIONS = [
  ['students.view', 'Students', 'View student records'],
  ['students.create', 'Students', 'Create student records'],
  ['students.edit', 'Students', 'Edit student records'],
  ['students.archive', 'Students', 'Archive/deactivate students'],

  ['teachers.view', 'Teachers', 'View teacher records'],
  ['teachers.create', 'Teachers', 'Create teacher records'],
  ['teachers.edit', 'Teachers', 'Edit teacher records'],
  ['teachers.archive', 'Teachers', 'Archive/deactivate teachers'],

  ['courses.view', 'Courses', 'View courses'],
  ['courses.create', 'Courses', 'Create courses'],
  ['courses.edit', 'Courses', 'Edit courses'],
  ['courses.publish', 'Courses', 'Publish courses'],

  ['lessons.view', 'Lessons', 'View lessons'],
  ['lessons.create', 'Lessons', 'Create lessons'],
  ['lessons.edit', 'Lessons', 'Edit lessons'],
  ['lessons.publish', 'Lessons', 'Publish lessons'],

  ['assignments.view', 'Assignments', 'View assignments'],
  ['assignments.create', 'Assignments', 'Create assignments'],
  ['assignments.edit', 'Assignments', 'Edit assignments'],
  ['assignments.grade', 'Assignments', 'Grade assignments'],

  ['results.view', 'Results', 'View results'],
  ['results.enter', 'Results', 'Enter results'],
  ['results.edit', 'Results', 'Edit results'],
  ['results.publish', 'Results', 'Publish results'],

  ['reports.view', 'Reports', 'View reports'],
  ['reports.export', 'Reports', 'Export reports'],

  ['staff.view', 'Staff', 'View management-team staff'],
  ['staff.invite', 'Staff', 'Invite management-team staff'],
  ['staff.edit', 'Staff', 'Edit staff roles/assignments'],
  ['staff.suspend', 'Staff', 'Suspend/reactivate staff'],

  ['settings.view', 'Settings', 'View system settings'],
  ['settings.edit', 'Settings', 'Edit system settings']
];

// [role_key, display name, [permission keys]]
const DEFAULT_ROLES = [
  ['academic_manager', 'Academic Manager', [
    'students.view', 'teachers.view',
    'courses.view', 'courses.create', 'courses.edit', 'courses.publish',
    'lessons.view', 'lessons.create', 'lessons.edit', 'lessons.publish',
    'results.view', 'reports.view'
  ]],
  ['student_manager', 'Student Manager', [
    'students.view', 'students.create', 'students.edit', 'students.archive'
  ]],
  ['teacher_manager', 'Teacher Manager', [
    'teachers.view', 'teachers.create', 'teachers.edit'
  ]],
  ['course_manager', 'Course Manager', [
    'courses.view', 'courses.create', 'courses.edit', 'courses.publish'
  ]],
  ['content_manager', 'Content Manager', [
    'courses.edit', 'lessons.view', 'lessons.create', 'lessons.edit', 'lessons.publish'
  ]],
  ['exam_manager', 'Exam Manager', [
    'assignments.view', 'assignments.create', 'assignments.edit', 'assignments.grade',
    'results.view', 'results.enter', 'results.edit', 'results.publish'
  ]],
  ['admissions_manager', 'Admissions Manager', [
    'students.view', 'students.create', 'reports.view'
  ]],
  ['support_manager', 'Support Manager', [
    'students.view', 'teachers.view', 'reports.view'
  ]],
  ['data_entry_staff', 'Data Entry Staff', [
    'students.create', 'students.edit', 'results.enter'
  ]],
  ['moderator', 'Moderator', [
    'courses.view', 'lessons.view', 'reports.view'
  ]]
];

async function seedPermissions() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const [key, category, label] of PERMISSIONS) {
      await client.query(
        'INSERT INTO permissions (permission_key, category, label) VALUES ($1,$2,$3) ON CONFLICT (permission_key) DO NOTHING',
        [key, category, label]
      );
    }

    for (const [roleKey, name, permKeys] of DEFAULT_ROLES) {
      const { rows } = await client.query(
        'INSERT INTO staff_roles (role_key, name, is_system) VALUES ($1,$2,TRUE) ON CONFLICT (role_key) DO NOTHING RETURNING id',
        [roleKey, name]
      );
      let roleId = rows[0] && rows[0].id;
      if (!roleId) {
        const existing = await client.query('SELECT id FROM staff_roles WHERE role_key = $1', [roleKey]);
        roleId = existing.rows[0].id;
      }
      for (const permKey of permKeys) {
        await client.query(
          'INSERT INTO staff_role_permissions (staff_role_id, permission_key) VALUES ($1,$2) ON CONFLICT DO NOTHING',
          [roleId, permKey]
        );
      }
    }

    // Starter curriculum catalog — additive reference data only.
    const curricula = ['Pakistani SNC', 'British Curriculum', 'Cambridge O Level', 'Cambridge A Level'];
    for (const name of curricula) {
      await client.query('INSERT INTO curriculums (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [name]);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { seedPermissions };
