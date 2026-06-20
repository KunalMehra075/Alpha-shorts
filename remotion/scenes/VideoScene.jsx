import React from 'react';
import {
  AbsoluteFill,
  OffthreadVideo,
  interpolate,
  staticFile,
  useCurrentFrame
} from 'remotion';
import { AnimationScene } from './AnimationScene.jsx';

/**
 * A stock video clip, auto-cropped to fill 9:16 (objectFit: cover) with a mild
 * cinematic zoom. Loops if the clip is shorter than the scene duration.
 */
export const VideoScene = ({ asset, effect = 'zoom-in', durationInFrames, seed }) => {
  const frame = useCurrentFrame();

  if (!asset || !asset.src) {
    return <AnimationScene kind="generic" durationInFrames={durationInFrames} seed={seed} />;
  }

  const p = interpolate(frame, [0, Math.max(1, durationInFrames)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });

  let scale = 1.05;
  let x = 0;
  switch (effect) {
    case 'zoom-out':
      scale = interpolate(p, [0, 1], [1.12, 1.02]);
      break;
    case 'drift':
      scale = 1.1;
      x = interpolate(p, [0, 1], [-2, 2]);
      break;
    case 'zoom-in':
    default:
      scale = interpolate(p, [0, 1], [1.02, 1.12]);
      break;
  }

  return (
    <AbsoluteFill style={{ backgroundColor: '#000', overflow: 'hidden' }}>
      <OffthreadVideo
        src={staticFile(asset.src)}
        muted
        loop
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: `translateX(${x}%) scale(${scale})`,
          transformOrigin: 'center center'
        }}
      />
    </AbsoluteFill>
  );
};
