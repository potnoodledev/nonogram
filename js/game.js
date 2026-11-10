/**
 * Shared grid-game shell.
 *
 * The shell owns the parts every grid variation needs: the board DOM, pointer
 * and keyboard navigation, moves, the timer, progress persistence, the Check
 * helper, the win dialog and the mode/puzzle pickers. A game mode supplies
 * rules and presentation through the small adapter object documented in
 * js/modes/README.md.
 */

import { formatTime } from './grid.js';

const GAME_MODE_KEY = 'grid-games:mode:v1';
const FEEDBACK_TIMEOUT = 4000;
const WRONG_HIGHLIGHT_TIMEOUT = 1800;

function emptyStore() {
  return { version: 1, currentId: null, puzzles: {} };
}

function loadStore(storageKey) {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    if (!parsed || parsed.version !== 1 || typeof parsed.puzzles !== 'object' || parsed.puzzles === null) {
      return emptyStore();
    }
    return parsed;
  } catch {
    return emptyStore();
  }
}

function readLastMode() {
  try {
    return localStorage.getItem(GAME_MODE_KEY);
  } catch {
    return null;
  }
}

function writeLastMode(modeId) {
  try {
    localStorage.setItem(GAME_MODE_KEY, modeId);
  } catch {
    /* Storage being unavailable must not break the game. */
  }
}

export class GridGame {
  constructor({ modes, dom }) {
    this.modes = modes;
    this.dom = dom;
    this.mode = null;
    this.puzzle = null;
    this.state = {
      modeId: null,
      index: 0,
      cells: null,
      cellEls: [],
      rowClues: [],
      columnClues: [],
      toolMode: 'fill',
      moves: 0,
      elapsedBase: 0,
      timerStartedAt: null,
      solved: false,
      dragging: false,
      dragValue: 0,
      hot: { row: -1, column: -1 },
      wrongCells: [],
      wrongTimer: null,
      feedbackTimer: null,
      persistTimer: null,
      store: emptyStore(),
    };
  }

  /* ------------------------------------------------------------------------
     Boot and mode switching
     ------------------------------------------------------------------------ */

  boot() {
    this.bindEvents();
    const fromHash = this.parseHash();
    const fallback = this.modes.nonogram ? 'nonogram' : Object.keys(this.modes)[0];
    const lastMode = readLastMode();
    const modeId = fromHash?.modeId ?? (lastMode && this.modes[lastMode] ? lastMode : fallback);
    this.startMode(modeId, fromHash?.puzzleId ?? null);
    window.setInterval(() => this.updateTimerDisplay(), 1000);
  }

  startMode(modeId, puzzleId = null) {
    const nextMode = this.modes[modeId];
    if (!nextMode) return;
    if (this.mode?.id === modeId && puzzleId === null) return;

    if (this.state.cells) {
      this.stopTimer();
      this.persistNow();
    }

    if (this.dom.winDialog.open) this.dom.winDialog.close();
    this.clearWrongHighlights();
    this.clearFeedback();
    this.stopTimer();

    this.mode = nextMode;
    this.state.modeId = nextMode.id;
    this.state.cells = null;
    this.state.store = loadStore(nextMode.storageKey);
    this.state.toolMode = 'fill';
    this.state.hot = { row: -1, column: -1 };
    this.puzzle = null;

    this.updateModeTabs();
    this.updateModePanels();
    this.dom.boardHint.innerHTML = nextMode.hint ?? '';
    this.dom.winTitle.textContent = nextMode.winTitle;
    this.buildPuzzleSelect();
    this.buildTools();

    let index = puzzleId === null ? -1 : nextMode.puzzleIndexById(puzzleId);
    if (index < 0) index = nextMode.puzzleIndexById(this.state.store.currentId ?? '');
    if (index < 0) index = 0;

    writeLastMode(nextMode.id);
    this.loadPuzzle(index);
  }

