-- Undo 0003. Drops the new, empty module tables. Run only before any real
-- curriculum, translation or assessment content has been entered.
DROP TABLE IF EXISTS mastery_records, practice_attempts, question_bank_items CASCADE;
DROP TABLE IF EXISTS lab_catalog_plan CASCADE;
DROP FUNCTION IF EXISTS lab_catalog_plan_guard();
DROP TABLE IF EXISTS lab_engines CASCADE;
DROP TABLE IF EXISTS pathway_mappings, outcome_prerequisites, learning_outcomes, topics, grade_levels, subjects, curriculum_pathways, curriculum_frameworks CASCADE;
ALTER TABLE students DROP COLUMN IF EXISTS learning_locale;
ALTER TABLE users DROP COLUMN IF EXISTS locale;
DROP FUNCTION IF EXISTS nova_translate(TEXT, TEXT);
DROP TABLE IF EXISTS glossary_terms, translations, translation_keys, locales CASCADE;
DROP TABLE IF EXISTS content_provenance, content_sources CASCADE;
