/**
 * Generates batched INSERT SQL for public.books from Airtable CSV export.
 * Run: node scripts/generate-books-insert-batches.js
 * Outputs: scripts/sql-batches/books_batch_N.sql
 */
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const CSV_PATH = '/Users/Ryo/Downloads/BookM-Grid view.csv';
const OUT_DIR = path.join(__dirname, 'sql-batches');
const BATCH_SIZE = 80;

function sqlStr(s) {
  if (s == null || String(s).trim() === '') return 'NULL';
  return "'" + String(s).replace(/'/g, "''") + "'";
}

function sqlDate(s) {
  const t = String(s || '').trim();
  if (!t) return 'NULL';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return 'NULL';
  return sqlStr(t) + '::date';
}

const raw = fs.readFileSync(CSV_PATH, 'utf8');
const rows = parse(raw, {
  columns: true,
  skip_empty_lines: true,
  relax_column_count: true,
  bom: true
});

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const values = [];
for (const r of rows) {
  const title = String(r['タイトル'] ?? '').trim();
  if (!title) continue;

  const classification = String(r['分類'] ?? '').trim() || null;
  const author = String(r['著者'] ?? '').trim() || null;
  const tags = String(r['タグ'] ?? '').trim() || null;
  const status = String(r.status ?? '貸出可').trim() || '貸出可';
  const dueRaw = String(r.due_date ?? '').trim();
  const loanHistory = String(r['貸出履歴'] ?? '').trim() || null;

  values.push(
    `(${sqlStr(classification)}, ${sqlStr(title)}, ${sqlStr(author)}, ${sqlStr(tags)}, ${sqlStr(status)}, ${sqlDate(dueRaw)}, ${sqlStr(loanHistory)})`
  );
}

let batch = 0;
for (let i = 0; i < values.length; i += BATCH_SIZE) {
  const chunk = values.slice(i, i + BATCH_SIZE);
  const sql =
    `INSERT INTO public.books (classification, title, author, tags, status, due_date, loan_history)\nVALUES\n` +
    chunk.join(',\n') +
    ';\n';
  const file = path.join(OUT_DIR, `books_batch_${batch}.sql`);
  fs.writeFileSync(file, sql, 'utf8');
  console.log(file, chunk.length);
  batch++;
}

console.log('Total rows:', values.length);
