# Actually Free Tools

A suite of free, browser-based tools. No uploads, no accounts, no backend, no cost.

**Live tools:**

- [PDF Editor](pdf-editor.html) — rotate, delete pages, add text & images
- [Background Remover](bg-remover.html) — on-device AI, outputs transparent PNG
- [Photo Editor](photo-editor.html) — adjustments, filters, rotate, flip, crop

## Features

### PDF Editor

- Upload via drag & drop or file picker
- Navigate pages (prev/next, direct input, arrow keys)
- Rotate pages 90°, delete pages
- Add draggable text annotations (configurable size/colour)
- Add draggable/resizable image overlays
- Download edited PDF with annotations baked in

### Background Remover

- Supports PNG, JPG, WebP
- On-device ML model via `@imgly/background-removal` — image never leaves the browser
- Progress bar for model loading (~20 MB first run, cached afterwards)
- Preview with transparent / white / black / custom colour background
- Download as PNG with or without background

### Photo Editor

- Adjustments: brightness, contrast, saturation, blur
- Rotate 90° left/right, flip horizontal/vertical
- 8 preset filters: None, Grayscale, Sepia, Warm, Cool, Vivid, Fade, Noir
- Crop: drag-to-select overlay, applies crop and resets transforms
- Download at full original resolution

## Tech Stack

| Library | Purpose | Source |
| ------- | ------- | ------ |
| [PDF.js](https://mozilla.github.io/pdf.js/) | Render PDF to canvas | CDN |
| [pdf-lib](https://pdf-lib.js.org/) | Edit PDF structure | CDN |
| [@imgly/background-removal](https://img.ly/open-source/background-removal-js/) | In-browser AI background removal | CDN (ESM) |
| [Tabler Icons](https://tabler.io/icons) | UI icons | CDN |
| Canvas API | Photo editing | Built-in |

No build step. No Node.js required to run.

## Quick Start (local)

```bash
# Python 3
python3 -m http.server 8000
# open http://localhost:8000

# Node.js
npx http-server -p 8000 -o
```

> **Note:** The background remover requires a local server (not `file://`) because it loads WebAssembly via ESM import.

## Deploy for Free

### Vercel (easiest)

```bash
npm i -g vercel && vercel
```

Or connect the GitHub repo at [vercel.com](https://vercel.com) → New Project → Deploy.

### Netlify

Go to [netlify.com](https://netlify.com) → Add new site → Import from GitHub → Deploy.

Or drag the project folder onto [app.netlify.com/drop](https://app.netlify.com/drop).

### GitHub Pages

Repo Settings → Pages → Source: main branch / root → Save.

Site available at `https://<username>.github.io/<repo>`.

### Cloudflare Pages

[pages.cloudflare.com](https://pages.cloudflare.com) → Create project → Connect GitHub → leave build settings blank → Deploy.

## Custom Domain

All hosts support free custom domains. Add a `CNAME` record pointing to the host's domain — takes under 10 minutes.

## Project Structure

```text
index.html           Hub / landing page
pdf-editor.html      PDF editor tool
bg-remover.html      Background remover tool
photo-editor.html    Photo editor tool
shared.css           Common styles (dark theme, header, buttons)
package.json         Metadata + dev scripts
.gitignore
LICENSE              MIT
.github/
  workflows/
    deploy.yml       Auto-deploy on push to main
docs/
  plans/             Design documents
```

## Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Commit your changes
4. Open a pull request

Goal: keep the site dependency-free (CDN only), zero build step, single HTML file per tool.

## License

MIT — see [LICENSE](LICENSE)
