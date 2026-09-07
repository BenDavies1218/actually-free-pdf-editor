import { removeBackground } from "https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/dist/index.mjs";

const uploadSection = document.getElementById("upload-section");
const progressSection = document.getElementById("progress-section");
const editorSection = document.getElementById("editor-section");
const dropBox = document.getElementById("drop-box");
const imageInput = document.getElementById("imageInput");
const bgImageInput = document.getElementById("bgImageInput");
const originalImg = document.getElementById("original-img");
const resultCanvas = document.getElementById("result-canvas");
const resultBgCanvas = document.getElementById("result-bg-canvas");
const progressFill = document.getElementById("progress-fill");
const progressLabel = document.getElementById("progress-label");

let resultBlob = null;
let resultImage = null;
let currentBg = "transparent";
let bgImageEl = null;
let touchupMode = "erase";
let isBrushing = false;
let originalAlpha = null;

function toast(msg, type = "info") {
  const el = document.createElement("div");
  el.className =
    "toast" +
    (type === "error" ? " error" : type === "success" ? " success" : "");
  el.textContent = msg;
  document.getElementById("toast-container").appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ── Process image ──
async function processImage(file) {
  if (!file.type.startsWith("image/")) {
    toast("Please select an image file", "error");
    return;
  }

  uploadSection.style.display = "none";
  progressSection.classList.add("show");
  editorSection.style.display = "none";

  const objectUrl = URL.createObjectURL(file);
  originalImg.src = objectUrl;

  try {
    const resultBlobOut = await removeBackground(file, {
      publicPath: window.location.origin + "/package/dist/",
      model: "medium",
      progress: (key, current, total) => {
        if (total > 0) {
          const pct = Math.round((current / total) * 100);
          progressFill.style.width = pct + "%";
          if (key.includes("fetch") || key.includes("load")) {
            progressLabel.textContent = `Loading AI model… ${pct}% (cached after first run)`;
          } else {
            progressLabel.textContent = `Removing background… ${pct}%`;
          }
        }
      },
    });

    resultBlob = resultBlobOut;
    resultImage = await createImageBitmap(resultBlob);

    resultCanvas.width = resultImage.width;
    resultCanvas.height = resultImage.height;
    resultCanvas.getContext("2d").drawImage(resultImage, 0, 0);

    resultBgCanvas.width = resultImage.width;
    resultBgCanvas.height = resultImage.height;

    // Store original alpha for touch-up restore
    const imgData = resultCanvas
      .getContext("2d")
      .getImageData(0, 0, resultCanvas.width, resultCanvas.height);
    originalAlpha = new Uint8Array(imgData.data.length >> 2);
    for (let i = 0; i < originalAlpha.length; i++)
      originalAlpha[i] = imgData.data[i * 4 + 3];

    progressSection.classList.remove("show");
    editorSection.style.display = "flex";
    document.getElementById("open-new-btn").style.display = "";
    document.getElementById("brush-bar").classList.add("show");
    resultCanvas.style.cursor = "crosshair";

    applyBackground(currentBg);
    toast("Background removed!", "success");
  } catch (e) {
    progressSection.classList.remove("show");
    uploadSection.style.display = "";
    toast("Failed: " + e.message, "error");
    console.error(e);
  }
}

// ── Background overlay ──
function applyBackground(bg) {
  currentBg = bg;
  const bgCtx = resultBgCanvas.getContext("2d");
  bgCtx.clearRect(0, 0, resultBgCanvas.width, resultBgCanvas.height);

  if (bg === "transparent") {
    resultBgCanvas.style.display = "none";
    document.querySelector(
      ".panel-canvas.checkerboard",
    ).style.background = "";
  } else if (bg === "image" && bgImageEl) {
    resultBgCanvas.style.display = "block";
    bgCtx.drawImage(
      bgImageEl,
      0,
      0,
      resultBgCanvas.width,
      resultBgCanvas.height,
    );
  } else if (bg !== "image") {
    resultBgCanvas.style.display = "block";
    bgCtx.fillStyle =
      bg === "white" ? "#ffffff" : bg === "black" ? "#111111" : bg;
    bgCtx.fillRect(0, 0, resultBgCanvas.width, resultBgCanvas.height);
  }
}

// ── Background swatches ──
function setActiveSwatch(swatchEl) {
  document
    .querySelectorAll(".bg-swatch")
    .forEach((s) => s.classList.remove("active"));
  document.getElementById("bg-img-btn").classList.remove("active");
  if (swatchEl) swatchEl.classList.add("active");
}

document.querySelectorAll(".bg-swatch").forEach((swatch) => {
  swatch.addEventListener("click", () => {
    setActiveSwatch(swatch);
    applyBackground(swatch.dataset.bg);
  });
});

document
  .getElementById("bg-color-picker")
  .addEventListener("input", (e) => {
    setActiveSwatch(null);
    applyBackground(e.target.value);
  });

// ── Bg image replacement ──
document.getElementById("bg-img-btn").addEventListener("click", () => {
  bgImageInput.click();
});

bgImageInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    bgImageEl = img;
    URL.revokeObjectURL(url);

    // Draw thumbnail onto the button
    const btn = document.getElementById("bg-img-btn");
    btn.innerHTML = "";
    const thumbCanvas = document.createElement("canvas");
    thumbCanvas.width = 26;
    thumbCanvas.height = 26;
    thumbCanvas.getContext("2d").drawImage(img, 0, 0, 26, 26);
    btn.appendChild(thumbCanvas);

    setActiveSwatch(null);
    btn.classList.add("active");
    applyBackground("image");
  };
  img.src = url;
  e.target.value = "";
});

