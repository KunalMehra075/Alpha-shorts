import React from 'react';
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { AnimationScene } from './AnimationScene.jsx';

/**
 * A still image with a Ken Burns motion. The image is over-scaled so panning
 * never reveals edges, then slowly zoomed/panned across the scene's duration.
 */
export const ImageScene = ({
  asset,
  effect = 'kenburns-in',
  durationInFrames,
  seed,
  zoom = 50,
  intensity = 50,
  motion = 'cinematic'
}) => {
  const frame = useCurrentFrame();

  // Guard: if the asset is somehow missing, degrade to a procedural scene.
  if (!asset || !asset.src) {
    return <AnimationScene kind="generic" durationInFrames={durationInFrames} seed={seed} intensity={intensity} />;
  }

  const p = interpolate(frame, [0, Math.max(1, durationInFrames)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });

  // Scene-settings motion: zoom drives the scale amount, intensity drives pan,
  // motion style is an overall multiplier (50% = the previous defaults).
  const motionMul = motion === 'subtle' ? 0.6 : motion === 'energetic' ? 1.6 : 1.0;
  const zoomAmt = 0.12 * (zoom / 50) * motionMul; // total scale delta over the scene
  const panAmt = 4 * (intensity / 50) * motionMul; // percent of pan each side
  const OVER = 1.12;
  const cover = OVER + (panAmt * 2) / 100; // over-scan so panning never shows edges
  let scale = cover;
  let x = 0;
  let y = 0;

  switch (effect) {
    case 'kenburns-out':
      scale = interpolate(p, [0, 1], [cover + zoomAmt, cover]);
      x = interpolate(p, [0, 1], [-panAmt * 0.3, panAmt * 0.3]);
      break;
    case 'pan-left':
      scale = cover + 0.04;
      x = interpolate(p, [0, 1], [panAmt, -panAmt]); // percent
      break;
    case 'pan-right':
      scale = cover + 0.04;
      x = interpolate(p, [0, 1], [-panAmt, panAmt]);
      break;
    case 'parallax':
      scale = interpolate(p, [0, 1], [cover, cover + zoomAmt * 0.6]);
      y = interpolate(p, [0, 1], [panAmt * 0.6, -panAmt * 0.6]);
      break;
    case 'kenburns-in':
    default:
      scale = interpolate(p, [0, 1], [cover, cover + zoomAmt]);
      x = interpolate(p, [0, 1], [panAmt * 0.3, -panAmt * 0.3]);
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
