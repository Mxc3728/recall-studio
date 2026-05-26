const storageKey = "recall-studio-state-v1";
const libraryKey = "recall-studio-library-v1";
const sampleMaterial = `Photosynthesis converts light energy into chemical energy. In plants, chlorophyll captures sunlight inside the chloroplasts. Carbon dioxide and water are transformed into glucose and oxygen through a sequence of reactions.`;
const markColors = {
  amber: {
    bg: "#fff1c7",
    border: "rgba(239, 184, 79, 0.72)",
    text: "#6f4b00",
    revealed: "rgba(239, 184, 79, 0.16)",
  },
  mint: {
    bg: "#dff7f5",
    border: "rgba(31, 122, 100, 0.62)",
    text: "#155743",
    revealed: "rgba(31, 122, 100, 0.1)",
  },
  sky: {
    bg: "#ddeeff",
    border: "rgba(76, 127, 176, 0.62)",
    text: "#234f78",
    revealed: "rgba(76, 127, 176, 0.12)",
  },
  rose: {
    bg: "#ffe3dc",
    border: "rgba(201, 79, 64, 0.62)",
    text: "#8f2f25",
    revealed: "rgba(201, 79, 64, 0.12)",
  },
  graphite: {
    bg: "#e8ebe6",
    border: "rgba(99, 112, 103, 0.58)",
    text: "#3a433d",
    revealed: "rgba(99, 112, 103, 0.12)",
  },
};

const elements = {
  sourceInput: document.querySelector("#sourceInput"),
  setTitle: document.querySelector("#setTitle"),
  buildButton: document.querySelector("#buildButton"),
  saveSetButton: document.querySelector("#saveSetButton"),
  sampleButton: document.querySelector("#sampleButton"),
  newButton: document.querySelector("#newButton"),
  installButton: document.querySelector("#installButton"),
  saveState: document.querySelector("#saveState"),
  savedCount: document.querySelector("#savedCount"),
  savedList: document.querySelector("#savedList"),
  studySurface: document.querySelector("#studySurface"),
  wordCount: document.querySelector("#wordCount"),
  hiddenCount: document.querySelector("#hiddenCount"),
  groupCount: document.querySelector("#groupCount"),
  hideAllButton: document.querySelector("#hideAllButton"),
  revealAllButton: document.querySelector("#revealAllButton"),
  clearMasksButton: document.querySelector("#clearMasksButton"),
  modeButtons: document.querySelectorAll("[data-mode]"),
  maskStyleButtons: document.querySelectorAll("[data-mask-style]"),
  markColorButtons: document.querySelectorAll("[data-mark-color]"),
};

const initialState = {
  activeSetId: null,
  title: "Untitled set",
  source: "",
  tokens: [],
  groups: [],
  mode: "edit",
  maskStyle: "blur",
  markColor: "amber",
};

let state = loadState();
let library = loadLibrary();
let dragState = null;
let saveTimer = null;
let installPrompt = null;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (!saved || !Array.isArray(saved.tokens) || !Array.isArray(saved.groups)) {
      return { ...initialState };
    }

    return {
      ...initialState,
      ...saved,
      groups: saved.groups.map((group) => ({ revealed: false, ...group })),
    };
  } catch {
    return { ...initialState };
  }
}

function loadLibrary() {
  try {
    const saved = JSON.parse(localStorage.getItem(libraryKey));
    if (!Array.isArray(saved)) return [];

    return saved
      .filter((set) => set && set.id && typeof set.source === "string")
      .map((set) => ({
        ...set,
        tokens: Array.isArray(set.tokens) ? set.tokens : tokenize(set.source),
        groups: Array.isArray(set.groups) ? set.groups : [],
      }));
  } catch {
    return [];
  }
}

function saveLibrary() {
  localStorage.setItem(libraryKey, JSON.stringify(library));
}

function saveState() {
  clearTimeout(saveTimer);
  elements.saveState.textContent = "Saving";

  saveTimer = setTimeout(() => {
    localStorage.setItem(storageKey, JSON.stringify(state));
    elements.saveState.textContent = "Saved locally";
  }, 180);
}

