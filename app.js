const storageKey = "recall-studio-state-v1";
const libraryKey = "recall-studio-library-v1";
const serviceWorkerSkipWaitingMessage = "SKIP_WAITING";
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
const testTypes = ["easy", "medium", "hard"];
const testTypeLabels = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};
const testMatchThreshold = 0.97;
const testDifficultySettings = {
  easy: {
    ratio: 0.3,
    maxPerSentence: 4,
  },
  medium: {
    ratio: 0.9,
    maxPerSentence: Number.POSITIVE_INFINITY,
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
  testType: "easy",
  testItems: [],
  testHardAnswer: "",
  testHardResult: null,
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

    const fallbackColor = getMarkColorKey(saved.markColor);
    const testType = getTestTypeKey(saved.testType);

    return {
      ...initialState,
      ...saved,
      markColor: fallbackColor,
      testType,
      testItems: saved.testType === testType && Array.isArray(saved.testItems) ? saved.testItems : [],
      testHardAnswer: typeof saved.testHardAnswer === "string" ? saved.testHardAnswer : "",
      testHardResult: typeof saved.testHardResult === "boolean" ? saved.testHardResult : null,
      groups: saved.groups.map((group) => normalizeGroup(group, fallbackColor)),
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
        markColor: getMarkColorKey(set.markColor),
        groups: Array.isArray(set.groups) ? set.groups.map((group) => normalizeGroup(group, set.markColor)) : [],
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

function getMarkColorKey(markColor) {
  return markColors[markColor] ? markColor : "amber";
}

function getTestTypeKey(testType) {
  if (testType === "random") return "easy";
  return testTypes.includes(testType) ? testType : "easy";
}

function getMarkColorStyles(markColor) {
  return markColors[getMarkColorKey(markColor)];
}

function applyMarkColorStyles(element, markColor) {
  const color = getMarkColorStyles(markColor);

  element.style.setProperty("--mark-bg", color.bg);
  element.style.setProperty("--mark-border", color.border);
  element.style.setProperty("--mark-text", color.text);
  element.style.setProperty("--mark-revealed", color.revealed);
}

function normalizeGroup(group, fallbackColor = "amber") {
  return {
    revealed: false,
    ...group,
    markColor: getMarkColorKey(group?.markColor || group?.color || fallbackColor),
  };
}

function getTokenText(tokens = state.tokens) {
  return tokens.map((token) => token.text).join("");
}

function getWordCount(tokens = state.tokens) {
  return tokens.filter((token) => token.type === "word").length;
}

function normalizeTestText(text) {
  return String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]*\n+[ \t]*/g, " ")
    .trim()
    .toLowerCase();
}

function isWithinEditLimit(expected, actual, maxDistance) {
  if (Math.abs(expected.length - actual.length) > maxDistance) return false;

  let previous = new Array(actual.length + 1).fill(0).map((_, index) => index);

  for (let expectedIndex = 1; expectedIndex <= expected.length; expectedIndex += 1) {
    const current = new Array(actual.length + 1).fill(maxDistance + 1);
    current[0] = expectedIndex;
    const minActualIndex = Math.max(1, expectedIndex - maxDistance);
    const maxActualIndex = Math.min(actual.length, expectedIndex + maxDistance);
    let bestInRow = current[0];

    for (let actualIndex = minActualIndex; actualIndex <= maxActualIndex; actualIndex += 1) {
      const cost = expected[expectedIndex - 1] === actual[actualIndex - 1] ? 0 : 1;
      current[actualIndex] = Math.min(
        previous[actualIndex] + 1,
        current[actualIndex - 1] + 1,
        previous[actualIndex - 1] + cost,
      );
      bestInRow = Math.min(bestInRow, current[actualIndex]);
    }

    if (bestInRow > maxDistance) return false;
    previous = current;
  }

  return previous[actual.length] <= maxDistance;
}

function isTestMatch(expected, actual) {
  const normalizedExpected = normalizeTestText(expected);
  const normalizedActual = normalizeTestText(actual);
  if (normalizedExpected === normalizedActual) return true;

  const maxLength = Math.max(normalizedExpected.length, normalizedActual.length);
  if (!maxLength) return true;

  const maxDistance = Math.floor(maxLength * (1 - testMatchThreshold));
  return isWithinEditLimit(normalizedExpected, normalizedActual, maxDistance);
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
        ...normalizeGroup(group),
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
    resetTestSession();
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
    groups: rebuildGroupRanges((savedSet.groups || []).map((group) => normalizeGroup(group, savedSet.markColor))),
    mode: savedSet.groups?.length ? "study" : "edit",
    maskStyle: savedSet.maskStyle || state.maskStyle || "blur",
    markColor: getMarkColorKey(savedSet.markColor),
    testType: "easy",
    testItems: [],
    testHardAnswer: "",
    testHardResult: null,
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
    markColor: state.markColor,
    revealed: false,
  });
  state.groups = rebuildGroupRanges();
  resetTestSession();
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
      markColor: state.markColor,
      revealed: false,
    });
  }

  state.groups = rebuildGroupRanges();
  resetTestSession();
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
    testType: "easy",
    testItems: [],
    testHardAnswer: "",
    testHardResult: null,
  };

  saveState();
  render();
}

