# Shorts Dashboard — Implementation Plan

A personal, single-user **content-creation operating system** for YouTube Shorts.
It wraps the existing CLI pipeline (ElevenLabs → Whisper → FFmpeg → Remotion)
behind a fast, modern web UI so the whole flow — **Topic → Script → Audio →
Captions → Assets → Video → Upload** — takes minutes, not an hour.

This document is the agreed blueprint. Building proceeds **in phases**; after
Phase 1 I stop for your approval before continuing.

---

## 1. Decisions (locked)

| Decision | Choice | Notes |
|----------|--------|-------|
| App architecture | **Vite SPA + Express API** | React+TS+Tailwind+ShadCN front end; small Express backend reusing `src/lib`. |
| Persistence | **Filesystem + JSON manifest** | One folder per workspace, `workspace.json` manifest + media on disk. |
| Script/SEO/suggestion AI | **Mock now, wire later** | Endpoints return realistic structured mock data; real LLM added in a later phase. |
| Phase 1 depth | **UI-first with mocks** | Full UI/routing/workspace CRUD now; generation is mocked until approval. |
| Theme & palette | **Light + dark only; white/black/red/gray** | Single red accent; **glossy red-gradient pill buttons** (per reference). No other colors. |

These are reflected throughout the plan below.

---

## 2. Tech stack

**Frontend** (`dashboard/`)
- React 18 + TypeScript, built with **Vite**
- **TailwindCSS** + **ShadCN UI** (Radix primitives)
- **react-router-dom** for routing (workspace + tab IDs live in the URL)
- **@tanstack/react-query** for server state (fetch/cache/mutations)
- **zustand** for light client UI state (active workspace, unsaved edits)
- `lucide-react` icons, `sonner` toasts, `react-hook-form` + `zod` for forms

**Backend** (`server/`)
- **Express** (TypeScript via `tsx` in dev) — local-only API
- Reuses existing `src/lib/*` engine modules in later phases
- File-based persistence helpers (atomic writes), `zod` for request/manifest validation
- **SSE** (Server-Sent Events) for long-job progress (audio/caption/render) — later phases

**Why this fits:** it's your exact stated stack, keeps the proven Node ESM
pipeline as the engine, and stays a simple local tool (no auth, no DB server).

---

## 3. Repository layout (monorepo, same repo)

```
shorts-generator/
├── src/                      # EXISTING CLI pipeline (unchanged; reused by server)
│   └── lib/                  # elevenlabs, whisper, ffmpeg, assets, timeline, remotion-render…
├── remotion/                 # EXISTING Remotion compositions (reused for renders)
├── server/                   # NEW Express API
│   ├── index.ts              # app bootstrap, middleware, static serve of media
│   ├── routes/               # workspaces, script, templates, stats (audio/caption/video/upload later)
│   ├── lib/                  # workspace store, manifest schema, fs helpers, mock generators
│   └── types.ts              # shared API/domain types (also imported by dashboard via path)
├── dashboard/                # NEW Vite React app
│   ├── index.html
│   ├── src/
│   │   ├── main.tsx, App.tsx, router.tsx
│   │   ├── components/ui/     # ShadCN components
│   │   ├── components/        # app components (Stepper, StatusBadge, WorkspaceCard…)
│   │   ├── layouts/           # RootLayout, WorkspaceLayout
│   │   ├── pages/             # Home, Script, Audio, Caption, Video, Upload
│   │   ├── features/          # per-tab logic + hooks
│   │   ├── lib/               # api client, query hooks, types, utils
│   │   └── styles/index.css
│   ├── tailwind.config.ts, components.json, vite.config.ts, tsconfig.json
├── workspaces/               # NEW persisted data (gitignored)
│   └── <workspace-id>/ …
├── config/
│   └── prompt-templates.json # NEW global prompt templates
└── package.json              # add workspaces? No — keep one root; add dev scripts
```

**Dev experience:** root scripts run both processes.
- `npm run dash:server` → Express on `:8787`
- `npm run dash:web` → Vite on `:5173`, proxying `/api`, `/media` → `:8787`
- `npm run dash` → both together (via `concurrently`)

The existing CLI commands (`gen-audio`, `gen-caption`, `generate-video`, …) keep
working untouched.

---

## 4. Data model (filesystem + JSON manifest)

```
workspaces/
└── dwarka-mystery-a1b2/             # <slug>-<shortid>
    ├── workspace.json               # the manifest (source of truth for metadata + status)
    ├── script/
    │   ├── current.json             # active script version (pointer mirrored in manifest)
    │   └── versions/ v1.json v2.json…
    ├── audio/        v1.mp3 v2.mp3…  # (Phase 2)
    ├── captions/     (srt/json/ass) # (Phase 3)
    ├── assets/       images/ videos/ generated/  # (Phase 4)
    ├── renders/      render-1.mp4 thumb-1.jpg…    # (Phase 4)
    └── upload.json                  # SEO + publish data (Phase 5)
```

