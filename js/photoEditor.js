// ── State ──
let originalImage = null;
let rotation = 0;
let flipH = false;
let flipV = false;
let activePreset = "none";
let textAnnotations = [];
let exportFmt = "png";

// ── Undo / Redo state ──
let currentImageSrc = null;
const history = [];
let historyIdx = -1;

const PRESETS = {
  none: { label: "None", filter: "" },
  grayscale: { label: "Grayscale", filter: "grayscale(1)" },
  sepia: { label: "Sepia", filter: "sepia(0.9)" },
  warm: {
    label: "Warm",
    filter: "sepia(0.35) saturate(1.5) hue-rotate(-15deg)",
  },
  cool: {
    label: "Cool",
    filter: "saturate(0.8) hue-rotate(195deg) brightness(1.05)",
  },
  vivid: { label: "Vivid", filter: "saturate(1.9) contrast(1.1)" },
  fade: {
    label: "Fade",
    filter: "contrast(0.78) brightness(1.15) saturate(0.65)",
  },
  noir: {
    label: "Noir",
    filter: "grayscale(1) contrast(1.45) brightness(0.88)",
  },
};

// ── DOM ──
const uploadSection = document.getElementById("upload-section");
const editor = document.getElementById("editor");
const previewCanvas = document.getElementById("preview-canvas");
const cropOverlay = document.getElementById("crop-overlay");
const cropSelection = document.getElementById("crop-selection");
const cropActiveBar = document.getElementById("crop-active-bar");
const imageInput = document.getElementById("imageInput");
const presetsRow = document.getElementById("presets-row");

function getSlider(id) {
  return parseInt(document.getElementById(id).value, 10);
}

function toast(msg, type = "info") {
  const el = document.createElement("div");
  el.className =
    "toast" +
    (type === "error" ? " error" : type === "success" ? " success" : "");
  el.textContent = msg;
  document.getElementById("toast-container").appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ── Undo / Redo ──
function getCurrentSettings() {
  return {
    imageSrc: currentImageSrc,
    rotation,
    flipH,
    flipV,
    brightness: +document.getElementById("brightness").value,
    contrast: +document.getElementById("contrast").value,
    saturation: +document.getElementById("saturation").value,
    blur: +document.getElementById("blur").value,
    sharpen: +document.getElementById("sharpen").value,
    preset: activePreset,
    texts: JSON.parse(JSON.stringify(textAnnotations)),
  };
}

function saveHistory() {
  history.splice(historyIdx + 1);
  history.push(getCurrentSettings());
  if (history.length > 50) history.shift();
  else historyIdx++;
  updateUndoRedoBtns();
}

function updateUndoRedoBtns() {
  document.getElementById("undo-btn").disabled = historyIdx <= 0;
  document.getElementById("redo-btn").disabled =
    historyIdx >= history.length - 1;
}

async function restoreHistoryState(state) {
  rotation = state.rotation;
  flipH = state.flipH;
  flipV = state.flipV;
  document.getElementById("brightness").value = state.brightness;
  document.getElementById("contrast").value = state.contrast;
  document.getElementById("saturation").value = state.saturation;
  document.getElementById("blur").value = state.blur;
  document.getElementById("sharpen").value = state.sharpen;
  activePreset = state.preset;
  textAnnotations = state.texts || [];
  updateSliderLabels();
  updatePresetButtons();
  renderTextLayer();
  if (state.imageSrc && state.imageSrc !== currentImageSrc) {
    currentImageSrc = state.imageSrc;
    await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        originalImage = img;
        resolve();
      };
      img.src = state.imageSrc;
    });
  }
  redraw();
}

function undo() {
  if (historyIdx > 0) {
    historyIdx--;
    restoreHistoryState(history[historyIdx]);
  }
}
function redo() {
  if (historyIdx < history.length - 1) {
    historyIdx++;
    restoreHistoryState(history[historyIdx]);
  }
}

document.getElementById("undo-btn").addEventListener("click", undo);
document.getElementById("redo-btn").addEventListener("click", redo);

