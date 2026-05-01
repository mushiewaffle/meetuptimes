// Master EDC Las Vegas 2026 schedule, derived from src/data/edc2026.json (which
// is built from src/data/edc2026.csv by scripts/build-edc-data.mjs).
//
// Each entry exposes everything the existing app already understood — `artist`,
// `stage`, `start` (ISO) — plus EDC-specific fields used by the picker UI:
// `day`, `startTime`, `endTime`, `id`.

import edcData from './edc2026.json';

// EDC Las Vegas 2026 runs Fri May 15 – Sun May 17, 2026 (Friday Night session
// closes early Sat morning, etc.). Adjust here if the festival dates change.
const NIGHT_BASE_DATE = {
  Fri: { y: 2026, m: 4, d: 15 }, // m is 0-indexed (May = 4)
  Sat: { y: 2026, m: 4, d: 16 },
  Sun: { y: 2026, m: 4, d: 17 },
};

function parse12h(s) {
  const m = String(s).trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ampm = m[3].toUpperCase();
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return { h, min };
}

// Map (festival night, clock time) -> ISO. AM hours roll into the next calendar
// day (e.g. Fri 4:00 AM is Sat 4:00 AM clock-time, but during Friday's session).
function makeISO(night, timeStr) {
  const t = parse12h(timeStr);
  if (!t) return null;
  const base = NIGHT_BASE_DATE[night];
  const dayOffset = t.h < 12 ? 1 : 0;
  return new Date(base.y, base.m, base.d + dayOffset, t.h, t.min).toISOString();
}

const festivalSchedule = edcData.sets.map((s) => ({
  id: s.id,
  day: s.night, // 'Fri' | 'Sat' | 'Sun'
  artist: s.artist,
  stage: s.stage,
  startTime: s.start, // '5:00 PM' (display)
  endTime: s.end, // '7:00 PM' (display)
  start: makeISO(s.night, s.start),
  end: makeISO(s.night, s.end),
}));

export const FESTIVAL_NAME = edcData.festival;
export const STAGES = edcData.stages;

export default festivalSchedule;