function tokenize(text) {
  const parts = text.match(/\p{L}[\p{L}\p{M}\p{N}'’-]*|\p{N}+(?:[.,]\p{N}+)*|\s+|[^\s]/gu) || [];

  return parts.map((text, index) => ({
    id: index,
    text,
    type: /^\s+$/u.test(text) ? "space" : /[\p{L}\p{N}]/u.test(text) ? "word" : "punct",
  }));
}

function makeGroupId() {
  return `group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeSetId() {
  return `set-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getTokenText(tokens = state.tokens) {
  return tokens.map((token) => token.text).join("");
}

function getWordCount(tokens = state.tokens) {
  return tokens.filter((token) => token.type === "word").length;
}

function getWordIndicesBetween(start, end) {
  const low = Math.min(start, end);
  const high = Math.max(start, end);

  return state.tokens
    .slice(low, high + 1)
    .filter((token) => token.type === "word")
    .map((token) => token.id);
}

function getGroupForToken(tokenId) {
  return state.groups.find((group) => group.wordIds.includes(tokenId));
}

function rebuildGroupRanges(groups = state.groups) {
  return groups
    .map((group) => {
      const sortedIds = [...group.wordIds].sort((a, b) => a - b);

      return {
        ...group,
        wordIds: sortedIds,
        start: sortedIds[0],
        end: sortedIds[sortedIds.length - 1],
      };
    })
    .filter((group) => group.wordIds.length > 0);
}

function applySourceFromInputs() {
  const source = elements.sourceInput.value.trim();
  const title = elements.setTitle.value.trim() || "Untitled set";
  const sourceChanged = source !== getTokenText();

  state.title = title;
  state.source = source;

  if (sourceChanged) {
    state.tokens = tokenize(source);
    state.groups = [];
    state.mode = "edit";
  }

  state.groups = rebuildGroupRanges();
}

function createSetSnapshot(id, existingSet) {
  const now = new Date().toISOString();

  return {
    id,
    title: state.title,
    source: state.source,
    tokens: state.tokens,
    groups: state.groups.map((group) => ({ ...group, revealed: false })),
    maskStyle: state.maskStyle,
    markColor: state.markColor,
    createdAt: existingSet?.createdAt || now,
    updatedAt: now,
  };
}

function saveCurrentSet() {
  applySourceFromInputs();

  if (!state.source) {
    elements.saveState.textContent = "Add material first";
    render();
    return;
  }

  const existingSet = library.find((set) => set.id === state.activeSetId);
  const id = existingSet?.id || state.activeSetId || makeSetId();
  const snapshot = createSetSnapshot(id, existingSet);

  if (existingSet) {
    library = library.map((set) => (set.id === id ? snapshot : set));
  } else {
    library = [snapshot, ...library];
  }

  state.activeSetId = id;
  saveLibrary();
  saveState();
  elements.saveState.textContent = "Saved material";
  render();
}

function openSavedSet(id) {
  const savedSet = library.find((set) => set.id === id);
  if (!savedSet) return;

  state = {
    ...initialState,
    activeSetId: savedSet.id,
    title: savedSet.title,
    source: savedSet.source,
    tokens: Array.isArray(savedSet.tokens) ? savedSet.tokens : tokenize(savedSet.source),
    groups: rebuildGroupRanges((savedSet.groups || []).map((group) => ({ ...group, revealed: false }))),
    mode: savedSet.groups?.length ? "study" : "edit",
    maskStyle: savedSet.maskStyle || state.maskStyle || "blur",
    markColor: savedSet.markColor || "amber",
  };

  saveState();
  render();
}

function deleteSavedSet(id) {
  const savedSet = library.find((set) => set.id === id);
  if (!savedSet) return;

  if (!window.confirm(`Delete "${savedSet.title}"?`)) return;

  library = library.filter((set) => set.id !== id);
  if (state.activeSetId === id) {
    state.activeSetId = null;
  }

  saveLibrary();
  saveState();
  render();
}

function maskRange(start, end) {
  const wordIds = getWordIndicesBetween(start, end);
  if (!wordIds.length) return;

  const touchedGroupIds = new Set();
  wordIds.forEach((wordId) => {
    const group = getGroupForToken(wordId);
    if (group) touchedGroupIds.add(group.id);
  });

  const mergedWordIds = new Set(wordIds);
  state.groups.forEach((group) => {
    if (touchedGroupIds.has(group.id)) {
      group.wordIds.forEach((wordId) => mergedWordIds.add(wordId));
    }
  });

  state.groups = state.groups.filter((group) => !touchedGroupIds.has(group.id));
  state.groups.push({
    id: makeGroupId(),
    wordIds: [...mergedWordIds].sort((a, b) => a - b),
    revealed: false,
  });
  state.groups = rebuildGroupRanges();
  saveState();
  render();
}

function toggleSingleWord(tokenId) {
  const group = getGroupForToken(tokenId);

  if (group) {
    state.groups = state.groups.filter((item) => item.id !== group.id);
  } else {
    state.groups.push({
      id: makeGroupId(),
      wordIds: [tokenId],
      revealed: false,
    });
  }

  state.groups = rebuildGroupRanges();
  saveState();
  render();
}

function buildFromSource() {
  const source = elements.sourceInput.value.trim();

  state = {
    ...state,
    title: elements.setTitle.value.trim() || "Untitled set",
    source,
    tokens: tokenize(source),
    groups: [],
    mode: "edit",
  };

  saveState();
  render();
}

function setMode(mode) {
  state.mode = mode;
  if (mode === "study") {
    state.groups = state.groups.map((group) => ({ ...group, revealed: false }));
  }
  saveState();
  render();
}

function setMaskStyle(maskStyle) {
  state.maskStyle = maskStyle;
  saveState();
  render();
}

function setMarkColor(markColor) {
  if (!markColors[markColor]) return;

  state.markColor = markColor;
  saveState();
  render();
}

function setAllRevealed(revealed) {
  state.groups = state.groups.map((group) => ({ ...group, revealed }));
  saveState();
  render();
}

function clearMasks() {
  state.groups = [];
  saveState();
  render();
}

function createTextNode(text) {
  return document.createTextNode(text);
}

function createWordToken(token, group) {
  const span = document.createElement("span");
  span.className = "word-token";
  span.textContent = token.text;
  span.dataset.tokenId = token.id;

  if (group) {
    span.classList.add("is-masked");
    span.dataset.groupId = group.id;
  }

  return span;
}

function getGroupText(group) {
  return state.tokens.slice(group.start, group.end + 1).map((token) => token.text).join("");
}

function maskWithBlanks(text) {
  return text.replace(/[^\s]/gu, "_");
}

function maskWithHints(text) {
  return text.replace(/\p{L}[\p{L}\p{M}\p{N}'’-]*|\p{N}+(?:[.,]\p{N}+)*/gu, (word) => {
    if (word.length <= 1) return word;
    return `${word[0]}${"_".repeat(Math.max(word.length - 1, 1))}`;
  });
}

function createStudyGroup(group) {
  const button = document.createElement("button");
  const text = getGroupText(group);
  const hidden = !group.revealed;

  button.type = "button";
  button.className = `mask-group ${hidden ? "is-hidden" : "is-revealed"}`;
  button.dataset.groupId = group.id;
  button.dataset.style = state.maskStyle;
  button.setAttribute("aria-label", hidden ? "Reveal chunk" : "Hide chunk");

  if (!hidden) {
    button.textContent = text;
  } else if (state.maskStyle === "blank") {
    button.textContent = maskWithBlanks(text);
  } else if (state.maskStyle === "hint") {
    button.textContent = maskWithHints(text);
  } else {
    button.textContent = text;
  }

  return button;
}

function renderEditSurface(fragment) {
  const groupsByToken = new Map();
  state.groups.forEach((group) => {
    group.wordIds.forEach((tokenId) => groupsByToken.set(tokenId, group));
  });

  state.tokens.forEach((token) => {
    if (token.type !== "word") {
      fragment.append(createTextNode(token.text));
      return;
    }

    fragment.append(createWordToken(token, groupsByToken.get(token.id)));
  });
}

function renderStudySurface(fragment) {
  const groupsByStart = new Map(state.groups.map((group) => [group.start, group]));
  let index = 0;

  while (index < state.tokens.length) {
    const group = groupsByStart.get(index);

    if (group) {
      fragment.append(createStudyGroup(group));
      index = group.end + 1;
      continue;
    }

    fragment.append(createTextNode(state.tokens[index].text));
    index += 1;
  }
}

function renderEmptyState() {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.textContent = "Paste material to begin";
  elements.studySurface.append(empty);
}

function renderStats() {
  const wordCount = getWordCount();
  const hiddenWords = new Set();
  state.groups.forEach((group) => group.wordIds.forEach((wordId) => hiddenWords.add(wordId)));

  elements.wordCount.textContent = wordCount;
  elements.hiddenCount.textContent = hiddenWords.size;
  elements.groupCount.textContent = state.groups.length;
}

function createTrashIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("viewBox", "0 0 24 24");

  ["M3 6h18", "M8 6V4h8v2", "M19 6l-1 14H6L5 6", "M10 11v5", "M14 11v5"].forEach((d) => {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    svg.append(path);
  });

  return svg;
}

function renderSavedMaterials() {
  elements.savedCount.textContent = library.length;
  elements.savedList.replaceChildren();

  if (!library.length) {
    const empty = document.createElement("div");
    empty.className = "saved-empty";
    empty.textContent = "No saved materials";
    elements.savedList.append(empty);
    return;
  }

  library.forEach((savedSet) => {
    const item = document.createElement("div");
    item.className = "saved-item";
    item.classList.toggle("active", savedSet.id === state.activeSetId);

    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.className = "saved-open";
    openButton.dataset.openSetId = savedSet.id;

    const title = document.createElement("span");
    title.className = "saved-title";
    title.textContent = savedSet.title || "Untitled set";

    const meta = document.createElement("span");
    meta.className = "saved-meta";
    meta.textContent = `${getWordCount(savedSet.tokens)} words · ${(savedSet.groups || []).length} chunks`;

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "saved-delete";
    deleteButton.dataset.deleteSetId = savedSet.id;
    deleteButton.setAttribute("aria-label", `Delete ${savedSet.title || "saved material"}`);
    deleteButton.title = "Delete";
    deleteButton.append(createTrashIcon());

    openButton.append(title, meta);
    item.append(openButton, deleteButton);
    elements.savedList.append(item);
  });
}

function renderControls() {
  const markColor = markColors[state.markColor] || markColors.amber;

  elements.modeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === state.mode);
  });

  elements.maskStyleButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.maskStyle === state.maskStyle);
  });

  elements.markColorButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.markColor === state.markColor);
  });

  elements.setTitle.value = state.title;
  elements.sourceInput.value = state.source;
  elements.studySurface.style.setProperty("--mark-bg", markColor.bg);
  elements.studySurface.style.setProperty("--mark-border", markColor.border);
  elements.studySurface.style.setProperty("--mark-text", markColor.text);
  elements.studySurface.style.setProperty("--mark-revealed", markColor.revealed);
  elements.studySurface.classList.toggle("mode-edit", state.mode === "edit");
  elements.studySurface.classList.toggle("mode-study", state.mode === "study");
  elements.saveSetButton.textContent = state.activeSetId ? "Update" : "Save";
}

