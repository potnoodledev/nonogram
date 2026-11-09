import {
  EMPTY,
  FILLED,
  MARKED,
  createGrid,
  findMistakes,
  isLineComplete,
  isSolved,
} from './nonogram.js';
import { DIFFICULTIES, PUZZLES, puzzleIndexById } from './puzzles.js';

const STORAGE_KEY = 'nonogram:progress:v1';
const FEEDBACK_TIMEOUT = 4000;
const WRONG_HIGHLIGHT_TIMEOUT = 1800;

const dom = {
  board: document.getElementById('board'),
  puzzleTitle: document.getElementById('puzzle-title'),
  puzzleNumber: document.getElementById('puzzle-number'),
  puzzleTotal: document.getElementById('puzzle-total'),
  puzzleDifficulty: document.getElementById('puzzle-difficulty'),
  puzzleSize: document.getElementById('puzzle-size'),
  puzzleSelect: document.getElementById('puzzle-select'),
  prevPuzzle: document.getElementById('prev-puzzle'),
  nextPuzzle: document.getElementById('next-puzzle'),
  timer: document.getElementById('timer'),
  moves: document.getElementById('moves'),
  solvedBadge: document.getElementById('solved-badge'),
  modeFill: document.getElementById('mode-fill'),
  modeMark: document.getElementById('mode-mark'),
  checkButton: document.getElementById('check-button'),
  resetButton: document.getElementById('reset-button'),
  feedback: document.getElementById('feedback'),
  winDialog: document.getElementById('win-dialog'),
  winDetail: document.getElementById('win-detail'),
  playAgain: document.getElementById('play-again'),
  nextUnsolved: document.getElementById('next-unsolved'),
};

const state = {
  index: 0,
  cells: null,
  cellEls: [],
  rowClues: [],
  columnClues: [],
  mode: 'fill',
  moves: 0,
  elapsedBase: 0,
  timerStartedAt: null,
  solved: false,
  dragging: false,
  dragValue: EMPTY,
  hot: { row: -1, column: -1 },
  wrongCells: [],
  wrongTimer: null,
  feedbackTimer: null,
  persistTimer: null,
};

function emptyStore() {
  return { version: 1, currentId: null, puzzles: {} };
}

function loadStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!parsed || parsed.version !== 1 || typeof parsed.puzzles !== 'object' || parsed.puzzles === null) {
      return emptyStore();
    }
    return parsed;
  } catch {
    return emptyStore();
  }
}

const store = loadStore();

/* --------------------------------------------------------------------------
   Persistence
   -------------------------------------------------------------------------- */

function savedProgress(puzzle) {
  const entry = store.puzzles[puzzle.id];
  if (!entry || !Array.isArray(entry.cells)) return null;
  if (entry.cells.length !== puzzle.size.rows) return null;
  const valid = entry.cells.every(
    (row) =>
      Array.isArray(row) &&
      row.length === puzzle.size.columns &&
      row.every((value) => value === EMPTY || value === FILLED || value === MARKED),
  );
  if (!valid) return null;
  return {
    cells: entry.cells.map((row) => row.slice()),
    moves: Number.isFinite(entry.moves) ? Math.max(0, Math.floor(entry.moves)) : 0,
    elapsed: Number.isFinite(entry.elapsed) ? Math.max(0, Math.floor(entry.elapsed)) : 0,
    solved: Boolean(entry.solved),
  };
}

function currentElapsed() {
  if (state.solved || state.timerStartedAt === null) return state.elapsedBase;
  return state.elapsedBase + Math.floor((Date.now() - state.timerStartedAt) / 1000);
}

function persistNow() {
  if (!state.cells) return;
  const puzzle = PUZZLES[state.index];
  store.version = 1;
  store.currentId = puzzle.id;
  store.puzzles[puzzle.id] = {
    cells: state.cells.map((row) => row.slice()),
    moves: state.moves,
    elapsed: currentElapsed(),
    solved: state.solved,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* A full or disabled localStorage should never break the game. */
  }
}

function schedulePersist() {
  window.clearTimeout(state.persistTimer);
  state.persistTimer = window.setTimeout(persistNow, 150);
}

