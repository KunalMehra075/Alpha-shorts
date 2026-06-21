/**
 * Build an ASS (Advanced SubStation Alpha) subtitle file with karaoke-style
 * word highlighting from word-level timestamps.
 *
 * Design:
 *  - Words are packed into LINES of up to `maxWordsPerLine` words.
 *  - Each LINE is one page (shown on screen at once), so the active caption
 *    always sits at exactly one vertical position — it never drifts up/down as
 *    karaoke moves between stacked lines.
 *  - For each spoken word we emit one Dialogue event spanning that word's active
 *    time; the active word renders in `highlightColor`, the rest in `textColor`.
 *  - Each line is absolutely positioned with \pos so `position` and
 *    `bottomPadding` are honored exactly.
 */

const LINES_PER_PAGE = 1; // one line per page -> consistent vertical position
const SAFE_WIDTH_RATIO = 0.9; // use 90% of the frame width, ~5% margin each side

// "#RRGGBB" -> "BBGGRR" (ASS stores colors blue-green-red).
function toBGR(hex) {
  const h = hex.replace('#', '').trim();
  const r = h.slice(0, 2);
  const g = h.slice(2, 4);
  const b = h.slice(4, 6);
  return `${b}${g}${r}`.toUpperCase();
}

// Color for a Style field: &HAABBGGRR (AA alpha, 00 = opaque).
function styleColor(hex, alpha = '00') {
  return `&H${alpha}${toBGR(hex)}`;
}

// Color for an inline override tag, e.g. \1c&HBBGGRR&
function inlineColor(hex) {
  return `&H${toBGR(hex)}&`;
}

// seconds -> H:MM:SS.cc (centiseconds)
function fmtTime(t) {
  const total = Math.max(0, t);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const cs = Math.round((total - Math.floor(total)) * 100);
  // handle rounding to 100
  const cs2 = cs === 100 ? 99 : cs;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(
    cs2
  ).padStart(2, '0')}`;
}

function sanitize(text, uppercase) {
  const clean = text.replace(/[{}]/g, '').replace(/\\/g, '').trim();
  return uppercase ? clean.toUpperCase() : clean;
}

const DEVANAGARI = /[ऀ-ॿ]/;

// Rough per-character advance as a fraction of font size. Used to wrap lines so
// big fonts don't overflow the frame width (libass can't be measured from Node).
// Devanagari clusters render a bit wider per code point than Latin.
function charWidthFactor(uppercase, bold, devanagari) {
  let f = devanagari ? 0.62 : uppercase ? 0.62 : 0.55;
  if (bold) f += 0.03;
  return f;
}

/**
 * Greedily pack words into lines, then lines into pages. A line ends when it
 * hits `maxWordsPerLine` OR would exceed the safe pixel width — whichever first.
 */
function paginate(words, style, video) {
  const { maxWordsPerLine, fontSize, uppercase, bold } = style;
  const safeWidth = video.width * SAFE_WIDTH_RATIO;
  const devanagari = words.some((w) => DEVANAGARI.test(w.word));
  const perChar = fontSize * charWidthFactor(uppercase, bold, devanagari);
  const maxChars = Math.max(1, Math.floor(safeWidth / perChar));

  const len = (w) => (uppercase ? w.word.toUpperCase() : w.word).length;

  const lines = [];
  let line = [];
  let lineChars = 0;
  for (const w of words) {
    const wlen = len(w);
    const projected = lineChars + (line.length ? 1 : 0) + wlen;
    const tooMany = line.length >= maxWordsPerLine;
    const tooWide = line.length > 0 && projected > maxChars;
    if (tooMany || tooWide) {
      lines.push(line);
      line = [];
      lineChars = 0;
    }
    line.push(w);
    lineChars += (line.length > 1 ? 1 : 0) + wlen;
  }
  if (line.length) lines.push(line);

  const pages = [];
  for (let i = 0; i < lines.length; i += LINES_PER_PAGE) {
    pages.push(lines.slice(i, i + LINES_PER_PAGE));
  }
  return pages;
}

/**
 * Derive an all-white version of a style for the alpha-mask pass. Geometry
 * (font, size, outline, shadow, position) is identical so it lines up exactly
 * with the color pass; only the colors are forced to white so the mask covers
 * the full glyph + outline + shadow region.
 */
export function maskStyle(style) {
  return {
    ...style,
    textColor: '#FFFFFF',
    highlightColor: '#FFFFFF',
    strokeColor: '#FFFFFF',
    shadowColor: '#FFFFFF'
  };
}

const SLIDE_IN_PX = 40; // enter slide distance
const SLIDE_OUT_PX = 30; // exit slide distance
const POP_IN_SCALE = 55; // % to start from on a pop enter
const POP_OUT_SCALE = 90; // % to shrink to on a pop exit

/**
 * Build the position + enter/exit animation override for a single caption event.
 * Enter animation applies only to a line's first word event, exit only to its
 * last, so each line animates in once and out once (middle words are static).
 * Times in \t are relative to the event's own [start,end].
 */
function motionTags({ cx, cy, durMs, isFirst, isLast, anim }) {
  const enter = isFirst ? anim.enter || 'none' : 'none';
  const exit = isLast ? anim.exit || 'none' : 'none';
  const eIn = Math.max(1, Math.min(anim.enterDuration ?? 120, durMs));
  const eOut = Math.max(0, durMs - (anim.exitDuration ?? 90));

  let motion = `\\an5\\pos(${cx},${cy})`;
  let init = '';
  let t = '';

  if (enter === 'pop') {
    init += `\\fscx${POP_IN_SCALE}\\fscy${POP_IN_SCALE}`;
    t += `\\t(0,${eIn},\\fscx100\\fscy100)`;
  } else if (enter === 'fade') {
    init += '\\alpha&HFF&';
    t += `\\t(0,${eIn},\\alpha&H00&)`;
  } else if (enter === 'slide') {
    motion = `\\an5\\move(${cx},${cy + SLIDE_IN_PX},${cx},${cy},0,${eIn})`;
    init += '\\alpha&HFF&';
    t += `\\t(0,${eIn},\\alpha&H00&)`;
  }

  if (exit === 'pop') {
    t += `\\t(${eOut},${durMs},\\fscx${POP_OUT_SCALE}\\fscy${POP_OUT_SCALE}\\alpha&HFF&)`;
  } else if (exit === 'fade') {
    t += `\\t(${eOut},${durMs},\\alpha&HFF&)`;
  } else if (exit === 'slide') {
    if (enter !== 'slide') {
      motion = `\\an5\\move(${cx},${cy},${cx},${cy - SLIDE_OUT_PX},${eOut},${durMs})`;
    }
    t += `\\t(${eOut},${durMs},\\alpha&HFF&)`;
  }

  return `${motion}${init}${t}`;
}

/**
 * @param {object[]} words  [{word,start,end}]
 * @param {object}   style  resolved caption style preset
 * @param {object}   video  { width, height }
 * @returns {string} ASS file contents
 */
export function buildAss(words, style, video) {
  const { width, height } = video;
  const {
    fontFamily,
    fontSize,
    textColor,
    highlightColor,
    strokeColor,
    strokeWidth,
    shadowColor,
    shadowBlur = 0,
    position = 'bottom',
    positionY, // optional 0-100 (0 = top, 100 = bottom). Overrides `position`.
    bottomPadding = 0,
    lineSpacing = 0,
    uppercase = false,
    bold = false,
    animation = { enter: 'pop', exit: 'pop', enterDuration: 120, exitDuration: 90 }
  } = style;

  // ── Header ────────────────────────────────────────────────
  const shadowDepth = shadowBlur > 0 ? Math.max(2, Math.round(shadowBlur * 0.6)) : 0;
  const header = `[Script Info]
