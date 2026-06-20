# Shorts Studio — Dashboard

A personal, local web dashboard for the shorts pipeline (React + TypeScript +
Tailwind + ShadCN-style UI), backed by a small Express API that reuses the
existing Node engine.

## Run (from the project root)

```bash
# one-time: install dashboard + server deps
npm run dash:install

# start API (:8787) and web (:5173) together
npm run dash
```

Then open http://localhost:5173.

Run them separately if you prefer:

```bash
npm run dash:server   # Express API on :8787
npm run dash:web      # Vite dev server on :5173 (proxies /api + /media)
```

## What's in Phase 1

- Light/dark theme, strict white/black/red/gray palette, glossy red-gradient
  primary buttons.
- Workspace system: create / rename / duplicate / delete / open, persisted to
  `workspaces/<id>/workspace.json`.
- Dashboard Home: workspace cards, recents, placeholder stats.
- **Script Generator** (fully built against mock generation): prompt editor +
  templates, topic, generate, editable voiceover + scene breakdown, autosave,
  and version history with restore.
- Audio / Caption / Video / Upload tabs are status-aware placeholders for the
  next phases.

## Structure

```
dashboard/   Vite React app (this folder)
server/      Express API (../server)
workspaces/  persisted workspace data (../workspaces, gitignored)
config/prompt-templates.json   global prompt templates
```

## Environment

- `DASH_PORT` (default 8787) — API port
- `DASH_WORKSPACES_DIR` (default `../workspaces`) — data location
- `DASH_API` (dashboard dev, default `http://localhost:8787`) — proxy target
