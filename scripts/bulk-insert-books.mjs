/**
 * Bulk-insert books from Airtable CSV export via Supabase REST (anon or service role).
 * Usage: SB_KEY=<anon_or_service> node scripts/bulk-insert-books.mjs [path/to.csv]
 */
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse/sync';

const url = process.env.SUPABASE_URL || 'https://kjjiddskkrysjnczzcku.supabase.co';
const key = process.env.SB_KEY;
if (!key) {
  console.error('Set SB_KEY (anon or service role JWT)');
  process.exit(1);
}

const csvPath = process.argv[2] || '/Users/Ryo/Downloads/BookM-Grid view.csv';
const supabase = createClient(url, key);

const raw = fs.readFileSync(csvPath, 'utf8');
const rows = parse(raw, {
  columns: true,
  skip_empty_lines: true,
  relax_column_count: true,
  bom: true
});

const records = [];
for (const r of rows) {
  const title = String(r['タイトル'] ?? '').trim();
  if (!title) continue;
  const dueRaw = String(r.due_date ?? '').trim();
  records.push({
    classification: String(r['分類'] ?? '').trim() || null,
    title,
    author: String(r['著者'] ?? '').trim() || null,
    tags: String(r['タグ'] ?? '').trim() || null,
    status: String(r.status ?? '貸出可').trim() || '貸出可',
    due_date: /^\d{4}-\d{2}-\d{2}$/.test(dueRaw) ? dueRaw : null,
    loan_history: String(r['貸出履歴'] ?? '').trim() || null
  });
}

const chunkSize = 100;
for (let i = 0; i < records.length; i += chunkSize) {
  const part = records.slice(i, i + chunkSize);
  const { error } = await supabase.from('books').insert(part);
  if (error) {
    console.error(error);
    process.exit(1);
  }
  console.log('inserted', Math.min(i + chunkSize, records.length), '/', records.length);
}

console.log('done, total', records.length);
