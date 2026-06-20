import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion';
import { SceneTransition } from './components/SceneTransition.jsx';
import { ImageScene } from './scenes/ImageScene.jsx';
import { VideoScene } from './scenes/VideoScene.jsx';
import { AnimationScene } from './scenes/AnimationScene.jsx';
import { SplitScreenScene } from './scenes/SplitScreenScene.jsx';

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

export const ShortsVideo = ({ scenes = [], narration, music, transitionFrames = 15 }) => {
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

      {/* Narration is always the primary audio track. */}
      {narration ? <Audio src={staticFile(narration)} /> : null}

      {/* Optional background music, looped, underneath the narration. */}
      {music ? (
        <Audio src={staticFile(music.src)} volume={music.volume ?? 0.12} loop />
      ) : null}
    </AbsoluteFill>
  );
};