  handleHashChange() {
    const parsed = this.parseHash();
    if (!parsed) return;
    if (parsed.modeId !== this.state.modeId) {
      this.startMode(parsed.modeId, parsed.puzzleId);
      return;
    }
    const index = this.mode.puzzleIndexById(parsed.puzzleId);
    if (index >= 0 && index !== this.state.index) this.loadPuzzle(index);
  }

  parseHash() {
    let raw;
    try {
      raw = decodeURIComponent(window.location.hash.replace(/^#/, ''));
    } catch {
      return null;
    }
    if (!raw) return null;

    const slash = raw.indexOf('/');
    if (slash > 0) {
      const modeId = raw.slice(0, slash);
      const puzzleId = raw.slice(slash + 1);
      if (this.modes[modeId]) return { modeId, puzzleId };
      return null;
    }

    /* Older links used a bare puzzle id, e.g. #heart. */
    for (const mode of Object.values(this.modes)) {
      if (mode.puzzleIndexById(raw) >= 0) return { modeId: mode.id, puzzleId: raw };
    }
    return null;
  }

  updateModeTabs() {
    for (const button of this.dom.gameModeButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.gameMode === this.mode.id));
    }
  }

  updateModePanels() {
    for (const panel of document.querySelectorAll('[data-mode-panel]')) {
      panel.hidden = panel.dataset.modePanel !== this.mode.id;
    }
  }

  buildPuzzleSelect() {
    this.dom.puzzleSelect.innerHTML = '';
    for (const difficulty of this.mode.difficulties) {
      const group = document.createElement('optgroup');
      group.label = difficulty;
      for (const puzzle of this.mode.puzzles.filter((candidate) => candidate.difficulty === difficulty)) {
        const option = document.createElement('option');
        option.value = puzzle.id;
        const label = `${puzzle.name} · ${puzzle.size.columns}×${puzzle.size.rows}`;
        option.dataset.label = label;
        option.textContent = label;
        group.append(option);
      }
      this.dom.puzzleSelect.append(group);
    }
  }

  buildTools() {
    this.dom.modeControls.innerHTML = '';
    this.dom.modeControls.dataset.mode = this.mode.id;
    this.mode.buildTools?.(this, this.dom.modeControls);
    this.updateControls();
  }

  updateControls() {
    this.mode.updateControls?.(this);
  }

  /* ------------------------------------------------------------------------
     Puzzle lifecycle
     ------------------------------------------------------------------------ */

  loadPuzzle(index, { restore = true } = {}) {
    if (!Number.isInteger(index) || index < 0 || index >= this.mode.puzzles.length) index = 0;
    if (this.dom.winDialog.open) this.dom.winDialog.close();
    this.clearWrongHighlights();
    this.clearFeedback();

    if (this.state.cells) {
      this.stopTimer();
      this.persistNow();
    }

    const puzzle = this.mode.puzzles[index];
    this.puzzle = puzzle;
    this.state.index = index;
    this.state.solved = false;
    this.state.moves = 0;
    this.state.elapsedBase = 0;
    this.state.timerStartedAt = null;
    this.state.dragging = false;
    this.state.hot = { row: -1, column: -1 };

    const saved = restore ? this.savedProgress(puzzle) : null;
    if (saved) {
      this.state.cells = saved.cells;
      this.state.moves = saved.moves;
      this.state.elapsedBase = saved.elapsed;
      this.state.solved = saved.solved;
    } else {
      this.state.cells = this.mode.createCells(puzzle);
    }

    this.buildBoard(puzzle);
    this.applyStateToBoard();
    this.mode.refreshAllCompletion?.(this);
    this.updateHeader(puzzle);
    this.dom.puzzleSelect.value = puzzle.id;
    this.updateSelectLabels();
    this.updateStats();
    this.updateSolvedUI();
    this.updateHash(puzzle);

    const initial = this.mode.initialHot?.(this);
    if (initial) this.setHot(initial.row, initial.column);
    else this.setHot(-1, -1);

    this.updateControls();
    this.schedulePersist();
  }

