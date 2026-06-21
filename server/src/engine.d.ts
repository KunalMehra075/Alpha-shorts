// Ambient types for the existing CLI engine (plain JS in ../src/lib), imported
// by the dashboard server. Kept loose on purpose — the engine is the source of
// truth at runtime; these just satisfy the type-checker.

declare module '*/lib/elevenlabs.js' {
  export function generateAudio(opts: {
    text: string;
    outPath: string;
    config: any;
    logger?: any;
  }): Promise<{ bytes: number }>;
}

declare module '*/lib/ffmpeg.js' {
  export function getDuration(filePath: string, config: any, logger?: any): Promise<number>;
  export function renderOverlay(opts: {
    assPath: string;
    maskPath: string;
    outPath: string;
    durationSec: number;
    config: any;
    logger?: any;
  }): Promise<void>;
}

declare module '*/lib/ass-generator.js' {
  export function buildAss(words: any[], style: any, video: any): string;
  export function maskStyle(style: any): any;
}

declare module '*/lib/assets.js' {
  export function searchAssets(opts: {
    keywords: string[];
    config: any;
    logger?: any;
  }): Promise<any[]>;
  export function searchAsset(opts: {
    keywords: string[];
    config: any;
    logger?: any;
  }): Promise<any | null>;
}

declare module '*/lib/asset-cache.js' {
  export function downloadAsset(opts: {
    url: string;
    kind: 'video' | 'image';
    config: any;
    logger?: any;
  }): Promise<{ path: string; cached: boolean }>;
  export function downloadFirstFitting(opts: {
    urls: string[];
    kind: 'video' | 'image';
    config: any;
    logger?: any;
  }): Promise<{ path: string; cached: boolean }>;
}

declare module '*/lib/remotion-render.js' {
  export function renderVideo(opts: {
    inputProps: any;
    config: any;
    outPath: string;
    logger?: any;
    onProgress?: (p: { phase: 'bundling' | 'rendering'; progress: number }) => void;
  }): Promise<string>;
}
