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

// The element's media, sized to the wrapper width (height keeps native aspect).
const ElementMedia = ({ el }) => {
  const style = { width: '100%', height: 'auto', display: 'block' };
  if (el.kind === 'gif') return <Gif src={staticFile(el.src)} fit="contain" style={style} />;
  if (el.kind === 'video') return <OffthreadVideo src={staticFile(el.src)} muted loop style={style} />;
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