/* --------------------------------------------------------------------------
   Timer
   -------------------------------------------------------------------------- */

function startTimerIfNeeded() {
  if (state.solved || state.moves === 0 || state.timerStartedAt !== null) return;
  state.timerStartedAt = Date.now();
}

function stopTimer() {
  if (state.timerStartedAt === null) return;
  state.elapsedBase = currentElapsed();
  state.timerStartedAt = null;
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function updateTimerDisplay() {
  dom.timer.textContent = formatTime(currentElapsed());
}

/* --------------------------------------------------------------------------
   Board construction
   -------------------------------------------------------------------------- */

function clueNumberSpan(run) {
  const span = document.createElement('span');
  span.className = 'clue-number';
  span.textContent = String(run);
  return span;
}

function zeroClueSpan() {
  const span = document.createElement('span');
  span.className = 'clue-number is-zero';
  span.textContent = '0';
  return span;
}

function buildBoard(puzzle) {
  const { rows, columns } = puzzle.size;
  dom.board.innerHTML = '';
  dom.board.classList.remove('is-solved');
  dom.board.style.setProperty('--rows', String(rows));
  dom.board.style.setProperty('--cols', String(columns));
  const maxRowClues = Math.max(1, ...puzzle.clues.rows.map((clue) => clue.length));
  const maxColumnClues = Math.max(1, ...puzzle.clues.columns.map((clue) => clue.length));
  dom.board.style.setProperty('--row-clue-cols', String(maxRowClues));
  dom.board.style.setProperty('--col-clue-rows', String(maxColumnClues));
  dom.board.setAttribute('aria-label', `${puzzle.name} nonogram, ${rows} by ${columns} grid`);

  state.rowClues = [];
  state.columnClues = [];
  state.cellEls = Array.from({ length: rows }, () => Array(columns).fill(null));

  const corner = document.createElement('div');
  corner.className = 'board-corner';
  corner.setAttribute('aria-hidden', 'true');
  dom.board.append(corner);

  for (let column = 0; column < columns; column += 1) {
    const clueEl = document.createElement('div');
    clueEl.className = 'clue clue-column';
    if (column > 0 && column % 5 === 0) clueEl.classList.add('sep-left');
    const clue = puzzle.clues.columns[column];
    clueEl.setAttribute('aria-label', `Column ${column + 1} clue: ${clue.length ? clue.join(' ') : 'none'}`);
    if (clue.length === 0) clueEl.append(zeroClueSpan());
    for (const run of clue) clueEl.append(clueNumberSpan(run));
    dom.board.append(clueEl);
    state.columnClues.push(clueEl);
  }

  for (let row = 0; row < rows; row += 1) {
    const clueEl = document.createElement('div');
    clueEl.className = 'clue clue-row';
    if (row > 0 && row % 5 === 0) clueEl.classList.add('sep-top');
    const clue = puzzle.clues.rows[row];
    clueEl.setAttribute('aria-label', `Row ${row + 1} clue: ${clue.length ? clue.join(' ') : 'none'}`);
    if (clue.length === 0) clueEl.append(zeroClueSpan());
    for (const run of clue) clueEl.append(clueNumberSpan(run));
    dom.board.append(clueEl);
    state.rowClues.push(clueEl);

    for (let column = 0; column < columns; column += 1) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cell';
      if (column > 0 && column % 5 === 0) cell.classList.add('sep-left');
      if (row > 0 && row % 5 === 0) cell.classList.add('sep-top');
      cell.dataset.row = String(row);
      cell.dataset.column = String(column);
      cell.tabIndex = -1;
      cell.style.setProperty('--order', String(row * columns + column));
      cell.addEventListener('pointerdown', onCellPointerDown);
      cell.addEventListener('pointerenter', onCellPointerEnter);
      cell.addEventListener('keydown', onCellKeyDown);
      cell.addEventListener('click', onCellClick);
      cell.addEventListener('focus', onCellFocus);
      cell.addEventListener('blur', onCellBlur);
      dom.board.append(cell);
      state.cellEls[row][column] = cell;
    }
  }

  state.cellEls[0][0].tabIndex = 0;
}

