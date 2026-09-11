pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const DEFAULT_SCALE = 1.5;
const DEFAULT_SCALE_MOBILE = 0.6;
function isMobileViewport() {
  return window.matchMedia("(max-width: 700px)").matches;
}
function defaultScale() {
  return isMobileViewport() ? DEFAULT_SCALE_MOBILE : DEFAULT_SCALE;
}

let pdfDoc = null;
let pdfLibDoc = null;
let currentPage = 1;
let totalPages = 0;
let scale = defaultScale();
let annotations = {};
let originalFileName = "edited.pdf";
let dragFromPage = null;
let extractMode = false;
let selectedPages = new Set();

const dropZoneEl = document.getElementById("drop-zone");
const dropBox = document.getElementById("drop-box");
const editor = document.getElementById("editor");
const canvas = document.getElementById("pdf-canvas");
const ctx = canvas.getContext("2d");
const annLayer = document.getElementById("annotation-layer");
const pageInput = document.getElementById("page-input");
const totalEl = document.getElementById("total-pages");
const zoomDisplay = document.getElementById("zoom-display");
const loading = document.getElementById("loading");
const textPopup = document.getElementById("text-popup");
const textInput = document.getElementById("text-input");
const fileInput = document.getElementById("fileInput");
const imageInput = document.getElementById("imageInput");
const mergeFileInput = document.getElementById("mergeInput");
const thumbPanel = document.getElementById("thumb-panel");

function toast(msg, type = "info") {
  const el = document.createElement("div");
  el.className =
    "toast" +
    (type === "error" ? " error" : type === "success" ? " success" : "");
  el.textContent = msg;
  document.getElementById("toast-container").appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function showLoading(msg) {
  document.querySelector("#loading p").textContent = msg || "Processing…";
  loading.classList.add("show");
}
function hideLoading() {
  loading.classList.remove("show");
}

async function loadPDFBytes(bytes, name) {
  showLoading("Loading PDF…");
  try {
    originalFileName = name || "edited.pdf";
    pdfLibDoc = await PDFLib.PDFDocument.load(bytes, {
      ignoreEncryption: false,
    });
    const pdfData = new Uint8Array(bytes);
    pdfDoc = await pdfjsLib.getDocument({ data: pdfData }).promise;

    totalPages = pdfDoc.numPages;
    currentPage = 1;
    scale = defaultScale();
    zoomDisplay.textContent = Math.round((scale / DEFAULT_SCALE) * 100) + "%";
    annotations = {};

    totalEl.textContent = totalPages;
    pageInput.max = totalPages;

    dropZoneEl.style.display = "none";
    editor.style.display = "flex";
    document.getElementById("open-new-btn").style.display = "";
    document.getElementById("download-btn").style.display = "";
    document.getElementById("download-btn").disabled = false;

    await renderPage(currentPage);
    await renderAllThumbnails();
    updateFormFieldsAvailability();
    toast(
      "PDF loaded — " +
        totalPages +
        " page" +
        (totalPages !== 1 ? "s" : ""),
      "success",
    );
  } catch (e) {
    toast("Failed to open PDF: " + e.message, "error");
    console.error(e);
  } finally {
    hideLoading();
  }
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

fileInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.type !== "application/pdf") {
    toast("Please select a PDF file", "error");
    return;
  }
  const bytes = await readFile(file);
  await loadPDFBytes(bytes, file.name);
  fileInput.value = "";
});

dropBox.addEventListener("click", () => fileInput.click());
dropBox.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropBox.classList.add("dragover");
});
dropBox.addEventListener("dragleave", () =>
  dropBox.classList.remove("dragover"),
);
dropBox.addEventListener("drop", async (e) => {
  e.preventDefault();
  dropBox.classList.remove("dragover");
  const file = e.dataTransfer.files[0];
  if (!file || file.type !== "application/pdf") {
    toast("Please drop a PDF file", "error");
    return;
  }
  const bytes = await readFile(file);
  await loadPDFBytes(bytes, file.name);
});