### `workspace.json` (schema, validated with zod)

```jsonc
{
  "id": "dwarka-mystery-a1b2",
  "name": "Dwarka Mystery",
  "createdAt": "2026-06-20T00:00:00.000Z",
  "updatedAt": "2026-06-20T00:00:00.000Z",
  "language": "en",                       // en | hi | bilingual
  "stages": {                              // drives the status indicators per tab
    "script":  { "status": "completed",  "updatedAt": "…" },
    "audio":   { "status": "not_started" },
    "caption": { "status": "not_started" },
    "video":   { "status": "not_started" },
    "upload":  { "status": "not_started" }
  },
  "script": {
    "currentVersion": 2,
    "versions": [
      { "version": 1, "createdAt": "…", "topic": "Dwarka", "label": "Version 1" },
      { "version": 2, "createdAt": "…", "topic": "Dwarka", "label": "Version 2" }
    ]
  },
  "audio":  { "currentVersion": null, "versions": [] },   // Phase 2
  "captions": { "settings": {}, "current": null },        // Phase 3
  "scenes": [],                                            // Phase 4 (asset choices, effects, transitions)
  "renders": [],                                           // Phase 4
  "upload": { "platform": "youtube", "visibility": "private" } // Phase 5
}
```

### Script version file `script/versions/vN.json`

Aligned with the existing `generate-video` scene schema, plus extra authoring
fields the dashboard shows:

```jsonc
{
  "version": 2,
  "createdAt": "…",
  "topic": "Dwarka Mystery",
  "promptUsed": "…full prompt text…",
  "voiceoverScript": "Scientists recently discovered…",   // editable freeform narration
  "scenes": [
    {
      "scene": 1,
      "start": 0,
      "end": 3,
      "spokenLine": "Scientists recently discovered…",
      "visualType": "Video",                 // Image | Video | Animation | SplitScreen
      "searchKeywords": ["brain", "neurons", "science"],
      "visualDescription": "Brain neurons animation",
      "imagePrompt": "Ultra realistic neuron network…"
    }
  ]
}
```

> This is a **superset** of the `scene-scripts/*.json` format the renderer already
> consumes, so Phase 4 can hand `{start,end,spokenLine,visualType,searchKeywords}`
> straight to `buildTimeline()` with zero translation.

### Global `config/prompt-templates.json`

```jsonc
[
  { "id": "hindi-facts",   "name": "Hindi Facts Prompt",   "body": "…" },
  { "id": "anime-facts",   "name": "Anime Facts Prompt",   "body": "…" }
]
```

### Status model

Every stage is one of: `not_started` · `in_progress` · `completed` · `failed`,
surfaced as a colored **StatusBadge** in the stepper and on workspace cards.
Transitions are driven by backend actions (e.g. saving a script version →
`script.completed`; starting a render → `video.in_progress`).

---

## 5. Backend API (Express)

Media files are served read-only at `/media/<workspaceId>/…`. JSON at `/api/*`.

**Phase 1 endpoints**

```
GET    /api/health
GET    /api/workspaces                      list (summary cards)
POST   /api/workspaces                      create { name, language? }
GET    /api/workspaces/:id                  full manifest
PATCH  /api/workspaces/:id                  rename / update meta
POST   /api/workspaces/:id/duplicate        deep-copy folder + new id
DELETE /api/workspaces/:id                  delete folder

GET    /api/workspaces/:id/script           current script version
PUT    /api/workspaces/:id/script           save manual edits (new or in-place)
POST   /api/workspaces/:id/script/generate  MOCK generate → new version
GET    /api/workspaces/:id/script/versions  version list
POST   /api/workspaces/:id/script/restore   { version } → make current

GET    /api/prompt-templates                list
POST   /api/prompt-templates                create
PUT    /api/prompt-templates/:id            update
DELETE /api/prompt-templates/:id            delete

GET    /api/stats                           placeholder dashboard stats
```

**Later phases (outlined):** `/audio/voices`, `/audio/generate`,
`/caption/generate`, `/caption/preview`, scene asset search/upload,
`/video/render` (+ SSE progress), `/upload/*` (YouTube OAuth + publish).

**Mock generator (Phase 1):** deterministic, realistic output derived from the
topic — a multi-sentence voiceover plus 4–6 scenes with timings, alternating
`visualType`, keyword lists, visual descriptions and image prompts. Clearly
labeled as mock in the response so the UI can show a "mock" tag.