  resetPuzzle() {
    const puzzle = this.puzzle;
    if (this.dom.winDialog.open) this.dom.winDialog.close();
    this.clearWrongHighlights();
    this.clearFeedback();
    this.stopTimer();

    this.state.cells = this.mode.createCells(puzzle);
    this.state.moves = 0;
    this.state.elapsedBase = 0;
    this.state.timerStartedAt = null;
    this.state.solved = false;
    this.state.dragging = false;
    delete this.state.store.puzzles[puzzle.id];

    this.applyStateToBoard();
    this.mode.refreshAllCompletion?.(this);
    this.updateStats();
    this.updateSolvedUI();
    this.updateSelectLabels();
    this.updateHash(puzzle);
    this.refreshHighlight();
    this.updateControls();
    this.persistNow();
    this.setFeedback('Fresh puzzle. Good luck!');
  }

  finishPuzzle() {
    this.stopTimer();
    this.state.solved = true;
    this.state.dragging = false;
    this.persistNow();
    this.updateSolvedUI();
    this.updateStats();
    this.setHot(-1, -1);

    const puzzle = this.puzzle;
    this.dom.winTitle.textContent = this.mode.winTitle;
    this.dom.winDetail.textContent = `${puzzle.name} · ${formatTime(this.state.elapsedBase)} · ${this.state.moves} ${
      this.state.moves === 1 ? 'move' : 'moves'
    }`;
    this.updateSelectLabels();
    this.updateControls();

    if (typeof this.dom.winDialog.showModal === 'function') {
      this.dom.winDialog.showModal();
    } else {
      this.dom.winDialog.setAttribute('open', '');
    }
  }

  nextUnsolvedIndex(fromIndex) {
    for (let step = 1; step <= this.mode.puzzles.length; step += 1) {
      const index = (fromIndex + step) % this.mode.puzzles.length;
      if (this.state.store.puzzles[this.mode.puzzles[index].id]?.solved !== true) return index;
    }
    return (fromIndex + 1) % this.mode.puzzles.length;
  }

  /* ------------------------------------------------------------------------
     Persistence
     ------------------------------------------------------------------------ */

  currentElapsed() {
    if (this.state.timerStartedAt === null) return this.state.elapsedBase;
    return this.state.elapsedBase + Math.floor((Date.now() - this.state.timerStartedAt) / 1000);
  }

  savedProgress(puzzle) {
    const entry = this.state.store.puzzles[puzzle.id];
    if (!entry || !Array.isArray(entry.cells)) return null;
    if (!this.mode.validateCells(entry.cells, puzzle)) return null;
    return {
      cells: entry.cells.map((row) => row.slice()),
      moves: Number.isFinite(entry.moves) ? Math.max(0, Math.floor(entry.moves)) : 0,
      elapsed: Number.isFinite(entry.elapsed) ? Math.max(0, Math.floor(entry.elapsed)) : 0,
      solved: Boolean(entry.solved),
    };
  }

  persistNow() {
    if (!this.state.cells || !this.puzzle) return;
    this.state.store.version = 1;
    this.state.store.currentId = this.puzzle.id;
    this.state.store.puzzles[this.puzzle.id] = {
      cells: this.state.cells.map((row) => row.slice()),
      moves: this.state.moves,
      elapsed: this.currentElapsed(),
      solved: this.state.solved,
    };
    try {
      localStorage.setItem(this.mode.storageKey, JSON.stringify(this.state.store));
    } catch {
      /* A full or disabled localStorage should never break the game. */
    }
  }

  schedulePersist() {
    window.clearTimeout(this.state.persistTimer);
    this.state.persistTimer = window.setTimeout(() => this.persistNow(), 150);
  }

  /* ------------------------------------------------------------------------
     Timer and stats
     ------------------------------------------------------------------------ */