document
  .getElementById("open-new-btn")
  .addEventListener("click", () => fileInput.click());

async function renderPage(num) {
  if (!pdfDoc) return;
  currentPage = Math.max(1, Math.min(num, totalPages));
  pageInput.value = currentPage;

  const page = await pdfDoc.getPage(currentPage);
  const viewport = page.getViewport({ scale });

  canvas.width = viewport.width;
  canvas.height = viewport.height;
  canvas.style.width = viewport.width + "px";
  canvas.style.height = viewport.height + "px";
  annLayer.style.width = viewport.width + "px";
  annLayer.style.height = viewport.height + "px";

  await page.render({ canvasContext: ctx, viewport }).promise;
  updateNavButtons();
  renderAnnotations();

  document.querySelectorAll(".thumb").forEach((t) => {
    t.classList.toggle("active", +t.dataset.page === currentPage);
    t.classList.toggle(
      "selected",
      extractMode && selectedPages.has(+t.dataset.page),
    );
  });
}

function updateNavButtons() {
  document.getElementById("prev-btn").disabled = currentPage <= 1;
  document.getElementById("next-btn").disabled =
    currentPage >= totalPages;
  document.getElementById("delete-btn").disabled = totalPages <= 1;
}

function renderAnnotations() {
  annLayer.innerHTML = "";
  const pageAnns = annotations[currentPage] || [];
  pageAnns.forEach((ann, idx) => {
    if (ann.type === "image") renderImageAnnotation(ann, idx);
    else renderTextAnnotation(ann, idx);
  });
}

function renderTextAnnotation(ann, idx) {
  const el = document.createElement("div");
  el.className = "text-annotation";
  el.style.left = ann.x + "px";
  el.style.top = ann.y + "px";

  const span = document.createElement("span");
  span.textContent = ann.text;
  span.style.fontSize = ann.fontSize + "px";
  span.style.color = ann.color;

  const del = document.createElement("button");
  del.className = "ann-del";
  del.innerHTML = "&times;";
  del.addEventListener("click", (e) => {
    e.stopPropagation();
    annotations[currentPage].splice(idx, 1);
    renderAnnotations();
  });

  el.appendChild(span);
  el.appendChild(del);
  el.addEventListener("pointerdown", startDrag(ann, el));
  annLayer.appendChild(el);
}

function renderImageAnnotation(ann, idx) {
  const el = document.createElement("div");
  el.className = "img-annotation";
  el.style.left = ann.x + "px";
  el.style.top = ann.y + "px";

  const img = document.createElement("img");
  img.src = ann.dataUrl;
  img.draggable = false;
  img.style.width = ann.width + "px";
  img.style.height = ann.height + "px";

  const del = document.createElement("button");
  del.className = "ann-del";
  del.innerHTML = "&times;";
  del.addEventListener("click", (e) => {
    e.stopPropagation();
    annotations[currentPage].splice(idx, 1);
    renderAnnotations();
  });

  const resizeHandle = document.createElement("div");
  resizeHandle.className = "ann-resize";
  resizeHandle.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    e.preventDefault();
    resizeHandle.setPointerCapture(e.pointerId);
    const aspect = ann.width / ann.height;
    const startX = e.clientX;
    const startW = ann.width;
    function onMove(ev) {
      const newW = Math.max(20, startW + (ev.clientX - startX));
      ann.width = newW;
      ann.height = newW / aspect;
      img.style.width = ann.width + "px";
      img.style.height = ann.height + "px";
    }
    function onUp() {
      resizeHandle.removeEventListener("pointermove", onMove);
      resizeHandle.removeEventListener("pointerup", onUp);
      resizeHandle.removeEventListener("pointercancel", onUp);
    }
    resizeHandle.addEventListener("pointermove", onMove);
    resizeHandle.addEventListener("pointerup", onUp);
    resizeHandle.addEventListener("pointercancel", onUp);
  });

  el.appendChild(img);
  el.appendChild(del);
  el.appendChild(resizeHandle);
  el.addEventListener("pointerdown", startDrag(ann, el));
  annLayer.appendChild(el);
}

