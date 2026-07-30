# Phaser Platformer Index (index_v2.html) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build `index_v2.html` — a standalone alt landing page where the player navigates to one of the three tools (PDF Editor, BG Remover, Photo Editor) by playing a small Phaser 3 platformer and reaching the matching door.

**Architecture:** Single self-contained HTML file, same per-page pattern as `pdf-editor.html`/`bg-remover.html`/`photo-editor.html` (includes `shared.css` + `theme.js`, own `<style>`/`<script>`). Phaser 3 loaded via CDN script tag, Arcade Physics, one static-camera scene, all visuals generated at runtime via `Graphics → texture` (no image assets).

**Tech Stack:** Plain HTML/CSS/JS, Phaser 3 (CDN), existing site `shared.css` theme variables, no build step.

**Reference:** Design doc at `docs/plans/2026-07-30-phaser-index-design.md`.

---

## Context for the implementer

This repo has **no test runner and no build step** — every page is a single static HTML file opened directly or served with `python3 -m http.server`. "Testing" in this codebase means:
1. Extracting the page's inline `<script>` and running `node --check` on it (pure syntax validation — catches typos/bad braces, nothing else).
2. Opening the page in a real browser and eyeballing the behavior (there is no headless test harness here — verification is manual).

Follow this pattern for every task below rather than looking for a `test/` directory or `npm test` — there isn't one.

The site's theme variables (defined in `shared.css`) that matter here: `--bg`, `--surface`, `--surface2`, `--border`, `--accent`, `--text`, `--text-muted`. `theme.js` sets `data-theme` on `<html>` before paint and exposes a `#theme-toggle` button pattern already used on every other page — copy it verbatim, don't reinvent it.

---

### Task 1: Page shell (head, header, footer, no game yet)

**Files:**
- Create: `index_v2.html`

**Step 1: Write the file**

Base the `<head>`, `<header class="site-header">`, and `<footer>` on `index.html` exactly (same logo, same 3 nav links, same `.header-actions` with the `#theme-toggle` button, same footer markup) so the page is visually indistinguishable from the rest of the site except for the `<main>` content. Use this `<head>`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <script src="theme.js"></script>
    <title>Play to Navigate — Actually Free Tools</title>
    <meta
      name="description"
      content="Jump around a mini platformer to reach the free tool you want — PDF editor, background remover, or photo editor."
    />
    <link
      rel="stylesheet"
      href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css"
    />
    <link rel="stylesheet" href="shared.css" />
  </head>
  <body>
```

Copy the header block from `index.html` (logo + nav + `.header-actions` with `#theme-toggle`) unchanged — no nav link gets an `active` class, same as `index.html`.

For `<main>`, use a placeholder for now:

```html
    <main>
      <p style="text-align:center;padding:48px;">Game goes here.</p>
    </main>
```

Copy the `<footer>` block from `index.html` unchanged, then close `</body></html>`.

**Step 2: Verify**

```bash
cd /Users/benjamindavies/Documents/GitHub/actually-free-pdf-editor
python3 -m http.server 8123 &
sleep 1
curl -s http://localhost:8123/index_v2.html | grep -c "site-header"
```
Expected: `1` (confirms the file serves and contains the header).

Open `http://localhost:8123/index_v2.html` in a browser and confirm the header/nav/theme-toggle look and behave exactly like on `index.html`.

**Step 3: Commit**

```bash
git add index_v2.html
git commit -m "Add index_v2 page shell with shared header/footer"
```

---

### Task 2: Game container + Phaser CDN + empty themed scene

**Files:**
- Modify: `index_v2.html`

**Step 1: Add container markup and CSS**

Replace the placeholder `<main>` with:

```html
    <main>
      <div id="game-container">
        <div id="game-fallback">
          <i class="ti ti-alert-triangle" style="font-size:2rem;color:var(--accent)"></i>
          <p>The game couldn't load. Use the links below to get where you're going.</p>
        </div>
      </div>
      <p class="control-hint">Arrow keys / WASD to move, Space to jump.</p>
      <div class="skip-links">
        <span>Prefer to skip the game?</span>
        <a href="pdf-editor.html">PDF Editor</a>
        <a href="bg-remover.html">BG Remover</a>
        <a href="photo-editor.html">Photo Editor</a>
      </div>
    </main>
```

Add to a `<style>` block in `<head>` (after the `shared.css` link):

