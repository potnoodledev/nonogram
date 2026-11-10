import { createGrid } from '../grid.js';
import {
  DOT,
  EMPTY,
  STAR,
  findClashes,
  findMistakes,
  isStarBattleSolved,
  starCount,
} from '../starbattle.js';
import {
  STAR_BATTLE_DIFFICULTIES,
  STAR_BATTLE_PUZZLES,
  starbattleIndexById,
} from '../starbattle-puzzles.js';

/**
 * Very low-contrast tints so neighbouring regions can be told apart; the
 * outline drawn by the edge classes is the main cue.
 */
const REGION_TINTS = [
  'rgba(94, 234, 212, 0.035)',
  'rgba(96, 165, 250, 0.055)',
  'rgba(129, 140, 248, 0.05)',
  'rgba(45, 212, 191, 0.03)',
  'rgba(56, 189, 248, 0.045)',
  'rgba(167, 139, 250, 0.045)',
  'rgba(52, 211, 153, 0.035)',
  'rgba(96, 165, 250, 0.03)',
  'rgba(94, 234, 212, 0.05)',
  'rgba(129, 140, 248, 0.035)',
];

function nextValue(value) {
  if (value === EMPTY) return STAR;
  if (value === STAR) return DOT;
  return EMPTY;
}

function cellLabel(game, row, column) {
  const value = game.state.cells[row][column];
  const region = String.fromCharCode(97 + game.puzzle.regions[row][column]);
  const state = value === STAR ? 'star' : value === DOT ? 'known empty' : 'empty';
  return `${game.puzzle.name}, row ${row + 1}, column ${column + 1}, region ${region}: ${state}`;
}

function refreshConflicts(game) {
  const clashes = findClashes(game.state.cells, game.puzzle);
  for (let row = 0; row < game.puzzle.size.rows; row += 1) {
    for (let column = 0; column < game.puzzle.size.columns; column += 1) {
      game.cellEl(row, column)?.classList.toggle('is-conflict', clashes.has(row * game.puzzle.size.columns + column));
    }
  }
}