function startDrag(ann, el) {
  return function (e) {
    if (
      e.target.classList.contains("ann-del") ||
      e.target.classList.contains("ann-resize")
    )
      return;
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    const startX = e.clientX - ann.x;
    const startY = e.clientY - ann.y;
    function onMove(ev) {
      ann.x = ev.clientX - startX;
      ann.y = ev.clientY - startY;
      el.style.left = ann.x + "px";
      el.style.top = ann.y + "px";
    }
    function onUp() {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    }
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
  };
}

document
  .getElementById("prev-btn")
  .addEventListener("click", () => renderPage(currentPage - 1));
document
  .getElementById("next-btn")
  .addEventListener("click", () => renderPage(currentPage + 1));
pageInput.addEventListener("change", () => {
  const val = parseInt(pageInput.value, 10);
  if (!isNaN(val)) renderPage(val);
});

document
  .getElementById("rotate-btn")
  .addEventListener("click", async () => {
    if (!pdfLibDoc) return;
    showLoading("Rotating page…");
    try {
      const pages = pdfLibDoc.getPages();
      const page = pages[currentPage - 1];
      page.setRotation(
        PDFLib.degrees((page.getRotation().angle + 90) % 360),
      );
      const bytes = await pdfLibDoc.save();
      pdfLibDoc = await PDFLib.PDFDocument.load(bytes);
      pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) })
        .promise;
      await renderPage(currentPage);
      await renderAllThumbnails();
      updateFormFieldsAvailability();
      toast("Page rotated");
    } catch (e) {
      toast("Rotation failed: " + e.message, "error");
    } finally {
      hideLoading();
    }
  });

document
  .getElementById("delete-btn")
  .addEventListener("click", async () => {
    if (!pdfLibDoc || totalPages <= 1) return;
    if (
      !confirm(
        `Delete page ${currentPage} of ${totalPages}? This cannot be undone.`,
      )
    )
      return;
    showLoading("Deleting page…");
    try {
      pdfLibDoc.removePage(currentPage - 1);
      const bytes = await pdfLibDoc.save();
      pdfLibDoc = await PDFLib.PDFDocument.load(bytes);
      pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) })
        .promise;
      totalPages = pdfDoc.numPages;
      totalEl.textContent = totalPages;
      pageInput.max = totalPages;

      delete annotations[currentPage];
      const shifted = {};
      Object.keys(annotations).forEach((k) => {
        const n = parseInt(k, 10);
        shifted[n > currentPage ? n - 1 : n] = annotations[k];
      });
      annotations = shifted;

      await renderPage(Math.min(currentPage, totalPages));
      await renderAllThumbnails();
      updateFormFieldsAvailability();
      toast("Page deleted");
    } catch (e) {
      toast("Delete failed: " + e.message, "error");
    } finally {
      hideLoading();
    }
  });

function setZoom(newScale) {
  scale = Math.max(0.4, Math.min(3, newScale));
  zoomDisplay.textContent = Math.round((scale / DEFAULT_SCALE) * 100) + "%";
  renderPage(currentPage);
}

document
  .getElementById("zoom-in-btn")
  .addEventListener("click", () => setZoom(scale + 0.3));
document
  .getElementById("zoom-out-btn")
  .addEventListener("click", () => setZoom(scale - 0.3));
document
  .getElementById("zoom-fit-btn")
  .addEventListener("click", () => setZoom(defaultScale()));