function render() {
  state.groups = rebuildGroupRanges();
  elements.studySurface.replaceChildren();
  renderControls();
  renderSavedMaterials();
  renderStats();

  if (!state.tokens.length) {
    renderEmptyState();
    return;
  }

  const fragment = document.createDocumentFragment();

  if (state.mode === "study") {
    renderStudySurface(fragment);
  } else {
    renderEditSurface(fragment);
  }

  elements.studySurface.append(fragment);
}

function getTokenElement(target) {
  return target.closest?.(".word-token");
}

function updateDraggingHighlight() {
  elements.studySurface.querySelectorAll(".word-token.is-dragging").forEach((node) => {
    node.classList.remove("is-dragging");
  });

  if (!dragState || dragState.start === dragState.end) return;

  const selectedIds = new Set(getWordIndicesBetween(dragState.start, dragState.end));
  elements.studySurface.querySelectorAll(".word-token").forEach((node) => {
    node.classList.toggle("is-dragging", selectedIds.has(Number(node.dataset.tokenId)));
  });
}

function onPointerDown(event) {
  if (state.mode !== "edit") return;

  const tokenElement = getTokenElement(event.target);
  if (!tokenElement) return;

  const tokenId = Number(tokenElement.dataset.tokenId);
  dragState = {
    pointerId: event.pointerId,
    start: tokenId,
    end: tokenId,
    moved: false,
  };

  tokenElement.setPointerCapture?.(event.pointerId);
  event.preventDefault();
}