document.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey) {
    if (e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      undo();
    }
    if ((e.key === "z" && e.shiftKey) || e.key === "y") {
      e.preventDefault();
      redo();
    }
  }
});

// ── Build filter string ──
function buildFilter() {
  const b = getSlider("brightness") / 100;
  const c = getSlider("contrast") / 100;
  const s = getSlider("saturation") / 100;
  const bl = getSlider("blur");
  const parts = [`brightness(${b})`, `contrast(${c})`, `saturate(${s})`];
  if (bl > 0) parts.push(`blur(${bl}px)`);
  if (activePreset !== "none" && PRESETS[activePreset].filter)
    parts.push(PRESETS[activePreset].filter);
  return parts.join(" ");
}

// ── Sharpening ──
function applySharpening(imageData, strength) {
  if (strength <= 0) return;
  const d = imageData.data;
  const src = new Uint8ClampedArray(d);
  const w = imageData.width,
    h = imageData.height;
  const s = strength;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) << 2;
      for (let c = 0; c < 3; c++) {
        const v =
          (1 + 4 * s) * src[i + c] -
          s * src[((y - 1) * w + x) * 4 + c] -
          s * src[((y + 1) * w + x) * 4 + c] -
          s * src[(y * w + x - 1) * 4 + c] -
          s * src[(y * w + x + 1) * 4 + c];
        d[i + c] = Math.max(0, Math.min(255, v));
      }
    }
  }
}

// ── Render to a target canvas ──
function renderToCanvas(targetCanvas, sourceImage) {
  const img = sourceImage || originalImage;
  const W = img.naturalWidth || img.width;
  const H = img.naturalHeight || img.height;
  const swapped = rotation === 90 || rotation === 270;

  targetCanvas.width = swapped ? H : W;
  targetCanvas.height = swapped ? W : H;

  const tctx = targetCanvas.getContext("2d");
  tctx.save();
  tctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
  tctx.filter = buildFilter();
  tctx.translate(targetCanvas.width / 2, targetCanvas.height / 2);
  tctx.rotate((rotation * Math.PI) / 180);
  if (flipH) tctx.scale(-1, 1);
  if (flipV) tctx.scale(1, -1);
  tctx.drawImage(img, -W / 2, -H / 2, W, H);
  tctx.restore();
  tctx.filter = "none";

  const sharpenStr = getSlider("sharpen") / 10;
  if (sharpenStr > 0) {
    const imgData = tctx.getImageData(
      0,
      0,
      targetCanvas.width,
      targetCanvas.height,
    );
    applySharpening(imgData, sharpenStr);
    tctx.putImageData(imgData, 0, 0);
  }
}

// ── Text layer ──
function renderTextLayer() {
  const layer = document.getElementById("text-layer");
  layer.innerHTML = "";
  textAnnotations.forEach((ann) => {
    const el = document.createElement("div");
    el.style.cssText = `
        position: absolute;
        left: ${ann.xFrac * 100}%;
        top: ${ann.yFrac * 100}%;
        transform: translate(-50%, -50%);
        font-size: ${ann.fontSize}px;
        color: ${ann.color};
        font-family: sans-serif;
        white-space: nowrap;
        text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
        pointer-events: all;
        cursor: move;
        user-select: none;
      `;
    el.textContent = ann.text;

    const delBtn = document.createElement("span");
    delBtn.textContent = "×";
    delBtn.style.cssText = `
        position: absolute;
        top: -10px;
        right: -10px;
        background: rgba(0,0,0,0.6);
        color: #fff;
        border-radius: 50%;
        width: 18px;
        height: 18px;
        display: none;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        cursor: pointer;
        line-height: 18px;
        text-align: center;
      `;
    el.addEventListener("mouseenter", () => {
      delBtn.style.display = "flex";
    });
    el.addEventListener("mouseleave", () => {
      delBtn.style.display = "none";
    });
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      textAnnotations = textAnnotations.filter((a) => a.id !== ann.id);
      saveHistory();
      renderTextLayer();
    });
    el.appendChild(delBtn);

    el.addEventListener("mousedown", (e) => {
      if (e.target === delBtn) return;
      e.preventDefault();
      const layerRect = layer.getBoundingClientRect();
      const onMove = (mv) => {
        ann.xFrac = Math.max(
          0,
          Math.min(1, (mv.clientX - layerRect.left) / layerRect.width),
        );
        ann.yFrac = Math.max(
          0,
          Math.min(1, (mv.clientY - layerRect.top) / layerRect.height),
        );
        el.style.left = ann.xFrac * 100 + "%";
        el.style.top = ann.yFrac * 100 + "%";
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        saveHistory();
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });

    layer.appendChild(el);
  });
}

