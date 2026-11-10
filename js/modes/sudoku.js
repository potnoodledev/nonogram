import { findConflicts, findMistakes, isGiven, isSolved } from '../sudoku.js';
import { SUDOKU_DIFFICULTIES, SUDOKU_PUZZLES, sudokuIndexById } from '../sudoku-puzzles.js';

function refreshConflicts(game) {
  const conflicts = findConflicts(game.state.cells);
  for (let row = 0; row < 9; row += 1) {
    for (let column = 0; column < 9; column += 1) {
      game.cellEl(row, column)?.classList.toggle('is-conflict', conflicts.has(row * 9 + column));
    }
  }
}

function selectedEditable(game) {
  const { row, column } = game.state.hot;
  if (game.state.solved || row < 0 || column < 0) return false;
  return !isGiven(game.puzzle, row, column);
}

function enterDigit(game, digit) {
  if (!selectedEditable(game)) return;
  const { row, column } = game.state.hot;
  const current = game.state.cells[row][column];
  game.setCell(row, column, current === digit ? 0 : digit);
  game.focusCell(row, column);
}

function cellLabel(game, row, column) {
  const value = game.state.cells[row][column];
  const given = isGiven(game.puzzle, row, column);
  const content = value === 0 ? 'empty' : given ? `given ${value}` : String(value);
  return `${game.puzzle.name}, row ${row + 1}, column ${column + 1}: ${content}`;
}

