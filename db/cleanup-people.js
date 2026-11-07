#!/usr/bin/env node
/* One-off clean-up: remove every student and every teacher except the
   teacher(s) you name, together with the records that belong only to them
   (logins, memberships, marks, homework, attendance, messages, their exams,
   lessons and timetable rows). Admins, office staff and parents are kept.

   SAFE BY DEFAULT: without --apply it does everything inside a transaction,
   prints what would change and then ROLLS BACK. Nothing is saved.

     CLEANUP_DATABASE_URL=... KEEP_TEACHER=Aisha node db/cleanup-people.js
     CLEANUP_DATABASE_URL=... KEEP_TEACHER=teacher@novaschool.pk KEEP_STUDENT=student@novaschool.pk node db/cleanup-people.js
     CLEANUP_DATABASE_URL=... KEEP_TEACHER=Aisha node db/cleanup-people.js --apply

   --apply asks you to type DELETE before it commits. Take a Neon backup
   branch first. Names of the people removed are printed so you can check. */
'use strict';
const { Client } = require('pg');
const readline = require('readline');

const URL_ = process.env.CLEANUP_DATABASE_URL;
const KEEP = (process.env.KEEP_TEACHER || '').trim();
const APPLY = process.argv.includes('--apply');
if (!URL_) { console.error('Set CLEANUP_DATABASE_URL (it is not printed).'); process.exit(2); }
if (!KEEP) { console.error('Set KEEP_TEACHER to the first name of the teacher to keep (e.g. KEEP_TEACHER=Aisha), or KEEP_TEACHER=none to remove every teacher.'); process.exit(2); }
const KEEP_NONE = KEEP.toLowerCase() === 'none';
// Optional: one student to keep for testing, by login email or first name.
const KEEP_STUDENT = (process.env.KEEP_STUDENT || '').trim();

const isLocal = /localhost|127\.0\.0\.1|host=\/|@\//.test(URL_);
let host = 'unknown';
try { host = new URL(URL_).hostname; } catch (e) { /* socket URL */ }

// Columns that only record "who did this" (or a class teacher slot): these are
// cleared instead of deleting the row they sit on.
const SET_NULL = /^(class_teacher_id|invited_by|reviewed_by|verified_by|created_by|actor_user_id|assigned_by_user_id|author_user_id|previewed_by_user_id|created_by_user_id)$/;

const ask = (q) => new Promise((r) => { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); rl.question(q, (a) => { rl.close(); r(a); }); });