// ── Update preview ──
function redraw() {
  if (!originalImage) return;

  const scroll = document.getElementById("canvas-scroll");
  const maxW = scroll.clientWidth - 48;
  const maxH = scroll.clientHeight - 48;
  const W = originalImage.naturalWidth || originalImage.width;
  const H = originalImage.naturalHeight || originalImage.height;
  const swapped = rotation === 90 || rotation === 270;
  const natW = swapped ? H : W;
  const natH = swapped ? W : H;
  const displayScale = Math.min(1, maxW / natW, maxH / natH);

  const offscreen = document.createElement("canvas");
  renderToCanvas(offscreen);

  previewCanvas.width = Math.round(natW * displayScale);
  previewCanvas.height = Math.round(natH * displayScale);
  previewCanvas.style.width = previewCanvas.width + "px";
  previewCanvas.style.height = previewCanvas.height + "px";

  const ctx = previewCanvas.getContext("2d");
  ctx.drawImage(
    offscreen,
    0,
    0,
    previewCanvas.width,
    previewCanvas.height,
  );

  cropOverlay.style.width = previewCanvas.width + "px";
  cropOverlay.style.height = previewCanvas.height + "px";
  cropOverlay.style.left = previewCanvas.offsetLeft + "px";
  cropOverlay.style.top = previewCanvas.offsetTop + "px";

  renderTextLayer();
}

// ── Load image ──
function loadImage(file) {
  if (!file.type.startsWith("image/")) {
    toast("Please select an image file", "error");
    return;
  }
  const img = new Image();
  img.onload = () => {
    const tmp = document.createElement("canvas");
    tmp.width = img.naturalWidth;
    tmp.height = img.naturalHeight;
    tmp.getContext("2d").drawImage(img, 0, 0);
    currentImageSrc = tmp.toDataURL("image/png");
    originalImage = img;

    rotation = 0;
    flipH = false;
    flipV = false;
    activePreset = "none";
    textAnnotations = [];
    document.getElementById("brightness").value = 100;
    document.getElementById("contrast").value = 100;
    document.getElementById("saturation").value = 100;
    document.getElementById("blur").value = 0;
    document.getElementById("sharpen").value = 0;
    updateSliderLabels();
    updatePresetButtons();
    exitCropMode();

    history.length = 0;
    historyIdx = -1;
    saveHistory();

    uploadSection.style.display = "none";
    editor.style.display = "flex";
    document.getElementById("open-new-btn").style.display = "";
    setTimeout(redraw, 50);
    toast("Image loaded", "success");
  };
  img.onerror = () => toast("Could not load image", "error");
  img.src = URL.createObjectURL(file);
}

// ── Slider listeners ──
function updateSliderLabels() {
  ["brightness", "contrast", "saturation", "blur", "sharpen"].forEach(
    (id) => {
      document.getElementById(id + "-val").textContent =
        document.getElementById(id).value;
    },
  );
}

["brightness", "contrast", "saturation", "blur", "sharpen"].forEach(
  (id) => {
    document.getElementById(id).addEventListener("input", () => {
      updateSliderLabels();
      redraw();
    });
    document.getElementById(id).addEventListener("change", () => {
      saveHistory();
    });
  },
);

