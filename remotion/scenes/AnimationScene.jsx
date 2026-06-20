import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  random,
  spring,
  useCurrentFrame,
  useVideoConfig
} from 'remotion';

// Background gradient themes per animation kind.
const THEMES = {
  particles: ['#0f0c29', '#302b63', '#24243e'],
  glow: ['#1a2980', '#26d0ce'],
  question: ['#141e30', '#243b55'],
  science: ['#000428', '#004e92'],
  wisdom: ['#42275a', '#734b6d'],
  generic: ['#16222a', '#3a6073']
};

function Background({ colors }) {
  const [a, b, c] = colors;
  const gradient = c
    ? `linear-gradient(160deg, ${a} 0%, ${b} 55%, ${c} 100%)`
    : `linear-gradient(160deg, ${a} 0%, ${b} 100%)`;
  return <AbsoluteFill style={{ background: gradient }} />;
}

// ── Particle field ───────────────────────────────────────────────────────────
function Particles({ seed }) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const count = 70;
  return (
    <AbsoluteFill>
      {Array.from({ length: count }).map((_, i) => {
        const r = random(`${seed}-p-${i}`);
        const r2 = random(`${seed}-q-${i}`);
        const size = 4 + r * 10;
        const speed = 30 + r2 * 90;
        const x = r * width;
        const yStart = height + size;
        const y = (yStart - ((frame * (speed / 30)) % (height + 100)));
        const twinkle = 0.3 + 0.7 * Math.abs(Math.sin((frame + i * 12) / 18));
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: size,
              height: size,
              borderRadius: '50%',
              background: '#fff',
              opacity: twinkle * 0.8,
              filter: 'blur(0.5px)',
              boxShadow: `0 0 ${size}px rgba(255,255,255,0.8)`
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
}

// ── Pulsing glow orbs ────────────────────────────────────────────────────────
function Glow({ seed }) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const orbs = 5;
  return (
    <AbsoluteFill>
      {Array.from({ length: orbs }).map((_, i) => {
        const r = random(`${seed}-g-${i}`);
        const size = (0.4 + r * 0.5) * width;
        const cx = random(`${seed}-gx-${i}`) * width;
        const cy = random(`${seed}-gy-${i}`) * height;
        const pulse = 0.5 + 0.5 * Math.sin((frame + i * 40) / 25);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: cx - size / 2,
              top: cy - size / 2,
              width: size,
              height: size,
              borderRadius: '50%',
              background: `radial-gradient(circle, rgba(120,220,255,${0.35 *
                pulse}) 0%, rgba(120,220,255,0) 70%)`,
              transform: `scale(${0.8 + pulse * 0.4})`
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
}

// ── Animated question-mark reveal ────────────────────────────────────────────
function Question({ seed }) {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 12, mass: 0.6 } });
  const rings = 3;
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      {Array.from({ length: rings }).map((_, i) => {
        const delay = i * 10;
        const t = interpolate(frame - delay, [0, 40], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp'
        });
        const s = 0.4 + t * 1.6;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              width: width * 0.5,
              height: width * 0.5,
              borderRadius: '50%',
              border: '3px solid rgba(255,255,255,0.25)',
              transform: `scale(${s})`,
              opacity: (1 - t) * 0.8
            }}
          />
        );
      })}
      <div
        style={{
          fontSize: width * 0.45,
          fontWeight: 900,
          color: '#fff',
          fontFamily: 'Arial, sans-serif',
          textShadow: '0 0 40px rgba(120,200,255,0.9)',
          transform: `scale(${pop}) rotate(${(1 - pop) * -15}deg)`
        }}
      >
        ?
      </div>
    </AbsoluteFill>
  );
}