  startTimerIfNeeded() {
    if (this.state.solved || this.state.moves === 0 || this.state.timerStartedAt !== null) return;
    this.state.timerStartedAt = Date.now();
  }

  stopTimer() {
    if (this.state.timerStartedAt === null) return;
    this.state.elapsedBase = this.currentElapsed();
    this.state.timerStartedAt = null;
  }

  updateTimerDisplay() {
    this.dom.timer.textContent = formatTime(this.currentElapsed());
  }

  updateStats() {
    this.dom.moves.textContent = String(this.state.moves);
    this.updateTimerDisplay();
  }

  /* ------------------------------------------------------------------------
     Board construction
     ------------------------------------------------------------------------ */

  buildBoard(puzzle) {
    const layout = this.mode.boardLayout(puzzle);
    const { rows, columns } = layout;
    const board = this.dom.board;

    board.innerHTML = '';
    board.className = 'board';
    board.dataset.mode = this.mode.id;
    delete board.dataset.tool;
    board.style.setProperty('--rows', String(rows));
    board.style.setProperty('--cols', String(columns));
    board.setAttribute('aria-label', this.mode.boardLabel(puzzle));

    const separator = layout.separatorEvery;
    const separatorRows = typeof separator === 'number' ? separator : separator?.rows;
    const separatorColumns = typeof separator === 'number' ? separator : separator?.columns;

    this.state.cellEls = Array.from({ length: rows }, () => Array(columns).fill(null));
    this.state.rowClues = [];
    this.state.columnClues = [];

    if (layout.clues) {
      const maxRowClues = Math.max(1, ...layout.clues.rows.map((clue) => clue.length));
      const maxColumnClues = Math.max(1, ...layout.clues.columns.map((clue) => clue.length));
      board.style.setProperty('--row-clue-cols', String(maxRowClues));
      board.style.setProperty('--col-clue-rows', String(maxColumnClues));

      const corner = document.createElement('div');
      corner.className = 'board-corner';
      corner.setAttribute('aria-hidden', 'true');
      board.append(corner);

      for (let column = 0; column < columns; column += 1) {
        const clueEl = this.createClueElement(
          layout.clues.columns[column],
          'column',
          column,
          separatorColumns,
        );
        board.append(clueEl);
        this.state.columnClues.push(clueEl);
      }
    } else {
      board.style.removeProperty('--row-clue-cols');
      board.style.removeProperty('--col-clue-rows');
    }

    for (let row = 0; row < rows; row += 1) {
      if (layout.clues) {
        const clueEl = this.createClueElement(layout.clues.rows[row], 'row', row, separatorRows);
        board.append(clueEl);
        this.state.rowClues.push(clueEl);
      }

      for (let column = 0; column < columns; column += 1) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'cell';
        if (separatorColumns && column > 0 && column % separatorColumns === 0) {
          cell.classList.add('sep-left');
        }
        if (separatorRows && row > 0 && row % separatorRows === 0) {
          cell.classList.add('sep-top');
        }
        cell.dataset.row = String(row);
        cell.dataset.column = String(column);
        cell.tabIndex = -1;
        cell.style.setProperty('--order', String(row * columns + column));
        cell.addEventListener('pointerdown', (event) => this.onCellPointerDown(event));
        cell.addEventListener('pointerenter', (event) => this.onCellPointerEnter(event));
        cell.addEventListener('keydown', (event) => this.onCellKeyDown(event));
        cell.addEventListener('click', (event) => this.onCellClick(event));
        cell.addEventListener('focus', (event) => this.onCellFocus(event));
        cell.addEventListener('blur', () => this.onCellBlur());
        board.append(cell);
        this.state.cellEls[row][column] = cell;
      }
    }

