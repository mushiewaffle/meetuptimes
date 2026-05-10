import React, { useState, useEffect } from 'react';
import { getStageMapCoords, getStageMeetupSpot } from '../utils/stageZones';

const MAP_IMAGE_SRC = '/edc-map-2026.jpg';

/**
 * Modal that displays the official EDC Las Vegas 2026 festival map with a
 * pulsing pin dropped on the stage of the upcoming common set. Lets users
 * find their suggested meetup spot visually instead of decoding a landmark
 * name in isolation.
 *
 * Props:
 *   stage:    string — stage name (e.g. "Kinetic Field"). Drives pin position.
 *   landmark: string — landmark text shown beneath the map (the meetup spot).
 *   onClose:  () => void
 *
 * If `/edc-map-2026.jpg` is missing (the repo doesn't ship the official map
 * image), `onError` swaps the image for a text-only fallback that still
 * surfaces the landmark + a one-line explanation of how to enable the map.
 */
export default function FestivalMap({ stage, landmark, onClose }) {
  const [imageFailed, setImageFailed] = useState(false);
  const coords = getStageMapCoords(stage);
  const spot = landmark || getStageMeetupSpot(stage) || '';

  // Lock background scroll while the modal is open (matches EDCPicker).
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/90 flex items-stretch sm:items-center justify-center sm:p-4 animate-fadeIn"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-2xl bg-edc-black border-0 sm:border sm:border-edc-purple/40 sm:rounded-2xl shadow-2xl flex flex-col max-h-screen sm:max-h-[90vh]"
      >
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-edc-purple/20 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-orbitron tracking-widest text-[10px] text-edc-blue/80 uppercase mb-1">
              Festival map · meetup spot
            </div>
            <div className="text-edc-pink font-bold text-base leading-tight truncate">
              {stage || 'Unknown stage'}
            </div>
            {spot && (
              <div className="text-white/70 text-xs leading-snug mt-1">
                📍 {spot}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-white/40 hover:text-edc-pink text-2xl leading-none w-8 h-8 flex items-center justify-center -mt-1"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Map body */}
        <div className="flex-1 overflow-y-auto p-3">
          {imageFailed ? (
            // Image asset is missing — show a graceful fallback so the modal
            // still communicates the spot, plus a one-time setup note for the
            // person running the app.
            <div className="bg-black/40 border border-edc-purple/30 rounded-lg p-5 text-center">
              <div className="text-edc-pink/80 text-sm font-semibold mb-2">
                Map image not loaded
              </div>
              <div className="text-white/70 text-xs leading-relaxed mb-4">
                Save the official EDC 2026 festival map to{' '}
                <code className="bg-black/60 px-1.5 py-0.5 rounded text-edc-blue">
                  public/edc-map-2026.jpg
                </code>{' '}
                and the map view will activate.
              </div>
              {spot && (
                <div className="text-white/90 text-sm pt-3 border-t border-edc-purple/20">
                  📍 {spot}
                </div>
              )}
            </div>
          ) : (
            <div className="relative w-full">
              <img
                src={MAP_IMAGE_SRC}
                alt="EDC Las Vegas 2026 festival map"
                onError={() => setImageFailed(true)}
                className="w-full h-auto rounded-lg select-none"
                draggable={false}
              />
              {coords && (
                <>
                  {/* Pin: lime "balloon" body whose triangular tail tip
                      lands exactly on the landmark, body sitting just
                      above. This way the actual landmark (Zero Gravity
                      sculpture, 64 TAPS, etc.) stays visible instead of
                      being covered by the marker. Pulsing halo at the
                      tail tip draws attention without obscuring anything.
                      pointer-events-none keeps the backdrop click-to-close
                      working through the pin. */}
                  <div
                    className="absolute pointer-events-none flex flex-col items-center"
                    style={{
                      left: `${coords.x}%`,
                      top: `${coords.y}%`,
                      transform: 'translate(-50%, -100%)',
                      filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.6))',
                    }}
                  >
                    <div
                      className="rounded-full"
                      style={{
                        width: 22,
                        height: 22,
                        backgroundColor: '#39ff14',
                        border: '3px solid #000',
                        boxShadow: '0 0 0 2px #fff',
                      }}
                    />
                    <div
                      style={{
                        width: 0,
                        height: 0,
                        marginTop: -2,
                        borderLeft: '6px solid transparent',
                        borderRight: '6px solid transparent',
                        borderTop: '9px solid #39ff14',
                      }}
                    />
                  </div>
                  {/* Pulse ring centered exactly on the landmark coordinate
                      so the eye is drawn to the exact spot the pin tail is
                      pointing at. Sits behind the body via lower z-index. */}
                  <div
                    className="absolute pointer-events-none rounded-full animate-ping"
                    style={{
                      left: `${coords.x}%`,
                      top: `${coords.y}%`,
                      transform: 'translate(-50%, -50%)',
                      width: 18,
                      height: 18,
                      backgroundColor: 'rgba(57,255,20,0.5)',
                    }}
                  />
                </>
              )}
              {!coords && (
                <div className="absolute inset-x-0 bottom-0 bg-black/70 text-white/80 text-xs text-center py-2 rounded-b-lg">
                  No pin — this stage isn't on the published 2026 map.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-edc-purple/20 bg-black/40 flex items-center justify-between gap-3">
          <div className="text-[10px] text-white/40 leading-snug">
            Pin marks the stage of the upcoming common set.
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md bg-gradient-to-r from-edc-blue to-edc-pink hover:opacity-90 text-white text-sm font-bold font-orbitron tracking-wider transition-opacity"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
