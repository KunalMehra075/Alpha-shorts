// Deterministic, offline placeholder thumbnails as SVG data URIs (grayscale
// abstract art with an occasional red accent — stays within the app palette).
// Used for mock stock/asset suggestions until real providers are wired in.

function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: string) {
  let s = hash(seed) || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1000) / 1000;
  };
}

export function placeholderDataUri(
  seed: string,
  opts: { ratio?: '9:16' | '16:9' | '1:1'; accent?: boolean } = {}
): string {
  const r = rng(seed);
  const [w, h] =
    opts.ratio === '16:9' ? [320, 180] : opts.ratio === '1:1' ? [240, 240] : [180, 320];

  const g1 = 14 + Math.floor(r() * 30);
  const g2 = 40 + Math.floor(r() * 50);
  const shapes: string[] = [];
  const count = 3 + Math.floor(r() * 3);
  for (let i = 0; i < count; i++) {
    const cx = Math.floor(r() * w);
    const cy = Math.floor(r() * h);
    const rad = 20 + Math.floor(r() * 70);
    const tone = 60 + Math.floor(r() * 120);
    const op = (0.06 + r() * 0.14).toFixed(2);
    const fill =
      opts.accent && i === 0
        ? `rgba(220,40,40,${(0.25 + r() * 0.2).toFixed(2)})`
        : `rgba(${tone},${tone},${tone},${op})`;
    shapes.push(`<circle cx="${cx}" cy="${cy}" r="${rad}" fill="${fill}" />`);
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="rgb(${g1},${g1},${g1})"/>
      <stop offset="1" stop-color="rgb(${g2},${g2},${g2})"/>
    </linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#g)"/>
    ${shapes.join('')}
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