function cellStateLabel(value) {
  if (value === FILLED) return 'filled';
  if (value === MARKED) return 'marked blank';
  return 'blank';
}

function updateCellElement(row, column) {
  const cell = state.cellEls[row]?.[column];
  if (!cell) return;
  const value = state.cells[row][column];
  const puzzle = PUZZLES[state.index];
  cell.classList.toggle('is-filled', value === FILLED);
  cell.classList.toggle('is-marked', value === MARKED);
  cell.setAttribute('aria-label', `${puzzle.name}, row ${row + 1}, column ${column + 1}: ${cellStateLabel(value)}`);
}

function applyStateToBoard() {
  for (let row = 0; row < state.cells.length; row += 1) {
    for (let column = 0; column < state.cells[row].length; column += 1) {
      updateCellElement(row, column);
    }
  }
}

function makeRovingTarget(cell) {
  for (const row of state.cellEls) {
    for (const other of row) {
      if (other) other.tabIndex = -1;
    }
  }
  cell.tabIndex = 0;
}

/* --------------------------------------------------------------------------
   Crosshair highlighting
   -------------------------------------------------------------------------- */

function setCrosshair(row, column) {
  const previous = state.hot;
  if (previous.row === row && previous.column === column) return;

  if (previous.row >= 0) {
    state.rowClues[previous.row]?.classList.remove('is-hot');
    state.cellEls[previous.row]?.[previous.column]?.classList.remove('is-hot');
  }
  if (previous.column >= 0) {
    state.columnClues[previous.column]?.classList.remove('is-hot');
  }

  state.hot = { row, column };

  if (row >= 0 && column >= 0) {
    state.rowClues[row]?.classList.add('is-hot');
    state.columnClues[column]?.classList.add('is-hot');
    state.cellEls[row]?.[column]?.classList.add('is-hot');
  }
}

/* --------------------------------------------------------------------------
   Painting
   -------------------------------------------------------------------------- */

function paintCell(row, column, value) {
  if (state.solved) return false;
  if (value !== EMPTY && value !== FILLED && value !== MARKED) return false;
  if (state.cells[row][column] === value) return false;

  if (state.wrongTimer !== null) clearWrongHighlights();

  state.cells[row][column] = value;
  state.moves += 1;
  updateCellElement(row, column);
  startTimerIfNeeded();
  refreshCompletion(row, column);
  updateStats();

  const puzzle = PUZZLES[state.index];
  if (isSolved(state.cells, puzzle.solution)) {
    finishPuzzle();
  } else {
    schedulePersist();
  }
  return true;
}

function refreshCompletion(row, column) {
  const puzzle = PUZZLES[state.index];
  state.rowClues[row]?.classList.toggle(
    'is-complete',
    isLineComplete(state.cells, 'row', row, puzzle.clues.rows[row]),
  );
  state.columnClues[column]?.classList.toggle(
    'is-complete',
    isLineComplete(state.cells, 'column', column, puzzle.clues.columns[column]),
  );
}

function refreshAllCompletion() {
  const puzzle = PUZZLES[state.index];
  for (let row = 0; row < puzzle.size.rows; row += 1) {
    state.rowClues[row].classList.toggle(
      'is-complete',
      isLineComplete(state.cells, 'row', row, puzzle.clues.rows[row]),
    );
  }
  for (let column = 0; column < puzzle.size.columns; column += 1) {
    state.columnClues[column].classList.toggle(
      'is-complete',
      isLineComplete(state.cells, 'column', column, puzzle.clues.columns[column]),
    );
  }
}

/* --------------------------------------------------------------------------
   Pointer and keyboard input
   -------------------------------------------------------------------------- */

function cellCoordinates(cell) {
  return { row: Number(cell.dataset.row), column: Number(cell.dataset.column) };
}

function onCellPointerDown(event) {
  const cell = event.currentTarget;
  const { row, column } = cellCoordinates(cell);

  if (state.solved) {
    if (event.button === 0) cell.focus({ preventScroll: true });
    return;
  }

  if (event.button === 2) {
    event.preventDefault();
    cell.focus({ preventScroll: true });
    paintCell(row, column, state.cells[row][column] === MARKED ? EMPTY : MARKED);
    return;
  }

  if (event.button !== 0) return;

  event.preventDefault();
  cell.focus({ preventScroll: true });

  const current = state.cells[row][column];
  const value =
    state.mode === 'mark'
      ? current === MARKED
        ? EMPTY
        : MARKED
      : current === FILLED
        ? EMPTY
        : FILLED;

  state.dragging = true;
  state.dragValue = value;
  paintCell(row, column, value);
}