document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") return;
  if ((e.ctrlKey || e.metaKey) && e.key === "=") {
    e.preventDefault();
    setZoom(scale + 0.3);
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "-") {
    e.preventDefault();
    setZoom(scale - 0.3);
  }
  if (e.key === "ArrowRight" || e.key === "ArrowDown")
    renderPage(currentPage + 1);
  if (e.key === "ArrowLeft" || e.key === "ArrowUp")
    renderPage(currentPage - 1);
});

document.getElementById("add-text-btn").addEventListener("click", () => {
  textInput.value = "";
  textPopup.classList.add("open");
  textInput.focus();
});

document
  .getElementById("text-cancel-btn")
  .addEventListener("click", () => textPopup.classList.remove("open"));

document
  .getElementById("text-confirm-btn")
  .addEventListener("click", () => {
    const text = textInput.value.trim();
    if (!text) {
      toast("Please enter some text", "error");
      return;
    }
    const fontSize = parseInt(
      document.getElementById("font-size-select").value,
      10,
    );
    const color = document.getElementById("font-color-select").value;
    if (!annotations[currentPage]) annotations[currentPage] = [];
    annotations[currentPage].push({
      x: 40,
      y: 40,
      text,
      fontSize,
      color,
    });
    renderAnnotations();
    textPopup.classList.remove("open");
    toast("Text added — drag to position it");
  });

textInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter")
    document.getElementById("text-confirm-btn").click();
  if (e.key === "Escape")
    document.getElementById("text-cancel-btn").click();
});

textPopup.addEventListener("click", (e) => {
  if (e.target === textPopup) textPopup.classList.remove("open");
});

document
  .getElementById("add-image-btn")
  .addEventListener("click", () => imageInput.click());

imageInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    toast("Please select an image file", "error");
    return;
  }

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => resolve(ev.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const dims = await new Promise((resolve) => {
    const img = new Image();
    img.onload = () =>
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = dataUrl;
  });

  const maxW = canvas.width * 0.4;
  const ratio = dims.w > maxW ? maxW / dims.w : 1;

  if (!annotations[currentPage]) annotations[currentPage] = [];
  annotations[currentPage].push({
    type: "image",
    x: 40,
    y: 40,
    width: Math.round(dims.w * ratio),
    height: Math.round(dims.h * ratio),
    dataUrl,
    mimeType: file.type,
  });

  renderAnnotations();
  imageInput.value = "";
  toast("Image added — drag to position, corner handle to resize");
});

function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(",")[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toPngBytes(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext("2d").drawImage(img, 0, 0);
      resolve(dataUrlToBytes(c.toDataURL("image/png")));
    };
    img.src = dataUrl;
  });
}

async function downloadPDF() {
  if (!pdfLibDoc) return;
  showLoading("Saving PDF…");
  try {
    const pages = pdfLibDoc.getPages();
    const font = await pdfLibDoc.embedFont(
      PDFLib.StandardFonts.Helvetica,
    );

    for (const [pageNum, anns] of Object.entries(annotations)) {
      if (!anns.length) continue;
      const page = pages[parseInt(pageNum, 10) - 1];
      if (!page) continue;
      const { width, height } = page.getSize();

      for (const ann of anns) {
        const scaleX = width / canvas.width;
        const scaleY = height / canvas.height;

        if (ann.type === "image") {
          const mime = ann.mimeType || "";
          let embeddedImg;
          if (mime === "image/jpeg" || mime === "image/jpg") {
            embeddedImg = await pdfLibDoc.embedJpg(
              dataUrlToBytes(ann.dataUrl),
            );
          } else {
            embeddedImg = await pdfLibDoc.embedPng(
              await toPngBytes(ann.dataUrl),
            );
          }
          const pdfW = ann.width * scaleX;
          const pdfH = ann.height * scaleY;
          page.drawImage(embeddedImg, {
            x: Math.max(0, ann.x * scaleX),
            y: Math.max(0, height - ann.y * scaleY - pdfH),
            width: pdfW,
            height: pdfH,
          });
        } else {
          const hex = ann.color.replace("#", "");
          const r = parseInt(hex.substring(0, 2), 16) / 255;
          const g = parseInt(hex.substring(2, 4), 16) / 255;
          const b = parseInt(hex.substring(4, 6), 16) / 255;
          page.drawText(ann.text, {
            x: Math.max(0, ann.x * scaleX),
            y: Math.max(
              0,
              height - ann.y * scaleY - ann.fontSize * scaleY,
            ),
            size: ann.fontSize,
            font,
            color: PDFLib.rgb(r, g, b),
          });
        }
      }
    }

    const bytes = await pdfLibDoc.save();
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = originalFileName.replace(/\.pdf$/i, "") + "-edited.pdf";
    a.click();
    URL.revokeObjectURL(url);
    toast("PDF downloaded!", "success");
  } catch (e) {
    toast("Download failed: " + e.message, "error");
    console.error(e);
  } finally {
    hideLoading();
  }
}

