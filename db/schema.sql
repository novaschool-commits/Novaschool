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
-- Idempotent additions for photo/document/entrance-test support on a database
-- that already has this table from before these features existed.
ALTER TABLE admission_applications ADD COLUMN IF NOT EXISTS photo_base64 TEXT;
ALTER TABLE admission_applications ADD COLUMN IF NOT EXISTS document_base64 TEXT;
ALTER TABLE admission_applications ADD COLUMN IF NOT EXISTS document_filename TEXT;
ALTER TABLE admission_applications ADD COLUMN IF NOT EXISTS entrance_score TEXT;
ALTER TABLE admission_applications ADD COLUMN IF NOT EXISTS curriculum TEXT;
ALTER TABLE admission_applications ADD COLUMN IF NOT EXISTS monthly_fee NUMERIC;
ALTER TABLE admission_applications ADD COLUMN IF NOT EXISTS fee_currency TEXT;

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
