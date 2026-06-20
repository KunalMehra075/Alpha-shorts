import React from 'react';
import { Composition } from 'remotion';
import { ShortsVideo } from './Video.jsx';

// Placeholder props for Remotion Studio / before real inputProps arrive. The
// real timeline is injected at render time and calculateMetadata adopts its
// dimensions, fps and duration.
const fallbackProps = {
  width: 1080,
  height: 1920,
  fps: 30,
  durationInFrames: 300,
  transitionFrames: 15,
  narration: null,
  music: null,
  scenes: []
};

export const RemotionRoot = () => {
  return (
    <Composition
      id="ShortsVideo"
      component={ShortsVideo}
      durationInFrames={fallbackProps.durationInFrames}
      fps={fallbackProps.fps}
      width={fallbackProps.width}
      height={fallbackProps.height}
      defaultProps={fallbackProps}
      calculateMetadata={({ props }) => ({
        durationInFrames: Math.max(1, Math.round(props.durationInFrames || 1)),
        fps: props.fps || 30,
        width: props.width || 1080,
        height: props.height || 1920
      })}
    />
  );
};