export const sudokuMode = {
  id: 'sudoku',
  title: 'Sudoku',
  storageKey: 'sudoku:progress:v1',
  puzzles: SUDOKU_PUZZLES,
  difficulties: SUDOKU_DIFFICULTIES,
  puzzleIndexById: sudokuIndexById,
  cellNoun: 'cell',
  winTitle: 'Grid solved!',
  keepSelection: true,
  hint: 'Select a cell, then choose a number · Arrow keys move · <kbd>1</kbd>–<kbd>9</kbd> fill, <kbd>Backspace</kbd> clears',

  boardLayout() {
    return {
      rows: 9,
      columns: 9,
      clues: null,
      separatorEvery: 3,
    };
  },

  boardLabel(puzzle) {
    return `${puzzle.name} Sudoku, 9 by 9 grid`;
  },

  createCells(puzzle) {
    return puzzle.givens.map((row) => row.slice());
  },

  validateCells(cells, puzzle) {
    if (!Array.isArray(cells) || cells.length !== 9) return false;
    return cells.every(
      (row, rowIndex) =>
        Array.isArray(row) &&
        row.length === 9 &&
        row.every(
          (value, columnIndex) =>
            Number.isInteger(value) &&
            value >= 0 &&
            value <= 9 &&
            (puzzle.givens[rowIndex][columnIndex] === 0 ||
              value === puzzle.givens[rowIndex][columnIndex]),
        ),
    );
  },

  isEditable(puzzle, row, column) {
    return !isGiven(puzzle, row, column);
  },

  isValidValue(value) {
    return Number.isInteger(value) && value >= 0 && value <= 9;
  },

  firstEditableCell(puzzle) {
    for (let row = 0; row < 9; row += 1) {
      for (let column = 0; column < 9; column += 1) {
        if (!isGiven(puzzle, row, column)) return { row, column };
      }
    }
    return null;
  },

  initialHot(game) {
    if (game.state.solved) return null;
    return this.firstEditableCell(game.puzzle);
  },

  renderCell(game, row, column) {
    const cell = game.cellEl(row, column);
    if (!cell) return;
    const value = game.state.cells[row][column];
    const given = isGiven(game.puzzle, row, column);
    cell.textContent = value === 0 ? '' : String(value);
    cell.classList.toggle('is-given', given);
    cell.classList.toggle('has-value', value !== 0);
    cell.setAttribute('aria-label', cellLabel(game, row, column));
  },

  afterCellsChanged(game) {
    game.refreshAllCells();
    refreshConflicts(game);
  },

  refreshAllCompletion(game) {
    refreshConflicts(game);
  },

  isSolved(cells, puzzle) {
    return isSolved(cells, puzzle);
  },

  findMistakes(game) {
    return findMistakes(game.state.cells, game.puzzle.solution);
  },

  clearHighlight(game) {
    for (let row = 0; row < 9; row += 1) {
      for (let column = 0; column < 9; column += 1) {
        game.cellEl(row, column)?.classList.remove('is-hot', 'is-peer', 'is-same');
      }
    }
  },

  applyHighlight(game, row, column) {
    const selected = game.state.cells[row][column];
    const boxRow = Math.floor(row / 3) * 3;
    const boxColumn = Math.floor(column / 3) * 3;

    for (let candidateRow = 0; candidateRow < 9; candidateRow += 1) {
      for (let candidateColumn = 0; candidateColumn < 9; candidateColumn += 1) {
        const cell = game.cellEl(candidateRow, candidateColumn);
        if (!cell) continue;
        const isSelected = candidateRow === row && candidateColumn === column;
        const isPeer =
          candidateRow === row ||
          candidateColumn === column ||
          (candidateRow >= boxRow &&
            candidateRow < boxRow + 3 &&
            candidateColumn >= boxColumn &&
            candidateColumn < boxColumn + 3);
        const isSame =
          selected !== 0 && game.state.cells[candidateRow][candidateColumn] === selected;

        cell.classList.toggle('is-hot', isSelected);
        cell.classList.toggle('is-peer', isPeer && !isSelected);
        cell.classList.toggle('is-same', isSame && !isSelected);
      }
    }
  },

  onPointerDown(game, row, column, event) {
    if (event.button !== 2) return;
    event.preventDefault();
    if (game.state.solved || isGiven(game.puzzle, row, column)) return;
    game.setCell(row, column, 0);
  },

  onKeyboardClick(game, row, column) {
    game.focusCell(row, column);
  },

  onKeyDown(game, row, column, event) {
    if (event.key >= '1' && event.key <= '9') {
      if (!game.state.solved && !isGiven(game.puzzle, row, column)) {
        const digit = Number(event.key);
        const current = game.state.cells[row][column];
        game.setCell(row, column, current === digit ? 0 : digit);
      }
      return true;
    }

    if (event.key === '0' || event.key === 'Backspace' || event.key === 'Delete') {
      if (!game.state.solved && !isGiven(game.puzzle, row, column)) {
        game.setCell(row, column, 0);
      }
      return true;
    }

    return false;
  },

  buildTools(game, container) {
    const pad = document.createElement('div');
    pad.className = 'digit-pad';
    pad.setAttribute('role', 'group');
    pad.setAttribute('aria-label', 'Sudoku digits');

    for (let digit = 1; digit <= 9; digit += 1) {
      const button = document.createElement('button');
      button.className = 'digit-button';
      button.type = 'button';
      button.dataset.digit = String(digit);
      button.textContent = String(digit);
      button.setAttribute('aria-label', `Enter ${digit}`);
      button.addEventListener('click', () => enterDigit(game, digit));
      pad.append(button);
    }

    const erase = document.createElement('button');
    erase.className = 'digit-button digit-erase';
    erase.type = 'button';
    erase.dataset.digit = '0';
    erase.textContent = 'Erase';
    erase.setAttribute('aria-label', 'Erase selected cell');
    erase.addEventListener('click', () => enterDigit(game, 0));
    pad.append(erase);

    container.append(pad);
  },

  updateControls(game) {
    const { row, column } = game.state.hot;
    const value = row >= 0 && column >= 0 ? game.state.cells[row][column] : 0;
    const enabled = selectedEditable(game);

    for (const button of game.dom.modeControls.querySelectorAll('[data-digit]')) {
      button.disabled = !enabled;
      button.classList.toggle('is-current', Number(button.dataset.digit) === value && value !== 0);
    }
  },
};