**Engine reuse (later):** most `src/lib` functions already take explicit output
paths (`generateAudio({outPath})`, `extractAudio({outPath})`,
`renderOverlay({outPath})`, `buildTimeline({script,...})`), so the server points
them at `workspaces/<id>/…`. A light refactor will parameterize the few spots
that read the global `paths` singleton; tracked when those phases begin.

---

## 6. Frontend design

### Routing (workspace + tab IDs in the URL — refresh-safe)

```
/                                  Dashboard Home
/w/:workspaceId                    → redirect to /w/:id/script
/w/:workspaceId/script             Script Generator
/w/:workspaceId/audio              Audio Generator
/w/:workspaceId/caption            Caption Maker
/w/:workspaceId/video              Video Creator
/w/:workspaceId/upload             Video Uploader
/templates                         Prompt template manager (modal or page)
```

Putting `:workspaceId` and the tab in the path means a refresh keeps you exactly
where you were (the behavior you wanted previously) and every screen is
deep-linkable.

### Layout & navigation

- **RootLayout:** slim left rail (Home, Workspaces, Templates, Settings) + top bar
  (current workspace name, quick switcher, theme toggle).
- **WorkspaceLayout:** horizontal **Stepper** of the 5 tabs (matches the
  wireframe), each with a StatusBadge; content area below. The stepper is the
  primary nav and conveys progress left→right.

### Design language (modern / polished / minimal)

- **Two themes only: light and dark** (toggle in the top bar, persisted).
- **Strict palette — white, black, red, gray only.** No other hues anywhere.
  - Light: white/near-white surfaces, black text, gray borders/muted text, **red** as the single accent.
  - Dark: near-black surfaces, white text, gray borders/muted text, **red** accent.
  - Tailwind theme tokens map to exactly these (background, foreground, muted,
    border, and a `red` accent ramp); no default ShadCN multi-color palette.
- **Primary buttons = glossy red gradient** in the style of the reference image:
  - pill shape (fully rounded), vertical gradient (lighter red at top →
    deeper/crimson at bottom), a soft top inner highlight (subtle inset light),
    a faint outer glow/halo, and a gentle press/hover lift.
  - Implemented as a reusable `Button` variant (e.g. `variant="primary"`) so it's
    consistent everywhere; secondary/ghost buttons stay neutral (gray/black/white).
  - Defined with CSS variables so the exact same look adapts to light/dark.
- Clear typographic hierarchy, generous spacing, subtle gray borders over heavy
  shadows; restrained motion (fast 150–200ms transitions, no gratuitous
  animation — per your UX goals).
- Keyboard-friendly, few-clicks-per-action, autosave with toast confirmations.
- (I'll apply the `frontend-design` skill's guidance during the build so it reads
  as intentional, not a templated admin theme.)

> A small **design-tokens + Button showcase** will be the very first visible
> deliverable in Phase 1 so you can approve the exact red gradient and both
> themes before the rest is built on top.

### Tab-by-tab UI (full build target; Phase 1 = Script tab live, others shells)

1. **Script Generator** — Prompt editor (large textarea) with Save / Load
   Template / New Template; Topic input; **Generate**; editable Voiceover Script;
   **Scene Breakdown** table (Scene #, Start, End, Spoken Line, Visual Type,
   Keywords, Visual Description, Image Prompt) — every cell editable; **version
   history** drawer with restore.
2. **Audio Generator** — script preview, voice selector, Generate, audio player
   (duration / size / gen-time), Replay/Regenerate/Download/Replace, audio
   history switcher. *(Phase 2)*
3. **Caption Maker** — audio preview; language (Hindi/English/Bilingual); style
   controls (font, size, weight, colors, stroke, highlight, position); Generate
   (SRT / word-timestamps / JSON); live preview tabs (Normal / Highlighted /
   Green-screen). *(Phase 3)*
4. **Video Creator** — central **Scene Table** (Spoken Line, Duration, Keywords,
   Prompt, Selected Asset, Actions); per-scene asset management (upload/replace/
   delete/preview), AI keyword + image-prompt + stock suggestions, scene type +
   effect + transition controls, per-scene regenerate; **Create Video** with
   progress (current scene / ETA via SSE); **Video Gallery** (thumb, duration,
   resolution, date; preview/rename/delete/download); Proceed to Upload.
   *(Phase 4)*
5. **Video Uploader** — video preview; SEO (Title/Description/Tags) with AI
   suggestions + one-click insert; platform targets (YouTube now; IG/FB/TikTok/X
   slots designed-in); visibility (Public/Private/Unlisted); upload progress;
   success + URL. *(Phase 5)*

6. **Dashboard Home** — Workspace list (create/rename/duplicate/delete/open),
   Recent Projects, Recently Generated Videos, Upload Statistics (placeholder
   numbers in Phase 1).