function onCellPointerEnter(event) {
  const cell = event.currentTarget;
  const { row, column } = cellCoordinates(cell);

  if (!state.dragging) {
    setCrosshair(row, column);
    return;
  }

  if (event.pointerType === 'mouse' || event.pointerType === 'pen') {
    paintCell(row, column, state.dragValue);
  }
}

function onCellClick(event) {
  /* Screen readers and keyboard "click" activations have detail 0. Pointer
     clicks are already handled by pointerdown, so ignore them here. */
  if (event.detail !== 0 || state.solved) return;
  const { row, column } = cellCoordinates(event.currentTarget);
  const current = state.cells[row][column];
  paintCell(row, column, current === FILLED ? EMPTY : FILLED);
}

function onCellFocus(event) {
  const cell = event.currentTarget;
  makeRovingTarget(cell);
  const { row, column } = cellCoordinates(cell);
  setCrosshair(row, column);
}

function onCellBlur() {
  setCrosshair(-1, -1);
}

function moveFocus(row, column) {
  const puzzle = PUZZLES[state.index];
  const nextRow = Math.min(Math.max(row, 0), puzzle.size.rows - 1);
  const nextColumn = Math.min(Math.max(column, 0), puzzle.size.columns - 1);
  const cell = state.cellEls[nextRow][nextColumn];
  if (cell) cell.focus({ preventScroll: false });
}

function onCellKeyDown(event) {
  const { row, column } = cellCoordinates(event.currentTarget);
  const puzzle = PUZZLES[state.index];

  switch (event.key) {
    case 'ArrowUp':
      event.preventDefault();
      moveFocus(row - 1, column);
      return;
    case 'ArrowDown':
      event.preventDefault();
      moveFocus(row + 1, column);
      return;
    case 'ArrowLeft':
      event.preventDefault();
      moveFocus(row, column - 1);
      return;
    case 'ArrowRight':
      event.preventDefault();
      moveFocus(row, column + 1);
      return;
    case 'Home':
      event.preventDefault();
      moveFocus(row, 0);
      return;
    case 'End':
      event.preventDefault();
      moveFocus(row, puzzle.size.columns - 1);
      return;
    case ' ':
    case 'Enter':
      event.preventDefault();
      paintCell(row, column, state.cells[row][column] === FILLED ? EMPTY : FILLED);
      return;
    case 'x':
    case 'X':
      event.preventDefault();
      paintCell(row, column, state.cells[row][column] === MARKED ? EMPTY : MARKED);
      return;
    case 'Delete':
    case 'Backspace':
      event.preventDefault();
      paintCell(row, column, EMPTY);
      return;
    default:
      break;
  }
}

/* --------------------------------------------------------------------------
   Modes, stats and feedback
   -------------------------------------------------------------------------- */

function setMode(mode) {
  state.mode = mode === 'mark' ? 'mark' : 'fill';
  dom.modeFill.setAttribute('aria-pressed', String(state.mode === 'fill'));
  dom.modeMark.setAttribute('aria-pressed', String(state.mode === 'mark'));
  dom.board.dataset.mode = state.mode;
}

function updateStats() {
  dom.moves.textContent = String(state.moves);
  updateTimerDisplay();
}

function setFeedback(message, warning = false) {
  window.clearTimeout(state.feedbackTimer);
  dom.feedback.textContent = message;
  dom.feedback.classList.toggle('is-warn', warning);
  state.feedbackTimer = window.setTimeout(clearFeedback, FEEDBACK_TIMEOUT);
}

function clearFeedback() {
  window.clearTimeout(state.feedbackTimer);
  state.feedbackTimer = null;
  dom.feedback.textContent = '';
  dom.feedback.classList.remove('is-warn');
}

