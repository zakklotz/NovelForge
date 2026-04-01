# Contributing

Thanks for your interest in improving NovelForge.

## Setup

```bash
pnpm install
```

For the desktop shell, you can also validate the Rust side directly:

```bash
cd apps/desktop/src-tauri
cargo check
```

## Run checks

Use the same commands the repo uses in CI:

```bash
pnpm typecheck
pnpm test
pnpm build
```

For local development:

```bash
pnpm dev
```

## Branch and PR expectations

- Keep branches focused on one change or fix at a time.
- Open pull requests with a short summary of what changed and why.
- Include screenshots when UI behavior or visuals change.
- Run `pnpm typecheck` and `pnpm test` before opening a PR. Run `pnpm build` when your changes could affect the shipped desktop UI.

## Scope

NovelForge is intentionally focused on a local-first story IDE for planning, writing, and revising novels. Please keep proposed changes aligned with that direction and avoid unrelated platform expansion or speculative features.