function onPointerMove(event) {
  if (!dragState || state.mode !== "edit") return;

  const target = document.elementFromPoint(event.clientX, event.clientY);
  const tokenElement = getTokenElement(target);
  if (!tokenElement) return;

  const tokenId = Number(tokenElement.dataset.tokenId);
  if (tokenId === dragState.end) return;

  dragState.end = tokenId;
  dragState.moved = true;
  updateDraggingHighlight();
}

function onPointerUp() {
  if (!dragState || state.mode !== "edit") return;

  const { start, end, moved } = dragState;
  dragState = null;

  if (moved && getWordIndicesBetween(start, end).length > 1) {
    maskRange(start, end);
  } else {
    toggleSingleWord(start);
  }
}

function onSurfaceClick(event) {
  if (state.mode !== "study") return;

  const groupElement = event.target.closest?.(".mask-group");
  if (!groupElement) return;

  state.groups = state.groups.map((group) => {
    if (group.id !== groupElement.dataset.groupId) return group;
    return { ...group, revealed: !group.revealed };
  });

  saveState();
  render();
}

function startNewSet() {
  state = { ...initialState };
  localStorage.removeItem(storageKey);
  elements.saveState.textContent = "New set";
  render();
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || window.location.protocol === "file:") return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

function wireInstallPrompt() {
  if (!elements.installButton) return;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    elements.installButton.hidden = false;
  });

  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    elements.installButton.hidden = true;
  });

  elements.installButton.addEventListener("click", async () => {
    if (!installPrompt) return;

    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    elements.installButton.hidden = true;
  });
}

