// Canonical scene scale/pan model, shared by the image and video scenes so the
// dashboard preview (which mirrors this exact formula) and the render look the
// same.
//
// `zoom` is the Scene-settings slider (0–100). It maps to a static base scale:
//   50 → 1× (cover/original), 100 → 2×, 0 → ½×   via   2^((zoom-50)/50).
// On top of the base, the effect applies a small animated Ken Burns travel
// (zoomAmt) and pan (driven by `intensity`), with a touch of overscan so pans
// never reveal the frame edges.

export function motionMultiplier(motion) {
  return motion === 'subtle' ? 0.6 : motion === 'energetic' ? 1.6 : 1.0;
}

export function sceneTransform(effect, p, opts = {}) {
  const zoom = opts.zoom ?? 50;
  const intensity = opts.intensity ?? 50;
  const motion = opts.motion ?? 'cinematic';

  const base = Math.pow(2, (zoom - 50) / 50); // 50→1, 100→2, 0→0.5
  const mm = motionMultiplier(motion);
  const zoomAmt = 0.12 * mm; // animated zoom travel over the scene
  const pan = 4 * (intensity / 50) * mm; // % pan each side
  const edge = 1 + (Math.abs(pan) * 1.5) / 100; // overscan to hide pan edges

  let scale = base * edge;
  let x = 0;
  let y = 0;

  switch (effect) {
    case 'kenburns-out':
      scale = base * edge * (1 + zoomAmt * (1 - p));
      x = pan * 0.3 * (2 * p - 1);
      break;
    case 'zoom-out':
      scale = base * edge * (1 + zoomAmt * (1 - p));
      break;
    case 'pan-left':
      scale = base * edge;
      x = pan * (1 - 2 * p);
      break;
    case 'pan-right':
      scale = base * edge;
      x = -pan * (1 - 2 * p);
      break;
    case 'parallax':
      scale = base * edge * (1 + zoomAmt * 0.6 * p);
      y = pan * 0.6 * (1 - 2 * p);
      break;
    case 'drift':
      scale = base * edge * (1 + zoomAmt * 0.3);
      x = pan * 0.5 * (2 * p - 1);
      break;
    case 'kenburns-in':
      scale = base * edge * (1 + zoomAmt * p);
      x = pan * 0.3 * (1 - 2 * p);
      break;
    case 'zoom-in':
    default:
      scale = base * edge * (1 + zoomAmt * p);
      break;
  }

  return { scale, x, y };
}
