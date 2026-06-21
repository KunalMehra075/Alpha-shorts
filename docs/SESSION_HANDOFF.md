# Session Handoff — shorts-generator

_Last updated: 2026-06-21 (Script↔Assets decoupled; Uploader SEO/metadata functional)_

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
| 4 | Assets | `assets` | **Functional.** Per-scene stock search via the engine (`searchAssets` → Pexels/Pixabay/library, gated on `PEXELS_API_KEY`/`PIXABAY_API_KEY`), select → downloads the file into `workspaces/<id>/assets/` (served via `/media`), manual upload, "Auto-fill all", Asset Library. Persisted to the **manifest** `assets` section (`server/src/lib/assets.ts` + `routes/assets.ts`). No AI-gen yet (Image Prompt is saved for later). |
| 5 | Video Editor | `video` | **Functional render.** Auto timeline + presets + transition icons + scene settings + CSS scrubber preview (reads real assets/captions). "Create Video" runs a **real Remotion render** as a background job (`server/src/lib/video.ts` + `routes/video.ts`): builds `inputProps` from the manifest assets + editor timeline + captions, reuses the engine's `renderVideo()`/`ShortsVideo` composition, and writes an MP4 to `workspaces/<id>/renders/` (served via `/media`). UI **polls** `useRenders` for live progress; gallery plays/downloads/deletes real renders. Captions composite via a new Remotion layer (`remotion/components/Captions.jsx`). Timeline tweaks still live in zustand `editorStore` (sent in the render request); music deferred. |
| 6 | Video Uploader | `upload` | **Functional.** Real AI SEO (LLM strategy — `server/src/lib/seo.ts`); metadata persisted to `manifest.upload`; **real YouTube upload** of the latest completed render via Google OAuth2 + Data API v3 (`server/src/lib/youtube.ts`, `googleapis`), as a background job with live progress. Needs `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_REFRESH_TOKEN` in `.env` (UI shows a "not connected" state until set). Ported from the user's `youbute-uploader` project. |

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
1. **AI image generation for Assets:** wire the per-scene "Image Prompt" to higgsfield MCP
   `generate_image` (or OpenAI images), save the result as the scene's selected asset. (Needs a
   provider decision.)
2. **Video Editor polish:** persist the editor timeline to the manifest (migrate off localStorage so
   renders are reproducible server-side); background music done; `@remotion/player` true-WYSIWYG
   preview. (Caption font embedding NOT needed — verified Devanagari + Latin render correctly via the
   system font + browser fallback.)

_Recent rounds:_ Script↔Assets **decoupled** — Script is narration-only; the scene breakdown is
built (and edited) in the Assets step from the script OR the caption transcript, persisted at
`manifest.scenes` (see `docs/scene-breakdown-decoupling.md`). Uploader SEO/metadata made functional.

_Done in recent rounds:_ Assets (step 4) — real stock search + download-on-select + upload +
auto-fill, persisted to `manifest.assets`. Video Editor (step 5) — real background Remotion render
(`server/src/lib/video.ts`, `routes/video.ts`, `remotion/components/Captions.jsx`,
`renderVideo` `onProgress`) producing a playable 1080×1920 MP4 with live progress polling.

⚠️ **Render notes:** one render at a time (global lock; staging uses the shared
`remotion/public/assets/`, which the engine wipes each render — that's why its `.gitkeep` gets
removed). Captions/narration in the render require audio, which is currently blocked by the
**ElevenLabs free-plan/payment** issue, so the caption layer wasn't render-tested end-to-end (it's
build-verified and mirrors the verified preview CSS). Verified end-to-end: render with real Pexels
video assets + transitions + effects → valid h264 1080×1920 MP4 served via `/media`.

---

## 9. Quick start for next session
```bash
npm run dash            # boots server :8787 + web :5173 → http://localhost:5173
# add keys to .env first for real script/audio:
#   DEEPSEEK_API_KEY=...  OPENAI_API_KEY=...  (ELEVENLABS_API_KEY needs billing fixed)
```
Pipeline 1–3 are functional; 4–6 are polished mock UIs awaiting wiring.
