import React, { useMemo, useState, useRef, useEffect } from 'react';
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

/**
 * EDCPicker — modal for tapping sets out of the hardcoded EDC 2026 roster.
 *
 * Props:
 *   open: boolean
 *   initialSelection: number[] (set IDs already picked, optional)
 *   title: string (header text — e.g. "Pick your sets" or "Add to schedule")
 *   onSave: (sets: ScheduleSet[]) => void   // sets in {artist, stage, start} shape
 *   onCancel: () => void
 */
export default function EDCPicker({
  open,
  initialSelection = [],
  title = 'Pick your sets',
  onSave,
  onCancel,
}) {
  const [activeNight, setActiveNight] = useState('Fri');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState(() => new Set(initialSelection));
  const listRef = useRef(null);

  // Reset internal state when the picker is opened
  useEffect(() => {
    if (open) {
      setPicked(new Set(initialSelection));
      setQuery('');
      setActiveNight('Fri');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Lock background scroll while the modal is open. Without this, iOS Safari
  // lets the underlying page scroll behind the modal — confusing and ugly.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Close on Escape — quick keyboard escape hatch on desktop.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  const setsByNight = useMemo(() => {
    const m = { Fri: [], Sat: [], Sun: [] };
    for (const s of festivalSchedule) m[s.day].push(s);
    return m;
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = setsByNight[activeNight];
    if (q) {
      list = list.filter(
        (s) =>
          s.artist.toLowerCase().includes(q) ||
          s.stage.toLowerCase().includes(q),
      );
    }
    return list;
  }, [setsByNight, activeNight, query]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [activeNight]);

  function toggle(id) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSave() {
    const pickedSets = festivalSchedule
      .filter((s) => picked.has(s.id))
      .map((s) => ({
        artist: s.artist,
        stage: s.stage,
        start: s.start,
        end: s.end,
      }))
      .sort((a, b) => new Date(a.start) - new Date(b.start));
    onSave(pickedSets);
  }

  if (!open) return null;

  const totalsByNight = {
    Fri: [...picked].filter((id) => festivalSchedule[id]?.day === 'Fri').length,
    Sat: [...picked].filter((id) => festivalSchedule[id]?.day === 'Sat').length,
    Sun: [...picked].filter((id) => festivalSchedule[id]?.day === 'Sun').length,
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-stretch sm:items-center justify-center sm:p-4 animate-fadeIn">
      <div className="w-full sm:max-w-2xl bg-edc-black border-0 sm:border sm:border-edc-purple/40 sm:rounded-2xl shadow-2xl flex flex-col max-h-screen sm:max-h-[90vh]">
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-edc-purple/20">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-orbitron tracking-widest text-[10px] text-edc-blue mb-0.5">
                EDC LAS VEGAS 2026 · MAY 15–17
              </div>
              <h2 className="text-xl font-bold text-white">{title}</h2>
              <p className="text-xs text-white/50 mt-0.5">
                Tap to add sets. Switch nights with the tabs below.
              </p>
            </div>
            <button
              onClick={onCancel}
              className="text-white/40 hover:text-edc-pink text-2xl leading-none -mt-1"
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
                className={`flex-1 py-2 px-1 rounded-md text-sm font-medium transition-all ${
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

        {/* List */}
        <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-2">
          {filtered.length === 0 ? (
            <div className="text-center text-white/40 py-12 text-sm">
              No sets match "{query}".
            </div>
          ) : (
            <div className="rounded-lg overflow-hidden divide-y divide-edc-purple/10 border border-edc-purple/20">
              {filtered.map((s) => {
                const isPicked = picked.has(s.id);
                return (
                  <button
                    key={s.id}
                    onClick={() => toggle(s.id)}
                    className={`w-full text-left px-3 py-2.5 flex items-center gap-3 transition-colors ${
                      isPicked
                        ? 'bg-edc-pink/15 hover:bg-edc-pink/20'
                        : 'hover:bg-edc-purple/10'
                    }`}
                  >
                    <div
                      className={`shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center text-[11px] font-bold ${
                        isPicked
                          ? 'bg-edc-pink border-edc-pink text-black'
                          : 'border-white/30'
                      }`}
                    >
                      {isPicked ? '✓' : ''}
                    </div>
                    <div className="shrink-0 w-14 text-xs text-white/50 tabular-nums">
                      {fmtTime(s.startTime)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white truncate">
                        {s.artist}
                      </div>
                      <div className="text-[11px] text-white/40 truncate">
                        {s.stage} · ends {fmtTime(s.endTime)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-edc-purple/20 bg-black/40">
          <div className="flex items-center gap-3">
            <div className="flex-1 text-sm text-white/80">
              <span className="text-edc-blue font-bold">{picked.size}</span>{' '}
              {picked.size === 1 ? 'set' : 'sets'} selected
              {picked.size > 0 && (
                <span className="text-white/40 text-xs ml-2">
                  ({totalsByNight.Fri}F · {totalsByNight.Sat}S · {totalsByNight.Sun}S)
                </span>
              )}
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
              className="px-5 py-2 rounded-md bg-gradient-to-r from-edc-pink to-edc-purple disabled:from-gray-700 disabled:to-gray-700 disabled:opacity-40 text-white font-bold text-sm shadow-[0_0_15px_rgba(255,0,255,0.3)] disabled:shadow-none transition-all"
            >
              Save schedule →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
