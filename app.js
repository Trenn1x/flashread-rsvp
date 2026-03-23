const state = {
  rawText: "",
  units: [],
  mode: "word",
  themeChoice: "auto",
  index: 0,
  wpm: 300,
  playing: false,
  timerId: null,
  touchStart: null,
};

const THEME_STORAGE_KEY = "flashread-theme-choice";
const VALID_THEME_CHOICES = new Set(["auto", "dark", "light"]);
const systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");

const els = {
  fileInput: document.getElementById("fileInput"),
  fileName: document.getElementById("fileName"),
  unitCount: document.getElementById("unitCount"),
  flashWord: document.getElementById("flashWord"),
  readerSurface: document.getElementById("readerSurface"),
  playPauseBtn: document.getElementById("playPauseBtn"),
  rewindBtn: document.getElementById("rewindBtn"),
  forwardBtn: document.getElementById("forwardBtn"),
  speedRange: document.getElementById("speedRange"),
  speedValue: document.getElementById("speedValue"),
  progressRange: document.getElementById("progressRange"),
  progressValue: document.getElementById("progressValue"),
  statusToast: document.getElementById("statusToast"),
  modeButtons: [...document.querySelectorAll(".chip[data-mode]")],
  themeButtons: [...document.querySelectorAll(".chip[data-theme-choice]")],
  dropzone: document.getElementById("dropzone"),
};

if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeText(raw) {
  return raw
    .replaceAll("\r", "\n")
    .replaceAll("\u00a0", " ")
    .replaceAll(/[ \t]+/g, " ")
    .replaceAll(/[ \t]*\n[ \t]*/g, "\n")
    .trim();
}

function toWordUnits(text) {
  const normalized = text.replaceAll(/\s+/g, " ").trim();
  if (!normalized) return [];
  return normalized.match(/\S+/g) ?? [];
}

function toLetterUnits(text) {
  const compact = text.replaceAll(/\s+/g, " ");
  return [...compact].filter((ch) => ch.trim() !== "");
}

function unitsFromText(text, mode) {
  return mode === "letter" ? toLetterUnits(text) : toWordUnits(text);
}

function getPivotIndex(word) {
  if (word.length <= 1) return 0;
  return Math.min(word.length - 1, Math.floor((word.length - 1) * 0.35));
}

function renderCurrent() {
  if (!state.units.length) {
    els.flashWord.textContent = "Upload a file";
    return;
  }

  const token = state.units[state.index] ?? "";
  if (state.mode === "letter") {
    els.flashWord.textContent = token;
    return;
  }

  const pivot = getPivotIndex(token);
  const left = escapeHtml(token.slice(0, pivot));
  const center = escapeHtml(token[pivot] ?? "");
  const right = escapeHtml(token.slice(pivot + 1));
  els.flashWord.innerHTML = `${left}<span class="pivot">${center}</span>${right}`;
}

function updateProgressUI() {
  const count = state.units.length;
  els.unitCount.textContent = String(count);
  els.progressRange.max = String(Math.max(0, count - 1));
  els.progressRange.value = String(Math.max(0, state.index));
  els.progressValue.textContent = count
    ? `${state.index + 1} / ${count}`
    : "0 / 0";
}

function updateSpeedUI() {
  els.speedValue.textContent = `${state.wpm} WPM`;
  els.speedRange.value = String(state.wpm);
}

function updatePlayButton() {
  els.playPauseBtn.textContent = state.playing ? "Pause" : "Play";
}

function showToast(message) {
  els.statusToast.textContent = message;
  els.statusToast.classList.add("visible");
  window.clearTimeout(showToast.timerId);
  showToast.timerId = window.setTimeout(() => {
    els.statusToast.classList.remove("visible");
  }, 900);
}

function readSavedThemeChoice() {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return VALID_THEME_CHOICES.has(saved) ? saved : "auto";
  } catch {
    return "auto";
  }
}

function themeLabel(choice) {
  return choice.charAt(0).toUpperCase() + choice.slice(1);
}

function resolveTheme(choice) {
  if (choice === "auto") {
    return systemThemeQuery.matches ? "dark" : "light";
  }

  return choice;
}

function updateThemeButtonState() {
  els.themeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.themeChoice === state.themeChoice);
  });
}

