# NovelForge Architecture

NovelForge is organized as a small workspace:

- `apps/desktop`: Tauri desktop shell, React UI, desktop-specific integration.
- `packages/domain`: shared types, schemas, and event contracts.
- `packages/analysis`: rule-based impact analysis and future AI provider boundary.
- `packages/test-fixtures`: reusable seeded project fixtures.

The desktop app keeps SQLite as the source of truth and treats analysis as a separate subsystem fed by domain events.
