import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useVideoConfig } from 'remotion';
import { SceneTransition } from './components/SceneTransition.jsx';
import { ImageScene } from './scenes/ImageScene.jsx';
import { VideoScene } from './scenes/VideoScene.jsx';
import { AnimationScene } from './scenes/AnimationScene.jsx';
import { SplitScreenScene } from './scenes/SplitScreenScene.jsx';
import { Captions } from './components/Captions.jsx';

function renderScene(scene) {
  const common = {
    durationInFrames: scene.durationInFrames,
    seed: scene.index,
    keywords: scene.keywords
  };
  switch (scene.visualType) {
    case 'video':
      return <VideoScene asset={scene.assets[0]} effect={scene.effect} {...common} />;
    case 'splitscreen':
      return (
        <SplitScreenScene
          assets={scene.assets}
          variant={scene.splitVariant}
          {...common}
        />
      );
    case 'animation':
      return <AnimationScene kind={scene.animationKind} {...common} />;
    case 'image':
    default:
      return <ImageScene asset={scene.assets[0]} effect={scene.effect} {...common} />;
  }
}

// Looped background music with optional fade in/out (0.8s ramps).
const MusicTrack = ({ music }) => {
  const { durationInFrames, fps } = useVideoConfig();
  const fade = Math.max(1, Math.round(0.8 * fps));
  const base = music.volume ?? 0.12;
  return (
    <Audio
      src={staticFile(music.src)}
      loop
      volume={(f) => {
        let v = base;
        if (music.fadeIn && f < fade) v *= f / fade;
        if (music.fadeOut && f > durationInFrames - fade) {
          v *= Math.max(0, (durationInFrames - f) / fade);
        }
        return Math.max(0, v);
      }}
    />
  );
};

export const ShortsVideo = ({ scenes = [], narration, music, transitionFrames = 15, captions }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {scenes.map((scene) => (
        <Sequence
          key={scene.index}
          from={scene.from}
          durationInFrames={scene.durationInFrames}
          name={`scene-${scene.index}-${scene.visualType}`}
        >
          <SceneTransition
            type={scene.transitionIn}
            durationInFrames={transitionFrames}
          >
            {renderScene(scene)}
          </SceneTransition>
        </Sequence>
      ))}

      {/* Caption overlay sits above the scenes (dashboard render only). */}
      {captions?.enabled && captions.lines?.length ? (
        <Captions lines={captions.lines} settings={captions.settings} />
      ) : null}

      {/* Narration is always the primary audio track. */}
      {narration ? <Audio src={staticFile(narration)} /> : null}

      {/* Optional background music, looped, underneath the narration. */}
      {music ? <MusicTrack music={music} /> : null}
    </AbsoluteFill>
  );
};