function applyTheme(choice, options = {}) {
  const { persist = true, announce = true } = options;
  if (!VALID_THEME_CHOICES.has(choice)) return;

  state.themeChoice = choice;
  const resolvedTheme = resolveTheme(choice);
  document.documentElement.dataset.theme = resolvedTheme;
  updateThemeButtonState();

  if (persist) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, choice);
    } catch {
      // Ignore localStorage write errors.
    }
  }

  if (announce) {
    const suffix = choice === "auto" ? ` (${themeLabel(resolvedTheme)})` : "";
    showToast(`Theme: ${themeLabel(choice)}${suffix}`);
  }
}

function handleSystemThemeChange() {
  if (state.themeChoice !== "auto") return;
  applyTheme("auto", { persist: false, announce: false });
}

function stepDelayMs(token) {
  const baseMs = 60000 / state.wpm;

  if (state.mode === "letter") {
    return Math.max(35, Math.round(baseMs / 5));
  }

  let factor = 1;
  if (token.length >= 9) factor += 0.15;
  if (/[,.!?;:]$/.test(token)) factor += 0.35;
  return Math.round(baseMs * factor);
}

function pausePlayback() {
  state.playing = false;
  window.clearTimeout(state.timerId);
  state.timerId = null;
  updatePlayButton();
}

function tick() {
  if (!state.playing) return;
  renderCurrent();
  updateProgressUI();

  if (state.index >= state.units.length - 1) {
    pausePlayback();
    showToast("Reached end");
    return;
  }

  const token = state.units[state.index] ?? "";
  const delay = stepDelayMs(token);
  state.timerId = window.setTimeout(() => {
    state.index += 1;
    tick();
  }, delay);
}

function startPlayback() {
  if (!state.units.length) {
    showToast("Upload a document first");
    return;
  }

  if (state.index >= state.units.length - 1) {
    state.index = 0;
  }

  state.playing = true;
  updatePlayButton();
  window.clearTimeout(state.timerId);
  tick();
}

function restartTickerIfNeeded() {
  if (!state.playing) return;
  window.clearTimeout(state.timerId);
  tick();
}

function togglePlayback() {
  if (state.playing) {
    pausePlayback();
    return;
  }
  startPlayback();
}

function jump(delta) {
  if (!state.units.length) return;
  const next = Math.max(0, Math.min(state.units.length - 1, state.index + delta));
  state.index = next;
  renderCurrent();
  updateProgressUI();
  restartTickerIfNeeded();
}

function setMode(nextMode) {
  if (nextMode === state.mode) return;
  const prevCount = state.units.length;
  const ratio = prevCount > 1 ? state.index / (prevCount - 1) : 0;

  state.mode = nextMode;
  state.units = unitsFromText(state.rawText, nextMode);
  state.index = state.units.length
    ? Math.round(ratio * (state.units.length - 1))
    : 0;

  els.modeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === nextMode);
  });

  renderCurrent();
  updateProgressUI();
  restartTickerIfNeeded();
}

async function extractTextFromPdf(file) {
  if (!window.pdfjsLib) {
    throw new Error("PDF parser not loaded. Please refresh and try again.");
  }

  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = window.pdfjsLib.getDocument({ data });
  const doc = await loadingTask.promise;

  const pageChunks = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    pageChunks.push(content.items.map((item) => item.str || "").join(" "));
  }

  return pageChunks.join("\n");
}

