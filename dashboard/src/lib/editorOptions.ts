import type { VisualType } from './types';

// Transition library (per docs/future-asset-video-split.md).
export const TRANSITIONS = [
  'Fade',
  'Crossfade',
  'Zoom',
  'Slide Left',
  'Slide Right',
  'Push',
  'Blur Transition',
  'Scale Transition'
] as const;
export type Transition = (typeof TRANSITIONS)[number];

// Effects, grouped by what kind of asset a scene uses.
export const IMAGE_EFFECTS = [
  'Zoom In',
  'Zoom Out',
  'Pan Left',
  'Pan Right',
  'Ken Burns',
  'Parallax',
  'Slow Rotate',
  'Depth Effect'
] as const;

export const VIDEO_EFFECTS = [
  'Slow Zoom',
  'Crop and Scale',
  'Speed Adjustment',
  'Motion Blur',
  'Dynamic Focus'
] as const;

export const ANIMATION_EFFECTS = [
  'Particle Background',
  'Glow Effect',
  'Question Reveal',
  'Floating Elements',
  'Science Style Motion Graphics'
] as const;

export function effectsFor(visualType: VisualType): readonly string[] {
  if (visualType === 'Video') return VIDEO_EFFECTS;
  if (visualType === 'Animation') return ANIMATION_EFFECTS;
  if (visualType === 'SplitScreen') return IMAGE_EFFECTS;
  return IMAGE_EFFECTS;
}

export function defaultEffect(visualType: VisualType): string {
  return effectsFor(visualType)[0];
}

// One-click theme presets — each sets an effect (by asset type), a transition,
// and a motion style across every scene.
export type Preset = {
  name: string;
  description: string;
  transition: Transition;
  motionStyle: 'subtle' | 'cinematic' | 'energetic';
  effects: { image: string; video: string; animation: string };
};

export const PRESETS: Preset[] = [
  {
    name: 'Mystery',
    description: 'Slow, suspenseful pushes and crossfades',
    transition: 'Crossfade',
    motionStyle: 'cinematic',
    effects: { image: 'Ken Burns', video: 'Slow Zoom', animation: 'Glow Effect' }
  },
  {
    name: 'History',
    description: 'Documentary-style pans and fades',
    transition: 'Fade',
    motionStyle: 'subtle',
    effects: { image: 'Pan Left', video: 'Crop and Scale', animation: 'Floating Elements' }
  },
  {
    name: 'Science',
    description: 'Clean zooms and dynamic focus',
    transition: 'Zoom',
    motionStyle: 'energetic',
    effects: { image: 'Zoom In', video: 'Dynamic Focus', animation: 'Science Style Motion Graphics' }
  },
  {
    name: 'Space',
    description: 'Deep parallax and slow rotation',
    transition: 'Scale Transition',
    motionStyle: 'cinematic',
    effects: { image: 'Parallax', video: 'Slow Zoom', animation: 'Particle Background' }
  },
  {
    name: 'Technology',
    description: 'Snappy slides and motion blur',
    transition: 'Slide Left',
    motionStyle: 'energetic',
    effects: { image: 'Depth Effect', video: 'Motion Blur', animation: 'Question Reveal' }
  },
  {
    name: 'Ancient India',
    description: 'Warm Ken Burns and gentle blur',
    transition: 'Blur Transition',
    motionStyle: 'cinematic',
    effects: { image: 'Ken Burns', video: 'Slow Zoom', animation: 'Glow Effect' }
  }
];

export function presetEffect(preset: Preset, visualType: VisualType): string {
  if (visualType === 'Video') return preset.effects.video;
  if (visualType === 'Animation') return preset.effects.animation;
  return preset.effects.image;
}

// Deterministic transition picker (so a given scene gets a stable random pick).
function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function randomTransition(seed: string): Transition {
  return TRANSITIONS[hash(seed) % TRANSITIONS.length];
}