document
  .getElementById("download-btn")
  .addEventListener("click", downloadPDF);
document
  .getElementById("download-btn-2")
  .addEventListener("click", downloadPDF);

// ── Feature 1 & 2: Thumbnails + drag-to-reorder ──

async function renderThumbnail(pageNum) {
  const thumb = document.querySelector(`.thumb[data-page="${pageNum}"]`);
  if (!thumb) return;
  const thumbCanvas = thumb.querySelector("canvas");
  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale: 0.18 });
  thumbCanvas.width = viewport.width;
  thumbCanvas.height = viewport.height;
  await page.render({
    canvasContext: thumbCanvas.getContext("2d"),
    viewport,
  }).promise;
}

function buildThumbnailList() {
  thumbPanel.innerHTML = "";
  for (let i = 1; i <= totalPages; i++) {
    const div = document.createElement("div");
    div.className = "thumb" + (i === currentPage ? " active" : "");
    div.dataset.page = i;
    div.draggable = true;
    div.innerHTML = `<canvas></canvas><span>${i}</span>`;
    div.addEventListener("click", () => {
      if (extractMode) {
        togglePageSelection(i);
      } else {
        renderPage(i);
      }
    });
    div.addEventListener("dragstart", (e) => {
      dragFromPage = i;
      e.dataTransfer.effectAllowed = "move";
    });
    div.addEventListener("dragover", (e) => {
      e.preventDefault();
      div.style.opacity = "0.6";
    });
    div.addEventListener("dragleave", () => {
      div.style.opacity = "";
    });
    div.addEventListener("drop", async (e) => {
      e.preventDefault();
      div.style.opacity = "";
      if (dragFromPage && dragFromPage !== i)
        await reorderPages(dragFromPage, i);
    });
    thumbPanel.appendChild(div);
  }
}

async function renderAllThumbnails() {
  buildThumbnailList();
  for (let i = 1; i <= totalPages; i++) {
    await renderThumbnail(i);
  }
}

async function reorderPages(fromPage, toPage) {
  if (fromPage === toPage) return;
  showLoading("Reordering pages…");
  try {
    const n = totalPages;
    const order = Array.from({ length: n }, (_, i) => i);
    const [removed] = order.splice(fromPage - 1, 1);
    order.splice(toPage - 1, 0, removed);

    const newDoc = await PDFLib.PDFDocument.create();
    const copied = await newDoc.copyPages(pdfLibDoc, order);
    copied.forEach((p) => newDoc.addPage(p));
    const bytes = await newDoc.save();
    pdfLibDoc = await PDFLib.PDFDocument.load(bytes);
    pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) })
      .promise;

    const newAnns = {};
    order.forEach((origIdx, newIdx) => {
      const orig = origIdx + 1,
        dest = newIdx + 1;
      if (annotations[orig]) newAnns[dest] = annotations[orig];
    });
    annotations = newAnns;

    currentPage = toPage;
    await renderPage(currentPage);
    await renderAllThumbnails();
    updateFormFieldsAvailability();
    toast("Page moved");
  } catch (e) {
    toast("Reorder failed: " + e.message, "error");
  } finally {
    hideLoading();
  }
}

