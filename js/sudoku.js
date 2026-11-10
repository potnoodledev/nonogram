/**
 * Core Sudoku rules and helpers.
 *
 * A board is a 9×9 grid of integers. 0 is an empty cell; 1–9 are digits.
 * Givens are kept separately on the puzzle so the rules stay independent of
 * the presentation layer.
 */

export const SUDOKU_SIZE = 9;
export const SUDOKU_BOX = 3;
export const SUDOKU_EMPTY = 0;

const ALL_DIGITS = 0x1ff;

function rowOf(index) {
  return Math.floor(index / SUDOKU_SIZE);
}

function columnOf(index) {
  return index % SUDOKU_SIZE;
}

function boxOf(index) {
  const row = rowOf(index);
  const column = columnOf(index);
  return Math.floor(row / SUDOKU_BOX) * SUDOKU_BOX + Math.floor(column / SUDOKU_BOX);
}

/** Parse 81 characters (1–9, . or 0) into a 9×9 integer grid. */
export function parseGrid(text) {
  const source = String(text).replace(/\s+/g, '');
  if (source.length !== SUDOKU_SIZE * SUDOKU_SIZE) {
    throw new Error(`A Sudoku grid needs 81 cells, received ${source.length}.`);
  }

  const grid = [];
  for (let row = 0; row < SUDOKU_SIZE; row += 1) {
    const cells = [];
    for (let column = 0; column < SUDOKU_SIZE; column += 1) {
      const character = source[row * SUDOKU_SIZE + column];
      if (character === '.' || character === '0') {
        cells.push(SUDOKU_EMPTY);
      } else if (character >= '1' && character <= '9') {
        cells.push(Number(character));
      } else {
        throw new Error(`Unexpected Sudoku character "${character}".`);
      }
    }
    grid.push(cells);
  }
  return grid;
}

/** Deep-copy a 9×9 grid. */
export function cloneCells(cells) {
  return cells.map((row) => row.slice());
}

/** The editable starting board: a copy of the puzzle's givens. */
export function cellsFromGivens(puzzle) {
  return cloneCells(puzzle.givens);
}

/** True when the cell is one of the puzzle's printed numbers. */
export function isGiven(puzzle, row, column) {
  return puzzle.givens[row][column] !== SUDOKU_EMPTY;
}

/** True when the grid contains a digit in every cell. */
export function isFilled(cells) {
  return cells.every((row) => row.every((value) => value !== SUDOKU_EMPTY));
}

/** True when every row, column and box contains each digit exactly once. */
export function isValidSolution(cells) {
  if (!Array.isArray(cells) || cells.length !== SUDOKU_SIZE) return false;

  for (const row of cells) {
    if (!Array.isArray(row) || row.length !== SUDOKU_SIZE) return false;
  }

  for (let unit = 0; unit < SUDOKU_SIZE; unit += 1) {
    for (const axis of ['row', 'column', 'box']) {
      const seen = new Set();
      for (let index = 0; index < SUDOKU_SIZE; index += 1) {
        let row;
        let column;
        if (axis === 'row') {
          row = unit;
          column = index;
        } else if (axis === 'column') {
          row = index;
          column = unit;
        } else {
          row = Math.floor(unit / SUDOKU_BOX) * SUDOKU_BOX + Math.floor(index / SUDOKU_BOX);
          column = (unit % SUDOKU_BOX) * SUDOKU_BOX + (index % SUDOKU_BOX);
        }
        const value = cells[row]?.[column];
        if (!Number.isInteger(value) || value < 1 || value > 9 || seen.has(value)) return false;
        seen.add(value);
      }
    }
  }
  return true;
}

/** True when every cell matches the puzzle's solution. */
export function isSolved(cells, puzzle) {
  if (cells.length !== SUDOKU_SIZE) return false;
  for (let row = 0; row < SUDOKU_SIZE; row += 1) {
    if (cells[row].length !== SUDOKU_SIZE) return false;
    for (let column = 0; column < SUDOKU_SIZE; column += 1) {
      if (cells[row][column] !== puzzle.solution[row][column]) return false;
    }
  }
  return true;
}

/**
 * Cells whose digit conflicts with another digit in the same row, column or
 * box. Returns a Set of flat indices (row × 9 + column).
 */
export function findConflicts(cells) {
  const conflicts = new Set();
  const units = [];

  for (let index = 0; index < SUDOKU_SIZE; index += 1) {
    const row = [];
    const column = [];
    for (let offset = 0; offset < SUDOKU_SIZE; offset += 1) {
      row.push(index * SUDOKU_SIZE + offset);
      column.push(offset * SUDOKU_SIZE + index);
    }
    units.push(row, column);
  }

  for (let box = 0; box < SUDOKU_SIZE; box += 1) {
    const indices = [];
    for (let offset = 0; offset < SUDOKU_SIZE; offset += 1) {
      const row = Math.floor(box / SUDOKU_BOX) * SUDOKU_BOX + Math.floor(offset / SUDOKU_BOX);
      const column = (box % SUDOKU_BOX) * SUDOKU_BOX + (offset % SUDOKU_BOX);
      indices.push(row * SUDOKU_SIZE + column);
    }
    units.push(indices);
  }

  for (const unit of units) {
    const positions = new Map();
    for (const index of unit) {
      const value = cells[rowOf(index)][columnOf(index)];
      if (value === SUDOKU_EMPTY) continue;
      if (!positions.has(value)) positions.set(value, []);
      positions.get(value).push(index);
    }
    for (const matching of positions.values()) {
      if (matching.length < 2) continue;
      for (const index of matching) conflicts.add(index);
    }
  }

  return conflicts;
}

