-- 0003 · Foundations for Curriculum OS, Language OS, Virtual Lab OS,
-- Assessment OS and Content & Rights OS. Additive only; no existing table or
-- route changes behaviour. Content is NOT included: these are empty
-- structures plus reference rows (languages, lab engines, the planned
-- experiment catalog).
-- Rollback: db/migrations/rollback/0003_foundation_modules.down.sql

-- ---------- Content & Rights OS ----------------------------------------
-- Every external source consulted while writing curriculum or content is
-- recorded with its licence and what it may be used for. NovaSchool content
-- is original; sources inform facts, never copied wording (see
-- docs/CURRICULUM-AND-IP-POLICY.md).
CREATE TABLE IF NOT EXISTS content_sources (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  publisher TEXT,
  url TEXT,
  accessed_on DATE NOT NULL,
  licence TEXT NOT NULL,                 -- e.g. 'All rights reserved', 'CC BY 4.0', 'Public domain'
  permitted_use TEXT NOT NULL CHECK (permitted_use IN ('facts_only','quote_with_attribution','adapt_with_attribution','reuse','none')),
  attribution_text TEXT,
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','approved','rejected')),
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS content_provenance (
  id SERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,             -- e.g. 'learning_outcome', 'question_bank_item', 'lab_experiment'
  entity_id INTEGER NOT NULL,
  source_id INTEGER NOT NULL REFERENCES content_sources(id),
  relation TEXT NOT NULL CHECK (relation IN ('informed_by','cites','adapted_from','reused')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (entity_type, entity_id, source_id, relation)
);

-- ---------- Language OS -------------------------------------------------
CREATE TABLE IF NOT EXISTS locales (
  code TEXT PRIMARY KEY,                 -- BCP 47, e.g. 'en', 'ur', 'ar', 'zh-Hans'
  english_name TEXT NOT NULL,
  native_name TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('ltr','rtl')),
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('available','planned')),
  fallback_code TEXT REFERENCES locales(code)
);

INSERT INTO locales (code, english_name, native_name, direction, status, fallback_code) VALUES
  ('en', 'English', 'English', 'ltr', 'available', NULL),
  ('ur', 'Urdu', 'اردو', 'rtl', 'planned', 'en'),
  ('ar', 'Arabic', 'العربية', 'rtl', 'planned', 'en'),
  ('zh-Hans', 'Chinese (Simplified)', '简体中文', 'ltr', 'planned', 'en'),
  ('ko', 'Korean', '한국어', 'ltr', 'planned', 'en'),
  ('fr', 'French', 'Français', 'ltr', 'planned', 'en'),
  ('de', 'German', 'Deutsch', 'ltr', 'planned', 'en'),
  ('pa', 'Punjabi (Shahmukhi)', 'پنجابی', 'rtl', 'planned', 'ur'),
  ('sd', 'Sindhi', 'سنڌي', 'rtl', 'planned', 'ur'),
  ('ps', 'Pashto', 'پښتو', 'rtl', 'planned', 'ur'),
  ('bal', 'Balochi', 'بلوچی', 'rtl', 'planned', 'ur')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS translation_keys (
  key TEXT PRIMARY KEY CHECK (key ~ '^[a-z0-9_]+(\.[a-z0-9_]+)+$'),
  domain TEXT NOT NULL,                  -- 'ui', 'curriculum', 'lab', 'assessment'
  context_note TEXT
);