// ── Transform buttons ──
document
  .getElementById("rotate-left-btn")
  .addEventListener("click", () => {
    rotation = (rotation - 90 + 360) % 360;
    redraw();
    saveHistory();
  });

document
  .getElementById("rotate-right-btn")
  .addEventListener("click", () => {
    rotation = (rotation + 90) % 360;
    redraw();
    saveHistory();
  });

document.getElementById("flip-h-btn").addEventListener("click", () => {
  flipH = !flipH;
  redraw();
  saveHistory();
});
document.getElementById("flip-v-btn").addEventListener("click", () => {
  flipV = !flipV;
  redraw();
  saveHistory();
});

// ── Reset ──
document.getElementById("reset-btn").addEventListener("click", () => {
  rotation = 0;
  flipH = false;
  flipV = false;
  activePreset = "none";
  textAnnotations = [];
  document.getElementById("brightness").value = 100;
  document.getElementById("contrast").value = 100;
  document.getElementById("saturation").value = 100;
  document.getElementById("blur").value = 0;
  document.getElementById("sharpen").value = 0;
  updateSliderLabels();
  updatePresetButtons();
  exitCropMode();
  renderTextLayer();
  redraw();
  saveHistory();
  toast("Reset to original");
});

// ── Preset buttons ──
function updatePresetButtons() {
  document.querySelectorAll(".preset-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.preset === activePreset);
  });
}

Object.entries(PRESETS).forEach(([key, preset]) => {
  const btn = document.createElement("button");
  btn.className = "preset-btn" + (key === "none" ? " active" : "");
  btn.dataset.preset = key;
  btn.textContent = preset.label;
  btn.addEventListener("click", () => {
    activePreset = key;
    updatePresetButtons();
    redraw();
    saveHistory();
  });
  presetsRow.appendChild(btn);
});

// ── Crop ──
let cropMode = false;
let cropStart = null;
let cropRect = null;

function enterCropMode() {
  cropMode = true;
  cropOverlay.classList.add("show");
  cropActiveBar.classList.add("show");
  cropSelection.style.display = "none";
  cropRect = null;
}

function exitCropMode() {
  cropMode = false;
  cropOverlay.classList.remove("show");
  cropActiveBar.classList.remove("show");
  cropSelection.style.display = "none";
  cropStart = null;
  cropRect = null;
}

document
  .getElementById("crop-btn")
  .addEventListener("click", enterCropMode);
document
  .getElementById("crop-cancel-btn")
  .addEventListener("click", exitCropMode);

cropOverlay.addEventListener("mousedown", (e) => {
  if (!cropMode) return;
  const rect = cropOverlay.getBoundingClientRect();
  cropStart = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  cropSelection.style.display = "block";
  cropSelection.style.left = cropStart.x + "px";
  cropSelection.style.top = cropStart.y + "px";
  cropSelection.style.width = "0px";
  cropSelection.style.height = "0px";
});

window.addEventListener("mousemove", (e) => {
  if (!cropMode || !cropStart) return;
  const rect = cropOverlay.getBoundingClientRect();
  const curX = Math.max(
    0,
    Math.min(e.clientX - rect.left, cropOverlay.offsetWidth),
  );
  const curY = Math.max(
    0,
    Math.min(e.clientY - rect.top, cropOverlay.offsetHeight),
  );
  const x = Math.min(cropStart.x, curX);
  const y = Math.min(cropStart.y, curY);
  const w = Math.abs(curX - cropStart.x);
  const h = Math.abs(curY - cropStart.y);
  cropSelection.style.left = x + "px";
  cropSelection.style.top = y + "px";
  cropSelection.style.width = w + "px";
  cropSelection.style.height = h + "px";
  cropRect = { x, y, w, h };
});

window.addEventListener("mouseup", () => {
  if (cropMode) cropStart = null;
});

