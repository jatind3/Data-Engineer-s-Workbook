import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seedPath = path.resolve(__dirname, '../src/data/workbook-seed.json');
const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment before running npm run seed.');
  process.exit(1);
}
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

for (const sheet of seed.sheets) {
  const { data: savedSheet, error: sheetError } = await supabase
    .from('workbook_sheets')
    .upsert({
      slug: sheet.slug,
      name: sheet.name,
      description: sheet.description,
      sort_order: sheet.sort_order,
      table_columns: sheet.table_columns,
      raw_columns: sheet.raw_columns,
      header_row: sheet.header_row,
      raw_row_count: sheet.raw_row_count,
      max_column: sheet.max_column,
      updated_at: new Date().toISOString()
    }, { onConflict: 'slug' })
    .select('id')
    .single();
  if (sheetError) throw new Error(`Sheet ${sheet.name}: ${sheetError.message}`);

  const records = [];
  for (const row of sheet.table_rows) {
    records.push({
      source_key: `${sheet.slug}:table:${row.source_row}`,
      sheet_id: savedSheet.id,
      view_type: 'table',
      source_row: row.source_row,
      sort_order: row.source_row,
      data: row.data
    });
  }
  for (const row of sheet.raw_rows) {
    records.push({
      source_key: `${sheet.slug}:raw:${row.source_row}`,
      sheet_id: savedSheet.id,
      view_type: 'raw',
      source_row: row.source_row,
      sort_order: row.source_row,
      data: row.data
    });
  }
  for (let i = 0; i < records.length; i += 400) {
    const batch = records.slice(i, i + 400);
    const { error } = await supabase.from('workbook_rows').upsert(batch, { onConflict: 'source_key' });
    if (error) throw new Error(`Rows for ${sheet.name}: ${error.message}`);
  }
  console.log(`Seeded ${sheet.name}: ${sheet.table_rows.length} structured rows + ${sheet.raw_rows.length} original worksheet rows`);
}
console.log('Workbook import complete. Existing rows with matching source keys were updated; other rows were retained.');