// ── Feature 3: Merge PDFs ──

document
  .getElementById("merge-btn")
  .addEventListener("click", () => mergeFileInput.click());

mergeFileInput.addEventListener("change", async (e) => {
  const files = Array.from(e.target.files);
  if (!files.length) return;
  showLoading(`Merging ${files.length} PDF(s)…`);
  try {
    for (const file of files) {
      const bytes = await readFile(file);
      const srcDoc = await PDFLib.PDFDocument.load(bytes);
      const pages = await pdfLibDoc.copyPages(
        srcDoc,
        srcDoc.getPageIndices(),
      );
      pages.forEach((p) => pdfLibDoc.addPage(p));
    }
    const bytes = await pdfLibDoc.save();
    pdfLibDoc = await PDFLib.PDFDocument.load(bytes);
    pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) })
      .promise;
    totalPages = pdfDoc.numPages;
    totalEl.textContent = totalPages;
    pageInput.max = totalPages;
    await renderPage(currentPage);
    await renderAllThumbnails();
    updateFormFieldsAvailability();
    toast(`Merged — ${totalPages} pages total`, "success");
  } catch (e) {
    toast("Merge failed: " + e.message, "error");
  } finally {
    hideLoading();
    mergeFileInput.value = "";
  }
});

// ── Feature 4: Watermark ──

document.getElementById("watermark-btn").addEventListener("click", () => {
  document.getElementById("watermark-popup").classList.add("open");
});

document.getElementById("wm-cancel-btn").addEventListener("click", () => {
  document.getElementById("watermark-popup").classList.remove("open");
});

document
  .getElementById("watermark-popup")
  .addEventListener("click", (e) => {
    if (e.target === document.getElementById("watermark-popup"))
      document.getElementById("watermark-popup").classList.remove("open");
  });

document.getElementById("wm-opacity").addEventListener("input", () => {
  document.getElementById("wm-opacity-val").textContent =
    document.getElementById("wm-opacity").value + "%";
});
document.getElementById("wm-angle").addEventListener("input", () => {
  document.getElementById("wm-angle-val").textContent =
    document.getElementById("wm-angle").value + "°";
});
document.getElementById("wm-size").addEventListener("input", () => {
  document.getElementById("wm-size-val").textContent =
    document.getElementById("wm-size").value;
});

document
  .getElementById("wm-apply-btn")
  .addEventListener("click", async () => {
    const text = document.getElementById("wm-text").value.trim();
    const opacity = +document.getElementById("wm-opacity").value / 100;
    const angle = +document.getElementById("wm-angle").value;
    const size = +document.getElementById("wm-size").value;
    const hex = document
      .getElementById("wm-color")
      .value.replace("#", "");
    const r = parseInt(hex.slice(0, 2), 16) / 255,
      g = parseInt(hex.slice(2, 4), 16) / 255,
      b = parseInt(hex.slice(4, 6), 16) / 255;
    if (!text) {
      toast("Enter watermark text", "error");
      return;
    }
    document.getElementById("watermark-popup").classList.remove("open");
    showLoading("Applying watermark…");
    try {
      const font = await pdfLibDoc.embedFont(
        PDFLib.StandardFonts.HelveticaBold,
      );
      const pages = pdfLibDoc.getPages();
      for (const page of pages) {
        const { width, height } = page.getSize();
        const textWidth = font.widthOfTextAtSize(text, size);
        page.drawText(text, {
          x: width / 2 - textWidth / 2,
          y: height / 2 - size / 2,
          size,
          font,
          color: PDFLib.rgb(r, g, b),
          opacity,
          rotate: PDFLib.degrees(angle),
        });
      }
      const bytes = await pdfLibDoc.save();
      pdfLibDoc = await PDFLib.PDFDocument.load(bytes);
      pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) })
        .promise;
      await renderPage(currentPage);
      await renderAllThumbnails();
      updateFormFieldsAvailability();
      toast("Watermark applied to all pages", "success");
    } catch (e) {
      toast("Watermark failed: " + e.message, "error");
    } finally {
      hideLoading();
    }
  });

