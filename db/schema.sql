-- Nova School Platform — PostgreSQL schema
-- (Written to run on any Postgres, incl. Neon's free tier.)

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('student','parent','teacher','admin')),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admins (
  id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE REFERENCES users(id),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  title TEXT DEFAULT 'Administrator'
);

CREATE TABLE IF NOT EXISTS teachers (
  id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE REFERENCES users(id),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  subject TEXT
);

CREATE TABLE IF NOT EXISTS sections (
  id SERIAL PRIMARY KEY,
  section_code TEXT UNIQUE NOT NULL,      -- e.g. '8B'
  grade TEXT NOT NULL,                    -- e.g. 'Grade 8'
  name TEXT NOT NULL,                     -- e.g. 'B'
  capacity INTEGER DEFAULT 30,
  class_teacher_id INTEGER REFERENCES teachers(id)
);

CREATE TABLE IF NOT EXISTS students (
  id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE REFERENCES users(id),   -- NULL for roster-only demo students with no login
  admission_no TEXT UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  section_code TEXT REFERENCES sections(section_code)
);

CREATE TABLE IF NOT EXISTS parents (
  id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE REFERENCES users(id),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS student_parent_map (
  id SERIAL PRIMARY KEY,
  student_id INTEGER REFERENCES students(id),
  parent_id INTEGER REFERENCES parents(id)
);

CREATE TABLE IF NOT EXISTS timetable (
  id SERIAL PRIMARY KEY,
  section_code TEXT REFERENCES sections(section_code),
  day_of_week TEXT NOT NULL,              -- 'Monday' .. 'Friday'
  start_time TEXT NOT NULL,               -- '09:00'
  subject TEXT NOT NULL,
  room TEXT,
  teacher_id INTEGER REFERENCES teachers(id)
);

-- Idempotent: adds the column on a database that already has this table
-- from before this feature existed, without touching existing rows.
ALTER TABLE timetable ADD COLUMN IF NOT EXISTS meeting_link TEXT;

CREATE TABLE IF NOT EXISTS lessons (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  subject TEXT NOT NULL,
  section_code TEXT REFERENCES sections(section_code),
  teacher_id INTEGER REFERENCES teachers(id),
  video_url TEXT NOT NULL,          -- YouTube/Vimeo link (or any video URL)
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
-- When set, this recording stands in for a specific missed class date —
-- confirming you watched it can update that day's attendance.
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS lecture_date DATE;

CREATE TABLE IF NOT EXISTS lesson_watch_confirmations (
  id SERIAL PRIMARY KEY,
  student_id INTEGER REFERENCES students(id),
  lesson_id INTEGER REFERENCES lessons(id),
  confirmed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(student_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS attendance (
  id SERIAL PRIMARY KEY,
  student_id INTEGER REFERENCES students(id),
  date DATE NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('present','absent','late','excused'))
);

CREATE TABLE IF NOT EXISTS assignments (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  subject TEXT NOT NULL,
  section_code TEXT REFERENCES sections(section_code),
  teacher_id INTEGER REFERENCES teachers(id),
  due_date DATE,
  max_marks INTEGER DEFAULT 100
);

CREATE TABLE IF NOT EXISTS submissions (
  id SERIAL PRIMARY KEY,
  assignment_id INTEGER REFERENCES assignments(id),
  student_id INTEGER REFERENCES students(id),
  submitted_at TIMESTAMPTZ,
  marks INTEGER,
  status TEXT DEFAULT 'submitted' CHECK(status IN ('submitted','graded'))
);

CREATE TABLE IF NOT EXISTS grades (
  id SERIAL PRIMARY KEY,
  student_id INTEGER REFERENCES students(id),
  subject TEXT NOT NULL,
  assessment TEXT NOT NULL,
  score TEXT NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS invoices (
  id SERIAL PRIMARY KEY,
  student_id INTEGER REFERENCES students(id),
  term TEXT NOT NULL,
  amount_due NUMERIC NOT NULL,
  amount_paid NUMERIC DEFAULT 0,
  due_date DATE,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','paid','overdue'))
);

CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  sender_id INTEGER REFERENCES users(id),
  recipient_id INTEGER REFERENCES users(id),
  body TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS announcements (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT,
  audience TEXT DEFAULT 'all',           -- all | students | parents | teachers
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admission_applications (
  id SERIAL PRIMARY KEY,
  applicant_name TEXT NOT NULL,
  grade_applied TEXT NOT NULL,
  parent_email TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','declined')),
  submitted_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
-- Live class chat lock: while a teacher has an active session for a section,
-- students in that section can't send messages to that teacher until it ends.
-- Subject-wise study materials library, shared by grade (all sections within
-- a grade see the same library). Documents/images stored inline as base64
-- (fine at small-school scale; move to real object storage like S3/GCS if
-- this grows large) — videos use an external link (YouTube/Vimeo) instead,
-- since video files are too large to store this way.
CREATE TABLE IF NOT EXISTS study_materials (
  id SERIAL PRIMARY KEY,
  subject TEXT NOT NULL,
  grade TEXT NOT NULL,               -- e.g. 'Grade 8' — matches sections.grade
  title TEXT NOT NULL,
  description TEXT,
  material_type TEXT NOT NULL CHECK(material_type IN ('document','image','video')),
  file_base64 TEXT,
  file_name TEXT,
  file_mime TEXT,
  video_url TEXT,
  teacher_id INTEGER REFERENCES teachers(id),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS class_sessions (
  id SERIAL PRIMARY KEY,
  teacher_id INTEGER REFERENCES teachers(id),
  section_code TEXT REFERENCES sections(section_code),
  is_locked BOOLEAN NOT NULL DEFAULT TRUE,
  started_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMPTZ
);
-- Idempotent additions for photo/document/entrance-test support on a database
-- that already has this table from before these features existed.
ALTER TABLE admission_applications ADD COLUMN IF NOT EXISTS photo_base64 TEXT;
ALTER TABLE admission_applications ADD COLUMN IF NOT EXISTS document_base64 TEXT;
ALTER TABLE admission_applications ADD COLUMN IF NOT EXISTS document_filename TEXT;
ALTER TABLE admission_applications ADD COLUMN IF NOT EXISTS entrance_score TEXT;
ALTER TABLE admission_applications ADD COLUMN IF NOT EXISTS curriculum TEXT;
ALTER TABLE admission_applications ADD COLUMN IF NOT EXISTS monthly_fee NUMERIC;
ALTER TABLE admission_applications ADD COLUMN IF NOT EXISTS fee_currency TEXT;
ALTER TABLE admission_applications ADD COLUMN IF NOT EXISTS contact_phone TEXT;
ALTER TABLE admission_applications ADD COLUMN IF NOT EXISTS guardian_id TEXT;

ALTER TABLE teacher_applications ADD COLUMN IF NOT EXISTS co_curricular TEXT;

ALTER TABLE sections ADD COLUMN IF NOT EXISTS curriculum TEXT DEFAULT 'Pakistani';

-- Single-row settings table. Tracks whether Nova School has become an
-- examination-authority in its own right (registered with a board), which
-- changes how higher-grade report cards are labeled/handled.
CREATE TABLE IF NOT EXISTS school_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  exam_authority_status TEXT NOT NULL DEFAULT 'not_registered' CHECK(exam_authority_status IN ('not_registered','pending','registered')),
  exam_authority_name TEXT,
  CONSTRAINT single_row CHECK (id = 1)
);
INSERT INTO school_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Teacher recruitment applications (same idea as admissions, for job candidates).
CREATE TABLE IF NOT EXISTS teacher_applications (
  id SERIAL PRIMARY KEY,
  applicant_name TEXT NOT NULL,
  subject_applied TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  photo_base64 TEXT,
  document_base64 TEXT,
  document_filename TEXT,
  entrance_score TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','declined')),
  submitted_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Simple entrance/screening test question banks — one set for prospective
-- students, one for prospective teachers. Auto-graded MCQ only, deliberately
-- simpler than the full internal Tests & Quizzes engine since these are
-- one-shot and taken by people with no account yet.
CREATE TABLE IF NOT EXISTS entrance_test_questions (
  id SERIAL PRIMARY KEY,
  test_type TEXT NOT NULL CHECK(test_type IN ('student_admission','teacher_recruitment')),
  question_text TEXT NOT NULL,
  options JSONB NOT NULL,
  correct_answer TEXT NOT NULL,
  position INTEGER DEFAULT 0
);

-- Tests & quizzes: MCQ (auto-graded) and descriptive (manually graded) questions.
CREATE TABLE IF NOT EXISTS exams (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  subject TEXT NOT NULL,
  section_code TEXT REFERENCES sections(section_code),
  teacher_id INTEGER REFERENCES teachers(id),
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  is_published BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS exam_questions (
  id SERIAL PRIMARY KEY,
  exam_id INTEGER REFERENCES exams(id),
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL CHECK(question_type IN ('mcq','descriptive')),
  options JSONB,               -- array of option strings; MCQ only
  correct_answer TEXT,         -- MCQ only, matched against the chosen option
  marks INTEGER NOT NULL DEFAULT 1,
  position INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS exam_attempts (
  id SERIAL PRIMARY KEY,
  exam_id INTEGER REFERENCES exams(id),
  student_id INTEGER REFERENCES students(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress','submitted','graded')),
  auto_score NUMERIC DEFAULT 0,
  total_score NUMERIC,
  UNIQUE(exam_id, student_id)
);

CREATE TABLE IF NOT EXISTS exam_answers (
  id SERIAL PRIMARY KEY,
  attempt_id INTEGER REFERENCES exam_attempts(id),
  question_id INTEGER REFERENCES exam_questions(id),
  student_answer TEXT,
  is_correct BOOLEAN,
  marks_awarded NUMERIC,
  UNIQUE(attempt_id, question_id)
);

-- Self-paced Courses: a subject/curriculum/level catalog students can browse on
-- their own, separate from a specific class section's homework/tests. Teachers
-- populate the actual content (real curriculum material is their responsibility,
-- not generated here).
CREATE TABLE IF NOT EXISTS courses (
  id SERIAL PRIMARY KEY,
  subject TEXT NOT NULL,               -- e.g. 'Physics', 'Chinese', 'Mathematics'
  curriculum TEXT NOT NULL,            -- e.g. 'Pakistani SNC', 'Cambridge O Level', 'Cambridge A Level'
  level TEXT NOT NULL,                 -- e.g. 'Grade 5', 'O Level', 'AS Level', 'A Level'
  title TEXT NOT NULL,
  description TEXT,
  owner_teacher_id INTEGER REFERENCES teachers(id),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS course_topics (
  id SERIAL PRIMARY KEY,
  course_id INTEGER REFERENCES courses(id),
  title TEXT NOT NULL,
  position INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS course_lessons (
  id SERIAL PRIMARY KEY,
  topic_id INTEGER REFERENCES course_topics(id),
  title TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'video' CHECK(content_type IN ('video','text')),
  video_url TEXT,
  body_text TEXT,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS course_progress (
  id SERIAL PRIMARY KEY,
  student_id INTEGER REFERENCES students(id),
  lesson_id INTEGER REFERENCES course_lessons(id),
  completed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(student_id, lesson_id)
);

-- ============================================================
-- MANAGEMENT TEAM, ROLES & PERMISSIONS (Super Admin -> Management Team)
-- Additive only — existing 'admin' role/table is untouched and keeps
-- full unrestricted access. This introduces a separate 'staff' user
-- role for scoped management-team members.
-- ============================================================

-- Allow 'staff' as a user role alongside the existing four, without
-- touching any existing rows. Looks up whatever the role CHECK
-- constraint is actually named (rather than assuming the default
-- Postgres-generated name) so this works regardless of how it was
-- originally created.
DO $$
DECLARE
  con_name TEXT;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'users'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%role%';
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', con_name);
  END IF;
END $$;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('student','parent','teacher','admin','staff'));

-- Full permission catalog. Keys match the ones in the product spec
-- (e.g. 'students.view', 'courses.publish'). Enforced server-side in
-- middleware/permissions.js — never trust a hidden frontend button alone.
CREATE TABLE IF NOT EXISTS permissions (
  permission_key TEXT PRIMARY KEY,
  category TEXT NOT NULL,   -- e.g. 'Students', 'Courses', 'Results'
  label TEXT NOT NULL       -- human-readable, e.g. 'Edit student records'
);

-- Configurable management-team roles. 'is_system' roles ship with the
-- product (Academic Manager, etc.) and can't be deleted, only have
-- their permissions adjusted. Admins can also create fully custom roles.
CREATE TABLE IF NOT EXISTS staff_roles (
  id SERIAL PRIMARY KEY,
  role_key TEXT UNIQUE NOT NULL,   -- slug, e.g. 'academic_manager'
  name TEXT NOT NULL,              -- display name, e.g. 'Academic Manager'
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS staff_role_permissions (
  staff_role_id INTEGER REFERENCES staff_roles(id) ON DELETE CASCADE,
  permission_key TEXT REFERENCES permissions(permission_key) ON DELETE CASCADE,
  PRIMARY KEY (staff_role_id, permission_key)
);

-- One row per management-team member. Deactivate/suspend rather than
-- delete, per the "no destructive deletion" rule — history is kept.
CREATE TABLE IF NOT EXISTS staff (
  id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE REFERENCES users(id),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  staff_role_id INTEGER REFERENCES staff_roles(id),
  status TEXT NOT NULL DEFAULT 'invited' CHECK(status IN ('invited','active','suspended','removed')),
  invited_by INTEGER REFERENCES users(id),
  activation_token TEXT,
  activation_expires TIMESTAMPTZ,
  invited_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  activated_at TIMESTAMPTZ
);

-- Append-only audit trail. Never exposes credentials — 'details' should
-- only ever hold non-sensitive context (e.g. { "changedFields": [...] }).
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  actor_user_id INTEGER REFERENCES users(id),
  actor_role TEXT,
  action TEXT NOT NULL,          -- e.g. 'staff.invited', 'result.published'
  target_type TEXT,              -- e.g. 'student', 'course'
  target_id TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- ACADEMIC ARCHITECTURE — curriculum/board/level catalog
-- Additive reference tables only. courses.curriculum / courses.level
-- and sections.curriculum remain free-text and untouched, so nothing
-- existing breaks. These catalogs let Academic Management curate the
-- dropdown options instead of admins typing free text — course/section
-- forms can be wired to read from these in a later (frontend) pass.
-- ============================================================

CREATE TABLE IF NOT EXISTS curriculums (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL       -- e.g. 'Pakistani SNC', 'Cambridge O Level'
);

CREATE TABLE IF NOT EXISTS boards (
  id SERIAL PRIMARY KEY,
  curriculum_id INTEGER REFERENCES curriculums(id),
  name TEXT NOT NULL,             -- e.g. 'Federal Board', 'Cambridge CAIE'
  UNIQUE(curriculum_id, name)
);

CREATE TABLE IF NOT EXISTS academic_levels (
  id SERIAL PRIMARY KEY,
  curriculum_id INTEGER REFERENCES curriculums(id),
  name TEXT NOT NULL,             -- e.g. 'Matric / SSC', 'A Level'
  position INTEGER DEFAULT 0,
  UNIQUE(curriculum_id, name)
);

-- ============================================================
-- Assignment detail & real submissions (instructions, attachments,
-- teacher feedback). Additive only — existing columns/behavior untouched.
-- ============================================================
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS body_text TEXT;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS file_base64 TEXT;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS file_name TEXT;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS file_mime TEXT;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS feedback TEXT;

-- ============================================================
-- Virtual classroom whiteboard. Attaches to the existing
-- class_sessions table (already the "live session" concept —
-- teacher_id/section_code/started_at/ended_at). Persistence is
-- PNG snapshots per page, not per-stroke rows: live strokes travel
-- over WebSocket only and are never written to the database — only
-- a periodic/debounced full-page snapshot is saved, keeping DB load
-- light regardless of how much a teacher draws.
-- ============================================================
CREATE TABLE IF NOT EXISTS whiteboards (
  id SERIAL PRIMARY KEY,
  class_session_id INTEGER REFERENCES class_sessions(id),
  teacher_id INTEGER REFERENCES teachers(id),
  section_code TEXT REFERENCES sections(section_code),
  subject TEXT,
  status TEXT NOT NULL DEFAULT 'live' CHECK(status IN ('live','saved','archived')),
  allow_student_draw BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS whiteboard_pages (
  id SERIAL PRIMARY KEY,
  whiteboard_id INTEGER REFERENCES whiteboards(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  snapshot TEXT,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Tracks which page the class was last on, so a refresh/reconnect resumes
-- exactly where the teacher left off instead of defaulting back to page 1.
ALTER TABLE whiteboards ADD COLUMN IF NOT EXISTS current_page_id INTEGER REFERENCES whiteboard_pages(id);

-- ============================================================
-- Honest fee "payment": parents can't self-mark an invoice paid with
-- no money actually moving. They submit a payment claim (optionally
-- with a note, e.g. a bank transfer reference); only an admin
-- confirming it actually flips the invoice to 'paid'. No payment
-- gateway is wired up — this matches how many schools already
-- collect fees (bank transfer / cash), reconciled by the office.
-- ============================================================
DO $$
DECLARE
  con_name TEXT;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'invoices'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status%';
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE invoices DROP CONSTRAINT %I', con_name);
  END IF;
END $$;
ALTER TABLE invoices ADD CONSTRAINT invoices_status_check CHECK (status IN ('pending','pending_confirmation','paid','overdue'));

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_note TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_claimed_at TIMESTAMPTZ;

-- Teacher assignment attachments (Phase 2B: Assignments UI)
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS attachment_base64 TEXT;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS attachment_name TEXT;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS attachment_mime TEXT;

-- Staff profile fields (Phase 2C: Staff Profile page)
ALTER TABLE staff ADD COLUMN IF NOT EXISTS employee_id TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;

-- Real course publish/draft state (previously publish-check only logged an
-- audit entry with no actual effect — the public catalog showed every
-- course regardless of review status). Existing courses were already live
-- on the public site before this feature existed, so they're backfilled to
-- 'published' rather than silently disappearing; only courses created from
-- here on default to 'draft' and need an explicit publish step.
ALTER TABLE courses ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'published' CHECK (status IN ('draft','published'));
ALTER TABLE courses ALTER COLUMN status SET NOT NULL;
ALTER TABLE courses ALTER COLUMN status SET DEFAULT 'draft';
ALTER TABLE courses ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
UPDATE courses SET published_at = COALESCE(published_at, created_at) WHERE status = 'published' AND published_at IS NULL;

-- Staff notifications (real events only — new admission/teacher applications
-- so far; extend the trigger points below as more real events warrant it).
CREATE TABLE IF NOT EXISTS staff_notifications (
  id SERIAL PRIMARY KEY,
  staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  target_page TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Lightweight staff task tracker. `related_label` is a free-text pointer
-- (e.g. "Student: Aiden Silva") rather than a typed FK to
-- students/teachers/courses — kept simple deliberately per the original
-- spec's own "avoid unnecessary complexity" note; it's real data the
-- assigner types, not a fabricated field.
CREATE TABLE IF NOT EXISTS staff_tasks (
  id SERIAL PRIMARY KEY,
  assigned_to_staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  assigned_by_user_id INTEGER REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','needs_review')),
  due_date DATE,
  related_label TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS staff_task_comments (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES staff_tasks(id) ON DELETE CASCADE,
  author_user_id INTEGER REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Support ticketing. Any authenticated role can raise a ticket via the API,
-- though only the staff dashboard has a UI for it so far — student/parent/
-- teacher-facing ticket UIs are a separate, not-yet-built increment.
CREATE TABLE IF NOT EXISTS support_tickets (
  id SERIAL PRIMARY KEY,
  raised_by_user_id INTEGER NOT NULL REFERENCES users(id),
  raised_by_role TEXT NOT NULL,
  subject TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('student','teacher','technical','general')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
  assigned_to_staff_id INTEGER REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS support_ticket_replies (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_user_id INTEGER REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Suspend/activate for students, teachers, parents (Super Admin dashboard).
-- created_at is left NULL for pre-existing rows rather than backfilled to
-- "now" — their true enrollment date was never recorded, and faking a
-- recent timestamp would make every existing student look "new this month."
-- Only rows created from here on get a real value.
ALTER TABLE students ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended'));
ALTER TABLE students ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
ALTER TABLE students ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended'));
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
ALTER TABLE teachers ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE parents ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended'));

-- Organization management: Academic Years, Terms, Campuses. Deliberately
-- NOT linked into students/sections/courses yet — the school is single-
-- campus and single-year today, and forcing that link now would be a much
-- larger, riskier schema change across many tables. This is the foundation
-- only, per the spec's own "prepare architecture safely, don't overbuild."
CREATE TABLE IF NOT EXISTS academic_years (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  is_current BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS terms (
  id SERIAL PRIMARY KEY,
  academic_year_id INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date DATE,
  end_date DATE
);

CREATE TABLE IF NOT EXISTS campuses (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT
);

-- Widen course status from draft/published to the full 4-state workflow
-- the spec asks for. Existing rows keep whatever status they already have
-- (draft or published) — nothing changes for them, the constraint just
-- now also allows the two new values going forward.
DO $$
DECLARE
  con_name TEXT;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'courses'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status%';
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE courses DROP CONSTRAINT %I', con_name);
  END IF;
END $$;
ALTER TABLE courses ADD CONSTRAINT courses_status_check CHECK (status IN ('draft','under_review','published','archived'));

-- Exam scheduling (was previously just duration_minutes, no actual date/time)
ALTER TABLE exams ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

-- Grade configuration (letter-grade bands, e.g. A+ = 90-100%). Kept as a
-- standalone reference table for now — wiring it into every existing
-- report/gradebook display is a larger follow-on, not done here.
CREATE TABLE IF NOT EXISTS grade_bands (
  id SERIAL PRIMARY KEY,
  label TEXT NOT NULL,
  min_pct NUMERIC NOT NULL,
  max_pct NUMERIC NOT NULL
);

-- Security Center foundation. The app uses stateless JWTs with no session
-- table, so there was previously no way to actually end a user's session —
-- token_version makes that real: bumping it invalidates every token already
-- issued to that user, without needing to track individual sessions/devices.
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS failed_login_attempts (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  attempted_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Real, editable school settings for the Settings reorganization. Logo/
-- color branding is intentionally NOT made dynamic here — the site's visual
-- identity is baked into the HTML/CSS, and rebuilding that as a live-
-- configurable theming system is a much larger change than this warrants.
ALTER TABLE school_settings ADD COLUMN IF NOT EXISTS school_name TEXT;
ALTER TABLE school_settings ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE school_settings ADD COLUMN IF NOT EXISTS contact_phone TEXT;
ALTER TABLE school_settings ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE school_settings ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'Asia/Karachi';

-- Admin Notification Center. Kept as its own table rather than merging into
-- staff_notifications (which is keyed to a specific staff_id) — this app
-- can have multiple Super Admin accounts, and there's no per-admin
-- read-tracking need here, so notifications broadcast to all admins and a
-- single read_at covers everyone (whichever admin sees it first).
CREATE TABLE IF NOT EXISTS admin_notifications (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','important','critical')),
  target_page TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Admin-facing notifications. Kept as its own table rather than reusing
-- staff_notifications: admin has no per-role permission targeting to route
-- against, so these are simply "visible to any admin," with read_at shared
-- across admins rather than tracked per-account — a deliberate
-- simplification given this app typically has very few admin accounts.
CREATE TABLE IF NOT EXISTS admin_notifications (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','important','critical')),
  target_page TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
