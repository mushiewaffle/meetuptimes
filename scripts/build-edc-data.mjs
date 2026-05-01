// Converts src/data/edc2026.csv into src/data/edc2026.json
// CSV uses festival-night labeling: Day="Friday" includes Friday evening through
// Saturday early morning. Times are 12-hour AM/PM.
//
// Run: node scripts/build-edc-data.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const csvPath = join(repoRoot, 'src/data/edc2026.csv');
const jsonPath = join(repoRoot, 'src/data/edc2026.json');

function parseCsv(text) {
  const rows = [];
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const header = splitCsvLine(lines[0]);
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const row = {};
    header.forEach((h, idx) => (row[h] = cells[idx] ?? ''));
    rows.push(row);
  }
  return rows;
}

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

// "5:00 PM" -> {hour24, minute}
function parse12h(s) {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) throw new Error(`Bad time: ${s}`);
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ampm = m[3].toUpperCase();
  if (ampm === 'AM') {
    if (h === 12) h = 0;
  } else {
    if (h !== 12) h += 12;
  }
  return { h, min };
}

// Minutes since 5pm of the festival night.
// 5pm Fri = 0, 12am Sat = 420, 5:30am Sat = 750.
function festivalMinutes({ h, min }) {
  if (h >= 17) return (h - 17) * 60 + min;
  return (h + 7) * 60 + min;
}

const DAY_FULL_TO_SHORT = { Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun' };

const csv = readFileSync(csvPath, 'utf8');
const rows = parseCsv(csv);

const sets = rows.map((r, idx) => {
  const dayShort = DAY_FULL_TO_SHORT[r['Day']];
  if (!dayShort) throw new Error(`Bad day at row ${idx + 2}: ${JSON.stringify(r)}`);
  const start = parse12h(r['Start Time']);
  const end = parse12h(r['End Time']);
  return {
    night: dayShort,
    startMin: festivalMinutes(start),
    endMin: festivalMinutes(end),
    start: r['Start Time'],
    end: r['End Time'],
    artist: r['Artist'].trim(),
    stage: r['Stage'].trim(),
  };
});

// Stable, deterministic sort: night order (Fri/Sat/Sun) -> startMin -> stage -> artist
const NIGHT_ORDER = { Fri: 0, Sat: 1, Sun: 2 };
sets.sort((a, b) => {
  if (a.night !== b.night) return NIGHT_ORDER[a.night] - NIGHT_ORDER[b.night];
  if (a.startMin !== b.startMin) return a.startMin - b.startMin;
  if (a.stage !== b.stage) return a.stage.localeCompare(b.stage);
  return a.artist.localeCompare(b.artist);
});

// Assign sequential integer IDs after sorting -> stable across rebuilds as long
// as CSV content is unchanged.
sets.forEach((s, i) => (s.id = i));

const stages = [...new Set(sets.map((s) => s.stage))].sort();

const out = {
  version: 1,
  festival: 'EDC Las Vegas 2026',
  totalSets: sets.length,
  stages,
  sets,
};

writeFileSync(jsonPath, JSON.stringify(out));
console.log(`Wrote ${jsonPath}`);
console.log(`  ${sets.length} sets, ${stages.length} stages`);
console.log(`  Fri: ${sets.filter((s) => s.night === 'Fri').length}`);
console.log(`  Sat: ${sets.filter((s) => s.night === 'Sat').length}`);
console.log(`  Sun: ${sets.filter((s) => s.night === 'Sun').length}`);