// ── Feature 5: Extract pages ──

document.getElementById("extract-btn").addEventListener("click", () => {
  if (!extractMode) {
    extractMode = true;
    document.getElementById("extract-btn").classList.add("active");
    document.getElementById("extract-confirm-btn").style.display = "";
    document.getElementById("extract-cancel-btn").style.display = "";
    document.getElementById("thumb-panel").classList.add("selecting");
    toast(
      "Click thumbnails to select pages, then click Extract selected",
    );
  } else {
    cancelExtract();
  }
});

document
  .getElementById("extract-confirm-btn")
  .addEventListener("click", extractSelectedPages);
document
  .getElementById("extract-cancel-btn")
  .addEventListener("click", cancelExtract);

function cancelExtract() {
  extractMode = false;
  selectedPages.clear();
  document.getElementById("extract-btn").classList.remove("active");
  document.getElementById("extract-confirm-btn").style.display = "none";
  document.getElementById("extract-cancel-btn").style.display = "none";
  document.getElementById("thumb-panel").classList.remove("selecting");
  updateThumbnailSelection();
}

function togglePageSelection(pageNum) {
  if (selectedPages.has(pageNum)) selectedPages.delete(pageNum);
  else selectedPages.add(pageNum);
  updateThumbnailSelection();
}

function updateThumbnailSelection() {
  document.querySelectorAll(".thumb").forEach((t) => {
    t.classList.toggle(
      "selected",
      extractMode && selectedPages.has(+t.dataset.page),
    );
  });
}

async function extractSelectedPages() {
  if (selectedPages.size === 0) {
    toast("Select at least one page", "error");
    return;
  }
  showLoading("Extracting pages…");
  try {
    const indices = Array.from(selectedPages)
      .sort((a, b) => a - b)
      .map((p) => p - 1);
    const newDoc = await PDFLib.PDFDocument.create();
    const copied = await newDoc.copyPages(pdfLibDoc, indices);
    copied.forEach((p) => newDoc.addPage(p));
    const bytes = await newDoc.save();
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
      originalFileName.replace(/\.pdf$/i, "") + "-extracted.pdf";
    a.click();
    URL.revokeObjectURL(url);
    toast(`Extracted ${selectedPages.size} page(s)`, "success");
    cancelExtract();
  } catch (e) {
    toast("Extract failed: " + e.message, "error");
  } finally {
    hideLoading();
  }
}

// ── Feature 6: Fill existing form fields (AcroForm) ──

function updateFormFieldsAvailability() {
  const btn = document.getElementById("form-fields-btn");
  let hasFields = false;
  try {
    if (
      pdfLibDoc &&
      pdfLibDoc.catalog.has(PDFLib.PDFName.of("AcroForm"))
    ) {
      hasFields = pdfLibDoc.getForm().getFields().length > 0;
    }
  } catch (e) {
    hasFields = false;
  }
  btn.style.display = hasFields ? "" : "none";
}

