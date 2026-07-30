# Interactive Platformer Index (v2) — Design
Date: 2026-07-30

## Goal
Add `index_v2.html` — an alternate landing page where navigation to each tool happens by playing a small 2D platformer: jump around a level and reach the labeled door for the tool you want (PDF Editor / BG Remover / Photo Editor). Standalone alt page; existing `index.html` is untouched.

## Architecture
- New file `index_v2.html`, same per-page pattern as `pdf-editor.html` etc: includes `shared.css` + `theme.js` for identical header/nav/theme-toggle.
- Game engine: **Phaser 3 via CDN script tag** (`https://cdn.jsdelivr.net/npm/phaser@3/dist/phaser.min.js`) — same CDN-first approach as pdf.js/pdf-lib elsewhere in the project. No build step, no image/sprite assets — everything drawn at runtime via Phaser `Graphics → texture`.

## Layout
Standard site header (logo, nav, theme toggle) → centered Phaser canvas, logical resolution 800×450, Scale Manager `FIT` mode for responsive shrink on narrow screens → one-line control hint → quiet "skip the game" links row (PDF Editor / BG Remover / Photo Editor) → standard footer.

## Level & visual style
- Single static-camera scene, no scrolling.
- Ground + 5–7 staggered platforms leading to 3 towers, each topped with a labeled door, each reachable via its own distinct jump path.
- Player + platforms + doors are flat rounded-rect textures generated from Phaser `Graphics`, no external assets.

## Theming
Colors (`--bg`, `--accent`, `--surface`, `--border`, `--text`) are read once via `getComputedStyle(document.documentElement)` at scene `create()`. Whatever theme is active on page load is what the game uses for that session — toggling theme mid-game does not live-recolor the canvas.

## Physics & controls
- Phaser Arcade Physics: gravity, dynamic player body, static platform/door bodies.
- Keyboard: arrow keys/WASD to move, Space/Up/W to jump — grounded-only (no double jump, v1).
- Touch: 3 translucent on-screen buttons (◀ ▶ ⤒) overlaid on the canvas, shown only under a `pointer: coarse` media check.
- Falling off the level respawns the player at the start platform — no fail state.

## Door navigation
Arcade overlap between player and a door body triggers a brief visual cue, then `window.location.href` to the matching tool page after ~300ms.

## Resilience
Game init wrapped in try/catch. If Phaser fails to load or throws, the canvas area is replaced with a plain message and the same 3 skip-links become the primary way to navigate — the page never strands a visitor.

## Testing
No automated test runner in this project (static HTML/JS, no build). Verified manually in-browser: jump feel, all 3 doors reachable via distinct paths, touch buttons via devtools device emulation, correct theme colors in both light and dark, fallback links, off-platform respawn, and the Phaser-load-failure fallback path.
