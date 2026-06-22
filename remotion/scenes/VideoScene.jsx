import React from 'react';
import {
  AbsoluteFill,
  OffthreadVideo,
  interpolate,
  staticFile,
  useCurrentFrame
} from 'remotion';
import { AnimationScene } from './AnimationScene.jsx';
import { sceneTransform } from '../lib/sceneMotion.js';

/**
 * A stock video clip, auto-cropped to fill 9:16 (objectFit: cover) with a mild
 * cinematic zoom. Loops if the clip is shorter than the scene duration.
 */
export const VideoScene = ({
  asset,
  effect = 'zoom-in',
  durationInFrames,
  seed,
  zoom = 50,
  intensity = 50,
  motion = 'cinematic'
}) => {
  const frame = useCurrentFrame();

  if (!asset || !asset.src) {
    return <AnimationScene kind="generic" durationInFrames={durationInFrames} seed={seed} intensity={intensity} />;
  }

  const p = interpolate(frame, [0, Math.max(1, durationInFrames)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });

  // Canonical scale/pan, shared with the dashboard preview (see lib/sceneMotion).
  const { scale, x } = sceneTransform(effect, p, { zoom, intensity, motion });

  // Optional trim window (frame offsets into the source). When present we play
  // exactly that slice; otherwise loop a short clip to fill the scene.
  const hasTrim =
    Number.isFinite(asset.trimStartFrames) || Number.isFinite(asset.trimEndFrames);
  const trimProps = hasTrim
    ? {
        startFrom: Math.max(0, Math.round(asset.trimStartFrames || 0)),
        ...(Number.isFinite(asset.trimEndFrames) ? { endAt: Math.round(asset.trimEndFrames) } : {})
      }
    : { loop: true };

  return (
    <AbsoluteFill style={{ backgroundColor: '#000', overflow: 'hidden' }}>
      <OffthreadVideo
        src={staticFile(asset.src)}
        muted
        {...trimProps}
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