function buildFormFieldsList() {
  const form = pdfLibDoc.getForm();
  const listEl = document.getElementById("form-fields-list");
  listEl.innerHTML = "";

  form.getFields().forEach((field) => {
    const name = field.getName();
    const row = document.createElement("div");
    row.className = "form-field-row";

    const label = document.createElement("label");
    label.textContent = name;

    let input;
    if (field instanceof PDFLib.PDFTextField) {
      input = document.createElement("input");
      input.type = "text";
      input.value = field.getText() || "";
      input.dataset.fieldType = "text";
    } else if (field instanceof PDFLib.PDFCheckBox) {
      input = document.createElement("input");
      input.type = "checkbox";
      input.checked = field.isChecked();
      input.dataset.fieldType = "checkbox";
      row.classList.add("checkbox-row");
    } else if (
      field instanceof PDFLib.PDFDropdown ||
      field instanceof PDFLib.PDFOptionList
    ) {
      input = document.createElement("select");
      input.multiple = field instanceof PDFLib.PDFOptionList;
      const selected = field.getSelected();
      field.getOptions().forEach((opt) => {
        const optionEl = document.createElement("option");
        optionEl.value = opt;
        optionEl.textContent = opt;
        optionEl.selected = selected.includes(opt);
        input.appendChild(optionEl);
      });
      input.dataset.fieldType = "select";
    } else if (field instanceof PDFLib.PDFRadioGroup) {
      input = document.createElement("select");
      const selected = field.getSelected();
      field.getOptions().forEach((opt) => {
        const optionEl = document.createElement("option");
        optionEl.value = opt;
        optionEl.textContent = opt;
        optionEl.selected = opt === selected;
        input.appendChild(optionEl);
      });
      input.dataset.fieldType = "radio";
    } else {
      return; // push buttons, signatures — not fillable
    }

    input.dataset.fieldName = name;

    if (field.isReadOnly && field.isReadOnly()) input.disabled = true;

    row.appendChild(input);
    if (row.classList.contains("checkbox-row")) {
      row.appendChild(label);
    } else {
      row.insertBefore(label, input);
    }
    listEl.appendChild(row);
  });

  if (!listEl.children.length) {
    listEl.innerHTML =
      '<p class="form-fields-empty">No fillable fields found.</p>';
  }
}

document
  .getElementById("form-fields-btn")
  .addEventListener("click", () => {
    if (!pdfLibDoc) return;
    buildFormFieldsList();
    document.getElementById("form-flatten-checkbox").checked = false;
    document.getElementById("form-fields-popup").classList.add("open");
  });

document
  .getElementById("form-fields-cancel-btn")
  .addEventListener("click", () => {
    document.getElementById("form-fields-popup").classList.remove("open");
  });

document
  .getElementById("form-fields-popup")
  .addEventListener("click", (e) => {
    if (e.target === document.getElementById("form-fields-popup"))
      document
        .getElementById("form-fields-popup")
        .classList.remove("open");
  });

document
  .getElementById("form-fields-apply-btn")
  .addEventListener("click", async () => {
    if (!pdfLibDoc) return;
    const form = pdfLibDoc.getForm();
    const listEl = document.getElementById("form-fields-list");
    const flatten = document.getElementById(
      "form-flatten-checkbox",
    ).checked;
    document.getElementById("form-fields-popup").classList.remove("open");
    showLoading("Updating form fields…");
    try {
      listEl.querySelectorAll("[data-field-name]").forEach((input) => {
        const field = form.getField(input.dataset.fieldName);
        const type = input.dataset.fieldType;
        if (type === "text") {
          field.setText(input.value);
        } else if (type === "checkbox") {
          if (input.checked) field.check();
          else field.uncheck();
        } else if (type === "select") {
          const values = Array.from(input.selectedOptions).map(
            (o) => o.value,
          );
          field.select(values.length === 1 ? values[0] : values);
        } else if (type === "radio") {
          field.select(input.value);
        }
      });

      if (flatten) form.flatten();

      const bytes = await pdfLibDoc.save();
      pdfLibDoc = await PDFLib.PDFDocument.load(bytes);
      pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) })
        .promise;
      await renderPage(currentPage);
      await renderAllThumbnails();
      updateFormFieldsAvailability();
      toast(
        flatten ? "Form filled and flattened" : "Form fields updated",
        "success",
      );
    } catch (e) {
      toast("Failed to update form: " + e.message, "error");
    } finally {
      hideLoading();
    }
  });
