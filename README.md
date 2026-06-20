# shorts-generator

Automates **two** steps of a YouTube Shorts workflow:

1. **Audio generation** — turns your script `.txt` files into narration MP3s using the **ElevenLabs** API.
2. **Caption overlays** — transcribes the narration with **Whisper** (local, free) and renders **transparent 1080×1920 karaoke caption overlays** with **FFmpeg**, ready to drop on top of your anime clips in any editor.

It deliberately does **not** do script writing, video editing, anime clip handling, or YouTube uploads — you handle those.

```
videoscripts/attack-on-titan.txt
        │  npm run gen-audio
        ▼
generated-audio/attack-on-titan.mp3
        │  npm run gen-caption
        ▼
generated-subtitles/attack-on-titan.json   (Whisper word timings)
generated-subtitles/attack-on-titan.ass    (karaoke subtitles)
caption-overlays/attack-on-titan-overlay.mov  (transparent overlay)
```

---

## Quick start

```bash
# 1. Install Node deps
npm install

# 2. Scaffold folders + create .env + a sample script
npm run setup

# 3. Verify ffmpeg / whisper are installed and keys are set
npm run doctor

# 4. Add your keys to .env, drop scripts into videoscripts/, then:
npm run gen-audio
npm run gen-caption
```

The only things **you** provide:

1. ElevenLabs **API key**
2. ElevenLabs **Voice ID**
3. Your **script `.txt` files**

---

## Requirements

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | **22+** | runtime |
| FFmpeg + ffprobe | recent | render transparent overlays |
| Whisper (local) | openai-whisper **or** whisper-ctranslate2 | word-level subtitles |
| Python | 3.8–3.12 | required by Whisper |

No paid caption services are used. Whisper runs entirely on your machine.

### Install FFmpeg

```bash
# macOS (Homebrew) — IMPORTANT: the regular "ffmpeg" formula is built WITHOUT
# libass, so it cannot render captions. Use "ffmpeg-full":
brew install ffmpeg-full
# ffmpeg-full is keg-only, so point the project at it (see "Configuration"):
#   FFMPEG_BIN=/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg
#   FFPROBE_BIN=/opt/homebrew/opt/ffmpeg-full/bin/ffprobe

# Ubuntu / Debian (includes libass)
sudo apt update && sudo apt install ffmpeg

# Windows (winget — full build includes libass)
winget install Gyan.FFmpeg
```

Verify: `ffmpeg -version` and `ffprobe -version`.

> **FFmpeg must include libass.** Captions are rendered with the `ass` filter,
> which requires libass. Check with:
> ```bash
> ffmpeg -filters | grep " ass "      # should print a line for the "ass" filter
> ```
> If nothing prints, your build lacks libass. On macOS use `brew install
> ffmpeg-full` and set `FFMPEG_BIN`/`FFPROBE_BIN`. `npm run doctor` checks this
> for you.

### Install Whisper

**Option A — official OpenAI Whisper (default):**

```bash
pip install -U openai-whisper
```

You also need FFmpeg (above). First run downloads the model (e.g. ~140 MB for `base`).

**Option B — faster-whisper (much faster on CPU, same CLI flags):**

```bash
pip install -U whisper-ctranslate2
```

Then set `WHISPER_BIN=whisper-ctranslate2` in `.env`.

Verify: `whisper --help` (or `whisper-ctranslate2 --help`).

> On Apple Silicon, the official Whisper runs on CPU. `whisper-ctranslate2` is noticeably faster — recommended.

---

## Setup

1. Copy env and fill it in (or run `npm run setup`, which does this for you):

   ```bash
   cp .env.example .env
   ```

2. Edit `.env`:

   ```env
   ELEVENLABS_API_KEY=sk_...
   ELEVENLABS_VOICE_ID=your_voice_id
   ELEVENLABS_MODEL_ID=eleven_multilingual_v2
   ```

   - **API key:** ElevenLabs → Settings → API Keys.
   - **Voice ID:** ElevenLabs → Voices → click a voice → copy its ID.

3. Add scripts. One `.txt` file per video:

   ```
   videoscripts/
    ├── attack-on-titan.txt
    └── jujutsu-kaisen.txt
   ```

---

## Commands

