# Multi-Tool Expansion — Design
Date: 2026-07-29

## Goal
Expand the single-page PDF editor into **"Actually Free Tools"** — a multi-tool hub. All tools run 100% client-side; no backend, no accounts, no uploads.

## Architecture: Multi-Page Static Site

```
index.html          Hub / landing page
pdf-editor.html     Existing PDF editor (updated)
bg-remover.html     Background removal
photo-editor.html   Photo editor
shared.css          Common tokens, header/nav, buttons, toasts
```

## Shared CSS
Common dark theme tokens, `.site-header` + `.site-nav`, button variants, toast, spinner, drop-zone, popup overlay.

## Hub (index.html)
Brand: "Actually Free Tools". Hero tagline → 3 tool cards grid → features strip (No uploads · Free forever · Private).

## BG Remover (bg-remover.html)
Library: `@imgly/background-removal` via jsDelivr ESM (in-browser ML).
Layout: Upload drop-zone → split panel (original | transparent result on checkerboard).
Controls: background colour picker, download PNG.
UX: progress bar during 30MB model first-run download.

## Photo Editor (photo-editor.html)
Library: Canvas API only.
Layout: left sidebar (sliders) | centre canvas | top toolbar.
Features:
- Sliders: brightness, contrast, saturation, blur
- Rotate 90° L/R, flip H/V
- 8 preset filters: grayscale, sepia, warm, cool, vivid, fade, noir, none
- Crop: click-drag overlay selection, apply bakes in all transforms
