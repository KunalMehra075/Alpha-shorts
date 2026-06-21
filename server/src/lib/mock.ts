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

// Mock WRITER: a topic → a flowing narration string (no breakdown).
export function generateMockNarration(topic: string, sceneCount = 5): string {
  const cleanTopic = topic.trim() || 'Untitled Topic';
  const lines: string[] = [];
  for (let i = 0; i < sceneCount; i++) {
    const r = pseudo(`${cleanTopic}:${i}`);
    const hook = HOOKS[Math.floor(r * HOOKS.length)];
    const body = BODIES[Math.floor(pseudo(`${cleanTopic}:b:${i}`) * BODIES.length)];
    lines.push(
      i === 0
        ? `${hook} ${cleanTopic} — ${body}`
        : `${hook} ${cleanTopic.split(' ')[0] || cleanTopic} ${body}`
    );
  }
  return lines.join(' ');
}

// Pull a couple of word-stems from a line for mock keywords.
function keywordsFromText(line: string, i: number): string[] {
  const base = line
    .toLowerCase()
    .split(/[^a-z0-9ऀ-ॿ]+/)
    .filter((w) => w.length > 3);
  const extras = [
    ['cinematic', 'aerial', 'closeup'],
    ['ancient', 'mystery', 'ruins'],
    ['science', 'animation', 'macro'],
    ['dramatic', 'lighting', 'slow motion'],
    ['nature', 'cosmos', 'abstract']
  ][i % 5];
  return [...base.slice(0, 2), extras[i % extras.length]].filter(Boolean);
}

// Mock SEO: deterministic titles/descriptions/tags from the topic.
export function generateMockSeo(topic: string) {
  const t = topic.trim() || 'This Topic';
  const tagBase = t.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return {
    titles: [
      `The Untold Truth About ${t} 🤯`,
      `${t}: What Nobody Tells You #shorts`,
      `You Won't Believe This About ${t}`
    ],
    descriptions: [
      `A 60-second deep dive into ${t}. Like & subscribe for daily facts!\n\n#shorts #facts #${tagBase}`,
      `Ever wondered about ${t}? Here's the surprising truth in under a minute. #shorts #didyouknow`
    ],
    tags: [t.toLowerCase(), 'shorts', 'facts', 'viral', 'youtube shorts', 'did you know', 'mystery', 'education']
  };
}

// Mock DIRECTOR: split a finished narration VERBATIM into scenes (one per
// sentence) with mock visual fields. Preserves the words exactly.
export function generateMockBreakdown(script: string, _sceneCount = 5): Scene[] {
  const sentences = String(script || '')
    .split(/(?<=[.?!।])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const chunks = sentences.length ? sentences : [String(script || '').trim() || 'Scene one.'];

  const sceneDuration = 3;
  return chunks.map((line, i) => {
    const visualType = VISUAL_CYCLE[i % VISUAL_CYCLE.length];
    const kws = keywordsFromText(line, i);
    return {
      scene: i + 1,
      start: i * sceneDuration,
      end: (i + 1) * sceneDuration,
      spokenLine: line,
      visualType,
      searchKeywords: kws,
      visualDescription: `${kws.join(', ')} — ${visualType.toLowerCase()} shot`,
      imagePrompt: `Ultra realistic, highly detailed ${kws.join(' ')}, cinematic lighting, dramatic composition, 9:16 vertical`
    };
  });
}
