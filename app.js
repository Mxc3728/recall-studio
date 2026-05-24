const storageKey = "recall-studio-state-v1";
const sampleMaterial = `Photosynthesis converts light energy into chemical energy. In plants, chlorophyll captures sunlight inside the chloroplasts. Carbon dioxide and water are transformed into glucose and oxygen through a sequence of reactions.`;

const elements = {
  sourceInput: document.querySelector("#sourceInput"),
  setTitle: document.querySelector("#setTitle"),
  buildButton: document.querySelector("#buildButton"),
  sampleButton: document.querySelector("#sampleButton"),
  newButton: document.querySelector("#newButton"),
  installButton: document.querySelector("#installButton"),
  saveState: document.querySelector("#saveState"),
  studySurface: document.querySelector("#studySurface"),
  wordCount: document.querySelector("#wordCount"),
  hiddenCount: document.querySelector("#hiddenCount"),
  groupCount: document.querySelector("#groupCount"),
  hideAllButton: document.querySelector("#hideAllButton"),
  revealAllButton: document.querySelector("#revealAllButton"),
  clearMasksButton: document.querySelector("#clearMasksButton"),
  modeButtons: document.querySelectorAll("[data-mode]"),
  maskStyleButtons: document.querySelectorAll("[data-mask-style]"),
};

const initialState = {
  title: "Untitled set",
  source: "",
  tokens: [],
  groups: [],
  mode: "edit",
  maskStyle: "blur",
};

let state = loadState();
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
  const wordCount = state.tokens.filter((token) => token.type === "word").length;
  const hiddenWords = new Set();
  state.groups.forEach((group) => group.wordIds.forEach((wordId) => hiddenWords.add(wordId)));

  elements.wordCount.textContent = wordCount;
  elements.hiddenCount.textContent = hiddenWords.size;
  elements.groupCount.textContent = state.groups.length;
}

function renderControls() {
  elements.modeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === state.mode);
  });

  elements.maskStyleButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.maskStyle === state.maskStyle);
  });

  elements.setTitle.value = state.title;
  elements.sourceInput.value = state.source;
  elements.studySurface.classList.toggle("mode-edit", state.mode === "edit");
  elements.studySurface.classList.toggle("mode-study", state.mode === "study");
}

function render() {
  state.groups = rebuildGroupRanges();
  elements.studySurface.replaceChildren();
  renderControls();
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
elements.sampleButton.addEventListener("click", () => {
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

elements.setTitle.addEventListener("input", () => {
  state.title = elements.setTitle.value.trim() || "Untitled set";
  saveState();
});

elements.sourceInput.addEventListener("input", () => {
  state.source = elements.sourceInput.value;
  saveState();
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