// ── Science visual: nucleus + orbiting electrons ─────────────────────────────
function Science({ seed }) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const cx = width / 2;
  const cy = height / 2;
  const orbits = 3;
  return (
    <AbsoluteFill>
      <svg width={width} height={height}>
        <defs>
          <radialGradient id="nuc" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#7fd8ff" />
            <stop offset="100%" stopColor="#1565c0" />
          </radialGradient>
        </defs>
        {Array.from({ length: orbits }).map((_, i) => {
          const rx = 180 + i * 150;
          const ry = 90 + i * 80;
          const rot = (frame * (12 + i * 6)) % 360;
          const ang = ((frame * (1.5 + i * 0.6)) % 360) * (Math.PI / 180);
          const ex = cx + Math.cos(ang) * rx;
          const ey = cy + Math.sin(ang) * ry;
          return (
            <g key={i} transform={`rotate(${i * 60} ${cx} ${cy})`}>
              <ellipse
                cx={cx}
                cy={cy}
                rx={rx}
                ry={ry}
                fill="none"
                stroke="rgba(127,216,255,0.35)"
                strokeWidth={2}
                transform={`rotate(${rot} ${cx} ${cy})`}
              />
              <circle cx={ex} cy={ey} r={14} fill="#7fd8ff" />
            </g>
          );
        })}
        <circle cx={cx} cy={cy} r={60} fill="url(#nuc)" />
      </svg>
    </AbsoluteFill>
  );
}

// ── Ancient wisdom: rotating mandala rays ────────────────────────────────────
function Wisdom({ seed }) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const cx = width / 2;
  const cy = height / 2;
  const rays = 24;
  const glow = 0.5 + 0.5 * Math.sin(frame / 20);
  return (
    <AbsoluteFill>
      <svg width={width} height={height}>
        <g transform={`rotate(${frame * 0.4} ${cx} ${cy})`}>
          {Array.from({ length: rays }).map((_, i) => {
            const a = (i / rays) * Math.PI * 2;
            const len = 520;
            const x2 = cx + Math.cos(a) * len;
            const y2 = cy + Math.sin(a) * len;
            return (
              <line
                key={i}
                x1={cx}
                y1={cy}
                x2={x2}
                y2={y2}
                stroke="rgba(255,215,140,0.18)"
                strokeWidth={3}
              />
            );
          })}
        </g>
        {[160, 260, 360].map((r, i) => (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="rgba(255,215,140,0.3)"
            strokeWidth={2}
            transform={`rotate(${frame * (i % 2 ? -0.6 : 0.6)} ${cx} ${cy})`}
          />
        ))}
        <circle
          cx={cx}
          cy={cy}
          r={70}
          fill="rgba(255,225,170,0.9)"
          style={{ filter: `blur(${4 + glow * 6}px)` }}
        />
      </svg>
    </AbsoluteFill>
  );
}

// ── Generic motion graphics: drifting geometric blobs ────────────────────────
function Generic({ seed }) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const shapes = 6;
  return (
    <AbsoluteFill>
      {Array.from({ length: shapes }).map((_, i) => {
        const r = random(`${seed}-s-${i}`);
        const size = (0.25 + r * 0.4) * width;
        const baseX = random(`${seed}-sx-${i}`) * width;
        const baseY = random(`${seed}-sy-${i}`) * height;
        const dx = Math.sin((frame + i * 50) / 40) * 60;
        const dy = Math.cos((frame + i * 30) / 50) * 60;
        const rot = frame * (0.2 + r * 0.4) * (i % 2 ? -1 : 1);
        const round = r > 0.5 ? '50%' : '24px';
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: baseX - size / 2 + dx,
              top: baseY - size / 2 + dy,
              width: size,
              height: size,
              borderRadius: round,
              background: `rgba(255,255,255,${0.05 + r * 0.06})`,
              border: '2px solid rgba(255,255,255,0.15)',
              transform: `rotate(${rot}deg)`
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
}

const RENDERERS = {
  particles: Particles,
  glow: Glow,
  question: Question,
  science: Science,
  wisdom: Wisdom,
  generic: Generic
};

/**
 * A fully procedural scene (no external asset). Used both for explicit
 * "Animation" scenes and as the universal fallback when no stock/library asset
 * can be found — so rendering never fails for lack of media.
 */
export const AnimationScene = ({ kind = 'generic', seed = 0 }) => {
  const Renderer = RENDERERS[kind] || Generic;
  const colors = THEMES[kind] || THEMES.generic;
  return (
    <AbsoluteFill>
      <Background colors={colors} />
      <Renderer seed={seed} />
    </AbsoluteFill>
  );
};
