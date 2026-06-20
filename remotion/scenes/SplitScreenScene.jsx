import React from 'react';
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  interpolate,
  staticFile,
  useCurrentFrame
} from 'remotion';
import { AnimationScene } from './AnimationScene.jsx';

const LABELS = {
  leftright: ['', ''],
  'ancient-modern': ['ANCIENT', 'MODERN'],
  'before-after': ['BEFORE', 'AFTER']
};

function Half({ asset, slideFrom, label }) {
  const frame = useCurrentFrame();
  const x = interpolate(frame, [0, 18], [slideFrom, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });

  const media =
    asset.type === 'video' ? (
      <OffthreadVideo
        src={staticFile(asset.src)}
        muted
        loop
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    ) : (
      <Img
        src={staticFile(asset.src)}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    );

  return (
    <div
      style={{
        position: 'relative',
        width: '50%',
        height: '100%',
        overflow: 'hidden',
        transform: `translateX(${x}%)`
      }}
    >
      {media}
      {label ? (
        <div
          style={{
            position: 'absolute',
            bottom: 80,
            left: 0,
            right: 0,
            textAlign: 'center',
            color: '#fff',
            fontFamily: 'Arial, sans-serif',
            fontWeight: 800,
            fontSize: 56,
            letterSpacing: 2,
            textShadow: '0 3px 18px rgba(0,0,0,0.9)'
          }}
        >
          {label}
        </div>
      ) : null}
    </div>
  );
}

/**
 * A left/right comparison. Variants relabel the two halves
 * (Ancient vs Modern, Before vs After). Falls back to a procedural scene if
 * fewer than two assets were resolved.
 */
export const SplitScreenScene = ({ assets = [], variant = 'leftright', durationInFrames, seed }) => {
  if (!assets[0] || !assets[1]) {
    return <AnimationScene kind="generic" durationInFrames={durationInFrames} seed={seed} />;
  }
  const [leftLabel, rightLabel] = LABELS[variant] || LABELS.leftright;

  return (
    <AbsoluteFill style={{ flexDirection: 'row', backgroundColor: '#000' }}>
      <Half asset={assets[0]} slideFrom={-100} label={leftLabel} />
      <Half asset={assets[1]} slideFrom={100} label={rightLabel} />
      {/* center divider */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: 0,
          bottom: 0,
          width: 6,
          marginLeft: -3,
          background: 'rgba(255,255,255,0.85)',
          boxShadow: '0 0 24px rgba(255,255,255,0.6)'
        }}
      />
    </AbsoluteFill>
  );
};