function clearWrongHighlights() {
  window.clearTimeout(state.wrongTimer);
  state.wrongTimer = null;
  for (const [row, column] of state.wrongCells) {
    state.cellEls[row]?.[column]?.classList.remove('is-wrong');
  }
  state.wrongCells = [];
}

function checkMistakes() {
  if (state.solved) {
    setFeedback('This puzzle is already solved.');
    return;
  }

  clearWrongHighlights();
  const puzzle = PUZZLES[state.index];
  const mistakes = findMistakes(state.cells, puzzle.solution);
  const cells = [...mistakes.filled, ...mistakes.marked];

  if (cells.length === 0) {
    setFeedback('No mistakes found. Keep going.');
    return;
  }

  for (const [row, column] of cells) {
    state.cellEls[row][column].classList.add('is-wrong');
  }
  state.wrongCells = cells;
  state.wrongTimer = window.setTimeout(clearWrongHighlights, WRONG_HIGHLIGHT_TIMEOUT);
  setFeedback(
    `${cells.length} ${cells.length === 1 ? 'square is' : 'squares are'} wrong — highlighted for a moment.`,
    true,
  );
}

/* --------------------------------------------------------------------------
   Puzzle lifecycle
   -------------------------------------------------------------------------- */

function updateHeader(puzzle) {
  dom.puzzleTitle.textContent = puzzle.name;
  dom.puzzleNumber.textContent = String(state.index + 1);
  dom.puzzleTotal.textContent = String(PUZZLES.length);
  dom.puzzleDifficulty.textContent = puzzle.difficulty;
  dom.puzzleDifficulty.dataset.difficulty = puzzle.difficulty;
  dom.puzzleSize.textContent = `${puzzle.size.columns} × ${puzzle.size.rows}`;
  document.title = `${puzzle.name} — Nonogram`;
}

function updateSelectLabels() {
  for (const option of dom.puzzleSelect.options) {
    const base = option.dataset.label ?? option.textContent.replace(/\s*✓$/, '');
    option.dataset.label = base;
    const solved = store.puzzles[option.value]?.solved === true;
    option.textContent = `${base}${solved ? ' ✓' : ''}`;
  }
}

function updateSolvedUI() {
  dom.solvedBadge.hidden = !state.solved;
  dom.board.classList.toggle('is-solved', state.solved);
  dom.board.dataset.solved = String(state.solved);
}

function updateHash(puzzle) {
  try {
    history.replaceState(null, '', `#${puzzle.id}`);
  } catch {
    /* file:// or sandboxed contexts can refuse history updates. */
  }
}

function loadPuzzle(index, { restore = true } = {}) {
  if (index < 0 || index >= PUZZLES.length) index = 0;
  if (dom.winDialog.open) dom.winDialog.close();
  clearWrongHighlights();
  clearFeedback();
  if (state.cells) {
    stopTimer();
    persistNow();
  }

  const puzzle = PUZZLES[index];
  state.index = index;
  state.solved = false;
  state.moves = 0;
  state.elapsedBase = 0;
  state.timerStartedAt = null;
  state.dragging = false;
  setCrosshair(-1, -1);

  const saved = restore ? savedProgress(puzzle) : null;
  if (saved) {
    state.cells = saved.cells;
    state.moves = saved.moves;
    state.elapsedBase = saved.elapsed;
    state.solved = saved.solved;
  } else {
    state.cells = createGrid(puzzle.size.rows, puzzle.size.columns);
  }

  buildBoard(puzzle);
  applyStateToBoard();
  refreshAllCompletion();
  updateHeader(puzzle);
  dom.puzzleSelect.value = puzzle.id;
  updateSelectLabels();
  updateStats();
  updateSolvedUI();
  updateHash(puzzle);
  state.hot = { row: -1, column: -1 };
  schedulePersist();
}

function resetPuzzle() {
  const puzzle = PUZZLES[state.index];
  if (dom.winDialog.open) dom.winDialog.close();
  clearWrongHighlights();
  clearFeedback();
  stopTimer();
  state.cells = createGrid(puzzle.size.rows, puzzle.size.columns);
  state.moves = 0;
  state.elapsedBase = 0;
  state.timerStartedAt = null;
  state.solved = false;
  state.dragging = false;
  delete store.puzzles[puzzle.id];
  applyStateToBoard();
  refreshAllCompletion();
  updateStats();
  updateSolvedUI();
  updateSelectLabels();
  updateHash(puzzle);
  persistNow();
  setFeedback('Fresh puzzle. Good luck!');
}

