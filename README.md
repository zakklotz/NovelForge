# NovelForge

NovelForge is a local-first structured writing environment for novels. Chapters, scenes, characters, manuscript text, and revision suggestions are stored as linked story objects instead of disconnected documents.

## Workspace

- `apps/desktop`: Tauri desktop app with the React UI and Rust SQLite command layer
- `packages/domain`: shared story models, schemas, and event contracts
- `packages/analysis`: rule-based continuity and structure suggestion engine
- `packages/test-fixtures`: seeded sample project data for tests and local development
- `docs/architecture.md`: high-level architecture notes

## Current v1 scaffold

- Local project create/open using portable SQLite-backed `.novelforge` files
- Chapters view with reorderable chapter objects and metadata inspector
- Scenes board with drag/drop across chapter lanes
- Scene workspace with TipTap editor, metadata, chapter context, character context, and warnings
- Characters view with structured voice/arc cards and relationship editing
- Suggestion inbox backed by rule-based impact analysis running in a worker

## Commands

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm test
pnpm --filter @novelforge/desktop build
```

For the Rust desktop shell specifically:

```bash
cd apps/desktop/src-tauri
cargo check
```
