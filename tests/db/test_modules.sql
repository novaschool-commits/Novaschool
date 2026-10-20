-- Foundation modules (migration 0003): language fallback, translation status,
-- curriculum mapping rules, lab catalog guard, assessment review rule.
\set ON_ERROR_STOP on

-- Language OS: only reviewed text is served; fallback ur -> en; unknown key -> NULL.
INSERT INTO translation_keys (key, domain) VALUES ('ui.greeting', 'ui'), ('ui.only_english', 'ui');
INSERT INTO translations (key, locale, text, status, reviewed_by) VALUES ('ui.greeting', 'en', 'Good morning', 'approved', 101);
INSERT INTO translations (key, locale, text, status) VALUES ('ui.greeting', 'ur', 'صبح بخیر', 'machine_draft');
INSERT INTO translations (key, locale, text, status, reviewed_by) VALUES ('ui.only_english', 'en', 'English only', 'approved', 101);
DO $$ BEGIN
  ASSERT nova_translate('ui.greeting', 'ur') = 'Good morning', 'L1: machine draft must not be shown; falls back to English';
  UPDATE translations SET status = 'reviewed', reviewed_by = 101 WHERE key = 'ui.greeting' AND locale = 'ur';
  ASSERT nova_translate('ui.greeting', 'ur') = 'صبح بخیر', 'L2: reviewed Urdu is served';
  ASSERT nova_translate('ui.only_english', 'pa') = 'English only', 'L3: pa -> ur -> en fallback chain';
  ASSERT nova_translate('ui.missing', 'ur') IS NULL, 'L4: unknown key gives NULL (UI shows English source)';
  ASSERT (SELECT direction FROM locales WHERE code = 'ur') = 'rtl', 'L5: Urdu is right-to-left';
  BEGIN
    INSERT INTO translations (key, locale, text, status) VALUES ('ui.only_english', 'ar', 'x', 'approved');
    RAISE EXCEPTION 'L6 failed: approved without reviewer';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO translation_keys (key, domain) VALUES ('Bad Key!', 'ui');
    RAISE EXCEPTION 'L7 failed: malformed key accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;

-- Curriculum OS: endorsement needs evidence; verified mapping needs a person;
-- an outcome cannot be its own prerequisite.
DO $$
DECLARE fw INT; tp INT; o1 INT; o2 INT; pw INT;
BEGIN
  INSERT INTO curriculum_frameworks (code, name_key) VALUES ('nova-core', 'framework.nova_core') RETURNING id INTO fw;
  INSERT INTO topics (framework_id, subject_id, code, name_key) VALUES (fw, (SELECT id FROM subjects WHERE code = 'physics'), 'PHY.ELEC', 'topic.phy_elec') RETURNING id INTO tp;
  INSERT INTO learning_outcomes (framework_id, topic_id, code, statement_key) VALUES (fw, tp, 'PHY.ELEC.01', 'lo.phy_elec_01') RETURNING id INTO o1;
  INSERT INTO learning_outcomes (framework_id, topic_id, code, statement_key) VALUES (fw, tp, 'PHY.ELEC.02', 'lo.phy_elec_02') RETURNING id INTO o2;
  INSERT INTO outcome_prerequisites VALUES (o2, o1);
  BEGIN INSERT INTO outcome_prerequisites VALUES (o1, o1); RAISE EXCEPTION 'C1 failed'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO curriculum_pathways (code, name, officially_endorsed) VALUES ('fake-endorsed', 'X', TRUE);
    RAISE EXCEPTION 'C2 failed: endorsement without evidence';
  EXCEPTION WHEN check_violation THEN NULL; END;
  INSERT INTO curriculum_pathways (code, name) VALUES ('pk-national', 'Pakistan national curriculum (mapping only)') RETURNING id INTO pw;
  INSERT INTO pathway_mappings (outcome_id, pathway_id, external_code, alignment) VALUES (o1, pw, 'EXT-CODE-1', 'partial');
  BEGIN
    INSERT INTO pathway_mappings (outcome_id, pathway_id, external_code, alignment, verification) VALUES (o2, pw, 'EXT-CODE-2', 'full', 'verified');
    RAISE EXCEPTION 'C3 failed: verified without a person';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO pathway_mappings (outcome_id, pathway_id, external_code, alignment) VALUES (o2, pw, repeat('copied syllabus wording ', 5), 'full');
    RAISE EXCEPTION 'C4 failed: long external text accepted (codes only)';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;

-- Virtual Lab OS: a planned engine cannot back an "available" experiment.
INSERT INTO lab_catalog_plan (code, subject_code, title, grade_band, engine_code, status)
  VALUES ('PHY-01', 'physics', 'Building a series circuit', 'G6-8', 'circuit', 'available');
DO $$ BEGIN
  BEGIN
    INSERT INTO lab_catalog_plan (code, subject_code, title, grade_band, engine_code, status)
      VALUES ('CHE-01', 'chemistry', 'Acid and alkali titration', 'G9-10', 'chem_titration', 'available');
    RAISE EXCEPTION 'V1 failed: available on a planned engine';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%engine chem_titration is not built yet%' THEN RAISE; END IF;
  END;
  ASSERT (SELECT COUNT(*) FROM lab_engines WHERE status = 'available') = 3, 'V2: three engines built today';
END $$;

-- Assessment OS: an item cannot be published without a reviewer; mastery level 0-4.
DO $$ BEGIN
  BEGIN
    INSERT INTO question_bank_items (item_type, stem_key, status, institution_id) VALUES ('mcq', 'q.x', 'published', 1);
    RAISE EXCEPTION 'A1 failed: published without review';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO mastery_records (institution_id, student_id, outcome_id, level) VALUES (1, 21, (SELECT MIN(id) FROM learning_outcomes), 9);
    RAISE EXCEPTION 'A2 failed: mastery level out of range';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;

-- Content & Rights OS: permitted use must be one of the agreed values.
DO $$ BEGIN
  BEGIN
    INSERT INTO content_sources (title, accessed_on, licence, permitted_use) VALUES ('A syllabus', CURRENT_DATE, 'All rights reserved', 'copy_everything');
    RAISE EXCEPTION 'R1 failed';
  EXCEPTION WHEN check_violation THEN NULL; END;
  INSERT INTO content_sources (title, accessed_on, licence, permitted_use) VALUES ('A syllabus', CURRENT_DATE, 'All rights reserved', 'facts_only');
END $$;

\echo 'test_modules: all assertions passed'