document
  .getElementById("crop-apply-btn")
  .addEventListener("click", () => {
    if (!cropRect || cropRect.w < 4 || cropRect.h < 4) {
      toast("Draw a selection first", "error");
      return;
    }

    const W = originalImage.naturalWidth || originalImage.width;
    const H = originalImage.naturalHeight || originalImage.height;
    const swapped = rotation === 90 || rotation === 270;
    const natW = swapped ? H : W;
    const natH = swapped ? W : H;
    const sx = natW / previewCanvas.width;
    const sy = natH / previewCanvas.height;

    const cropX = Math.round(cropRect.x * sx);
    const cropY = Math.round(cropRect.y * sy);
    const cropW = Math.round(cropRect.w * sx);
    const cropH = Math.round(cropRect.h * sy);

    const fullCanvas = document.createElement("canvas");
    renderToCanvas(fullCanvas);

    const cropped = document.createElement("canvas");
    cropped.width = cropW;
    cropped.height = cropH;
    cropped
      .getContext("2d")
      .drawImage(
        fullCanvas,
        cropX,
        cropY,
        cropW,
        cropH,
        0,
        0,
        cropW,
        cropH,
      );

    const newImg = new Image();
    newImg.onload = () => {
      currentImageSrc = cropped.toDataURL("image/png");
      originalImage = newImg;
      rotation = 0;
      flipH = false;
      flipV = false;
      document.getElementById("brightness").value = 100;
      document.getElementById("contrast").value = 100;
      document.getElementById("saturation").value = 100;
      document.getElementById("blur").value = 0;
      document.getElementById("sharpen").value = 0;
      updateSliderLabels();
      exitCropMode();
      redraw();
      saveHistory();
      toast("Crop applied");
    };
    newImg.src = cropped.toDataURL("image/png");
  });

// ── Resize ──
let resizeAspect = 1;

document.getElementById("resize-btn").addEventListener("click", () => {
  if (!originalImage) return;
  const W = originalImage.naturalWidth || originalImage.width;
  const H = originalImage.naturalHeight || originalImage.height;
  const swapped = rotation === 90 || rotation === 270;
  const curW = swapped ? H : W;
  const curH = swapped ? W : H;
  document.getElementById("resize-w").value = curW;
  document.getElementById("resize-h").value = curH;
  resizeAspect = curW / curH;
  document.getElementById("resize-popup").classList.add("open");
});

document
  .getElementById("resize-cancel-btn")
  .addEventListener("click", () => {
    document.getElementById("resize-popup").classList.remove("open");
  });

document.getElementById("resize-w").addEventListener("input", () => {
  if (!document.getElementById("lock-ratio").checked) return;
  const w = +document.getElementById("resize-w").value;
  if (w > 0)
    document.getElementById("resize-h").value = Math.round(
      w / resizeAspect,
    );
});

document.getElementById("resize-h").addEventListener("input", () => {
  if (!document.getElementById("lock-ratio").checked) return;
  const h = +document.getElementById("resize-h").value;
  if (h > 0)
    document.getElementById("resize-w").value = Math.round(
      h * resizeAspect,
    );
});

document
  .getElementById("resize-apply-btn")
  .addEventListener("click", () => {
    const targetW = Math.max(
      1,
      Math.min(10000, +document.getElementById("resize-w").value),
    );
    const targetH = Math.max(
      1,
      Math.min(10000, +document.getElementById("resize-h").value),
    );
    if (!targetW || !targetH) {
      toast("Enter valid dimensions", "error");
      return;
    }

    const fullCanvas = document.createElement("canvas");
    renderToCanvas(fullCanvas);

    const resized = document.createElement("canvas");
    resized.width = targetW;
    resized.height = targetH;
    resized
      .getContext("2d")
      .drawImage(fullCanvas, 0, 0, targetW, targetH);

    const newImg = new Image();
    newImg.onload = () => {
      currentImageSrc = resized.toDataURL("image/png");
      originalImage = newImg;
      rotation = 0;
      flipH = false;
      flipV = false;
      document.getElementById("brightness").value = 100;
      document.getElementById("contrast").value = 100;
      document.getElementById("saturation").value = 100;
      document.getElementById("blur").value = 0;
      document.getElementById("sharpen").value = 0;
      updateSliderLabels();
      document.getElementById("resize-popup").classList.remove("open");
      redraw();
      saveHistory();
      toast("Resize applied");
    };
    newImg.src = resized.toDataURL("image/png");
  });