/** Digits that differ from the solution, used by the Check helper. */
export function findMistakes(cells, solution) {
  const mistakes = [];
  for (let row = 0; row < SUDOKU_SIZE; row += 1) {
    for (let column = 0; column < SUDOKU_SIZE; column += 1) {
      const value = cells[row][column];
      if (value !== SUDOKU_EMPTY && value !== solution[row][column]) {
        mistakes.push([row, column]);
      }
    }
  }
  return mistakes;
}

/** How many times each digit (1–9) currently appears on the board. */
export function digitCounts(cells) {
  const counts = Array(SUDOKU_SIZE + 1).fill(0);
  for (const row of cells) {
    for (const value of row) {
      if (value >= 1 && value <= 9) counts[value] += 1;
    }
  }
  return counts;
}

function buildMasks(flat) {
  const rows = Array(SUDOKU_SIZE).fill(0);
  const columns = Array(SUDOKU_SIZE).fill(0);
  const boxes = Array(SUDOKU_SIZE).fill(0);

  for (let index = 0; index < flat.length; index += 1) {
    const value = flat[index];
    if (value === SUDOKU_EMPTY) continue;
    const bit = 1 << (value - 1);
    const row = rowOf(index);
    const column = columnOf(index);
    rows[row] |= bit;
    columns[column] |= bit;
    boxes[boxOf(index)] |= bit;
  }

  return { rows, columns, boxes };
}

function bitCount(mask) {
  let count = 0;
  let remaining = mask;
  while (remaining) {
    remaining &= remaining - 1;
    count += 1;
  }
  return count;
}

/** Find the empty cell with the fewest candidates. */
function bestEmptyCell(flat, masks) {
  let best = -1;
  let bestMask = 0;
  let bestCount = SUDOKU_SIZE + 1;

  for (let index = 0; index < flat.length; index += 1) {
    if (flat[index] !== SUDOKU_EMPTY) continue;
    const row = rowOf(index);
    const column = columnOf(index);
    const mask = ALL_DIGITS & ~(masks.rows[row] | masks.columns[column] | masks.boxes[boxOf(index)]);
    const count = bitCount(mask);
    if (count === 0) return { index, mask: 0 };
    if (count < bestCount) {
      best = index;
      bestMask = mask;
      bestCount = count;
      if (count === 1) break;
    }
  }

  return { index: best, mask: bestMask };
}

/**
 * Solve a 9×9 grid, returning a new solved grid or null when it has no
 * solution. Used to derive puzzle solutions from their givens and to keep the
 * catalogue honest in tests.
 */
export function solve(givens) {
  if (findConflicts(givens).size > 0) return null;
  const flat = givens.flat();
  const masks = buildMasks(flat);

  function search() {
    const { index, mask } = bestEmptyCell(flat, masks);
    if (index === -1) return true;
    if (mask === 0) return false;

    const row = rowOf(index);
    const column = columnOf(index);
    const box = boxOf(index);

    let remaining = mask;
    while (remaining) {
      const bit = remaining & -remaining;
      remaining ^= bit;
      const value = Math.log2(bit) + 1;
      flat[index] = value;
      masks.rows[row] |= bit;
      masks.columns[column] |= bit;
      masks.boxes[box] |= bit;
      if (search()) return true;
      flat[index] = SUDOKU_EMPTY;
      masks.rows[row] ^= bit;
      masks.columns[column] ^= bit;
      masks.boxes[box] ^= bit;
    }
    return false;
  }

  if (!search()) return null;

  const solution = [];
  for (let row = 0; row < SUDOKU_SIZE; row += 1) {
    solution.push(flat.slice(row * SUDOKU_SIZE, (row + 1) * SUDOKU_SIZE));
  }
  return solution;
}

/** Count solutions, stopping at `limit` (2 is enough to prove uniqueness). */
export function countSolutions(givens, limit = 2) {
  if (findConflicts(givens).size > 0) return 0;
  const flat = givens.flat();
  const masks = buildMasks(flat);
  let count = 0;

  function search() {
    const { index, mask } = bestEmptyCell(flat, masks);
    if (index === -1) {
      count += 1;
      return;
    }
    if (mask === 0) return;

    const row = rowOf(index);
    const column = columnOf(index);
    const box = boxOf(index);

    let remaining = mask;
    while (remaining && count < limit) {
      const bit = remaining & -remaining;
      remaining ^= bit;
      const value = Math.log2(bit) + 1;
      flat[index] = value;
      masks.rows[row] |= bit;
      masks.columns[column] |= bit;
      masks.boxes[box] |= bit;
      search();
      flat[index] = SUDOKU_EMPTY;
      masks.rows[row] ^= bit;
      masks.columns[column] ^= bit;
      masks.boxes[box] ^= bit;
    }
  }

  search();
  return count;
}
