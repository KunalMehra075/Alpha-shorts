# Session Handoff — shorts-generator

_Last updated: 2026-06-21_

A working snapshot for picking this project up in a fresh session. Read this first.

---

## 1. What this project is

Two things live in one repo:

1. **CLI engine** (`src/`, `remotion/`) — original Node tool: ElevenLabs narration,
   Whisper+FFmpeg karaoke caption overlays, and a Remotion `generate-video` pipeline.
   Still works standalone (`npm run gen-audio|gen-caption|generate-video|convert-va|cleanup`).
2. **Dashboard** (`server/` + `dashboard/`) — a local, single-user web app that wraps the
   engine behind a 6-step workflow. This is the active area of development.

The dashboard is the focus. The CLI engine is mostly reused by the dashboard server.

---

## 2. Architecture

- **Frontend** `dashboard/` — Vite + React 18 + TS + Tailwind + ShadCN-style components.
  Routing via react-router; server state via TanStack Query; light cross-page state via
  **zustand** (`editorStore`, persisted to localStorage).
- **Backend** `server/` — Express (TS via `tsx`). Filesystem persistence: one folder per
  workspace under `workspaces/<id>/` with a `workspace.json` manifest + media files.
  Reuses the CLI engine JS modules via ambient decls (`server/src/engine.d.ts`,
  imports like `../../../src/lib/elevenlabs.js`).
- **Run:** `npm run dash` (root) → Express on **:8787**, Vite on **:5173** (proxies
  `/api` + `/media`). Also `npm run dash:install`, `dash:server`, `dash:web`, `dash:build`.

### Stage / manifest pattern (how steps work)
- Manifest `stages` object: `script, audio, caption, assets, video, upload` (each
  `{status, updatedAt}`). `setStage()` + `writeManifest()` in `server/src/lib/store.ts`.
- Frontend `STAGE_TABS` + `Stages` in `dashboard/src/lib/types.ts` drive the Stepper and
  routes (`/w/:id/:tab`). Adding/splitting a step = update schema `stages` (+`emptyStages`),
  `types.ts`, `router.tsx`, and add a page.
- Per-stage backend: nested routers `server/src/routes/{script,audio,caption}.ts` mounted in
  `routes/workspaces.ts` under `/api/workspaces/:id/<stage>`; per-stage store mutators
  (`setCaptions`, `addAudioVersion`, …). API client + hooks: `dashboard/src/lib/{api,queries}.ts`.

---

## 3. The 6-step pipeline — current status

| # | Step | Tab/route | Status |
|---|------|-----------|--------|
| 1 | Script Generator | `script` | **Functional.** LLM via **strategy pattern** (`server/src/lib/llm/`): DeepSeek → OpenAI → mock fallback. Master prompt owns the JSON output contract; prompt templates are creative briefs that extend it. Versioning + restore. |
| 2 | Audio Generator | `audio` | **Functional.** Real ElevenLabs (`generateTake`), voices in `config/voices.json` (Allison/Kanika), model `eleven_multilingual_v2`. Upload, history, real player, ffprobe duration. |
| 3 | Caption Maker | `caption` | **Functional.** Whisper transcription → editable lines/SRT/JSON; style (incl. 0–100 vertical position slider); renders **two playable mp4s** (normal black + green) with narration audio muxed; live CSS preview; render uses edited lines + flushes settings + cache-busts video. |
| 4 | Assets | `assets` | **UI-only (mock).** Per-scene asset gather: stock suggestions (`mockStockResults`), keyword/prompt edit, mock upload, Asset Library. Persists selections to zustand `editorStore`. No AI-gen. |
| 5 | Video Editor | `video` | **UI-only (mock).** Auto timeline + random transitions, effect presets, square timeline cards with **transition SVG icons** (`components/TransitionIcon.tsx`) in connector circles, scene settings (2×2 grid), 9:16 red-bordered mock preview (no autoplay), audio/music/caption rows, mock render+gallery. |
| 6 | Video Uploader | `upload` | **UI-only (mock).** SEO fields + mock AI suggestions, platform targets (YouTube active, others "soon"), visibility, mock upload progress + URL. |

Dashboard Home (`HomePage`): workspace CRUD, recents, placeholder stats.

---

## 4. Key files

- Backend: `server/src/lib/{schema,store,audio,caption,voices,paths,fsx}.ts`,
  `server/src/lib/llm/*`, `server/src/routes/*`, `server/src/index.ts`.