; Generated by shorts-generator
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 2
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,${fontFamily},${fontSize},${styleColor(textColor)},${styleColor(
    highlightColor
  )},${styleColor(strokeColor)},${styleColor(shadowColor)},${bold ? -1 : 0},0,0,0,100,100,0,0,1,${strokeWidth},${shadowDepth},5,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  // ── Layout math ───────────────────────────────────────────
  const centerX = Math.round(width / 2);
  const lineStep = fontSize + lineSpacing;

  // ── Build dialogue events ─────────────────────────────────
  const pages = paginate(words, style, video);
  const events = [];
  const blurTag = shadowBlur > 0 ? `\\blur${shadowBlur}` : '';

  for (const page of pages) {
    const numLines = page.length;
    const blockHeight = numLines * fontSize + (numLines - 1) * lineSpacing;

    let blockTop;
    if (typeof positionY === 'number') {
      // 0 = top, 100 = bottom. Keep a safe vertical margin at both edges.
      const margin = Math.round(height * 0.08);
      const avail = Math.max(0, height - 2 * margin - blockHeight);
      const frac = Math.min(100, Math.max(0, positionY)) / 100;
      blockTop = Math.round(margin + avail * frac);
    } else if (position === 'top') {
      blockTop = bottomPadding; // bottomPadding doubles as top padding
    } else if (position === 'center') {
      blockTop = Math.round((height - blockHeight) / 2);
    } else {
      blockTop = height - bottomPadding - blockHeight; // bottom
    }

    // Flatten page words so we can compute "next word start" across lines.
    const pageWords = page.flat();

    page.forEach((line, lineIndex) => {
      const lineCenterY = Math.round(
        blockTop + lineIndex * lineStep + fontSize / 2
      );

      line.forEach((activeWord, wordIndex) => {
        // active span: from this word's start until the next word starts
        const globalIndex = pageWords.indexOf(activeWord);
        const next = pageWords[globalIndex + 1];
        const start = activeWord.start;
        let end = next ? next.start : activeWord.end;
        if (end <= start) end = start + 0.05;
        const durMs = Math.max(1, Math.round((end - start) * 1000));

        // Enter on the line's first word, exit on its last word.
        const motion = motionTags({
          cx: centerX,
          cy: lineCenterY,
          durMs,
          isFirst: wordIndex === 0,
          isLast: wordIndex === line.length - 1,
          anim: animation
        });

        const rendered = line
          .map((w) => {
            const txt = sanitize(w.word, uppercase);
            if (w === activeWord) {
              return `{\\1c${inlineColor(highlightColor)}}${txt}{\\1c${inlineColor(
                textColor
              )}}`;
            }
            return txt;
          })
          .join(' ');

        const text = `{${motion}${blurTag}}${rendered}`;
        events.push(
          `Dialogue: 0,${fmtTime(start)},${fmtTime(
            end
          )},Caption,,0,0,0,,${text}`
        );
      });
    });
  }

  return header + events.join('\n') + '\n';
}
