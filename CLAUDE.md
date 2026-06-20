# Project Instructions

## Documentation

- **Always use Mermaid diagrams** when writing or updating docs (in `tech-docs/` or anywhere
  else). Do not use ASCII-art diagrams or numbered step-lists to depict flows — render them as
  Mermaid (`sequenceDiagram` for request/data flows, `stateDiagram-v2` for lifecycles/state
  machines, `erDiagram` for data models, `flowchart` for everything else).
- **Whenever a doc uses a table to describe relationships or connections, pair it with a proper
  diagram** that shows those connections visually. Tables list the facts; the diagram shows how
  things relate. Examples: an endpoints table → a sequence/flow diagram of the calls; a schema
  table → an `erDiagram` of the entities and their relations; a state table → a `stateDiagram-v2`.
- Keep diagrams in sync with the tables and prose around them when either changes.

## Environment files

- **Never read or edit `.env` or `.env.production`** (or any real env file holding secrets).
- **Only ever work with `.env.example` files.** To change configuration, update `.env.example`
  and/or tell the user the exact key/value to set in their own `.env` — do not open or modify
  the real `.env`.
