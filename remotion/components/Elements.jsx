import React from 'react';
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig
} from 'remotion';
import { Gif } from '@remotion/gif';

// A styled text element. Mirrors the caption span CSS (fontFamily, stroke via
// WebkitTextStroke + paintOrder, weight, transform) so the editor preview and
// this render match. fontSize is absolute in 1080×1920 frame space.
const ElementText = ({ el }) => {
  const s = el.textStyle || {};
  return (
    <div
      style={{
        width: '100%',
        fontFamily: `'${s.fontFamily || 'Inter'}', sans-serif`,
        fontSize: s.fontSize || 72,
        fontWeight: s.fontWeight || 800,
        color: s.color || '#FFFFFF',
        WebkitTextStroke: s.strokeWidth > 0 ? `${s.strokeWidth}px ${s.strokeColor || '#000000'}` : undefined,
        paintOrder: 'stroke fill',
        textShadow: '0 2px 8px rgba(0,0,0,0.5)',
        textTransform: s.uppercase ? 'uppercase' : 'none',
        textAlign: s.align || 'center',
        lineHeight: 1.1,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word'
      }}
    >
      {el.text}
    </div>
  );
};

// The element's media, sized to the wrapper width (height keeps native aspect).
const ElementMedia = ({ el }) => {
  const style = { width: '100%', height: 'auto', display: 'block' };
  if (el.kind === 'text') return <ElementText el={el} />;
  if (el.kind === 'gif') return <Gif src={staticFile(el.src)} fit="contain" style={style} />;
  // `transparent` extracts frames as PNG (not JPEG) so the keyed alpha channel
  // survives — without it the transparent areas composite onto black.
  if (el.kind === 'video')
    return <OffthreadVideo src={staticFile(el.src)} muted={el.muted !== false} loop transparent style={style} />;
  return <Img src={staticFile(el.src)} style={style} />;
};

// One placed element: positioned by center % (x/y), sized by width % (size),
// rotated, with an optional entrance/idle animation. `frame` is 0-based within
// the element's own <Sequence>.
const PlacedElement = ({ el }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  let opacity = 1;
  let extra = '';
  const inFrames = Math.max(1, Math.round(0.4 * fps));
  switch (el.animation) {
    case 'fade':
      opacity = interpolate(frame, [0, inFrames], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp'
      });
      break;
    case 'pop': {
      const s = spring({ frame, fps, config: { damping: 12, stiffness: 200 } });
      extra = ` scale(${interpolate(s, [0, 1], [0.6, 1])})`;
      break;
    }
    case 'pulse': {
      const s = 1 + 0.06 * Math.sin((frame / fps) * Math.PI * 2 * 1.5);
      extra = ` scale(${s})`;
      break;
    }
    case 'slide': {
      const dx = interpolate(frame, [0, inFrames], [-8, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp'
      });
      extra = ` translateX(${dx}%)`;
      opacity = interpolate(frame, [0, inFrames], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp'
      });
      break;
    }
    default:
      break;
  }

  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          left: `${el.x}%`,
          top: `${el.y}%`,
          width: `${el.size}%`,
          transform: `translate(-50%, -50%) rotate(${el.rotation || 0}deg)${extra}`,
          opacity
        }}
      >
        <ElementMedia el={el} />
      </div>
    </AbsoluteFill>
  );
};

// Overlay layer: each element timed by its [fromSec, toSec] window. Input order
// is already sorted by layer (back→front), so later items render on top.
export const Elements = ({ elements = [] }) => {
  const { fps } = useVideoConfig();
  return (
    <>
      {elements.map((el, i) => {
        const from = Math.max(0, Math.round((el.fromSec || 0) * fps));
        const dur = Math.max(1, Math.round(((el.toSec || 0) - (el.fromSec || 0)) * fps));
        return (
          <Sequence key={i} from={from} durationInFrames={dur} name={`element-${i}`}>
            <PlacedElement el={el} />
          </Sequence>
        );
      })}
    </>
  );
};