// ── Copy to clipboard ──
document
  .getElementById("copy-btn")
  .addEventListener("click", async () => {
    if (!resultCanvas) return;
    try {
      const blob = await new Promise((resolve) =>
        resultCanvas.toBlob(resolve, "image/png"),
      );
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      toast("Copied to clipboard!", "success");
    } catch (e) {
      toast("Copy failed — try downloading instead", "error");
    }
  });

// ── Touch-up brush ──
function paintBrush(cx, cy) {
  const r = +document.getElementById("brush-size").value;
  const ctx = resultCanvas.getContext("2d");
  const imgData = ctx.getImageData(
    0,
    0,
    resultCanvas.width,
    resultCanvas.height,
  );
  const d = imgData.data;
  const w = resultCanvas.width,
    h = resultCanvas.height;

  const rect = resultCanvas.getBoundingClientRect();
  const px = Math.round((cx - rect.left) * (w / rect.width));
  const py = Math.round((cy - rect.top) * (h / rect.height));

  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      const x = px + dx,
        y = py + dy;
      if (x < 0 || x >= w || y < 0 || y >= h) continue;
      const idx = (y * w + x) * 4;
      if (touchupMode === "erase") {
        d[idx + 3] = 0;
      } else {
        d[idx + 3] = originalAlpha ? originalAlpha[y * w + x] : 255;
      }
    }
  }
  ctx.putImageData(imgData, 0, 0);
}

resultCanvas.addEventListener("mousedown", (e) => {
  isBrushing = true;
  paintBrush(e.clientX, e.clientY);
});
resultCanvas.addEventListener("mousemove", (e) => {
  if (isBrushing) paintBrush(e.clientX, e.clientY);
});
window.addEventListener("mouseup", () => {
  isBrushing = false;
});

document
  .getElementById("brush-erase-btn")
  .addEventListener("click", () => {
    touchupMode = "erase";
    document.getElementById("brush-erase-btn").classList.add("active");
    document
      .getElementById("brush-restore-btn")
      .classList.remove("active");
  });

document
  .getElementById("brush-restore-btn")
  .addEventListener("click", () => {
    touchupMode = "restore";
    document.getElementById("brush-restore-btn").classList.add("active");
    document.getElementById("brush-erase-btn").classList.remove("active");
  });

document.getElementById("brush-size").addEventListener("input", (e) => {
  document.getElementById("brush-size-val").textContent = e.target.value;
});

// ── Download ──
document
  .getElementById("download-btn")
  .addEventListener("click", async () => {
    if (!resultBlob) return;

    if (currentBg === "transparent") {
      const blob = await new Promise((resolve) =>
        resultCanvas.toBlob(resolve, "image/png"),
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "background-removed.png";
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const tmp = document.createElement("canvas");
      tmp.width = resultCanvas.width;
      tmp.height = resultCanvas.height;
      const tmpCtx = tmp.getContext("2d");
      if (currentBg === "image" && bgImageEl) {
        tmpCtx.drawImage(bgImageEl, 0, 0, tmp.width, tmp.height);
      } else {
        tmpCtx.fillStyle =
          currentBg === "white"
            ? "#ffffff"
            : currentBg === "black"
              ? "#111111"
              : currentBg;
        tmpCtx.fillRect(0, 0, tmp.width, tmp.height);
      }
      tmpCtx.drawImage(resultCanvas, 0, 0);
      tmp.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "background-removed.png";
        a.click();
        URL.revokeObjectURL(url);
      }, "image/png");
    }
    toast("Image downloaded!", "success");
  });

