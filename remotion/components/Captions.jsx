import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

// Split a caption line into words with timing distributed evenly across the
// line's [start,end] — mirrors `wordsFromLines` in server/src/lib/caption.ts so
// the karaoke highlight matches the Caption-step overlay exactly.
function wordsForLine(line) {
  const toks = (line.text || '').trim().split(/\s+/).filter(Boolean);
  const dur = Math.max(0.2, line.end - line.start);
  const per = dur / Math.max(1, toks.length);
  return toks.map((w, i) => ({
    word: w,
    start: line.start + per * i,
    end: line.start + per * (i + 1)
  }));
}

/**
 * Caption overlay layer for the dashboard render. Matches the Caption-step
 * overlay: per-word karaoke highlight (active word in `highlightColor`) plus a
 * pop enter/exit animation. Rendered only when the dashboard passes captions.
 *
 * @param {{ lines: {start:number,end:number,text:string}[], settings: object }} props
 */
export const Captions = ({ lines = [], settings = {} }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  const line = lines.find((l) => t >= l.start && t < l.end);
  if (!line) return null;

  const {
    fontFamily = 'Inter',
    fontSize = 60,
    fontWeight = 800,
    textColor = '#FFFFFF',
    highlightColor = '#E11D2A',
    strokeColor = '#000000',
    strokeWidth = 6,
    positionY = 78,
    uppercase = true
  } = settings;

  const words = wordsForLine(line);
  const activeIdx = words.findIndex((w) => t >= w.start && t < w.end);

  // Pop enter (55% → 100% over the first 120ms) / exit (→ 90% over last 90ms) —
  // mirrors POP_IN_SCALE / POP_OUT_SCALE in src/lib/ass-generator.js.
  const elapsed = t - line.start;
  const remain = line.end - t;
  let scale = 1;
  if (elapsed < 0.12) {
    scale = interpolate(elapsed, [0, 0.12], [0.55, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp'
    });
  } else if (remain < 0.09) {
    scale = interpolate(remain, [0, 0.09], [0.9, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp'
    });
  }

  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          paddingLeft: 60,
          paddingRight: 60,
          textAlign: 'center',
          top: `${8 + 0.84 * positionY}%`,
          transform: 'translateY(-50%)'
        }}
      >
        <span
          style={{
            display: 'inline-block',
            fontFamily: `'${fontFamily}', sans-serif`,
            fontSize,
            fontWeight,
            WebkitTextStroke: strokeWidth > 0 ? `${strokeWidth}px ${strokeColor}` : undefined,
            paintOrder: 'stroke fill',
            textShadow: '0 2px 8px rgba(0,0,0,0.5)',
            textTransform: uppercase ? 'uppercase' : 'none',
            lineHeight: 1.1,
            transform: `scale(${scale})`,
            transformOrigin: 'center'
          }}
        >
          {words.map((w, i) => (
            <React.Fragment key={i}>
              <span style={{ color: i === activeIdx ? highlightColor : textColor }}>{w.word}</span>
              {i < words.length - 1 ? ' ' : ''}
            </React.Fragment>
          ))}
        </span>
      </div>
    </AbsoluteFill>
  );
};