```html
    <style>
      main {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 24px;
        gap: 16px;
      }
      #game-container {
        width: 100%;
        max-width: 800px;
        aspect-ratio: 800 / 450;
        border-radius: 16px;
        overflow: hidden;
        box-shadow: var(--shadow);
        border: 1px solid var(--border);
        position: relative;
        background: var(--surface2);
      }
      #game-container canvas { width: 100% !important; height: 100% !important; display: block; }
      .control-hint { color: var(--text-muted); font-size: 0.85rem; text-align: center; }
      .skip-links { display: flex; gap: 16px; flex-wrap: wrap; justify-content: center; font-size: 0.85rem; }
      .skip-links a { color: var(--text-muted); text-decoration: underline; }
      .skip-links a:hover { color: var(--text); }
      #game-fallback {
        display: none;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 12px;
        padding: 48px 24px;
        color: var(--text-muted);
        text-align: center;
        height: 100%;
      }
    </style>
```

**Step 2: Add Phaser CDN script tag**

In `<head>`, after the `shared.css` link:

```html
    <script src="https://cdn.jsdelivr.net/npm/phaser@3/dist/phaser.min.js"></script>
```

**Step 3: Add minimal themed scene**

Before `</body>`, add:

```html
    <script>
      (function () {
        try {
          var styles = getComputedStyle(document.documentElement);
          var colors = {
            bg: styles.getPropertyValue('--bg').trim(),
            accent: styles.getPropertyValue('--accent').trim(),
            surface2: styles.getPropertyValue('--surface2').trim(),
            text: styles.getPropertyValue('--text').trim(),
          };

          var config = {
            type: Phaser.AUTO,
            parent: 'game-container',
            width: 800,
            height: 450,
            backgroundColor: colors.bg || '#0b141a',
            scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
            scene: { create: function () {} },
          };

          new Phaser.Game(config);
        } catch (err) {
          console.error('Game failed to load:', err);
          var fallback = document.getElementById('game-fallback');
          if (fallback) fallback.style.display = 'flex';
        }
      })();
    </script>
  </body>
</html>
```

**Step 4: Verify**

```bash
python3 - <<'EOF'
import re
html = open('index_v2.html').read()
m = re.search(r'<script>\s*\(function \(\) \{.*?</script>', html, re.S)
open('/tmp/check.js','w').write(m.group(0).replace('<script>','').replace('</script>',''))
EOF
node --check /tmp/check.js && echo "SYNTAX OK"
```
Expected: `SYNTAX OK`.

Open `http://localhost:8123/index_v2.html` in a browser: the game container should render as a solid rounded rectangle in the theme's background color (dark or light depending on current toggle state), no console errors.

**Step 5: Commit**

```bash
git add index_v2.html
git commit -m "Add Phaser CDN scaffold with themed empty scene"
```

---

### Task 3: Level geometry (ground + platforms)

**Files:**
- Modify: `index_v2.html`

**Step 1: Add texture helper and platform data**

Inside the IIFE, before `var config = {...}`, add:

```javascript
          function hexToInt(hex) { return parseInt((hex || '#888888').replace('#', ''), 16); }

          function makeRoundRectTexture(scene, key, w, h, colorInt, radius) {
            var g = scene.add.graphics();
            g.fillStyle(colorInt, 1);
            g.fillRoundedRect(0, 0, w, h, radius);
            g.generateTexture(key, w, h);
            g.destroy();
          }

          var platformDefs = [
            { x: 400, y: 430, w: 800, h: 40, key: 'ground' },
            { x: 120, y: 300, w: 140, h: 24, key: 'platform' },
            { x: 120, y: 180, w: 140, h: 24, key: 'platform' },
            { x: 400, y: 260, w: 140, h: 24, key: 'platform' },
            { x: 400, y: 140, w: 140, h: 24, key: 'platform' },
            { x: 680, y: 320, w: 140, h: 24, key: 'platform' },
            { x: 680, y: 200, w: 140, h: 24, key: 'platform' },
          ];

          var platforms;
```

**Step 2: Replace the empty `create` function**

```javascript
            scene: {
              create: function () {
                makeRoundRectTexture(this, 'ground', 800, 40, hexToInt(colors.surface2), 0);
                makeRoundRectTexture(this, 'platform', 140, 24, hexToInt(colors.surface2), 8);

                platforms = this.physics.add.staticGroup();
                platformDefs.forEach(function (p) {
                  platforms.create(p.x, p.y, p.key);
                });
              },
            },
```

Also add Arcade Physics to the config object (sibling of `scale`):

