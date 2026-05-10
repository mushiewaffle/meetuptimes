// Day metadata for the day-separator headers in schedule lists / meetup
// plan / exports. Colors echo each night's vibe and stay distinct from the
// schedule body so headers read clearly as section dividers between Fri,
// Sat, and Sun.

export const DAY_INFO = {
  Fri: {
    short: 'FRI',
    label: 'Friday Night',
    date: 'May 15',
    color: '#2dd4ff', // cyan
    glow: 'rgba(45,212,255,0.5)',
  },
  Sat: {
    short: 'SAT',
    label: 'Saturday Night',
    date: 'May 16',
    color: '#ff36de', // pink
    glow: 'rgba(255,54,222,0.5)',
  },
  Sun: {
    short: 'SUN',
    label: 'Sunday Night',
    date: 'May 17',
    color: '#9b6cff', // purple
    glow: 'rgba(155,108,255,0.5)',
  },
};

export function getDayInfo(night) {
  return DAY_INFO[night] || null;
}

// Default meetup spot suggestions — each stage maps to a SPECIFIC named
// landmark within ~30m of the upcoming common-set's stage, drawn from the
// official EDC Las Vegas 2026 festival map (Insomniac, May 15-17 2026).
// The bar is high: art cars, sculptures, art pieces, and small named
// bars/water stations are fine because two friends can actually find
// each other at one. Stage entrances ("bass POD main entrance"), giant
// stages themselves, and vague areas ("Daisy Lane") are NOT — they're
// crowds of thousands. When no specific landmark exists nearby we
// return empty and the UI falls back to "Add meetup spot" so the user
// can name a real one themselves rather than seeing a useless guess.
const STAGE_MEETUP_SPOTS = {
  // North — main stage area
  'Kinetic Field': 'Zero Gravity sculpture · kineticFIELD entrance',
  'Casa Bacardí': 'Casa Bacardí bar entrance', // small named bar venue

  // Daisy Lane — north-center
  'Stereo Bloom': 'Flower Tower · Stereo Bloom',
  'Insomniac Fridays': 'Anima art piece · Kinetic Trail near Insomniac Fridays',
  'BeatBox Art Car': 'BeatBox Art Car · Daisy Lane',
  'Picnic Party Art Car': 'Picnic Party Art Car · Daisy Lane',

  // East side
  'Quantum Valley': 'Star Fighter art piece · Quantum Valley',
  'Neon Garden': 'I/O Disco · Neon Garden', // small named structure
  'Forest House': 'Elder Mother sculpture · Pixel Forest',

  // West side
  'Bionic Jungle': 'Paradisium art piece · Bionic Jungle',
  'Cosmic Meadow': '64 TAPS water station · Cosmic Meadow',

  // South side
  // Bass Pod has no specific labelled landmark on the published map —
  // empty fallback so the user names a real meeting point themselves.
  Basspod: '',
  'Circuit Grounds': 'Verizon Viewing Deck · Circuit Grounds',
  Wasteland: 'Salvage City Supper Club · Wasteland', // small named venue

  // Center — Rainbow Bazaar / Downtown EDC
  'Takis Rave Hangar': 'Crazy Dumbos carousel · Rainbow Bazaar',
  'Electrolit Hydration House': 'Lunchbox Packs booth · Downtown EDC',

  // YeeDC! is not labelled on the published 2026 map.
  'YeeDC!': '',
};

export function getStageMeetupSpot(stage) {
  if (!stage) return '';
  return STAGE_MEETUP_SPOTS[stage] || '';
}

// Approximate position of each stage on the official EDC Las Vegas 2026
// festival map, expressed as percentages (x: 0-100 left→right, y: 0-100
// top→bottom of the FULL map image including the right-side legend).
// Calibrated against the published map by overlaying a 10% grid in the
// browser; nudge any pin by 1-2% if it lands a smidge off — does not need
// to be pixel-perfect to be useful.
const STAGE_MAP_COORDS = {
  'Kinetic Field':                { x: 42, y: 18 },
  'Casa Bacardí':                 { x: 30, y: 22 },
  'Stereo Bloom':                 { x: 30, y: 34 },
  'Insomniac Fridays':            { x: 36, y: 31 },
  'BeatBox Art Car':              { x: 28, y: 41 },
  'Picnic Party Art Car':         { x: 36, y: 38 },
  'Quantum Valley':               { x: 58, y: 29 },
  'Neon Garden':                  { x: 62, y: 49 },
  'Forest House':                 { x: 60, y: 64 },
  'Bionic Jungle':                { x: 14, y: 27 },
  'Cosmic Meadow':                { x: 17, y: 42 },
  Basspod:                        { x: 38, y: 80 },
  'Circuit Grounds':              { x: 58, y: 80 },
  Wasteland:                      { x: 19, y: 78 },
  'Takis Rave Hangar':            { x: 40, y: 47 },
  'Electrolit Hydration House':   { x: 32, y: 58 },
  // YeeDC! is not labelled on the published 2026 map.
};

export function getStageMapCoords(stage) {
  if (!stage) return null;
  return STAGE_MAP_COORDS[stage] || null;
}
