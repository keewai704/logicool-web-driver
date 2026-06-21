# GitHub Pages Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add GitHub Pages deployment so the WebHID app is served over HTTPS.

**Architecture:** Vite computes the correct base path from `GITHUB_REPOSITORY` during CI while keeping local development at `/`. A GitHub Actions workflow builds, tests, uploads `dist`, and deploys with the official Pages actions.

**Tech Stack:** Vite, React, TypeScript, Vitest, pnpm, GitHub Actions, GitHub Pages.

## Global Constraints

- Local `pnpm dev` and local `pnpm build` must keep `base` as `/`.
- GitHub Pages repository deployment must use `/<repo>/` as the Vite base path.
- User/organization Pages root repositories ending in `.github.io` must use `/`.
- The workflow must use GitHub Pages Actions, not a committed `gh-pages` build output branch.
- Verification must include tests, typecheck, and build.

---

### Task 1: Vite Pages Base Path

**Files:**
- Modify: `vite.config.ts`
- Test: `vite.config.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `resolveBasePath(repository?: string): string`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { resolveBasePath } from './vite.config';

describe('resolveBasePath', () => {
  it('uses root base when no GitHub repository is provided', () => {
    expect(resolveBasePath(undefined)).toBe('/');
  });

  it('uses the repository name for project GitHub Pages', () => {
    expect(resolveBasePath('keewai/logicool-web-driver')).toBe('/logicool-web-driver/');
  });

  it('uses root base for user or organization Pages repositories', () => {
    expect(resolveBasePath('keewai/keewai.github.io')).toBe('/');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `nix develop -c pnpm test -- --run vite.config.test.ts`

Expected: FAIL because `resolveBasePath` is not exported.

- [ ] **Step 3: Implement base path resolver**

Update `vite.config.ts` to export `resolveBasePath()` and set `base: resolveBasePath(process.env.GITHUB_REPOSITORY)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `nix develop -c pnpm test -- --run vite.config.test.ts`

Expected: PASS.

### Task 2: GitHub Pages Workflow and Docs

**Files:**
- Create: `.github/workflows/pages.yml`
- Modify: `README.md`

**Interfaces:**
- Produces: GitHub Actions workflow that tests, builds, uploads `dist`, and deploys to Pages.

- [ ] **Step 1: Add workflow**

Create `.github/workflows/pages.yml` with official Pages actions: `actions/configure-pages@v5`, `actions/upload-pages-artifact@v3`, and `actions/deploy-pages@v4`.

- [ ] **Step 2: Update docs**

Document GitHub Pages setup: Settings -> Pages -> Source -> GitHub Actions, push to `main`, and use the published HTTPS URL.

- [ ] **Step 3: Verify**

Run:

```bash
nix develop -c pnpm test -- --run
nix develop -c pnpm typecheck
GITHUB_REPOSITORY=keewai/logicool-web-driver nix develop -c pnpm build
```

Expected: all commands exit 0 and built asset paths contain `/logicool-web-driver/`.

## Self-Review

- Spec coverage: Covers HTTPS GitHub Pages deployment, Vite base path, Actions workflow, docs, and verification.
- Placeholder scan: No placeholders remain.
- Type consistency: `resolveBasePath(repository?: string): string` is defined before tests and config consume it.