function setMode(mode) {
  state.mode = mode;
  if (mode === "study") {
    state.groups = state.groups.map((group) => ({ ...group, revealed: false }));
  } else if (mode === "test") {
    prepareTestMode();
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
  resetTestSession();
  saveState();
  render();
}

function resetTestSession(testType = state.testType || "easy") {
  state.testType = getTestTypeKey(testType);
  state.testItems = [];
  state.testHardAnswer = "";
  state.testHardResult = null;
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
    applyMarkColorStyles(span, group.markColor);
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
  applyMarkColorStyles(button, group.markColor);
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

function getBlankableTestCandidates() {
  if (state.groups.length) {
    return state.groups.map((group) => ({
      id: group.id,
      start: group.start,
      end: group.end,
      answer: getGroupText(group),
    }));
  }

  return state.tokens
    .filter((token) => token.type === "word")
    .map((token) => ({
      id: `token-${token.id}`,
      start: token.id,
      end: token.id,
      answer: token.text,
    }));
}

function getSentenceRanges() {
  const ranges = [];
  let sentenceStart = 0;
  let hasContent = false;

  state.tokens.forEach((token, index) => {
    if (token.type !== "space") {
      hasContent = true;
    }

    if (hasContent && /[.!?]/u.test(token.text)) {
      ranges.push({ start: sentenceStart, end: index });
      sentenceStart = index + 1;
      hasContent = false;
    }
  });

  if (state.tokens.slice(sentenceStart).some((token) => token.type !== "space")) {
    ranges.push({ start: sentenceStart, end: state.tokens.length - 1 });
  }

  return ranges.length ? ranges : [{ start: 0, end: state.tokens.length - 1 }];
}

function getTestCandidateBuckets(candidates) {
  return getSentenceRanges()
    .map((sentence) =>
      candidates.filter((candidate) => candidate.start >= sentence.start && candidate.start <= sentence.end),
    )
    .filter((bucket) => bucket.length);
}

function shuffleItems(items) {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

function getBlankCountForBucket(bucket, testType) {
  const settings = testDifficultySettings[testType] || testDifficultySettings.easy;
  const ratioCount = Math.max(1, Math.round(bucket.length * settings.ratio));
  const visibleReserve = testType === "medium" && bucket.length > 1 ? 1 : 0;
  const maxCount = Math.min(settings.maxPerSentence, bucket.length - visibleReserve);

  return Math.max(1, Math.min(bucket.length, ratioCount, maxCount));
}

function buildDifficultyTest(testType = state.testType) {
  const normalizedType = getTestTypeKey(testType);
  const candidates = getBlankableTestCandidates();
  const selectedItems = getTestCandidateBuckets(candidates).flatMap((bucket) =>
    shuffleItems(bucket).slice(0, getBlankCountForBucket(bucket, normalizedType)),
  );

  state.testType = normalizedType;
  state.testHardAnswer = "";
  state.testHardResult = null;
  state.testItems = selectedItems
    .sort((a, b) => a.start - b.start)
    .map((item, index) => ({
      ...item,
      id: `${item.id}-${index}`,
      userAnswer: "",
      correct: null,
    }));
}

function prepareTestMode() {
  state.testType = getTestTypeKey(state.testType);

  if (state.testType === "hard") {
    state.testHardResult = null;
    return;
  }

  if (!state.testItems.length) {
    buildDifficultyTest(state.testType);
  }
}

function setTestType(testType) {
  resetTestSession(testType);

  if (state.testType !== "hard") {
    buildDifficultyTest(state.testType);
  }

  saveState();
  render();
}

function newTest() {
  resetTestSession(state.testType);

  if (state.testType !== "hard") {
    buildDifficultyTest(state.testType);
  }

  saveState();
  render();
}

function checkTest() {
  if (state.testType === "hard") {
    state.testHardResult = isTestMatch(state.source, state.testHardAnswer);
    saveState();
    render();
    return;
  }

  state.testItems = state.testItems.map((item) => ({
    ...item,
    correct: isTestMatch(item.answer, item.userAnswer),
  }));
  saveState();
  render();
}

function renderTestToolbar() {
  const toolbar = document.createElement("div");
  toolbar.className = "test-toolbar";

  const typeSwitch = document.createElement("div");
  typeSwitch.className = "segmented test-type-switch";
  typeSwitch.setAttribute("role", "group");
  typeSwitch.setAttribute("aria-label", "Test type");

  testTypes.forEach((testType) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "segment";
    button.classList.toggle("active", state.testType === testType);
    button.dataset.testType = testType;
    button.textContent = testTypeLabels[testType];
    typeSwitch.append(button);
  });

  const actions = document.createElement("div");
  actions.className = "test-actions";

  const newButton = document.createElement("button");
  newButton.type = "button";
  newButton.className = "secondary-button";
  newButton.dataset.testAction = "new";
  newButton.textContent = "New Test";

  const checkButton = document.createElement("button");
  checkButton.type = "button";
  checkButton.className = "primary-button";
  checkButton.dataset.testAction = "check";
  checkButton.textContent = "Check";

  actions.append(newButton, checkButton);
  toolbar.append(typeSwitch, actions);
  return toolbar;
}

function renderTestSummary(fragment) {
  if (state.testType === "hard" && state.testHardResult === null) return;
  if (state.testType !== "hard" && state.testItems.every((item) => item.correct === null)) return;

  const summary = document.createElement("div");
  summary.className = "test-summary";

  if (state.testType === "hard") {
    summary.classList.toggle("correct", state.testHardResult === true);
    summary.classList.toggle("wrong", state.testHardResult === false);
    summary.textContent = state.testHardResult ? "Correct" : "Not yet";
  } else {
    const correctCount = state.testItems.filter((item) => item.correct).length;
    summary.textContent = `${correctCount} / ${state.testItems.length} correct`;
  }

  fragment.append(summary);
}

function createBlankInput(item, index) {
  const input = document.createElement("input");
  input.className = "blank-input";
  input.type = "text";
  input.value = item.userAnswer || "";
  input.dataset.testBlankId = item.id;
  input.setAttribute("aria-label", `Blank ${index + 1}`);
  input.style.setProperty("--blank-size", `${Math.min(Math.max(item.answer.length + 1, 6), 24)}ch`);

  if (item.correct !== null) {
    input.classList.toggle("correct", item.correct);
    input.classList.toggle("wrong", !item.correct);
  }

  return input;
}

function renderDifficultyTest(fragment) {
  if (!state.testItems.length) {
    buildDifficultyTest(state.testType);
  }

  const passage = document.createElement("div");
  passage.className = "test-passage";
  const blanksByStart = new Map(state.testItems.map((item, index) => [item.start, { item, index }]));
  let index = 0;

  while (index < state.tokens.length) {
    const blank = blanksByStart.get(index);

    if (blank) {
      passage.append(createBlankInput(blank.item, blank.index));
      index = blank.item.end + 1;
      continue;
    }

    passage.append(createTextNode(state.tokens[index].text));
    index += 1;
  }

  fragment.append(passage);
}

function renderHardTest(fragment) {
  const answer = document.createElement("textarea");
  answer.className = "hard-answer";
  answer.value = state.testHardAnswer || "";
  answer.dataset.hardAnswer = "true";
  answer.spellcheck = false;
  answer.setAttribute("aria-label", "Hard mode answer");
  answer.placeholder = "Full answer";

  if (state.testHardResult !== null) {
    answer.classList.toggle("correct", state.testHardResult === true);
    answer.classList.toggle("wrong", state.testHardResult === false);
  }

  fragment.append(answer);
}

function renderTestSurface(fragment) {
  const panel = document.createElement("div");
  panel.className = "test-panel";
  panel.append(renderTestToolbar());
  renderTestSummary(panel);

  if (state.testType === "hard") {
    renderHardTest(panel);
  } else {
    renderDifficultyTest(panel);
  }

  fragment.append(panel);
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
  state.markColor = getMarkColorKey(state.markColor);
  state.testType = getTestTypeKey(state.testType);

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
  elements.sourceInput.hidden = state.mode === "test";
  elements.sourceInput.disabled = state.mode === "test";
  applyMarkColorStyles(elements.studySurface, state.markColor);
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
  } else if (state.mode === "test") {
    renderTestSurface(fragment);
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
  if (state.mode === "test") {
    const typeButton = event.target.closest?.("[data-test-type]");
    if (typeButton) {
      setTestType(typeButton.dataset.testType);
      return;
    }

    const actionButton = event.target.closest?.("[data-test-action]");
    if (actionButton?.dataset.testAction === "new") {
      newTest();
      return;
    }

    if (actionButton?.dataset.testAction === "check") {
      checkTest();
      return;
    }
  }

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

  let refreshing = false;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;

    refreshing = true;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./service-worker.js")
      .then((registration) => {
        registration.update();

        if (registration.waiting) {
          registration.waiting.postMessage({ type: serviceWorkerSkipWaitingMessage });
        }

        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) return;

          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              worker.postMessage({ type: serviceWorkerSkipWaitingMessage });
            }
          });
        });
      })
      .catch(() => {});
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

elements.studySurface.addEventListener("input", (event) => {
  const blankInput = event.target.closest?.("[data-test-blank-id]");
  if (blankInput) {
    state.testItems = state.testItems.map((item) =>
      item.id === blankInput.dataset.testBlankId ? { ...item, userAnswer: blankInput.value, correct: null } : item,
    );
    saveState();
    return;
  }

  const hardAnswer = event.target.closest?.("[data-hard-answer]");
  if (hardAnswer) {
    state.testHardAnswer = hardAnswer.value;
    state.testHardResult = null;
    saveState();
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