(async () => {
  const db = new Client({ connectionString: URL_, ssl: isLocal ? false : { rejectUnauthorized: false } });
  await db.connect();
  console.log(`Target database host: ${host}`);
  console.log(APPLY ? 'Mode: APPLY (will ask before saving)' : 'Mode: PREVIEW ONLY (nothing will be saved)');

  const keep = KEEP_NONE ? [{ id: -1, first_name: '(none', last_name: '— all teachers removed)', subject: '' }] : (await db.query('SELECT t.id, t.first_name, t.last_name, t.subject FROM teachers t LEFT JOIN users u ON u.id = t.user_id WHERE t.first_name ILIKE $1 OR lower(u.email) = lower($1) ORDER BY t.id', [KEEP])).rows;
  if (keep.length !== 1) {
    console.error(`\nStopped: expected exactly 1 teacher with first name "${KEEP}", found ${keep.length}.`);
    keep.forEach((t) => console.error(`  - ${t.first_name} ${t.last_name} (${t.subject || 'no subject'})`));
    await db.end(); process.exit(3);
  }
  const k = keep[0];
  const teachers = (await db.query('SELECT t.id, t.user_id, t.first_name, t.last_name, u.email FROM teachers t LEFT JOIN users u ON u.id = t.user_id WHERE t.id <> $1 ORDER BY t.id', [k.id])).rows;
  let keepStudent = null;
  if (KEEP_STUDENT) {
    const ks = (await db.query('SELECT s.id, s.first_name, s.last_name, s.section_code FROM students s LEFT JOIN users u ON u.id = s.user_id WHERE s.first_name ILIKE $1 OR lower(u.email) = lower($1) ORDER BY s.id', [KEEP_STUDENT])).rows;
    if (ks.length !== 1) {
      console.error(`\nStopped: expected exactly 1 student matching "${KEEP_STUDENT}", found ${ks.length}.`);
      ks.forEach((x) => console.error(`  - ${x.first_name} ${x.last_name} (${x.section_code || 'no class'})`));
      await db.end(); process.exit(3);
    }
    keepStudent = ks[0];
  }
  const students = (await db.query('SELECT s.id, s.user_id, s.first_name, s.last_name, s.section_code, u.email FROM students s LEFT JOIN users u ON u.id = s.user_id WHERE s.id <> $1 ORDER BY s.id', [keepStudent ? keepStudent.id : -1])).rows;

  console.log(KEEP_NONE ? '\nKEEP teacher: none — every teacher will be removed' : `\nKEEP teacher: ${k.first_name} ${k.last_name} (${k.subject || 'no subject'})`);
  if (keepStudent) console.log(`KEEP student: ${keepStudent.first_name} ${keepStudent.last_name} (${keepStudent.section_code || 'no class'})`);
  console.log(`\nREMOVE ${teachers.length} teacher(s):`);
  teachers.forEach((t) => console.log(`  - ${t.first_name} ${t.last_name}${t.email ? ' <' + t.email + '>' : ''}`));
  console.log(`\nREMOVE ${students.length} student(s):`);
  students.forEach((s) => console.log(`  - ${s.first_name} ${s.last_name} (${s.section_code || 'no class'})${s.email ? ' <' + s.email + '>' : ''}`));

  // Foreign keys pointing at a table, discovered from the catalog.
  const fkCache = new Map();
  async function refsTo(table) {
    if (fkCache.has(table)) return fkCache.get(table);
    const { rows } = await db.query(`
      SELECT c.conrelid::regclass::text AS tbl, a.attname AS col, NOT a.attnotnull AS nullable, array_length(c.conkey,1) AS ncols
      FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
      WHERE c.contype = 'f' AND c.confrelid = $1::regclass`, [table]);
    fkCache.set(table, rows); return rows;
  }
  async function pkOf(table) {
    const { rows } = await db.query(`SELECT a.attname FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = $1::regclass AND i.indisprimary`, [table]);
    return rows.length === 1 ? rows[0].attname : null;
  }
  const counts = {};
  const bump = (k2, n) => { if (n) counts[k2] = (counts[k2] || 0) + n; };
  const q = (id) => '"' + id.replace(/"/g, '""') + '"';
  const qt = (t) => t.split('.').map(q).join('.');

  // Delete rows of `table` with primary key in ids, after handling everything that points at them.
  async function purge(table, ids, depth) {
    if (!ids.length) return;
    if (depth > 12) throw new Error('Reference chain too deep at ' + table);
    for (const fk of await refsTo(table)) {
      if (fk.ncols !== 1) throw new Error(`Multi-column reference from ${fk.tbl} — stopping to be safe.`);
      if (fk.tbl === table && fk.col === 'id') continue;
      if (fk.nullable && SET_NULL.test(fk.col)) {
        const r = await db.query(`UPDATE ${qt(fk.tbl)} SET ${q(fk.col)} = NULL WHERE ${q(fk.col)} = ANY($1)`, [ids]);
        bump(`${fk.tbl}.${fk.col} cleared`, r.rowCount);
        continue;
      }
      const pk = await pkOf(fk.tbl);
      if (pk) {
        const child = (await db.query(`SELECT ${q(pk)} AS id FROM ${qt(fk.tbl)} WHERE ${q(fk.col)} = ANY($1)`, [ids])).rows.map((r) => r.id);
        await purge(fk.tbl, child, depth + 1);
      } else {
        const r = await db.query(`DELETE FROM ${qt(fk.tbl)} WHERE ${q(fk.col)} = ANY($1)`, [ids]);
        bump(`${fk.tbl} deleted`, r.rowCount);
      }
    }
    const pk = await pkOf(table);
    const r = await db.query(`DELETE FROM ${qt(table)} WHERE ${q(pk)} = ANY($1)`, [ids]);
    bump(`${table} deleted`, r.rowCount);
  }

  const parentsBefore = (await db.query(`SELECT p.id, p.first_name, p.last_name FROM parents p`)).rows;
  await db.query('BEGIN');
  try {
    await purge('students', students.map((s) => s.id), 0);
    await purge('teachers', teachers.map((t) => t.id), 0);
    const userIds = [...students, ...teachers].map((x) => x.user_id).filter(Boolean);
    await purge('users', userIds, 0);

    const orphan = (await db.query(`SELECT p.first_name, p.last_name FROM parents p WHERE NOT EXISTS (SELECT 1 FROM student_parent_map m WHERE m.parent_id = p.id)`)).rows;
    const left = (await db.query(`SELECT (SELECT COUNT(*) FROM students) AS s, (SELECT COUNT(*) FROM teachers) AS t`)).rows[0];

    console.log('\nChanges:');
    Object.keys(counts).sort().forEach((x) => console.log(`  ${String(counts[x]).padStart(5)}  ${x}`));
    console.log(`\nAfter: ${left.t} teacher(s), ${left.s} student(s).`);
    console.log(`Parents kept: ${parentsBefore.length}. Parents now with no linked child: ${orphan.length}${orphan.length ? ' — ' + orphan.map((p) => p.first_name + ' ' + p.last_name).join(', ') : ''}`);

    if (!APPLY) { await db.query('ROLLBACK'); console.log('\nPREVIEW ONLY — rolled back, nothing changed.'); }
    else {
      const a = await ask('\nType DELETE to save these changes permanently (anything else cancels): ');
      if (a.trim() === 'DELETE') { await db.query('COMMIT'); console.log('Saved.'); }
      else { await db.query('ROLLBACK'); console.log('Cancelled — rolled back, nothing changed.'); }
    }
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    console.error('\nStopped, nothing changed: ' + err.message);
    process.exitCode = 1;
  } finally { await db.end(); }
})().catch((e) => { console.error('Failed: ' + e.message); process.exit(1); });
