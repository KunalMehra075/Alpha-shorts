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

// Per-line enter/exit animation. Mirrors src/lib/ass-generator.js constants so
// the final video matches the rendered overlay MP4 exactly:
//   pop   POP_IN_SCALE 55% / POP_OUT_SCALE 90%
//   slide SLIDE_IN_PX 40 / SLIDE_OUT_PX 30 (1920-px composition space)
//   enter 120ms / exit 90ms.
const ENTER = 0.12;
const EXIT = 0.09;

function lineMotion(style, elapsed, remain) {
  const base = { scale: 1, opacity: 1, ty: 0 };
  if (style === 'none') return base;
  const ein = (a, b) =>
    interpolate(elapsed, [0, ENTER], [a, b], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const eout = (a, b) =>
    interpolate(remain, [0, EXIT], [a, b], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  if (style === 'fade') {
    if (elapsed < ENTER) return { ...base, opacity: ein(0, 1) };
    if (remain < EXIT) return { ...base, opacity: eout(0, 1) };
    return base;
  }
  if (style === 'slide') {
    if (elapsed < ENTER) return { ...base, opacity: ein(0, 1), ty: ein(40, 0) };
    if (remain < EXIT) return { ...base, opacity: eout(0, 1), ty: eout(-30, 0) };
    return base;
  }
  // pop (default)
  if (elapsed < ENTER) return { ...base, scale: ein(0.55, 1) };
  if (remain < EXIT) return { ...base, scale: eout(0.9, 1) };
  return base;
}

/**
 * Caption overlay layer for the dashboard render. Matches the Caption-step
 * overlay: per-word karaoke highlight (active word in `highlightColor`) plus a
 * configurable per-line enter/exit animation (pop/fade/slide/none). Rendered
 * only when the dashboard passes captions.
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
    uppercase = true,
    animationStyle = 'pop'
  } = settings;

  const words = wordsForLine(line);
  const activeIdx = words.findIndex((w) => t >= w.start && t < w.end);

  // Per-line enter/exit animation, mirroring the ASS overlay engine.
  const elapsed = t - line.start;
  const remain = line.end - t;
  const { scale, opacity, ty } = lineMotion(animationStyle, elapsed, remain);

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
            opacity,
            transform: `translateY(${ty}px) scale(${scale})`,
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