elements.buildButton.addEventListener("click", buildFromSource);
elements.saveSetButton.addEventListener("click", saveCurrentSet);
elements.sampleButton.addEventListener("click", () => {
  state.activeSetId = null;
  elements.sourceInput.value = sampleMaterial;
  elements.setTitle.value = "Photosynthesis";
  buildFromSource();
});
elements.newButton.addEventListener("click", startNewSet);
elements.hideAllButton.addEventListener("click", () => setAllRevealed(false));
elements.revealAllButton.addEventListener("click", () => setAllRevealed(true));
elements.clearMasksButton.addEventListener("click", clearMasks);

elements.modeButtons.forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});

elements.maskStyleButtons.forEach((button) => {
  button.addEventListener("click", () => setMaskStyle(button.dataset.maskStyle));
});

elements.markColorButtons.forEach((button) => {
  button.addEventListener("click", () => setMarkColor(button.dataset.markColor));
});

elements.setTitle.addEventListener("input", () => {
  state.title = elements.setTitle.value.trim() || "Untitled set";
  saveState();
});

elements.sourceInput.addEventListener("input", () => {
  state.source = elements.sourceInput.value;
  saveState();
});

elements.savedList.addEventListener("click", (event) => {
  const deleteButton = event.target.closest?.("[data-delete-set-id]");
  if (deleteButton) {
    deleteSavedSet(deleteButton.dataset.deleteSetId);
    return;
  }

  const openButton = event.target.closest?.("[data-open-set-id]");
  if (openButton) {
    openSavedSet(openButton.dataset.openSetId);
  }
});

elements.studySurface.addEventListener("pointerdown", onPointerDown);
elements.studySurface.addEventListener("pointermove", onPointerMove);
elements.studySurface.addEventListener("pointerup", onPointerUp);
elements.studySurface.addEventListener("pointercancel", () => {
  dragState = null;
  updateDraggingHighlight();
});
elements.studySurface.addEventListener("click", onSurfaceClick);

registerServiceWorker();
wireInstallPrompt();
render();
