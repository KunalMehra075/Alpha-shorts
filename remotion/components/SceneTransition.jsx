import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

/**
 * Applies an entrance transition over the first `durationInFrames` frames of a
 * scene. Because scenes are laid out on absolute timings (so they stay locked to
 * the narration), transitions are entrance animations on the incoming scene
 * rather than overlapping crossfades — this keeps audio/visual sync exact.
 *
 *   fade        – opacity in
 *   zoom        – opacity in + scale down from 1.15 (zoom crossfade feel)
 *   slide-left  – slides in from the right edge
 *   slide-right – slides in from the left edge
 */
export const SceneTransition = ({ type, durationInFrames, children }) => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();

  const t = interpolate(frame, [0, Math.max(1, durationInFrames)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });

  let style;
  switch (type) {
    case 'slide-left':
      style = { transform: `translateX(${(1 - t) * width}px)` };
      break;
    case 'slide-right':
      style = { transform: `translateX(${-(1 - t) * width}px)` };
      break;
    case 'zoom':
      style = {
        opacity: t,
        transform: `scale(${interpolate(t, [0, 1], [1.15, 1])})`
      };
      break;
    case 'fade':
    default:
      style = { opacity: t };
      break;
  }

  return <AbsoluteFill style={style}>{children}</AbsoluteFill>;
};