    const first = this.mode.firstEditableCell?.(puzzle) ?? { row: 0, column: 0 };
    this.cellEl(first.row, first.column).tabIndex = 0;
  }

  createClueElement(clue, axis, index, separator) {
    const clueEl = document.createElement('div');
    clueEl.className = `clue clue-${axis}`;
    if (separator && index > 0 && index % separator === 0) {
      clueEl.classList.add(axis === 'column' ? 'sep-left' : 'sep-top');
    }
    clueEl.setAttribute(
      'aria-label',
      `${axis === 'column' ? 'Column' : 'Row'} ${index + 1} clue: ${clue.length ? clue.join(' ') : 'none'}`,
    );

    if (clue.length === 0) {
      const zero = document.createElement('span');
      zero.className = 'clue-number is-zero';
      zero.textContent = '0';
      clueEl.append(zero);
    } else {
      for (const run of clue) {
        const span = document.createElement('span');
        span.className = 'clue-number';
        span.textContent = String(run);
        clueEl.append(span);
      }
    }
    return clueEl;
  }

  cellEl(row, column) {
    return this.state.cellEls[row]?.[column] ?? null;
  }

  updateCellElement(row, column) {
    const cell = this.cellEl(row, column);
    if (!cell) return;
    this.mode.renderCell(this, row, column);
  }

  applyStateToBoard() {
    for (let row = 0; row < this.state.cells.length; row += 1) {
      for (let column = 0; column < this.state.cells[row].length; column += 1) {
        this.updateCellElement(row, column);
      }
    }
  }

  refreshAllCells() {
    this.applyStateToBoard();
  }

  /* ------------------------------------------------------------------------
     Selection and highlighting
     ------------------------------------------------------------------------ */

  setHot(row, column) {
    const previous = this.state.hot;
    if (previous.row === row && previous.column === column) return;

    this.mode.clearHighlight?.(this, previous);
    this.state.hot = { row, column };
    if (row >= 0 && column >= 0) this.mode.applyHighlight?.(this, row, column);
    this.updateControls();
  }

  refreshHighlight() {
    const { row, column } = this.state.hot;
    this.mode.clearHighlight?.(this, this.state.hot);
    if (row >= 0 && column >= 0) this.mode.applyHighlight?.(this, row, column);
  }

  makeRovingTarget(cell) {
    for (const row of this.state.cellEls) {
      for (const other of row) {
        if (other) other.tabIndex = -1;
      }
    }
    cell.tabIndex = 0;
  }

  focusCell(row, column, { preventScroll = true } = {}) {
    const cell = this.cellEl(row, column);
    if (cell) cell.focus({ preventScroll });
  }

  moveFocus(row, column) {
    const nextRow = Math.min(Math.max(row, 0), this.puzzle.size.rows - 1);
    const nextColumn = Math.min(Math.max(column, 0), this.puzzle.size.columns - 1);
    this.focusCell(nextRow, nextColumn, { preventScroll: false });
  }

  /* ------------------------------------------------------------------------
     Cell changes
     ------------------------------------------------------------------------ */

  beginDrag(value) {
    this.state.dragging = true;
    this.state.dragValue = value;
  }

  setCell(row, column, value) {
    const state = this.state;
    if (state.solved) return false;
    if (this.mode.isEditable && !this.mode.isEditable(this.puzzle, row, column)) return false;
    if (this.mode.isValidValue && !this.mode.isValidValue(value)) return false;
    if (state.cells[row][column] === value) return false;

    if (state.wrongTimer !== null) this.clearWrongHighlights();

    state.cells[row][column] = value;
    state.moves += 1;
    this.updateCellElement(row, column);
    this.mode.afterCellsChanged?.(this, row, column);
    this.refreshHighlight();
    this.updateControls();
    this.startTimerIfNeeded();
    this.mode.refreshCompletion?.(this, row, column);
    this.updateStats();

    if (this.mode.isSolved(state.cells, this.puzzle)) {
      this.finishPuzzle();
    } else {
      this.schedulePersist();
    }
    return true;
  }

  /* ------------------------------------------------------------------------
     Input handlers
     ------------------------------------------------------------------------ */

  onCellPointerDown(event) {
    const cell = event.currentTarget;
    const { row, column } = { row: Number(cell.dataset.row), column: Number(cell.dataset.column) };
    if (event.button === 0 || event.button === 2) this.focusCell(row, column);
    this.mode.onPointerDown?.(this, row, column, event);
  }

  onCellPointerEnter(event) {
    const cell = event.currentTarget;
    const { row, column } = { row: Number(cell.dataset.row), column: Number(cell.dataset.column) };

    if (!this.state.dragging) {
      this.setHot(row, column);
      return;
    }
    this.mode.onDragEnter?.(this, row, column, event);
  }

  onCellClick(event) {
    /* Screen readers and keyboard activations use detail 0; pointer clicks are
       already handled by pointerdown. */
    if (event.detail !== 0) return;
    const cell = event.currentTarget;
    const { row, column } = { row: Number(cell.dataset.row), column: Number(cell.dataset.column) };
    this.focusCell(row, column);
    this.mode.onKeyboardClick?.(this, row, column);
  }

  onCellFocus(event) {
    const cell = event.currentTarget;
    this.makeRovingTarget(cell);
    this.setHot(Number(cell.dataset.row), Number(cell.dataset.column));
  }

  onCellBlur() {
    if (!this.mode.keepSelection) this.setHot(-1, -1);
  }

  onCellKeyDown(event) {
    const cell = event.currentTarget;
    const row = Number(cell.dataset.row);
    const column = Number(cell.dataset.column);
    const { columns } = this.puzzle.size;

    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault();
        this.moveFocus(row - 1, column);
        return;
      case 'ArrowDown':
        event.preventDefault();
        this.moveFocus(row + 1, column);
        return;
      case 'ArrowLeft':
        event.preventDefault();
        this.moveFocus(row, column - 1);
        return;
      case 'ArrowRight':
        event.preventDefault();
        this.moveFocus(row, column + 1);
        return;
      case 'Home':
        event.preventDefault();
        this.moveFocus(row, 0);
        return;
      case 'End':
        event.preventDefault();
        this.moveFocus(row, columns - 1);
        return;
      default:
        break;
    }

    if (this.mode.onKeyDown?.(this, row, column, event)) {
      event.preventDefault();
    }
  }

  /* ------------------------------------------------------------------------
     Feedback, Check and solved state
     ------------------------------------------------------------------------ */

  setFeedback(message, warning = false) {
    window.clearTimeout(this.state.feedbackTimer);
    this.dom.feedback.textContent = message;
    this.dom.feedback.classList.toggle('is-warn', warning);
    this.state.feedbackTimer = window.setTimeout(() => this.clearFeedback(), FEEDBACK_TIMEOUT);
  }

  clearFeedback() {
    window.clearTimeout(this.state.feedbackTimer);
    this.state.feedbackTimer = null;
    this.dom.feedback.textContent = '';
    this.dom.feedback.classList.remove('is-warn');
  }

  clearWrongHighlights() {
    window.clearTimeout(this.state.wrongTimer);
    this.state.wrongTimer = null;
    for (const [row, column] of this.state.wrongCells) {
      this.cellEl(row, column)?.classList.remove('is-wrong');
    }
    this.state.wrongCells = [];
  }

  checkMistakes() {
    if (this.state.solved) {
      this.setFeedback('This puzzle is already solved.');
      return;
    }

    this.clearWrongHighlights();
    const mistakes = this.mode.findMistakes(this);

    if (mistakes.length === 0) {
      this.setFeedback('No mistakes found. Keep going.');
      return;
    }

    for (const [row, column] of mistakes) {
      this.cellEl(row, column)?.classList.add('is-wrong');
    }
    this.state.wrongCells = mistakes;
    this.state.wrongTimer = window.setTimeout(() => this.clearWrongHighlights(), WRONG_HIGHLIGHT_TIMEOUT);

    const noun = this.mode.cellNoun ?? 'square';
    this.setFeedback(
      `${mistakes.length} ${noun}${mistakes.length === 1 ? ' is' : 's are'} wrong — highlighted for a moment.`,
      true,
    );
  }

  updateHeader(puzzle) {
    this.dom.puzzleTitle.textContent = puzzle.name;
    this.dom.puzzleNumber.textContent = String(this.state.index + 1);
    this.dom.puzzleTotal.textContent = String(this.mode.puzzles.length);
    this.dom.puzzleDifficulty.textContent = puzzle.difficulty;
    this.dom.puzzleDifficulty.dataset.difficulty = puzzle.difficulty;
    this.dom.puzzleSize.textContent = `${puzzle.size.columns} × ${puzzle.size.rows}`;
    document.title = `${puzzle.name} — ${this.mode.title}`;
  }

  updateSelectLabels() {
    for (const option of this.dom.puzzleSelect.options) {
      const base = option.dataset.label ?? option.textContent.replace(/\s*✓$/, '');
      option.dataset.label = base;
      const solved = this.state.store.puzzles[option.value]?.solved === true;
      option.textContent = `${base}${solved ? ' ✓' : ''}`;
    }
  }

  updateSolvedUI() {
    this.dom.solvedBadge.hidden = !this.state.solved;
    this.dom.board.classList.toggle('is-solved', this.state.solved);
    this.dom.board.dataset.solved = String(this.state.solved);
  }

  updateHash(puzzle) {
    try {
      history.replaceState(null, '', `#${encodeURIComponent(this.mode.id)}/${encodeURIComponent(puzzle.id)}`);
    } catch {
      /* file:// or sandboxed contexts can refuse history updates. */
    }
  }

  /* ------------------------------------------------------------------------
     Event wiring
     ------------------------------------------------------------------------ */

  bindEvents() {
    for (const button of this.dom.gameModeButtons) {
      button.addEventListener('click', () => this.startMode(button.dataset.gameMode));
    }

    this.dom.checkButton.addEventListener('click', () => this.checkMistakes());
    this.dom.resetButton.addEventListener('click', () => this.resetPuzzle());
    this.dom.prevPuzzle.addEventListener('click', () => {
      const count = this.mode.puzzles.length;
      this.loadPuzzle((this.state.index - 1 + count) % count);
    });
    this.dom.nextPuzzle.addEventListener('click', () => {
      const count = this.mode.puzzles.length;
      this.loadPuzzle((this.state.index + 1) % count);
    });
    this.dom.puzzleSelect.addEventListener('change', () => {
      const index = this.mode.puzzleIndexById(this.dom.puzzleSelect.value);
      if (index >= 0) this.loadPuzzle(index);
    });
    this.dom.playAgain.addEventListener('click', () => {
      this.dom.winDialog.close();
      this.resetPuzzle();
    });
    this.dom.nextUnsolved.addEventListener('click', () => {
      const next = this.nextUnsolvedIndex(this.state.index);
      this.dom.winDialog.close();
      this.loadPuzzle(next);
    });

    this.dom.board.addEventListener('contextmenu', (event) => event.preventDefault());
    this.dom.board.addEventListener('pointerleave', () => {
      if (!this.state.dragging && !this.mode.keepSelection) this.setHot(-1, -1);
    });
    this.dom.board.addEventListener('pointerup', (event) => {
      if (this.state.dragging) this.mode.onPointerUp?.(this, event);
    });
    window.addEventListener('pointerup', () => {
      this.state.dragging = false;
    });
    window.addEventListener('pointercancel', () => {
      this.state.dragging = false;
    });

    window.addEventListener('pagehide', () => this.persistNow());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.persistNow();
      else this.updateTimerDisplay();
    });
    window.addEventListener('hashchange', () => this.handleHashChange());
  }
}