```javascript
            physics: { default: 'arcade', arcade: { gravity: { y: 900 }, debug: false } },
```

**Step 3: Verify**

Re-run the same `node --check` extraction command from Task 2, Step 4 (it will catch brace/syntax mistakes in the new code).

Open the page in a browser: 7 rounded rectangles should be visible — a full-width ground bar plus 6 staggered platforms — colored to match `--surface2` in the current theme.

**Step 4: Commit**

```bash
git add index_v2.html
git commit -m "Add platform level geometry to index_v2 game"
```

---

### Task 4: Player, movement, jump, respawn

**Files:**
- Modify: `index_v2.html`

**Step 1: Add player texture, sprite, controls**

Add `player, cursors, keys;` to the shared variable declarations near `platforms`.

In `create`, after the platforms are built:

```javascript
                makeRoundRectTexture(this, 'player', 32, 40, hexToInt(colors.accent), 10);

                player = this.physics.add.sprite(60, 360, 'player');
                player.setCollideWorldBounds(true);
                this.physics.add.collider(player, platforms);

                cursors = this.input.keyboard.createCursorKeys();
                keys = this.input.keyboard.addKeys('W,A,S,D');
```

Add an `update` function as a sibling of `create` inside `scene`:

```javascript
              update: function () {
                var left = cursors.left.isDown || keys.A.isDown;
                var right = cursors.right.isDown || keys.D.isDown;
                var jump = cursors.up.isDown || keys.W.isDown;

                if (left) player.setVelocityX(-220);
                else if (right) player.setVelocityX(220);
                else player.setVelocityX(0);

                if (jump && player.body.touching.down) player.setVelocityY(-480);

                if (player.y > 470) {
                  player.setPosition(60, 360);
                  player.setVelocity(0, 0);
                }
              },
```

**Step 2: Verify**

Run the `node --check` extraction from Task 2 Step 4 again.