| Command | What it does |
|---------|--------------|
| `npm run convert-va -- <name>` | Extract the audio from `raw-videos/<name>.<ext>` → `generated-audio/<name>.mp3`. No `<name>` converts every video in `raw-videos/`. Use this instead of `gen-audio` when you already have a recorded narration video. |
| `npm run gen-audio` | Read every `videoscripts/*.txt` → ElevenLabs → `generated-audio/*.mp3` (English). Skips files that already have audio. |
| `npm run gen-audio <name>` | Process only `videoscripts/<name>.txt`. |
| `npm run gen-audio:hi <name>` | Same, but Hindi (`-hi`). `:en` also available. |
| `npm run gen-caption` | Read every `generated-audio/*.mp3` → Whisper word timings → karaoke `.ass` → transparent `caption-overlays/*-overlay.mov` (English, `base` model). Skips overlays that already exist. |
| `npm run gen-caption <name>` | Process only `generated-audio/<name>.mp3`. |
| `npm run gen-caption:hi <name>` | Same, but Hindi (`-hi`): `small` model + `hindi` preset. `:en` also available. |
| `npm run gen-caption:green <name>` | Green-screen output (`.mp4`) instead of transparent. `gen-caption:green:hi` for Hindi green screen. |
| `npm run gen-caption -- --force` | Re-transcribe and re-render even if outputs exist (works with `<name>` / `-hi` / `--green` too). |
| `npm run generate-video <script.json>` | **Automated video.** Turn a scene-script JSON into a finished 1080×1920 MP4 (stock-asset search + Remotion render). See [Automated video generation](#automated-video-generation-remotion). |
| `npm run cleanup` | Delete everything in `caption-overlays/` and `generated-subtitles/` (keeps `.gitkeep`). Pass a `<name>` to remove only that item's artifacts. |
| `npm run setup` | Create folders, `.env`, and a sample script. |
| `npm run doctor` | Check Node / FFmpeg / Whisper / env vars. |

With **no argument**, both commands process every matching file in the folder.
With a **filename argument**, they process just that one file:

```bash
npm run gen-audio attack-on-titan      # -> videoscripts/attack-on-titan.txt -> generated-audio/attack-on-titan.mp3
npm run gen-caption attack-on-titan    # -> generated-audio/attack-on-titan.mp3 -> caption-overlays/attack-on-titan-overlay.mov
npm run gen-caption attack-on-titan -- --force   # re-render just this one
```

Notes on the filename argument:

- Use the **base name** (no extension). A trailing `.txt`/`.mp3` is also accepted
  and stripped, so `attack-on-titan` and `attack-on-titan.txt` are equivalent.
- **Spaces and special characters** are supported — quote the name:
  `npm run gen-audio "my video (part 1)"`.
- If the file doesn't exist, the command exits with a clear error that lists the
  available names in that folder.

Both commands log progress to the console and write detailed logs to `logs/`.

### Use your own narration video instead of ElevenLabs

If you already recorded the narration as a video, drop it in `raw-videos/` and
extract its audio — then run captions on it. No ElevenLabs needed:

```bash
# raw-videos/attack-on-titan.mp4  (any of: mp4 mov mkv webm avi m4v flv wmv mpg ts)
npm run convert-va -- attack-on-titan     # -> generated-audio/attack-on-titan.mp3
npm run gen-caption attack-on-titan       # -> caption-overlays/attack-on-titan-overlay.mov
```

`convert-va` matches the base name against any video extension in `raw-videos/`,
skips files whose `.mp3` already exists (use `--force` to redo), supports spaces
(`npm run convert-va -- "my clip"`), and converts every video when given no name.

---

## Using the overlays in your editor

The output `*-overlay.mov` files are **ProRes 4444 with a real alpha channel** — the background is fully transparent, only the captions are visible. In your editor:

1. Place your anime clip on the bottom track.
2. Place the `-overlay.mov` on the track above it.
3. Add the matching narration MP3 (or use the audio you already have).

Everything is sized to **1080×1920** and timed to the narration automatically.

---

## Caption styling

Styles live in `config/caption-styles.json`. Pick the active one in
`config/default.json` (`captions.activeStyle`) or via `CAPTION_STYLE` in `.env`.

Presets included:

| Preset | Language | Look |
|--------|----------|------|
| `hormozi` | English | Big bold centered all-caps, yellow word highlight, thick black outline. |
| `tiktok` | English | Bottom-positioned, cyan highlight, medium outline. |
| `minimal` | English | Clean white, thin outline, no highlight color change. |
| `hindi` | Hindi | Bold centered Devanagari (Noto Sans Devanagari), yellow word highlight. |
| `hindi-minimal` | Hindi | Bottom-positioned Devanagari, cyan highlight, thin outline. |

The active preset is chosen automatically from `LANGUAGE` (see **Multilingual**
below); set `CAPTION_STYLE` to override.

Every field is configurable per preset:

| Field | Meaning |
|-------|---------|
| `fontFamily` | Font name as installed on your system (libass uses system fonts). |
| `fontSize` | Pixel height at 1080×1920. |
| `textColor` | Normal word color (`#RRGGBB`). |
| `highlightColor` | Color of the word currently being spoken (karaoke). |
| `strokeColor` / `strokeWidth` | Text outline (stroke) color and thickness — e.g. `"#000000"` + `8` for a bold black stroke. |
| `shadowColor` / `shadowBlur` | Drop-shadow color and softness. |
| `position` | `top` \| `center` \| `bottom`. |
| `bottomPadding` | Distance (px) from the bottom (or top, when `position: top`). |
| `lineSpacing` | Reserved. Captions render one line at a time (single line per caption) so they stay at one fixed vertical position, so this currently has no effect. |
| `maxWordsPerLine` | Max words per line (a line also wraps early if it would overflow the frame width). |
| `uppercase` | Force ALL CAPS. |
| `bold` | Bold weight. |

> **Fonts:** the font you name must be installed on the machine running FFmpeg.
> If a font is missing, libass falls back silently to a default — install the
> font (e.g. "Anton", "Montserrat") or change `fontFamily` to one you have.

### Changing the font

1. Pick a font name and set `fontFamily` in the preset you use
   (`config/caption-styles.json`), e.g. `"fontFamily": "Anton"`.
2. The font must be **installed** so libass (via fontconfig) can find it:
   ```bash
   # macOS: drop the .ttf in ~/Library/Fonts, then:
   fc-list | grep -i "anton"     # confirm the exact family name
   ```
   On Linux, install to `~/.fonts` or via your package manager.
3. Use the **exact family name** fontconfig reports (left of the `:` in `fc-list`).

Good Shorts fonts: **Anton**, **Bebas Neue**, **Montserrat Black**, **Poppins**,
**Komika Axis**, **The Bold Font**.

### Word highlighting (karaoke)

Captions are karaoke-style using Whisper's word-level timings: the word being
spoken switches to `highlightColor` while the rest of the line stays in
`textColor`. One line is shown at a time and absolutely positioned, so every
caption stays at the exact same vertical spot (`position` + `bottomPadding`)
instead of drifting up/down.

### Enter / exit animation

Each caption line animates in when it appears and out when it leaves. Configure
globally in `config/default.json` → `captions.animation`, or per preset by
adding an `animation` object to that preset:

```jsonc
"animation": {
  "enter": "pop",         // pop | fade | slide | none
  "exit":  "pop",
  "enterDuration": 120,   // milliseconds
  "exitDuration":  90
}
```

- **pop** — scales up on enter, shrinks + fades on exit (default).
- **fade** — opacity fade in/out.
- **slide** — slides up into place / drifts up out.
- **none** — no animation.

### Background: transparent vs green screen

```bash
npm run gen-caption attack-on-titan          # transparent .mov (ProRes 4444, alpha)
npm run gen-caption:green attack-on-titan     # green-screen .mp4 (H.264)
```

| Mode | Output | Use it when |
|------|--------|-------------|
| `transparent` (default) | `<name>-overlay.mov` | Best quality — drop straight on your clip, no keying, no green spill. |
| `greenscreen` | `<name>-overlay.mp4` | Your editor keys chroma better than alpha; smaller files. Key out the green (`#00FF00`). |

Set it persistently in `config/default.json` → `video.background`
(`transparent` | `greenscreen`), or per run with `--green` / `--transparent`
(via `npm run gen-caption -- <name> --green`). The green color and H.264 quality
are configurable: `video.greenColor` (default `#00FF00`) and `video.greenCrf`
(default `18`, lower = higher quality).

---

## Multilingual (English + Hindi)

The project supports both English and Hindi content. The easiest way to choose
is a **per-command flag** — English is the default:

```bash
# English (default) — Whisper model: base
npm run gen-audio attack-on-titan
npm run gen-caption attack-on-titan

# Hindi — Whisper model: small, caption preset "hindi", Noto Sans Devanagari
npm run gen-audio:hi attack-on-titan
npm run gen-caption:hi attack-on-titan
```

The `:hi` / `:en` scripts simply pass a `-hi` / `-en` flag to the underlying
command. You can also pass the flag yourself — but because npm only forwards
dash-flags after `--`, use one of:

```bash
node src/gen-caption.js attack-on-titan -hi      # direct
npm run gen-caption -- attack-on-titan -hi       # via npm (note the --)
```

> **Why `:hi` scripts exist:** `npm run gen-caption attack-on-titan -hi`
> (without `--`) does **not** work — npm swallows the `-hi` flag. The `:hi`
> script avoids that, and the filename argument still forwards normally.

`-hi`/`-en` overrides the `LANGUAGE` env var, which overrides `config/default.json`.
`LANGUAGE=auto` (env) lets Whisper auto-detect. What the language controls:

| Area | Behavior |
|------|----------|
| **Audio (ElevenLabs)** | `eleven_multilingual_v2` narrates both English and Hindi directly from your script text — no extra setting needed. Use a multilingual voice. |
| **Transcription (Whisper)** | The transcription language follows the selected language; `auto`/blank auto-detects. The Whisper **model** is also auto-picked per language (en→`base`, hi→`small`). Override with `WHISPER_LANGUAGE` / `WHISPER_MODEL`. |
| **Captions (FFmpeg)** | Picks the caption preset mapped in `config/default.json` → `captions.byLanguage` (`en → hormozi`, `hi → hindi`). Override with `CAPTION_STYLE`. |

Per-language presets are configurable in `config/default.json`:

```jsonc
"captions": {
  "activeStyle": "",                         // explicit override; blank = pick by language
  "byLanguage": { "en": "hormozi", "hi": "hindi" }
}
```

### Hindi setup notes

- **Font (required for Devanagari):** the Hindi presets use **Noto Sans
  Devanagari**. Install it so FFmpeg/libass can find it:
  ```bash
  # macOS — recommended: static Regular + Bold (clean bold weight)
  curl -fsSL -o "$HOME/Library/Fonts/NotoSansDevanagari-Regular.ttf" \
    https://github.com/notofonts/notofonts.github.io/raw/main/fonts/NotoSansDevanagari/hinted/ttf/NotoSansDevanagari-Regular.ttf
  curl -fsSL -o "$HOME/Library/Fonts/NotoSansDevanagari-Bold.ttf" \
    https://github.com/notofonts/notofonts.github.io/raw/main/fonts/NotoSansDevanagari/hinted/ttf/NotoSansDevanagari-Bold.ttf
  # (the Homebrew cask `font-noto-sans-devanagari` also works, but installs a
  #  variable font whose bold weight may be synthesized)

  # Ubuntu/Debian
  sudo apt install fonts-noto-devanagari
  ```
  Verify: `fc-list | grep -i "noto sans devanagari"`.

- **Whisper model:** Hindi auto-uses the **`small`** model (the `base` model
  often transcribes Hindi audio into the wrong script). This is automatic when
  you use `-hi` / `gen-caption:hi`. For best accuracy set `WHISPER_MODEL=medium`.

- **Unicode / shaping:** rendering uses FFmpeg built with libass + **harfbuzz**
  (full Devanagari shaping — conjuncts and matras). `ffmpeg-full` on macOS
  includes this; `npm run doctor` reports library support.

Everything else — word-level karaoke highlighting, transparent overlays,
width-aware line wrapping — works identically for Hindi text.

## Other configuration

`config/default.json`:

```jsonc
{
  "elevenlabs": {
    "outputFormat": "mp3_44100_128",   // request format from ElevenLabs
    "voiceSettings": { "stability": 0.5, "similarityBoost": 0.75, "style": 0.0, "useSpeakerBoost": true }
  },
  "whisper": { "bin": "whisper", "model": "",
               "modelByLanguage": { "en": "base", "hi": "small" }, "language": "" },
  "video":   { "width": 1080, "height": 1920, "fps": 30,
               "codec": "prores_ks", "proresProfile": "4444", "pixelFormat": "yuva444p10le" },
  "captions": { "activeStyle": "", "byLanguage": { "en": "hormozi", "hi": "hindi" } }
}
```

Precedence: `config/default.json` < environment variables < CLI flags (`-hi`/`-en`).
Env overrides (see `.env.example`): `LANGUAGE`, `ELEVENLABS_OUTPUT_FORMAT`,
`WHISPER_BIN`, `WHISPER_MODEL`, `WHISPER_LANGUAGE`, `CAPTION_STYLE`.

**Whisper model** (`whisper.model`): leave blank to auto-pick by language via
`whisper.modelByLanguage` (en→`base`, hi→`small`). Set `whisper.model` or
`WHISPER_MODEL` to force one: `tiny`, `base`, `small`, `medium`, `large-v3`
(bigger = more accurate, slower).

**Alternative output codec:** to get smaller files for simple captions, set
`video.codec` to `qtrle` (QuickTime Animation, lossless with alpha) and
`video.pixelFormat` to `argb`. ProRes 4444 is the default for best editor compatibility.

---

## Project structure

```
shorts-generator/
├── package.json
├── .env.example
├── .gitignore
├── README.md
├── config/
│   ├── default.json          # runtime config
│   └── caption-styles.json   # caption presets (hormozi/tiktok/minimal)
├── src/
│   ├── convert-va.js         # command: npm run convert-va (video -> mp3)
│   ├── gen-audio.js          # command: npm run gen-audio
│   ├── gen-caption.js        # command: npm run gen-caption
│   ├── setup.js              # command: npm run setup
│   ├── doctor.js             # command: npm run doctor
│   └── lib/
│       ├── paths.js          # folder paths + ensureDirs()
│       ├── config.js         # config + env merge, style resolution
│       ├── logger.js         # console + file logging
│       ├── elevenlabs.js     # ElevenLabs TTS client
│       ├── whisper.js        # Whisper runner + word extraction
│       ├── ass-generator.js  # karaoke ASS subtitle builder
│       └── ffmpeg.js         # duration probe + transparent render
├── raw-videos/               # INPUT: raw videos to extract audio from
├── videoscripts/             # INPUT: your .txt scripts
├── generated-audio/          # OUTPUT/INPUT: narration .mp3
├── generated-subtitles/      # OUTPUT: .json (timings) + .ass + .mask.ass
├── caption-overlays/         # OUTPUT: transparent *-overlay.mov
└── logs/                     # per-run logs
```

---

## How it works

1. **`gen-audio`** POSTs each script to ElevenLabs
   `text-to-speech/{voiceId}` with your `modelId` and voice settings, then
   writes the returned MP3.
2. **`gen-caption`** runs Whisper with `--word_timestamps True --output_format json`
   to get per-word `{start,end}` times, builds two `.ass` files (a colored
   karaoke version and a white alpha-mask version), then renders a transparent
   ProRes 4444 overlay.

   > **Why two `.ass` files?** FFmpeg's `ass` filter draws text into the RGB
   > planes but does not write the alpha channel, so a naive single-pass render
   > comes out fully transparent (invisible). The renderer instead draws the
   > colored captions on black for RGB, draws an all-white copy on black for the
   > alpha mask, and `alphamerge`s them — giving correct per-pixel transparency
   > including anti-aliased outlines and soft shadows. You'll see
   > `<name>.ass` and `<name>.mask.ass` in `generated-subtitles/`.

   Lines wrap to fit the frame width automatically: `maxWordsPerLine` is an
   upper bound, but a line also breaks early if it would overflow horizontally.

---

## Troubleshooting

**`cannot render ASS subtitles (no "ass" filter)` / `No such filter: 'ass'`**
Your FFmpeg was built without libass. Reinstall a full build:
`brew reinstall ffmpeg` (macOS) or `sudo apt install ffmpeg` (Ubuntu). Confirm
with `ffmpeg -filters | grep " ass "` and `npm run doctor`.

**`Could not find "ffmpeg"` / `"whisper"`**
Not on PATH. Install (see above) and re-run `npm run doctor`. After installing
on macOS you may need a new terminal so PATH refreshes.

**`ELEVENLABS_API_KEY is not set`**
Fill in `.env`. Run `npm run setup` if you don't have a `.env` yet.

**ElevenLabs `401` / `403`**
Bad or missing API key, or the key lacks access to the chosen model.

**ElevenLabs `422` about `output_format`**
Your tier may not allow that format (e.g. 192 kbps needs a paid plan). Use
`mp3_44100_128` or set `ELEVENLABS_OUTPUT_FORMAT`.

**`No word-level timestamps found`**
Your Whisper build didn't emit word timings. Use `openai-whisper` or
`whisper-ctranslate2` (both support `--word_timestamps`). Very old versions don't.

**Whisper is slow**
Use a smaller model (`WHISPER_MODEL=base` or `tiny`) or switch to
`whisper-ctranslate2` (`WHISPER_BIN=whisper-ctranslate2`).

**Captions use the wrong font**
libass silently falls back when a font isn't installed. Install the font named
in your style, or set `fontFamily` to one you have (e.g. `Arial`, `Helvetica`).
For Hindi install **Noto Sans Devanagari** (see Multilingual → Hindi setup).

**Hindi captions appear in the wrong script (e.g. Urdu/Arabic) or romanized**
The Whisper `base` model is unreliable for Hindi. Set `WHISPER_MODEL=small`
(or `medium`) and `LANGUAGE=hi`, then re-run with `--force`.

**Devanagari shows tofu boxes □□□ or broken conjuncts**
Your FFmpeg lacks harfbuzz/libass shaping, or the font is missing. Use
`ffmpeg-full` (macOS) and install Noto Sans Devanagari. `npm run doctor` checks
libass support.

**Overlay looks opaque / black background in my editor**
Make sure your editor reads the alpha channel. ProRes 4444 `.mov` carries alpha;
some preview windows show a checkerboard — that's the transparency. If your tool
prefers it, switch `video.codec` to `qtrle` with `pixelFormat: argb`.

**Re-run from scratch**
Delete the relevant output file, or use `npm run gen-caption -- --force`.
Both commands skip work whose output already exists.

**Captions out of sync**
Word timings come from Whisper; a larger model (`small`/`medium`) improves
alignment on fast or noisy speech.

---

## Notes

- Filenames are matched by base name: `videoscripts/x.txt` →
  `generated-audio/x.mp3` → `caption-overlays/x-overlay.mov`.
- Re-running is safe and cheap: existing outputs are skipped (no duplicate
  ElevenLabs charges, no re-rendering) unless you pass `--force`.

---

## Automated video generation (Remotion)

Turn a **scene-script JSON** into a finished, vertical 1080×1920 MP4 — fully
automated. For each scene it searches stock providers (and your local library)
for the best matching clip/photo, downloads and caches it, lays everything onto
a frame-accurate timeline with motion + transitions, and renders the whole thing
with [Remotion](https://www.remotion.dev/). If nothing suitable is found for a
scene it falls back to a procedural animation, so **a render never fails for lack
of media**.

```bash
npm run generate-video scene-scripts/example.json
# → output/example.mp4
```

### Install

The Remotion toolchain ships as project dependencies — a normal install pulls it
in:

```bash
npm install
```

The **first render** also downloads a headless Chromium that Remotion uses to
render frames (one-time, automatic). FFmpeg from the rest of this project is
reused for muxing.

### API key setup

Add stock-provider keys to `.env` (both optional, but recommended — at least one
gives you real footage instead of only animations):

```bash
# .env
PEXELS_API_KEY=your_pexels_key      # https://www.pexels.com/api/
PIXABAY_API_KEY=your_pixabay_key    # https://pixabay.com/api/docs/
```

With **no keys**, the pipeline still works using `assets/library/` + procedural
animation scenes.

### Input format

A JSON array (or `{ "scenes": [...] }`) of scene objects:

| Field | Type | Meaning |
|-------|------|---------|
| `start` | number | Scene start in **seconds** |
| `end` | number | Scene end in **seconds** (`> start`) |
| `spokenLine` | string | The narration line (used to flavor animation fallbacks) |
| `visualType` | string | `Video` · `Image` · `Animation` · `SplitScreen` |
| `searchKeywords` | string[] | Keywords used to find an asset |

```json
[
  {
    "start": 0,
    "end": 3,
    "spokenLine": "Your brain has more connections than there are stars.",
    "visualType": "Video",
    "searchKeywords": ["brain neurons animation", "synapse network"]
  }
]
```

Pass a path, or just a name that resolves under `scene-scripts/`:

```bash
npm run generate-video scene-scripts/example.json
npm run generate-video example          # same file
```

### Narration & music

- **Narration** is matched automatically by name: `generate-video example` looks
  for `generated-audio/example.{mp3,wav,m4a}`. Generate it first with
  `npm run gen-audio example` (or `convert-va`). Narration is always the primary
  audio track. If none is found it renders silently with a warning.
- **Background music** is optional. Drop a track in `music/` and enable it:
  ```bash
  # .env
  VIDEO_GEN_MUSIC=ambient.mp3
  VIDEO_GEN_MUSIC_VOLUME=0.12
  ```
  It loops underneath the narration at the configured volume.

### Scene types

- **Image** — Ken Burns motion: zoom in/out, pan left/right, parallax.
- **Video** — auto-cropped to 9:16 (`objectFit: cover`) with a mild cinematic
  zoom; loops if shorter than the scene.
- **Animation** — procedural, no asset needed: particles, glow, question-mark
  reveal, science (nucleus/electrons), ancient-wisdom (mandala), generic motion
  graphics. The flavor is inferred from the scene's keywords / spoken line. This
  is also the universal fallback.
- **SplitScreen** — left/right comparison with variants: plain, Ancient vs
  Modern, Before vs After (needs two resolved assets).

Motion styles and transitions are varied automatically (no immediate repeats),
seeded deterministically per script so the same input renders the same output.

### Asset selection & caching

Search order: **1) local library → 2) Pexels → 3) Pixabay**. Candidates are
scored on relevance, resolution, orientation (portrait > landscape > square),
popularity, asset type (video preferred), with a large bonus for local-library
assets. Downloads are cached and reused:

```
cache/
 ├── videos/
 └── images/
```

A **local asset library** lets you force your own footage by topic — folder and
file names are matched against the keywords:

```
assets/library/
 ├── dwarka/
 ├── mahabharat/
 └── temple/
```

### Transitions

Fade · Zoom crossfade · Slide left · Slide right — 500ms, randomized per
boundary. Because scenes are placed on **absolute** timings to stay locked to the
narration, transitions are entrance animations on the incoming scene (keeping
audio/visual sync exact).

### Pipeline

```
scene.json
  → asset search (library / Pexels / Pixabay)
  → asset download + cache
  → timeline build (frame timings @ 30fps, motion + transitions)
  → assets staged into remotion/public/
  → Remotion composition (React)
  → render (Remotion + FFmpeg)
  → output/<name>.mp4
```

### Configuration

`config/video-gen.json` controls render settings, transitions, scoring weights,
and music defaults:

| Key | Meaning |
|-----|---------|
| `render` | `width`, `height`, `fps` (30), `codec` (`h264`), `crf` |
| `transitions` | `durationMs` (500) and the `types` pool |
| `assets.providers` | search order: `["library","pexels","pixabay"]` |
| `assets.perKeywordResults` | results to fetch per provider |
| `assets.scoring` | weights for relevance/resolution/orientation/popularity/etc |
| `music` | `enabled`, `track`, `volume` |