// ── Text overlay ──
let nextTextId = 1;

document.getElementById("add-text-btn").addEventListener("click", () => {
  document.getElementById("photo-text-input").value = "";
  document.getElementById("photo-text-popup").classList.add("open");
  setTimeout(
    () => document.getElementById("photo-text-input").focus(),
    50,
  );
});

document
  .getElementById("photo-text-cancel")
  .addEventListener("click", () => {
    document.getElementById("photo-text-popup").classList.remove("open");
  });

document
  .getElementById("photo-text-confirm")
  .addEventListener("click", () => {
    const text = document.getElementById("photo-text-input").value.trim();
    if (!text) {
      toast("Enter some text", "error");
      return;
    }
    textAnnotations.push({
      id: nextTextId++,
      xFrac: 0.5,
      yFrac: 0.5,
      text,
      fontSize: +document.getElementById("photo-text-size").value || 36,
      color: document.getElementById("photo-text-color").value,
    });
    document.getElementById("photo-text-popup").classList.remove("open");
    saveHistory();
    renderTextLayer();
  });

// ── Export / Download ──
function setFmt(fmt) {
  exportFmt = fmt;
  document
    .getElementById("fmt-png")
    .classList.toggle("active", fmt === "png");
  document
    .getElementById("fmt-jpg")
    .classList.toggle("active", fmt === "jpg");
  document.getElementById("quality-row").style.display =
    fmt === "jpg" ? "" : "none";
}

document
  .getElementById("export-quality")
  .addEventListener("input", () => {
    document.getElementById("export-quality-val").textContent =
      document.getElementById("export-quality").value;
  });

document.getElementById("download-btn").addEventListener("click", () => {
  if (!originalImage) return;
  document.getElementById("export-popup").classList.add("open");
});

document
  .getElementById("export-cancel-btn")
  .addEventListener("click", () => {
    document.getElementById("export-popup").classList.remove("open");
  });

document
  .getElementById("export-confirm-btn")
  .addEventListener("click", () => {
    if (!originalImage) return;
    const fullCanvas = document.createElement("canvas");
    renderToCanvas(fullCanvas);

    const ctx = fullCanvas.getContext("2d");
    textAnnotations.forEach((ann) => {
      ctx.font = `${ann.fontSize}px sans-serif`;
      ctx.fillStyle = ann.color;
      ctx.shadowColor = "rgba(0,0,0,0.8)";
      ctx.shadowBlur = 4;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        ann.text,
        ann.xFrac * fullCanvas.width,
        ann.yFrac * fullCanvas.height,
      );
      ctx.shadowBlur = 0;
      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";
    });

    const mimeType = exportFmt === "jpg" ? "image/jpeg" : "image/png";
    const quality =
      exportFmt === "jpg"
        ? +document.getElementById("export-quality").value / 100
        : undefined;
    const filename =
      exportFmt === "jpg" ? "edited-photo.jpg" : "edited-photo.png";

    fullCanvas.toBlob(
      (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        document.getElementById("export-popup").classList.remove("open");
        toast("Image downloaded!", "success");
      },
      mimeType,
      quality,
    );
  });

// ── File input ──
imageInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) loadImage(file);
  imageInput.value = "";
});

const dropBox = document.getElementById("drop-box");
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
  if (file) loadImage(file);
});

document
  .getElementById("open-new-btn")
  .addEventListener("click", () => imageInput.click());
document
  .getElementById("open-new-btn2")
  .addEventListener("click", () => imageInput.click());

// Redraw on window resize
let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(redraw, 120);
});