Open the page in a browser: a small rounded rectangle (accent-colored) should sit on the ground. Confirm:
- Left/Right arrow keys and A/D move it horizontally and it's stopped by world bounds.
- Space is NOT yet wired (only Up/W jump in this task — that's expected, Space comes with door/full-control polish, skip if tight on time, but W/Up jumping should already work).
- Jumping only works when standing on a platform or the ground (no mid-air double jump).
- Walking off a platform edge and falling past the bottom of the canvas resets the player to the start position instead of falling forever.

**Step 3: Commit**

```bash
git add index_v2.html
git commit -m "Add player sprite, movement, jump, and respawn to index_v2"
```

---

### Task 5: Doors + navigation

**Files:**
- Modify: `index_v2.html`

**Step 1: Add door data and creation**

Add near `platformDefs`:

```javascript
          var doorDefs = [
            { x: 120, y: 148, label: 'PDF Editor',   href: 'pdf-editor.html' },
            { x: 400, y: 108, label: 'BG Remover',   href: 'bg-remover.html' },
            { x: 680, y: 168, label: 'Photo Editor', href: 'photo-editor.html' },
          ];

          var doorGroup, doorTriggered = false;
```

In `create`, after the player/collider setup:

```javascript
                makeRoundRectTexture(this, 'door', 44, 64, hexToInt(colors.accent), 6);

                doorGroup = this.physics.add.staticGroup();
                var scene = this;
                doorDefs.forEach(function (d) {
                  var door = doorGroup.create(d.x, d.y, 'door');
                  door.href = d.href;
                  scene.add.text(d.x, d.y - 46, d.label, {
                    fontSize: '13px',
                    color: colors.text || '#ffffff',
                    fontFamily: 'sans-serif',
                  }).setOrigin(0.5);
                });

                this.physics.add.overlap(player, doorGroup, function (playerObj, door) {
                  if (doorTriggered) return;
                  doorTriggered = true;
                  playerObj.setTint(0xffffff);
                  this.cameras.main.flash(250, 255, 255, 255);
                  setTimeout(function () { window.location.href = door.href; }, 300);
                }, null, this);
```

In `update`, guard movement once a door has been triggered — add at the very top of `update`:

```javascript
                if (doorTriggered) { player.setVelocityX(0); return; }
```

**Step 2: Verify**

Run `node --check` extraction again.

Open the page in a browser, temporarily comment out the `window.location.href = door.href;` line (replace with `console.log('would navigate to', door.href);`) and confirm in the devtools console that walking/jumping the player into each of the 3 doors logs the correct href exactly once (not repeatedly). Then restore the real `window.location.href` line and confirm each door actually navigates to the right page.

**Step 3: Commit**

```bash
git add index_v2.html
git commit -m "Add labeled doors and navigation-on-overlap to index_v2"
```

---

### Task 6: Touch controls

**Files:**
- Modify: `index_v2.html`

**Step 1: Add touch button markup**

Inside `#game-container`, before `#game-fallback`:

```html
        <div class="touch-controls">
          <div class="touch-btn" id="touch-left">◀</div>
          <div class="touch-btn" id="touch-right">▶</div>
          <div class="touch-btn" id="touch-jump">⤒</div>
        </div>
```

**Step 2: Add CSS**

```css
      .touch-controls { position: absolute; inset: 0; pointer-events: none; display: none; }
      @media (pointer: coarse) { .touch-controls { display: block; } }
      .touch-btn {
        position: absolute;
        bottom: 16px;
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: rgba(0, 0, 0, 0.35);
        color: #fff;
        font-size: 1.4rem;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: all;
        border: 2px solid rgba(255, 255, 255, 0.4);
        user-select: none;
        -webkit-user-select: none;
      }
      #touch-left { left: 16px; }
      #touch-right { left: 84px; }
      #touch-jump { right: 16px; }
```

**Step 3: Wire touch state into input**

Add `var touchState = { left: false, right: false, jump: false };` near the other shared variables.

Add a helper, called once from `create` after the door/overlap setup:

```javascript
                (function wireTouchControls() {
                  function bind(id, prop) {
                    var el = document.getElementById(id);
                    if (!el) return;
                    ['pointerdown', 'pointerup', 'pointerleave', 'pointercancel'].forEach(function (evt) {
                      el.addEventListener(evt, function (e) {
                        e.preventDefault();
                        touchState[prop] = evt === 'pointerdown';
                      });
                    });
                  }
                  bind('touch-left', 'left');
                  bind('touch-right', 'right');
                  bind('touch-jump', 'jump');
                })();
```

Update `update` to OR the touch state into the existing input checks:

```javascript
                var left = cursors.left.isDown || keys.A.isDown || touchState.left;
                var right = cursors.right.isDown || keys.D.isDown || touchState.right;
                var jump = cursors.up.isDown || keys.W.isDown || touchState.jump;
```

**Step 4: Verify**

Run `node --check` extraction again.

Open the page in Chrome devtools with device emulation (toggle the device toolbar, pick any phone preset) and confirm the 3 translucent circular buttons appear over the bottom of the canvas and pressing/holding them moves and jumps the player. Then turn off device emulation and confirm the buttons do NOT appear on a normal desktop mouse viewport.

**Step 5: Commit**

```bash
git add index_v2.html
git commit -m "Add on-screen touch controls for index_v2 game"
```

---

### Task 7: Final resilience + polish pass

**Files:**
- Modify: `index_v2.html`

**Step 1: Confirm the fallback path**

Temporarily break the game on purpose (e.g., rename `Phaser.Game` to `Phaser.Gamee` in the script), reload the page, and confirm:
- The console shows the caught error.
- `#game-fallback` becomes visible with its warning message.
- The skip-links row below still works to navigate to all 3 tools.

Revert the intentional typo immediately after confirming.

**Step 2: Visual polish check**

With the local server running, open `index_v2.html` and toggle the site's light/dark theme button, then **reload the page** in each mode (colors are read once on load per the design, not live) and confirm in both themes:
- Text labels above doors are legible against the canvas background.
- Player, platforms, and doors are visually distinct from each other (not all near-identical shades).

If contrast is poor in either theme, adjust the `hexToInt(colors.X)` calls feeding `makeRoundRectTexture` for the affected texture (e.g., use `colors.text` tinted instead of `colors.surface2` for platforms if they blend into the background too much).

**Step 3: Full syntax check**

```bash
cd /Users/benjamindavies/Documents/GitHub/actually-free-pdf-editor
python3 - <<'EOF'
import re
html = open('index_v2.html').read()
m = re.search(r'<script>\s*\(function \(\) \{.*?</script>', html, re.S)
open('/tmp/check.js','w').write(m.group(0).replace('<script>','').replace('</script>',''))
EOF
node --check /tmp/check.js && echo "SYNTAX OK"
```

**Step 4: Commit**

```bash
git add index_v2.html
git commit -m "Polish index_v2 game contrast and confirm fallback path"
```
