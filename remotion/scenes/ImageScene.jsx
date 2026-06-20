import React from 'react';
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { AnimationScene } from './AnimationScene.jsx';

/**
 * A still image with a Ken Burns motion. The image is over-scaled so panning
 * never reveals edges, then slowly zoomed/panned across the scene's duration.
 */
export const ImageScene = ({ asset, effect = 'kenburns-in', durationInFrames, seed }) => {
  const frame = useCurrentFrame();

  // Guard: if the asset is somehow missing, degrade to a procedural scene.
  if (!asset || !asset.src) {
    return <AnimationScene kind="generic" durationInFrames={durationInFrames} seed={seed} />;
  }

  const p = interpolate(frame, [0, Math.max(1, durationInFrames)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });

  // base over-scan so translations stay covered
  const OVER = 1.12;
  let scale = OVER;
  let x = 0;
  let y = 0;

  switch (effect) {
    case 'kenburns-out':
      scale = interpolate(p, [0, 1], [1.18, OVER]);
      break;
    case 'pan-left':
      scale = 1.2;
      x = interpolate(p, [0, 1], [4, -4]); // percent
      break;
    case 'pan-right':
      scale = 1.2;
      x = interpolate(p, [0, 1], [-4, 4]);
      break;
    case 'parallax':
      scale = interpolate(p, [0, 1], [1.1, 1.2]);
      y = interpolate(p, [0, 1], [3, -3]);
      break;
    case 'kenburns-in':
    default:
      scale = interpolate(p, [0, 1], [OVER, 1.18]);
      break;
  }

  return (
    <AbsoluteFill style={{ backgroundColor: '#000', overflow: 'hidden' }}>
      <Img
        src={staticFile(asset.src)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: `translate(${x}%, ${y}%) scale(${scale})`,
          transformOrigin: 'center center'
        }}
      />
    </AbsoluteFill>
  );
};
