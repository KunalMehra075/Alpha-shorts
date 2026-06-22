import React from 'react';
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { AnimationScene } from './AnimationScene.jsx';
import { sceneTransform } from '../lib/sceneMotion.js';

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

  // Canonical scale/pan, shared with the dashboard preview (see lib/sceneMotion).
  const { scale, x, y } = sceneTransform(effect, p, { zoom, intensity, motion });

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