export const starbattleMode = {
  id: 'starbattle',
  title: 'Star Battle',
  storageKey: 'starbattle:progress:v1',
  puzzles: STAR_BATTLE_PUZZLES,
  difficulties: STAR_BATTLE_DIFFICULTIES,
  puzzleIndexById: starbattleIndexById,
  cellNoun: 'cell',
  winTitle: 'Every star in place!',
  hint: 'Tap to cycle star → dot → empty · Drag to dot a run · Arrow keys move, <kbd>Space</kbd> cycles, <kbd>X</kbd> dots',

  boardLayout(puzzle) {
    return {
      rows: puzzle.size.rows,
      columns: puzzle.size.columns,
      clues: null,
      separatorEvery: null,
    };
  },

  boardLabel(puzzle) {
    return `${puzzle.name} Star Battle, ${puzzle.size.rows} by ${puzzle.size.columns} grid`;
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
        row.every((value) => value === EMPTY || value === STAR || value === DOT),
    );
  },

  isValidValue(value) {
    return value === EMPTY || value === STAR || value === DOT;
  },

  initialHot(game) {
    if (game.state.solved) return null;
    return { row: 0, column: 0 };
  },

  renderCell(game, row, column) {
    const cell = game.cellEl(row, column);
    if (!cell) return;

    const value = game.state.cells[row][column];
    const region = game.puzzle.regions[row][column];
    const size = game.puzzle.size.rows;

    cell.textContent = value === STAR ? '★' : '';
    cell.classList.toggle('is-star', value === STAR);
    cell.classList.toggle('is-dot', value === DOT);
    cell.dataset.region = String(region + 1);
    cell.style.setProperty('--region-tint', REGION_TINTS[region % REGION_TINTS.length]);
    cell.classList.toggle('edge-top', row === 0 || game.puzzle.regions[row - 1][column] !== region);
    cell.classList.toggle('edge-bottom', row === size - 1 || game.puzzle.regions[row + 1][column] !== region);
    cell.classList.toggle('edge-left', column === 0 || game.puzzle.regions[row][column - 1] !== region);
    cell.classList.toggle('edge-right', column === size - 1 || game.puzzle.regions[row][column + 1] !== region);
    cell.setAttribute('aria-label', cellLabel(game, row, column));
  },

  afterCellsChanged(game) {
    refreshConflicts(game);
  },

  refreshAllCompletion(game) {
    refreshConflicts(game);
  },

  isSolved(cells, puzzle) {
    return isStarBattleSolved(cells, puzzle.solution);
  },

  findMistakes(game) {
    return findMistakes(game.state.cells, game.puzzle.solution);
  },

  clearHighlight(game) {
    for (let row = 0; row < game.puzzle.size.rows; row += 1) {
      for (let column = 0; column < game.puzzle.size.columns; column += 1) {
        game.cellEl(row, column)?.classList.remove('is-hot', 'is-peer');
      }
    }
  },

  applyHighlight(game, row, column) {
    const region = game.puzzle.regions[row][column];
    for (let candidateRow = 0; candidateRow < game.puzzle.size.rows; candidateRow += 1) {
      for (let candidateColumn = 0; candidateColumn < game.puzzle.size.columns; candidateColumn += 1) {
        const cell = game.cellEl(candidateRow, candidateColumn);
        if (!cell) continue;
        const isSelected = candidateRow === row && candidateColumn === column;
        const isPeer =
          candidateRow === row ||
          candidateColumn === column ||
          game.puzzle.regions[candidateRow][candidateColumn] === region;
        cell.classList.toggle('is-hot', isSelected);
        cell.classList.toggle('is-peer', isPeer && !isSelected);
      }
    }
  },

  onPointerDown(game, row, column, event) {
    const state = game.state;
    if (state.solved) return;

    if (event.button === 2) {
      event.preventDefault();
      const current = state.cells[row][column];
      if (current !== STAR) game.setCell(row, column, current === DOT ? EMPTY : DOT);
      return;
    }

    if (event.button !== 0) return;
    event.preventDefault();

    state.starBattleStart = { row, column };
    state.starBattleMoved = false;
    game.beginDrag(DOT);
  },

  onDragEnter(game, row, column) {
    const state = game.state;
    const start = state.starBattleStart;
    if (!start || state.solved) return;
    if (row === start.row && column === start.column) return;

    if (!state.starBattleMoved) {
      state.starBattleMoved = true;
      game.setCell(start.row, start.column, DOT);
    }
    game.setCell(row, column, DOT);
  },

  /* Called by the shell when the pointer is released over the board. */
  onPointerUp(game, event) {
    const state = game.state;
    const start = state.starBattleStart;
    state.starBattleStart = null;
    if (!start || state.starBattleMoved || state.solved) return;

    const cell = event.target.closest?.('.cell');
    if (!cell) return;
    if (Number(cell.dataset.row) !== start.row || Number(cell.dataset.column) !== start.column) return;

    game.setCell(start.row, start.column, nextValue(state.cells[start.row][start.column]));
  },

  onKeyboardClick(game, row, column) {
    if (game.state.solved) return;
    game.setCell(row, column, nextValue(game.state.cells[row][column]));
  },

  onKeyDown(game, row, column, event) {
    if (game.state.solved) return false;

    switch (event.key) {
      case ' ':
      case 'Enter':
        game.setCell(row, column, nextValue(game.state.cells[row][column]));
        return true;
      case 'x':
      case 'X':
        game.setCell(row, column, game.state.cells[row][column] === DOT ? EMPTY : DOT);
        return true;
      case 'Delete':
      case 'Backspace':
        game.setCell(row, column, EMPTY);
        return true;
      default:
        return false;
    }
  },

  buildTools(game, container) {
    const progress = document.createElement('p');
    progress.className = 'star-progress';
    progress.dataset.starProgress = '';
    progress.setAttribute('aria-live', 'polite');
    container.append(progress);
  },

  updateControls(game) {
    const progress = game.dom.modeControls.querySelector('[data-star-progress]');
    if (!progress) return;
    if (!game.state.cells || !game.puzzle) {
      progress.textContent = '';
      return;
    }
    progress.textContent = `${starCount(game.state.cells)} / ${game.puzzle.starTotal} stars`;
  },
};
