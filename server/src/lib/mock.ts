import type { Scene, VisualType } from './schema';

// Deterministic mock script generator. Produces a realistic voiceover + scene
// breakdown derived from the topic so the full UX can be built and reviewed
// before a real LLM is wired in (Phase 6). Output schema is a superset of the
// renderer's scene-scripts/*.json format.

const VISUAL_CYCLE: VisualType[] = ['Video', 'Animation', 'SplitScreen', 'Image'];

const HOOKS = [
  'Here is something almost nobody knows about',
  'Scientists were stunned when they studied',
  'There is a hidden truth behind',
  'Most people get this completely wrong about',
  'What if everything you knew about'
];

const BODIES = [
  'changed the way we understand the world.',
  'has puzzled experts for generations.',
  'turns out to be far stranger than fiction.',
  'connects ancient wisdom with modern science.',
  'is finally starting to make sense.'
];

function pseudo(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 0xffffffff;
}

function keywordsFor(topic: string, i: number): string[] {
  const base = topic
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const extras = [
    ['cinematic', 'aerial', 'closeup'],
    ['ancient', 'mystery', 'ruins'],
    ['science', 'animation', 'macro'],
    ['dramatic', 'lighting', 'slow motion'],
    ['nature', 'cosmos', 'abstract']
  ][i % 5];
  return [...base.slice(0, 2), extras[i % extras.length]].filter(Boolean);
}

export function generateMockScript(topic: string, sceneCount = 5) {
  const cleanTopic = topic.trim() || 'Untitled Topic';
  const sceneDuration = 3;
  const scenes: Scene[] = [];
  const lines: string[] = [];

  for (let i = 0; i < sceneCount; i++) {
    const r = pseudo(`${cleanTopic}:${i}`);
    const hook = HOOKS[Math.floor(r * HOOKS.length)];
    const body = BODIES[Math.floor(pseudo(`${cleanTopic}:b:${i}`) * BODIES.length)];
    const spokenLine =
      i === 0
        ? `${hook} ${cleanTopic} — ${body}`
        : `${hook} ${cleanTopic.split(' ')[0] || cleanTopic} ${body}`;

    lines.push(spokenLine);

    const visualType = VISUAL_CYCLE[i % VISUAL_CYCLE.length];
    const kws = keywordsFor(cleanTopic, i);

    scenes.push({
      scene: i + 1,
      start: i * sceneDuration,
      end: (i + 1) * sceneDuration,
      spokenLine,
      visualType,
      searchKeywords: kws,
      visualDescription: `${kws.join(', ')} — ${visualType.toLowerCase()} shot illustrating "${cleanTopic}"`,
      imagePrompt: `Ultra realistic, highly detailed ${kws.join(' ')}, cinematic lighting, dramatic composition, 9:16 vertical, related to ${cleanTopic}`
    });
  }

  return {
    voiceoverScript: lines.join(' '),
    scenes
  };
}