-- One row per key and language. Status keeps machine drafts from ever being
-- shown as final.
CREATE TABLE IF NOT EXISTS translations (
  key TEXT NOT NULL REFERENCES translation_keys(key) ON DELETE CASCADE,
  locale TEXT NOT NULL REFERENCES locales(code),
  text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'human_draft' CHECK (status IN ('machine_draft','human_draft','reviewed','approved')),
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (key, locale),
  CHECK (status NOT IN ('reviewed','approved') OR reviewed_by IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS glossary_terms (
  id SERIAL PRIMARY KEY,
  institution_id INTEGER REFERENCES institutions(id),   -- NULL: platform term
  term_key TEXT NOT NULL,
  locale TEXT NOT NULL REFERENCES locales(code),
  text TEXT NOT NULL,
  context_note TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','reviewed','approved')),
  reviewed_by INTEGER REFERENCES users(id),
  UNIQUE (institution_id, term_key, locale)
);

-- Resolves the text for a key: requested language, then its fallback chain,
-- then English. Only reviewed or approved translations are used.
CREATE OR REPLACE FUNCTION nova_translate(p_key TEXT, p_locale TEXT) RETURNS TEXT
LANGUAGE sql STABLE AS $$
  WITH RECURSIVE chain(code, depth) AS (
    SELECT p_locale, 0
    UNION ALL
    SELECT l.fallback_code, c.depth + 1 FROM chain c JOIN locales l ON l.code = c.code
     WHERE l.fallback_code IS NOT NULL AND c.depth < 5
  )
  SELECT t.text FROM (SELECT code, depth FROM chain UNION ALL SELECT 'en', 99) c
    JOIN translations t ON t.key = p_key AND t.locale = c.code AND t.status IN ('reviewed','approved')
   ORDER BY c.depth LIMIT 1
$$;

ALTER TABLE users ADD COLUMN IF NOT EXISTS locale TEXT REFERENCES locales(code);
ALTER TABLE students ADD COLUMN IF NOT EXISTS learning_locale TEXT REFERENCES locales(code);

-- ---------- Curriculum OS -----------------------------------------------
-- NovaSchool's own, original framework(s). External programmes (national
-- boards, Cambridge, later others) are "pathways" that outcomes are mapped
-- to by code only; a mapping never implies endorsement.
CREATE TABLE IF NOT EXISTS curriculum_frameworks (
  id SERIAL PRIMARY KEY,
  institution_id INTEGER REFERENCES institutions(id),   -- NULL: platform framework
  code TEXT NOT NULL,
  name_key TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','published','retired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (institution_id, code, version)
);

CREATE TABLE IF NOT EXISTS curriculum_pathways (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,              -- e.g. 'pk-national', 'cambridge-lower-secondary'
  name TEXT NOT NULL,
  country TEXT,
  officially_endorsed BOOLEAN NOT NULL DEFAULT FALSE,   -- only true with written evidence
  endorsement_evidence TEXT,
  CHECK (NOT officially_endorsed OR endorsement_evidence IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS subjects (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,              -- 'physics', 'chemistry', 'biology', 'computer_science'
  name_key TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS grade_levels (
  id SERIAL PRIMARY KEY,
  framework_id INTEGER NOT NULL REFERENCES curriculum_frameworks(id) ON DELETE CASCADE,
  code TEXT NOT NULL,                     -- 'g6', 'g7' ...
  ordinal INTEGER NOT NULL,
  name_key TEXT NOT NULL,
  UNIQUE (framework_id, code)
);

CREATE TABLE IF NOT EXISTS topics (
  id SERIAL PRIMARY KEY,
  framework_id INTEGER NOT NULL REFERENCES curriculum_frameworks(id) ON DELETE CASCADE,
  subject_id INTEGER NOT NULL REFERENCES subjects(id),
  grade_level_id INTEGER REFERENCES grade_levels(id),
  parent_topic_id INTEGER REFERENCES topics(id),
  code TEXT NOT NULL,
  name_key TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  UNIQUE (framework_id, code)
);

CREATE TABLE IF NOT EXISTS learning_outcomes (
  id SERIAL PRIMARY KEY,
  framework_id INTEGER NOT NULL REFERENCES curriculum_frameworks(id) ON DELETE CASCADE,
  topic_id INTEGER NOT NULL REFERENCES topics(id),
  code TEXT NOT NULL,                     -- stable, never reused, e.g. 'PHY.G8.ELEC.03'
  statement_key TEXT NOT NULL,            -- wording lives in translations
  cognitive_level TEXT CHECK (cognitive_level IN ('remember','understand','apply','analyse','evaluate','create')),
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','published','retired')),
  UNIQUE (framework_id, code, version)
);

CREATE TABLE IF NOT EXISTS outcome_prerequisites (
  outcome_id INTEGER NOT NULL REFERENCES learning_outcomes(id) ON DELETE CASCADE,
  prerequisite_id INTEGER NOT NULL REFERENCES learning_outcomes(id) ON DELETE CASCADE,
  PRIMARY KEY (outcome_id, prerequisite_id),
  CHECK (outcome_id <> prerequisite_id)
);

-- Mapping to an external pathway stores only the external code, never its
-- wording, and is "unverified" until a named person checks it.
CREATE TABLE IF NOT EXISTS pathway_mappings (
  outcome_id INTEGER NOT NULL REFERENCES learning_outcomes(id) ON DELETE CASCADE,
  pathway_id INTEGER NOT NULL REFERENCES curriculum_pathways(id),
  external_code TEXT NOT NULL CHECK (length(external_code) <= 40),
  alignment TEXT NOT NULL CHECK (alignment IN ('full','partial','related')),
  verification TEXT NOT NULL DEFAULT 'unverified' CHECK (verification IN ('unverified','verified')),
  verified_by INTEGER REFERENCES users(id),
  source_id INTEGER REFERENCES content_sources(id),
  PRIMARY KEY (outcome_id, pathway_id, external_code),
  CHECK (verification = 'unverified' OR verified_by IS NOT NULL)
);

INSERT INTO subjects (code, name_key) VALUES
  ('physics', 'subject.physics'), ('chemistry', 'subject.chemistry'),
  ('biology', 'subject.biology'), ('computer_science', 'subject.computer_science')
ON CONFLICT (code) DO NOTHING;

-- ---------- Virtual Lab OS ----------------------------------------------
-- Engines are reusable simulators; an experiment is configuration for one.
CREATE TABLE IF NOT EXISTS lab_engines (
  code TEXT PRIMARY KEY,
  subject_code TEXT NOT NULL REFERENCES subjects(code),
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('available','planned')),
  description TEXT
);

INSERT INTO lab_engines (code, subject_code, name, status, description) VALUES
  ('circuit', 'physics', 'DC series circuit', 'available', 'Server-scored; existing'),
  ('circuit_parallel', 'physics', 'DC parallel circuit', 'available', 'Server-scored; existing'),
  ('pendulum', 'physics', 'Simple pendulum', 'available', 'Server-scored; existing'),
  ('dc_circuit_general', 'physics', 'General DC circuit builder', 'planned', 'Any topology of cells, resistors, lamps, meters, switches'),
  ('mechanics_2d', 'physics', '2D motion and forces', 'planned', 'Projectiles, slopes, collisions, springs'),
  ('waves_optics', 'physics', 'Waves and ray optics', 'planned', 'Reflection, refraction, lenses, wave interference'),
  ('thermal', 'physics', 'Heat and temperature', 'planned', 'Heating curves, conduction, specific heat'),
  ('magnetism', 'physics', 'Magnetism and induction', 'planned', 'Fields, electromagnets, induction'),
  ('chem_titration', 'chemistry', 'Titration and indicators', 'planned', 'Burette, pH, indicators'),
  ('chem_reactions', 'chemistry', 'Reaction bench', 'planned', 'Rates, displacement, gas tests, heating'),
  ('chem_particles', 'chemistry', 'Particles and states', 'planned', 'States of matter, diffusion, gas laws'),
  ('chem_separation', 'chemistry', 'Separation techniques', 'planned', 'Filtration, distillation, chromatography'),
  ('chem_electrolysis', 'chemistry', 'Electrolysis cell', 'planned', 'Electrodes, products, plating'),
  ('bio_microscope', 'biology', 'Virtual microscope', 'planned', 'Slides, magnification, cell structures'),
  ('bio_physiology', 'biology', 'Body systems', 'planned', 'Heart rate, breathing, enzymes'),
  ('bio_plants', 'biology', 'Plant processes', 'planned', 'Photosynthesis, transpiration, germination'),
  ('bio_genetics', 'biology', 'Inheritance simulator', 'planned', 'Punnett squares, variation, selection'),
  ('bio_ecology', 'biology', 'Ecosystem model', 'planned', 'Food webs, populations, sampling'),
  ('cs_logic', 'computer_science', 'Logic gates', 'planned', 'Gates, truth tables, adders'),
  ('cs_algorithms', 'computer_science', 'Algorithm visualiser', 'planned', 'Searching, sorting, complexity'),
  ('cs_programming', 'computer_science', 'Block and text sandbox', 'planned', 'Sequence, selection, iteration, no network'),
  ('cs_data', 'computer_science', 'Data and representation', 'planned', 'Binary, images, sound, compression'),
  ('cs_networks', 'computer_science', 'Networks and security', 'planned', 'Packets, routing, encryption basics')
ON CONFLICT (code) DO NOTHING;

-- The 100-experiment plan (25 per subject) is loaded as data from
-- db/data/lab_catalog_plan.json by tests and tools; every row starts as
-- 'planned'. Only rows backed by a real engine and reviewed content may
-- become 'available'.
CREATE TABLE IF NOT EXISTS lab_catalog_plan (
  code TEXT PRIMARY KEY,
  subject_code TEXT NOT NULL REFERENCES subjects(code),
  title TEXT NOT NULL,
  grade_band TEXT NOT NULL,
  engine_code TEXT NOT NULL REFERENCES lab_engines(code),
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_development','available'))
);

-- A planned experiment cannot be marked available while its engine is not.
CREATE OR REPLACE FUNCTION lab_catalog_plan_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'available' AND (SELECT status FROM lab_engines WHERE code = NEW.engine_code) <> 'available' THEN
    RAISE EXCEPTION 'Experiment % cannot be available: engine % is not built yet.', NEW.code, NEW.engine_code;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS lab_catalog_plan_guard ON lab_catalog_plan;
CREATE TRIGGER lab_catalog_plan_guard BEFORE INSERT OR UPDATE ON lab_catalog_plan
  FOR EACH ROW EXECUTE FUNCTION lab_catalog_plan_guard();

-- ---------- Assessment OS -----------------------------------------------
CREATE TABLE IF NOT EXISTS question_bank_items (
  id SERIAL PRIMARY KEY,
  institution_id INTEGER REFERENCES institutions(id) DEFAULT nova_current_institution(),
  outcome_id INTEGER REFERENCES learning_outcomes(id),
  item_type TEXT NOT NULL CHECK (item_type IN ('mcq','multi_select','numeric','short_text','descriptive')),
  stem_key TEXT NOT NULL,                 -- wording in translations
  data JSONB NOT NULL DEFAULT '{}'::jsonb, -- options, answer rules; never sent to students whole
  difficulty SMALLINT CHECK (difficulty BETWEEN 1 AND 5),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','published','retired')),
  ai_drafted BOOLEAN NOT NULL DEFAULT FALSE,
  reviewed_by INTEGER REFERENCES users(id),
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (status <> 'published' OR reviewed_by IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS practice_attempts (
  id SERIAL PRIMARY KEY,
  institution_id INTEGER NOT NULL REFERENCES institutions(id) DEFAULT nova_current_institution(),
  student_id INTEGER NOT NULL REFERENCES students(id),
  item_id INTEGER NOT NULL REFERENCES question_bank_items(id),
  correct BOOLEAN,
  response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Mastery comes only from observed evidence (marks, practice, lab results).
CREATE TABLE IF NOT EXISTS mastery_records (
  institution_id INTEGER NOT NULL REFERENCES institutions(id) DEFAULT nova_current_institution(),
  student_id INTEGER NOT NULL REFERENCES students(id),
  outcome_id INTEGER NOT NULL REFERENCES learning_outcomes(id),
  level SMALLINT NOT NULL DEFAULT 0 CHECK (level BETWEEN 0 AND 4),
  evidence_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (student_id, outcome_id)
);

CREATE INDEX IF NOT EXISTS question_bank_items_institution_idx ON question_bank_items (institution_id);
CREATE INDEX IF NOT EXISTS practice_attempts_institution_idx ON practice_attempts (institution_id, student_id);
CREATE INDEX IF NOT EXISTS mastery_records_institution_idx ON mastery_records (institution_id, student_id);
