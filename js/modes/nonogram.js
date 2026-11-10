import {
  EMPTY,
  FILLED,
  MARKED,
  createGrid,
  findMistakes,
  isLineComplete,
  isSolved,
} from '../nonogram.js';
import { DIFFICULTIES, PUZZLES, puzzleIndexById } from '../puzzles.js';

function cellLabel(game, row, column) {
  const value = game.state.cells[row][column];
  const state = value === FILLED ? 'filled' : value === MARKED ? 'marked blank' : 'blank';
  return `${game.puzzle.name}, row ${row + 1}, column ${column + 1}: ${state}`;
}

function setComplete(game, axis, index) {
  const puzzle = game.puzzle;
  const clues = axis === 'row' ? puzzle.clues.rows : puzzle.clues.columns;
  const elements = axis === 'row' ? game.state.rowClues : game.state.columnClues;
  elements[index]?.classList.toggle('is-complete', isLineComplete(game.state.cells, axis, index, clues[index]));
}

export const nonogramMode = {
  id: 'nonogram',
  title: 'Nonogram',
  storageKey: 'nonogram:progress:v1',
  puzzles: PUZZLES,
  difficulties: DIFFICULTIES,
  puzzleIndexById,
  cellNoun: 'square',
  winTitle: 'Picture revealed!',
  hint: 'Drag to paint · Right-click to mark · Arrow keys move, <kbd>Space</kbd> fills, <kbd>X</kbd> marks',

  boardLayout(puzzle) {
    return {
      rows: puzzle.size.rows,
      columns: puzzle.size.columns,
      clues: puzzle.clues,
      separatorEvery: 5,
    };
  },

  boardLabel(puzzle) {
    return `${puzzle.name} nonogram, ${puzzle.size.rows} by ${puzzle.size.columns} grid`;
  },

  createCells(puzzle) {
    return createGrid(puzzle.size.rows, puzzle.size.columns, EMPTY);
  },

  validateCells(cells, puzzle) {
    if (!Array.isArray(cells) || cells.length !== puzzle.size.rows) return false;
    return cells.every(
      (row) =>
        Array.isArray(row) &&
        row.length === puzzle.size.columns &&
        row.every((value) => value === EMPTY || value === FILLED || value === MARKED),
    );
  },

  isValidValue(value) {
    return value === EMPTY || value === FILLED || value === MARKED;
  },

  renderCell(game, row, column) {
    const cell = game.cellEl(row, column);
    if (!cell) return;
    const value = game.state.cells[row][column];
    cell.classList.toggle('is-filled', value === FILLED);
    cell.classList.toggle('is-marked', value === MARKED);
    cell.setAttribute('aria-label', cellLabel(game, row, column));
  },

  refreshCompletion(game, row, column) {
    setComplete(game, 'row', row);
    setComplete(game, 'column', column);
  },

  refreshAllCompletion(game) {
    for (let row = 0; row < game.puzzle.size.rows; row += 1) setComplete(game, 'row', row);
    for (let column = 0; column < game.puzzle.size.columns; column += 1) {
      setComplete(game, 'column', column);
    }
  },

  isSolved(cells, puzzle) {
    return isSolved(cells, puzzle.solution);
  },

  findMistakes(game) {
    const mistakes = findMistakes(game.state.cells, game.puzzle.solution);
    return [...mistakes.filled, ...mistakes.marked];
  },

  clearHighlight(game, previous) {
    if (previous.row >= 0) {
      game.state.rowClues[previous.row]?.classList.remove('is-hot');
      game.cellEl(previous.row, previous.column)?.classList.remove('is-hot');
    }
    if (previous.column >= 0) {
      game.state.columnClues[previous.column]?.classList.remove('is-hot');
    }
  },

  applyHighlight(game, row, column) {
    game.state.rowClues[row]?.classList.add('is-hot');
    game.state.columnClues[column]?.classList.add('is-hot');
    game.cellEl(row, column)?.classList.add('is-hot');
  },

  onPointerDown(game, row, column, event) {
    const state = game.state;
    if (state.solved) return;

    if (event.button === 2) {
      event.preventDefault();
      game.setCell(row, column, state.cells[row][column] === MARKED ? EMPTY : MARKED);
      return;
    }

    if (event.button !== 0) return;

    event.preventDefault();
    const current = state.cells[row][column];
    const value =
      state.toolMode === 'mark'
        ? current === MARKED
          ? EMPTY
          : MARKED
        : current === FILLED
          ? EMPTY
          : FILLED;

    game.beginDrag(value);
    game.setCell(row, column, value);
  },

  onDragEnter(game, row, column, event) {
    if (event.pointerType === 'mouse' || event.pointerType === 'pen') {
      game.setCell(row, column, game.state.dragValue);
    }
  },

  onKeyboardClick(game, row, column) {
    if (game.state.solved) return;
    const current = game.state.cells[row][column];
    game.setCell(row, column, current === FILLED ? EMPTY : FILLED);
  },

  onKeyDown(game, row, column, event) {
    switch (event.key) {
      case ' ':
      case 'Enter':
        if (game.state.solved) return false;
        game.setCell(row, column, game.state.cells[row][column] === FILLED ? EMPTY : FILLED);
        return true;
      case 'x':
      case 'X':
        if (game.state.solved) return false;
        game.setCell(row, column, game.state.cells[row][column] === MARKED ? EMPTY : MARKED);
        return true;
      case 'Delete':
      case 'Backspace':
        if (game.state.solved) return false;
        game.setCell(row, column, EMPTY);
        return true;
      default:
        return false;
    }
  },

  buildTools(game, container) {
    const group = document.createElement('div');
    group.className = 'mode-toggle';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Drawing mode');

    for (const [mode, label, id] of [
      ['fill', 'Fill', 'mode-fill'],
      ['mark', 'Mark', 'mode-mark'],
    ]) {
      const button = document.createElement('button');
      button.className = 'mode-button';
      button.type = 'button';
      button.id = id;
      button.dataset.toolMode = mode;
      button.textContent = label;
      button.addEventListener('click', () => {
        game.state.toolMode = mode;
        game.updateControls();
      });
      group.append(button);
    }

    container.append(group);
  },

  updateControls(game) {
    for (const button of game.dom.modeControls.querySelectorAll('[data-tool-mode]')) {
      button.setAttribute('aria-pressed', String(button.dataset.toolMode === game.state.toolMode));
    }
    game.dom.board.dataset.tool = game.state.toolMode;
  },
};