- Engine (reused): `src/lib/{elevenlabs,whisper,ass-generator,ffmpeg,assets,asset-cache,timeline,remotion-render}.js`, `remotion/*`.
- Frontend pages: `dashboard/src/pages/{HomePage,ScriptPage,AudioPage,CaptionPage,AssetPage,VideoEditorPage,UploadPage,TemplatesPage}.tsx`.
- Frontend libs: `dashboard/src/lib/{types,api,queries,editorStore,editorOptions,mockMedia,placeholder,utils,theme}.ts(x)`.
- Components: `dashboard/src/components/{Stepper,StatusBadge,TabHeader,PhoneFrame,ThemeToggle,TransitionIcon,ui/*}.tsx`.
- Config: `config/{default.json,voices.json,caption-styles.json,prompt-templates.json,video-gen.json}`.
- Plan for the assets/video split: `~/.claude/plans/temporal-stargazing-catmull.md`.
- Future editor spec: `docs/future-asset-video-split.md`.

---

## 5. Design system (locked)
- Themes: **light + dark only**. Palette: **white / black / red / gray** — red is the only accent.
- Primary buttons: **glossy red-gradient pill** (`.btn-red-gradient`, `Button variant="primary"`).
- Caption rendering shared idea reused in previews (CSS) + ASS engine for real overlays.

---

## 6. Environment / external deps (`.env` at repo root; server loads it)
- `ELEVENLABS_API_KEY` (audio). ⚠️ Account currently has a **billing/payment issue** → real
  audio gen returns 401 until resolved; the integration itself is verified correct.
- `DEEPSEEK_API_KEY`, `OPENAI_API_KEY` (script). ⚠️ **Not set in `.env` yet** → script falls
  back to mock. Add them to get real DeepSeek-first generation. Optional `*_MODEL`, `*_BASE_URL`.
- `PEXELS_API_KEY`, `PIXABAY_API_KEY` (assets — used only when Assets goes functional).
- `FFMPEG_BIN`/`FFPROBE_BIN` → must point to **ffmpeg-full** (has libass); `WHISPER_BIN` →
  `whisper-ctranslate2`. Both confirmed installed on this machine.

---

## 7. Working conventions (important)
- **Verify by running**: typecheck (`npm run typecheck` in server + dashboard) + `npm run build`
  (dashboard), then boot + real smoke test, then a headless-Chrome **screenshot** for UI work
  (`puppeteer-core` installed temporarily, system Chrome at `/Applications/Google Chrome.app`,
  uninstalled + screenshots/test workspaces cleaned up after). Theme set via
  `localStorage.setItem('shorts-theme','dark')`.
- **Stale-server gotcha**: a prior `tsx` server often stays bound to :8787. Before smoke tests,
  `pkill -f tsx` and confirm `0`, then restart — otherwise you test OLD code (bit us repeatedly).
- **rtk shell proxy** truncates large piped output (you'll see `(N bytes total)` + a JSON parse
  error in inline `node -e`); write responses to a file and read fields instead.
- Leave the user-created workspace **`test-e3r6po`** untouched when cleaning test data.
- Some files were hand-edited by the user (Stepper.tsx, VideoPage→removed, config.js debug logs,
  `.env`/`.env.example`, VideoEditorPage). Don't revert intentional user changes.

---

## 8. Suggested next steps (not yet done)
1. **Functional Assets (step 4):** real `searchAssets`/`downloadAsset` (`src/lib/assets.js`,
   `asset-cache.js`) behind `/api/workspaces/:id/assets/*`; persist selections to a manifest
   `assets` section (migrate off the zustand-only store); optional AI image gen (higgsfield MCP
   `generate_image` is available, or OpenAI images).
2. **Functional Video Editor (step 5):** `@remotion/player` live preview + server render via an
   adapted `buildTimeline` (consume pre-chosen assets, effects, transitions) + `renderVideo`,
   compositing **captions** (native Remotion caption layer reusing lines+style) + narration +
   optional music; persist timeline + renders to the manifest.
3. **Functional Uploader (step 6):** YouTube OAuth + Data API upload, real SEO via the LLM.
4. Migrate `editorStore` (localStorage) → manifest persistence once steps 4/5 are functional.

---

## 9. Quick start for next session
```bash
npm run dash            # boots server :8787 + web :5173 → http://localhost:5173
# add keys to .env first for real script/audio:
#   DEEPSEEK_API_KEY=...  OPENAI_API_KEY=...  (ELEVENLABS_API_KEY needs billing fixed)
```
Pipeline 1–3 are functional; 4–6 are polished mock UIs awaiting wiring.