---

## 7. Phase plan

| Phase | Scope | Outcome |
|-------|-------|---------|
| **1 (now)** | Monorepo scaffold; ShadCN/theme; routing; **workspace CRUD + persistence**; Dashboard Home; **Script Generator fully built against mock generation** incl. templates + versioning; other 4 tabs as status-aware placeholder shells. | A usable workspace + scripting UX end-to-end with mock data. **Stop for approval.** |
| 2 | Audio Generator wired to `src/lib/elevenlabs.js` (+ live voice list), audio history, player. | Real narration per workspace. |
| 3 | Caption Maker wired to Whisper + `ass-generator` + `ffmpeg` (style controls, preview variants). | Real captions/overlays. |
| 4 | Video Creator wired to `assets.js` + `timeline.js` + `remotion-render.js`; scene table, asset suggestions/upload, controls, render w/ SSE progress, gallery. | Real rendered Shorts. |
| 5 | Video Uploader: YouTube OAuth + Data API upload, SEO fields. | One-click publish. |
| 6 | Replace mocks with the chosen real LLM across script/SEO/suggestions; stats; polish. | Fully automated. |

---

## 8. Phase 1 — concrete deliverables

**Backend**
- Express app, `/api/health`, CORS for the Vite origin, static `/media`.
- Workspace store (create/list/read/update/duplicate/delete) with atomic JSON
  writes + zod-validated manifest; slug+id generation.
- Script routes (get/save/generate-mock/versions/restore) + mock generator.
- Prompt-template routes + seeded `config/prompt-templates.json`.
- `/api/stats` placeholder.

**Frontend**
- Vite + TS + Tailwind + ShadCN initialized (`components.json`, `@/` alias).
- Router, RootLayout, WorkspaceLayout, Stepper, StatusBadge, theme toggle.
- TanStack Query client + typed API client + Zustand UI store.
- **Dashboard Home** (workspace cards w/ CRUD, recents, placeholder stats).
- **Script Generator** page: prompt editor + template load/save, topic, generate
  (mock), editable voiceover, editable scene table, version history + restore,
  autosave.
- The other four tabs: clean placeholder screens showing the stage status and a
  "coming next phase" state (so the stepper is fully navigable).

**Tooling**
- Root `package.json` scripts: `dash`, `dash:web`, `dash:server` (via
  `concurrently`, `tsx`).
- `workspaces/` added to `.gitignore` (keep `.gitkeep`).
- Short `dashboard/README.md` (run instructions).

**Phase 1 explicitly excludes:** real ElevenLabs/Whisper/FFmpeg/Remotion calls,
stock-asset search UI wiring, YouTube upload, and the real LLM — all stubbed/
mocked and scheduled above.

---

## 9. Environment variables (added incrementally)

| Var | Phase | Purpose |
|-----|-------|---------|
| `DASH_PORT` (default 8787) | 1 | Express port |
| `DASH_WORKSPACES_DIR` (default `workspaces/`) | 1 | Data location |
| `ANTHROPIC_API_KEY` *or* `OPENAI_API_KEY` | 6 | Real script/SEO/suggestions |
| `ELEVENLABS_*` (already exist) | 2 | Audio |
| `PEXELS_API_KEY` / `PIXABAY_API_KEY` (already exist) | 4 | Stock assets |
| `YOUTUBE_CLIENT_ID/SECRET`, `YOUTUBE_REDIRECT_URI` | 5 | Upload OAuth |

---

## 10. Assumptions & things I'll need later (non-blocking for Phase 1)

1. **Light + dark themes only**, strict **white/black/red/gray** palette with a
   single **red accent** and **glossy red-gradient pill primary buttons** (per
   your reference image). No other colors are introduced anywhere.
2. **YouTube upload (Phase 5)** will require you to create a Google Cloud OAuth
   client (Desktop/Web) and enable the YouTube Data API v3 — I'll provide exact
   steps when we reach it.
3. **Single user, local only** — no authentication or multi-tenant concerns.
4. The **mock script schema** is the contract the real LLM will fill later, so
   Phase 1 UI won't need rework when we wire the model.
5. Existing CLI workflows remain fully functional and untouched.

---

## 11. Open questions (optional — safe defaults assumed if you don't answer)

- **Workspace ↔ existing folders:** keep all new data under `workspaces/`
  (assumed), or also mirror into the current `videoscripts/ generated-audio/…`
  folders for CLI interop? *(Default: self-contained per workspace; add an
  export-to-CLI action later if useful.)*
- **Bilingual captions:** treat as a third language mode end-to-end (assumed), or
  English-only in early phases?

If these defaults are fine, no action needed — I'll proceed on them.
```
