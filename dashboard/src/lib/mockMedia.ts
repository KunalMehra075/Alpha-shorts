// Mock data + helpers used by the UI-first tabs (Audio / Caption / Video /
// Upload). Replaced by real engine calls in the functional phases.

import { placeholderDataUri } from './placeholder';

export type Voice = {
  id: string;
  name: string;
  accent: string;
  gender: 'Male' | 'Female';
  languages: string[];
};

export const VOICES: Voice[] = [
  { id: 'rachel', name: 'Rachel', accent: 'American', gender: 'Female', languages: ['en'] },
  { id: 'adam', name: 'Adam', accent: 'American', gender: 'Male', languages: ['en'] },
  { id: 'antoni', name: 'Antoni', accent: 'American', gender: 'Male', languages: ['en'] },
  { id: 'bella', name: 'Bella', accent: 'British', gender: 'Female', languages: ['en'] },
  { id: 'aarav', name: 'Aarav', accent: 'Indian', gender: 'Male', languages: ['hi', 'en'] },
  { id: 'isha', name: 'Isha', accent: 'Indian', gender: 'Female', languages: ['hi', 'en'] }
];

export type StockAsset = {
  id: string;
  kind: 'video' | 'image';
  source: 'pexels' | 'pixabay' | 'library';
  thumb: string;
  ratio: '9:16' | '16:9' | '1:1';
  label: string;
};

// Deterministic mock stock results for a set of keywords.
export function mockStockResults(keywords: string[], seedSalt = ''): StockAsset[] {
  const base = (keywords.join(' ') || 'abstract') + seedSalt;
  const sources: StockAsset['source'][] = ['pexels', 'pixabay', 'library'];
  const ratios: StockAsset['ratio'][] = ['9:16', '16:9', '1:1'];
  return Array.from({ length: 6 }).map((_, i) => {
    const kind: StockAsset['kind'] = i % 3 === 0 ? 'video' : 'image';
    const ratio = ratios[i % ratios.length];
    return {
      id: `${base}-${i}`,
      kind,
      source: sources[i % sources.length],
      ratio,
      thumb: placeholderDataUri(`${base}-${i}`, { ratio, accent: i % 4 === 0 }),
      label: keywords[i % Math.max(1, keywords.length)] || 'asset'
    };
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Mock SEO suggestions for the uploader.
export function mockSeo(topic: string) {
  const t = topic || 'This Topic';
  return {
    titles: [
      `The Untold Truth About ${t} 🤯`,
      `${t}: What Nobody Tells You #shorts`,
      `You Won't Believe This About ${t}`
    ],
    descriptions: [
      `A 60-second deep dive into ${t}. Like & subscribe for daily facts!\n\n#shorts #facts #${t.replace(/\s+/g, '')}`,
      `Ever wondered about ${t}? Here's the surprising truth in under a minute.`
    ],
    tags: [
      t.toLowerCase(),
      'shorts',
      'facts',
      'viral',
      'youtube shorts',
      'did you know',
      'mystery',
      'education'
    ]
  };
}