async function extractTextFromDocx(file) {
  if (!window.mammoth) {
    throw new Error("DOCX parser not loaded. Please refresh and try again.");
  }

  const arrayBuffer = await file.arrayBuffer();
  const result = await window.mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

async function extractTextFromPlain(file) {
  return file.text();
}

async function extractText(file) {
  const ext = (file.name.split(".").pop() || "").toLowerCase();

  if (file.type === "application/pdf" || ext === "pdf") {
    return extractTextFromPdf(file);
  }

  if (
    file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    ext === "docx"
  ) {
    return extractTextFromDocx(file);
  }

  if (
    file.type.startsWith("text/") ||
    ["txt", "md", "csv", "json", "rtf"].includes(ext)
  ) {
    return extractTextFromPlain(file);
  }

  throw new Error("Unsupported type. Use PDF, DOCX, TXT, or MD.");
}

function loadTextIntoReader(text, fileName) {
  state.rawText = normalizeText(text);
  state.units = unitsFromText(state.rawText, state.mode);
  state.index = 0;
  pausePlayback();

  els.fileName.textContent = fileName;
  renderCurrent();
  updateProgressUI();

  if (!state.units.length) {
    showToast("No readable text found in this file");
    return;
  }

  showToast(`Loaded ${state.units.length} units`);
}

async function handleFile(file) {
  if (!file) return;

  showToast("Parsing file...");

  try {
    const text = await extractText(file);
    loadTextIntoReader(text, file.name);
  } catch (error) {
    pausePlayback();
    showToast("Could not parse this file");
    console.error(error);
  }
}

els.fileInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  await handleFile(file);
});

["dragenter", "dragover"].forEach((eventName) => {
  els.dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    els.dropzone.classList.add("drag-active");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  els.dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    els.dropzone.classList.remove("drag-active");
  });
});

els.dropzone.addEventListener("drop", async (event) => {
  const file = event.dataTransfer?.files?.[0];
  await handleFile(file);
});

els.playPauseBtn.addEventListener("click", togglePlayback);
els.rewindBtn.addEventListener("click", () => jump(-10));
els.forwardBtn.addEventListener("click", () => jump(10));

els.speedRange.addEventListener("input", () => {
  state.wpm = Number(els.speedRange.value);
  updateSpeedUI();
  restartTickerIfNeeded();
});

els.progressRange.addEventListener("input", () => {
  state.index = Number(els.progressRange.value);
  renderCurrent();
  updateProgressUI();
  restartTickerIfNeeded();
});

els.modeButtons.forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});

els.themeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    applyTheme(button.dataset.themeChoice);
  });
});

els.readerSurface.addEventListener("pointerdown", (event) => {
  els.readerSurface.setPointerCapture(event.pointerId);
  state.touchStart = {
    x: event.clientX,
    y: event.clientY,
    t: Date.now(),
  };
});

els.readerSurface.addEventListener("pointerup", (event) => {
  if (!state.touchStart) return;

  const width = els.readerSurface.getBoundingClientRect().width;
  const dx = event.clientX - state.touchStart.x;
  const dy = event.clientY - state.touchStart.y;
  const elapsed = Date.now() - state.touchStart.t;

  state.touchStart = null;

  const absX = Math.abs(dx);
  const absY = Math.abs(dy);

  if (absX < 16 && absY < 16 && elapsed < 350) {
    const xWithinSurface = event.offsetX;
    if (xWithinSurface < width * 0.33) {
      jump(-10);
      showToast("Rewind 10");
      return;
    }

    if (xWithinSurface > width * 0.66) {
      jump(10);
      showToast("Forward 10");
      return;
    }

    togglePlayback();
    showToast(state.playing ? "Play" : "Pause");
    return;
  }

  if (absX > absY && absX > 30) {
    state.wpm = Math.max(80, Math.min(900, state.wpm + (dx > 0 ? 25 : -25)));
    updateSpeedUI();
    restartTickerIfNeeded();
    showToast(`${state.wpm} WPM`);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === " ") {
    event.preventDefault();
    togglePlayback();
  }

  if (event.key === "ArrowLeft") {
    jump(-10);
  }

  if (event.key === "ArrowRight") {
    jump(10);
  }

  if (event.key === "ArrowUp") {
    state.wpm = Math.min(900, state.wpm + 20);
    updateSpeedUI();
    restartTickerIfNeeded();
  }

  if (event.key === "ArrowDown") {
    state.wpm = Math.max(80, state.wpm - 20);
    updateSpeedUI();
    restartTickerIfNeeded();
  }
});

if (typeof systemThemeQuery.addEventListener === "function") {
  systemThemeQuery.addEventListener("change", handleSystemThemeChange);
} else if (typeof systemThemeQuery.addListener === "function") {
  systemThemeQuery.addListener(handleSystemThemeChange);
}

applyTheme(readSavedThemeChoice(), { persist: false, announce: false });
updatePlayButton();
updateProgressUI();
updateSpeedUI();
renderCurrent();