function nextUnsolvedIndex(fromIndex) {
  for (let step = 1; step <= PUZZLES.length; step += 1) {
    const index = (fromIndex + step) % PUZZLES.length;
    if (store.puzzles[PUZZLES[index].id]?.solved !== true) return index;
  }
  return (fromIndex + 1) % PUZZLES.length;
}

function finishPuzzle() {
  state.solved = true;
  stopTimer();
  state.dragging = false;
  persistNow();
  updateSolvedUI();
  updateStats();
  setCrosshair(-1, -1);

  const puzzle = PUZZLES[state.index];
  dom.winDetail.textContent = `${puzzle.name} · ${formatTime(state.elapsedBase)} · ${state.moves} ${
    state.moves === 1 ? 'move' : 'moves'
  }`;
  updateSelectLabels();

  if (typeof dom.winDialog.showModal === 'function') {
    dom.winDialog.showModal();
  } else {
    dom.winDialog.setAttribute('open', '');
  }
}

/* --------------------------------------------------------------------------
   Boot
   -------------------------------------------------------------------------- */

function buildPuzzleSelect() {
  dom.puzzleSelect.innerHTML = '';
  for (const difficulty of DIFFICULTIES) {
    const group = document.createElement('optgroup');
    group.label = difficulty;
    for (const puzzle of PUZZLES.filter((candidate) => candidate.difficulty === difficulty)) {
      const option = document.createElement('option');
      option.value = puzzle.id;
      const label = `${puzzle.name} · ${puzzle.size.columns}×${puzzle.size.rows}`;
      option.dataset.label = label;
      option.textContent = label;
      group.append(option);
    }
    dom.puzzleSelect.append(group);
  }
}

function initialIndex() {
  const hashId = decodeURIComponent(window.location.hash.replace(/^#/, ''));
  const hashIndex = hashId ? puzzleIndexById(hashId) : -1;
  if (hashIndex >= 0) return hashIndex;
  const storedIndex = puzzleIndexById(store.currentId ?? '');
  return storedIndex >= 0 ? storedIndex : 0;
}

dom.modeFill.addEventListener('click', () => setMode('fill'));
dom.modeMark.addEventListener('click', () => setMode('mark'));
dom.checkButton.addEventListener('click', checkMistakes);
dom.resetButton.addEventListener('click', resetPuzzle);
dom.prevPuzzle.addEventListener('click', () => loadPuzzle((state.index - 1 + PUZZLES.length) % PUZZLES.length));
dom.nextPuzzle.addEventListener('click', () => loadPuzzle((state.index + 1) % PUZZLES.length));
dom.puzzleSelect.addEventListener('change', () => {
  const index = puzzleIndexById(dom.puzzleSelect.value);
  if (index >= 0) loadPuzzle(index);
});
dom.playAgain.addEventListener('click', () => {
  dom.winDialog.close();
  resetPuzzle();
});
dom.nextUnsolved.addEventListener('click', () => {
  const next = nextUnsolvedIndex(state.index);
  dom.winDialog.close();
  loadPuzzle(next);
});

dom.board.addEventListener('contextmenu', (event) => event.preventDefault());
dom.board.addEventListener('pointerleave', () => {
  if (!state.dragging) setCrosshair(-1, -1);
});
window.addEventListener('pointerup', () => {
  state.dragging = false;
});
window.addEventListener('pointercancel', () => {
  state.dragging = false;
});

window.addEventListener('pagehide', persistNow);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) persistNow();
  else updateTimerDisplay();
});
window.addEventListener('hashchange', () => {
  const id = decodeURIComponent(window.location.hash.replace(/^#/, ''));
  const index = puzzleIndexById(id);
  if (index >= 0 && index !== state.index) loadPuzzle(index);
});

window.setInterval(updateTimerDisplay, 1000);

buildPuzzleSelect();
loadPuzzle(initialIndex());
setMode('fill');
