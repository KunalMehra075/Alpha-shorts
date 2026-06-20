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
