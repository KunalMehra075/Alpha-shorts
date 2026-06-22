# Analytics & Content Intelligence — Implementation Plan

This is the phased build plan for the Analytics module specified in
[`Analytics.md`](./Analytics.md). It tracks what ships now (Phase 1) and what is
deferred, plus the architecture all phases share.

## Decisions

| Topic | Decision |
| --- | --- |
| Phase 1 scope | Core channel dashboard (KPIs, growth chart, video table, top performers, per-project analytics) |
| Data source | Real YouTube Data + Analytics APIs; user re-auths with analytics scopes |
| Category / hook style | AI-classified from the script (deferred to Phase 2 dashboards; schema fields added now) |
| Charts | shadcn charts (Recharts under the hood) |

```mermaid
flowchart LR
  subgraph Google["Google APIs"]
    DATA["YouTube Data API v3<br/>channels · videos · playlistItems"]
    YTA["YouTube Analytics API v2<br/>reports.query"]
  end
  subgraph Server["server/ (Express)"]
    LIB["lib/analytics.ts<br/>fetch + join + period-compare"]
    CACHE[("disk + mem cache<br/>TTL + manual refresh")]
    ROUTES["routes/analytics.ts<br/>/api/analytics/*<br/>/api/projects/:id/analytics"]
  end
  subgraph Web["dashboard/ (React)"]
    HOOKS["queries.ts hooks"]
    PAGE["AnalyticsPage<br/>KPIs · charts · table · top"]
    WS["Project ▸ Analytics"]
  end
  DATA --> LIB
  YTA --> LIB
  LIB <--> CACHE
  LIB --> ROUTES --> HOOKS --> PAGE
  HOOKS --> WS
```

## Auth & scopes

The uploader's refresh token is `youtube.upload` only. Analytics needs a token
regenerated with the additional scopes below, and the **YouTube Analytics API**
enabled in Google Cloud Console.

```mermaid
flowchart TD
  A["GOOGLE_REFRESH_TOKEN<br/>(youtube.upload only)"] -->|insufficient scope| B{"Analytics call"}
  B -->|403| C["API returns needsReauth: true"]
  C --> D["UI: 'Connect analytics access' card<br/>with .env re-auth steps"]
  E["Re-generate token with<br/>youtube.upload + youtube.readonly<br/>+ yt-analytics.readonly<br/>+ yt-analytics-monetary.readonly"] --> F["Real data flows"]
```

## Phase 1 — Analytics Command Center (this build)

```mermaid
flowchart TD
  RANGE["Range switcher<br/>7d / 30d / 90d / 365d / lifetime"]
  RANGE --> KPI["KPI grid (9 cards)<br/>value · Δ% · trend · vs prev period"]
  RANGE --> GROW["Channel growth chart<br/>toggle: views/subs/likes/watch time/engagement"]
  RANGE --> SUBS["Subscriber growth<br/>gained / lost / net"]
  RANGE --> TOP["Top performers<br/>views · retention · subs · engagement"]
  RANGE --> TABLE["Video performance table<br/>search · sort · filter"]
  WS["Per-project analytics<br/>(reads stored videoId)"]
```

**Backend**
- `lib/analytics.ts` — Data API (`channels.list mine`, `videos.list`,
  `playlistItems.list` for the uploads universe) + Analytics API
  (`reports.query` with `day` and `video` dimensions). Joins per-video metrics
  with snippet/thumbnail. Current-vs-previous window for KPI deltas. In-memory +
  on-disk cache keyed by range (TTL ~30 min) with manual refresh. 403/insufficient
  scope → `{ needsReauth }`.
- `routes/analytics.ts` — `/api/analytics/{status,overview,timeseries,videos,top,refresh}`
  and `/api/projects/:id/analytics`.

**Frontend**
- `recharts` + `components/ui/chart.tsx` (shadcn chart primitives, themed to tokens).
- Rebuilt `AnalyticsPage.tsx` (command center) + `ProjectAnalyticsPage.tsx`
  (link in the project header).

**Groundwork (no dead code):** add `category` + `hookStyle` to the project
schema. Population via AI classification ships in Phase 2 — scripts are persisted,
so classification can run retroactively with no backfill loss.

## Phase 2 — Content intelligence

```mermaid
flowchart TD
  R["Retention curve<br/>(audienceWatchRatio)"]
  H["Hook performance<br/>(consumes hookStyle)"]
  C["Category / content dashboard<br/>(consumes category)"]
  E["Engagement deep-dive"]
  U["Upload-time heatmap"]
  K["Upload-consistency calendar + streak"]
  CLASS["AI classification<br/>script → category + hookStyle"] --> H
  CLASS --> C
```

## Phase 3 — Decision system

```mermaid
flowchart TD
  COM["Recent comments inbox"]
  AI["AI insights & recommendations"]
  CI["Content intelligence<br/>winning topics/hooks/length/time"]
  REV["Revenue dashboard<br/>(yt-analytics-monetary scope)"]
```

## Verification (Phase 1)

- Server + dashboard typecheck/build.
- Backend smoke: `needsReauth` path (no analytics scope) and, once re-authed,
  real `overview`/`timeseries`/`videos`. Throwaway project for the per-project
  endpoint. Dark-mode screenshots. Cleanup leaving user projects untouched.