Environment overrides: `PEXELS_API_KEY`, `PIXABAY_API_KEY`, `VIDEO_GEN_MUSIC`,
`VIDEO_GEN_MUSIC_VOLUME`.

### Project structure (this module)

```
config/video-gen.json        # render / asset / music config
scene-scripts/*.json         # input scene scripts
cache/{videos,images}/       # downloaded, reused stock assets
assets/library/<topic>/      # your own local footage (highest priority)
music/                       # optional background tracks
output/                      # rendered <name>.mp4
remotion/                    # Remotion entry + React compositions
 ├── index.js · Root.jsx · Video.jsx
 ├── components/SceneTransition.jsx
 ├── scenes/{Image,Video,Animation,SplitScreen}Scene.jsx
 └── public/                 # assets staged per render (auto-managed)
src/generate-video.js        # CLI entry
src/lib/{assets,asset-cache,timeline,remotion-render,video-config}.js
```

Preview/iterate on the compositions in Remotion Studio:

```bash
npm run studio
```

### Notes & limits

- Scenes should be **contiguous** (`end` of one = `start` of the next); a gap
  renders as black.
- Stock APIs are rate-limited; the cache means repeat runs hit them far less.
- Procedural fallbacks are intentional — check the run log to see which scenes
  used a fallback and refine those `searchKeywords`.

## License

MIT
