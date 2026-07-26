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
