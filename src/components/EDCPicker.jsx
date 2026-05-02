import React, {
  useMemo,
  useState,
  useRef,
  useEffect,
  useCallback,
  useDeferredValue,
  memo,
} from 'react';
import festivalSchedule from '../data/festivalSchedule';

const NIGHTS = [
  { key: 'Fri', label: 'Fri Night', sub: 'May 15' },
  { key: 'Sat', label: 'Sat Night', sub: 'May 16' },
  { key: 'Sun', label: 'Sun Night', sub: 'May 17' },
];

function fmtTime(s) {
  const m = String(s).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return s;
  const h = m[1];
  const min = m[2];
  const suf = m[3].toLowerCase();
  return min === '00' ? `${h}${suf}` : `${h}:${min}${suf}`;
}

// Pre-bucket the static roster once, outside the component, so it isn't
// recomputed on every mount/render.
const SETS_BY_NIGHT = (() => {
  const m = { Fri: [], Sat: [], Sun: [] };
  for (const s of festivalSchedule) m[s.day].push(s);
  return m;
})();

// Each row is its own memoized component so a single toggle re-renders only
// the row whose `picked` flipped — not all ~144 rows on the active night.
// Without this, every tap was reconciling the entire visible list.
const SetRow = memo(function SetRow({ set, picked, onToggle }) {
  return (
    <button
      onClick={() => onToggle(set.id)}
      className={`w-full text-left px-3 py-2.5 flex items-center gap-3 ${
        picked
          ? 'bg-edc-pink/15 active:bg-edc-pink/25'
          : 'active:bg-edc-purple/15'
      }`}
    >
      <div
        className={`shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center text-[11px] font-bold ${
          picked
            ? 'bg-edc-pink border-edc-pink text-black'
            : 'border-white/30'
        }`}
      >
        {picked ? '✓' : ''}
      </div>
      <div className="shrink-0 w-14 text-xs text-white/50 tabular-nums">
        {fmtTime(set.startTime)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-white truncate">{set.artist}</div>
        <div className="text-[11px] text-white/40 truncate">
          {set.stage} · ends {fmtTime(set.endTime)}
        </div>
      </div>
    </button>
  );
});

/**
 * EDCPicker — modal for tapping sets out of the hardcoded EDC 2026 roster.
 *
 * Props:
 *   open: boolean
 *   initialSelection: number[] (set IDs already picked, optional)
 *   initialName: string (current schedule name, e.g. "Your picks" or "Alice")
 *   namePlaceholder: string (placeholder shown when input is empty)
 *   onSave: (sets: ScheduleSet[], name: string) => void
 *   onCancel: () => void
 */
export default function EDCPicker({
  open,
  initialSelection = [],
  initialName = '',
  namePlaceholder = 'Schedule name…',
  onSave,
  onCancel,
}) {
  const [activeNight, setActiveNight] = useState('Fri');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState(() => new Set(initialSelection));
  const [name, setName] = useState(initialName);
  const listRef = useRef(null);

  // useDeferredValue keeps typing snappy: input updates immediately, but
  // expensive filtering happens at lower priority.
  const deferredQuery = useDeferredValue(query);

  // Reset internal state when the picker is opened
  useEffect(() => {
    if (open) {
      setPicked(new Set(initialSelection));
      setQuery('');
      setActiveNight('Fri');
      setName(initialName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Lock background scroll while the modal is open. Without this, iOS Safari
  // lets the underlying page scroll behind the modal.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    const list = SETS_BY_NIGHT[activeNight];
    if (!q) return list;
    return list.filter(
      (s) =>
        s.artist.toLowerCase().includes(q) ||
        s.stage.toLowerCase().includes(q),
    );
  }, [activeNight, deferredQuery]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [activeNight]);

  // Stable toggle reference — required for SetRow's memo to skip re-renders
  // of rows whose picked state didn't change.
  const toggle = useCallback((id) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSave = useCallback(() => {
    const pickedSets = festivalSchedule
      .filter((s) => picked.has(s.id))
      .map((s) => ({
        artist: s.artist,
        stage: s.stage,
        start: s.start,
        end: s.end,
      }))
      .sort((a, b) => new Date(a.start) - new Date(b.start));
    onSave(pickedSets, name.trim());
  }, [picked, name, onSave]);

  // Recomputed only when the picked set actually changes, not on every render.
  const totalsByNight = useMemo(() => {
    const t = { Fri: 0, Sat: 0, Sun: 0 };
    for (const id of picked) {
      const day = festivalSchedule[id]?.day;
      if (day) t[day]++;
    }
    return t;
  }, [picked]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-stretch sm:items-center justify-center sm:p-4 animate-fadeIn">
      <div className="w-full sm:max-w-2xl bg-edc-black border-0 sm:border sm:border-edc-purple/40 sm:rounded-2xl shadow-2xl flex flex-col max-h-screen sm:max-h-[90vh]">
        {/* Header — editable schedule name + close button. A small label and
            pencil icon make the name input obviously tap-to-edit (otherwise
            users miss it; bare bottom-border didn't read as an input). */}
        <div className="px-4 pt-4 pb-3 border-b border-edc-purple/20">
          <div className="flex items-end gap-2">
            <div className="flex-1 min-w-0">
              <label className="block text-[10px] font-orbitron tracking-widest uppercase text-edc-blue/80 mb-1">
                Schedule name · tap to edit
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={namePlaceholder}
                  className="w-full bg-transparent text-lg font-bold text-white placeholder-white/30 border-b-2 border-edc-purple/40 hover:border-edc-purple/70 focus:border-edc-pink focus:outline-none py-1 pr-7 pl-0 transition-colors"
                />
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-edc-purple/60 pointer-events-none"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </div>
            </div>
            <button
              onClick={onCancel}
              className="shrink-0 text-white/40 hover:text-edc-pink text-2xl leading-none w-8 h-8 flex items-center justify-center -mb-1"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <div className="mt-3 flex gap-1">
            {NIGHTS.map((n) => (
              <button
                key={n.key}
                onClick={() => setActiveNight(n.key)}
                className={`flex-1 py-2 px-1 rounded-md text-sm font-medium ${
                  activeNight === n.key
                    ? 'bg-edc-pink/20 text-edc-pink border border-edc-pink/60'
                    : 'text-white/50 hover:text-white border border-transparent'
                }`}
              >
                <div className="font-orbitron tracking-wide">{n.label}</div>
                <div className="text-[10px] opacity-70">
                  {n.sub}
                  {totalsByNight[n.key] > 0 && ` · ${totalsByNight[n.key]} picked`}
                </div>
              </button>
            ))}
          </div>

          <div className="mt-3">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search artist or stage…"
              className="w-full px-3 py-2 rounded-md bg-black/60 border border-edc-purple/30 text-sm text-white placeholder-white/30 focus:outline-none focus:border-edc-blue"
            />
          </div>
        </div>

        {/* List — `contain: content` and `will-change: transform` reduce paint
            cost while scrolling a long list of rows. */}
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto px-3 py-2"
          style={{ contain: 'content' }}
        >
          {filtered.length === 0 ? (
            <div className="text-center text-white/40 py-12 text-sm">
              No sets match "{query}".
            </div>
          ) : (
            <div className="rounded-lg overflow-hidden divide-y divide-edc-purple/10 border border-edc-purple/20">
              {filtered.map((s) => (
                <SetRow
                  key={s.id}
                  set={s}
                  picked={picked.has(s.id)}
                  onToggle={toggle}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-edc-purple/20 bg-black/40">
          <div className="flex items-center gap-3">
            <div className="flex-1 text-sm text-white/80">
              <span className="text-edc-blue font-bold">{picked.size}</span>{' '}
              {picked.size === 1 ? 'set' : 'sets'} selected
            </div>
            <button
              onClick={onCancel}
              className="px-3 py-2 rounded-md text-sm text-white/60 hover:text-white"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={picked.size === 0}
              className="px-5 py-2 rounded-md bg-gradient-to-r from-edc-pink to-edc-purple disabled:from-gray-700 disabled:to-gray-700 disabled:opacity-40 text-white font-bold text-sm shadow-[0_0_15px_rgba(255,0,255,0.3)] disabled:shadow-none"
            >
              Save schedule →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