// ── File input ──
imageInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) processImage(file);
  imageInput.value = "";
});

// ── Drag & drop ──
dropBox.addEventListener("click", () => imageInput.click());
dropBox.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropBox.classList.add("dragover");
});
dropBox.addEventListener("dragleave", () =>
  dropBox.classList.remove("dragover"),
);
dropBox.addEventListener("drop", (e) => {
  e.preventDefault();
  dropBox.classList.remove("dragover");
  const file = e.dataTransfer.files[0];
  if (file) processImage(file);
});

// ── Batch mode ──
async function processBatch(files) {
  uploadSection.style.display = "none";
  editorSection.style.display = "none";
  progressSection.classList.remove("show");
  document.getElementById("batch-section").classList.add("show");

  const batchList = document.getElementById("batch-list");
  batchList.innerHTML = "";
  Array.from(files).forEach((file, i) => {
    const div = document.createElement("div");
    div.style.cssText =
      "display:flex;align-items:center;gap:8px;padding:6px 8px;background:var(--surface2);border-radius:6px;font-size:0.83rem";
    div.innerHTML = `<i class="ti ti-clock" id="batch-icon-${i}" style="color:var(--text-muted)"></i><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${file.name}</span>`;
    batchList.appendChild(div);
  });

  let done = 0;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    document.getElementById(`batch-icon-${i}`).className =
      "ti ti-loader-2";
    document.getElementById(`batch-icon-${i}`).style.color =
      "var(--accent)";
    document.getElementById("batch-progress-label").textContent =
      `Processing ${i + 1} of ${files.length}: ${file.name}`;
    document.getElementById("batch-progress-fill").style.width =
      (i / files.length) * 100 + "%";

    try {
      const resultBlobOut = await removeBackground(file, {
        publicPath: window.location.origin + "/package/dist/",
        model: "medium",
        progress: () => {},
      });
      const url = URL.createObjectURL(resultBlobOut);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name.replace(/\.[^.]+$/, "") + "-no-bg.png";
      a.click();
      URL.revokeObjectURL(url);
      document.getElementById(`batch-icon-${i}`).className =
        "ti ti-check";
      document.getElementById(`batch-icon-${i}`).style.color = "#22c55e";
      done++;
    } catch (e) {
      document.getElementById(`batch-icon-${i}`).className = "ti ti-x";
      document.getElementById(`batch-icon-${i}`).style.color =
        "var(--danger)";
    }
  }

  document.getElementById("batch-progress-fill").style.width = "100%";
  document.getElementById("batch-progress-label").textContent =
    `Done! ${done} of ${files.length} images processed.`;
  setTimeout(() => {
    document.getElementById("batch-section").classList.remove("show");
    uploadSection.style.display = "";
    toast(`Batch complete — ${done} image(s) downloaded`, "success");
  }, 3000);
}

document.getElementById("batchInput").addEventListener("change", (e) => {
  const files = e.target.files;
  if (files && files.length > 0) processBatch(files);
  e.target.value = "";
});

// ── Open new ──
function resetToUpload() {
  editorSection.style.display = "none";
  uploadSection.style.display = "";
  document.getElementById("open-new-btn").style.display = "none";
  document.getElementById("brush-bar").classList.remove("show");
  progressFill.style.width = "0%";
  currentBg = "transparent";
  bgImageEl = null;
  originalAlpha = null;
  resultCanvas.style.cursor = "";
  const btn = document.getElementById("bg-img-btn");
  btn.innerHTML = '<i class="ti ti-photo" id="bg-img-icon"></i>';
  btn.classList.remove("active");
  document
    .querySelectorAll(".bg-swatch")
    .forEach((s) => s.classList.remove("active"));
  document
    .querySelector(".bg-swatch.transparent")
    .classList.add("active");
}

document
  .getElementById("open-new-btn")
  .addEventListener("click", () => imageInput.click());
document
  .getElementById("open-new-btn2")
  .addEventListener("click", () => imageInput.click());
