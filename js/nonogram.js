/**
 * Core nonogram rules and helpers.
 *
 * Cell values are stored as small integers so a puzzle state can be serialised
 * to localStorage without special casing:
 *
 *   EMPTY  - untouched / known blank
 *   FILLED - part of the picture
 *   MARKED - the player's "this is blank" cross
 */

export const EMPTY = 0;
export const FILLED = 1;
export const MARKED = 2;

/**
 * Turn one line of booleans into its clue sequence.
 * e.g. [true, true, false, true] -> [2, 1]
 */
export function cluesForLine(line) {
  const clues = [];
  let run = 0;
  for (const filled of line) {
    if (filled) {
      run += 1;
    } else if (run > 0) {
      clues.push(run);
      run = 0;
    }
  }
  if (run > 0) clues.push(run);
  return clues;
}

/** Clues for every row and column of a solution grid. */
export function cluesForGrid(solution) {
  const rows = solution.map(cluesForLine);
  const columns = [];
  const rowCount = solution.length;
  const columnCount = rowCount > 0 ? solution[0].length : 0;

  for (let column = 0; column < columnCount; column += 1) {
    const line = [];
    for (let row = 0; row < rowCount; row += 1) line.push(solution[row][column]);
    columns.push(cluesForLine(line));
  }

  return { rows, columns };
}

/** True when two clue sequences are identical. */
export function cluesMatch(a, b) {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
}

/** Build a grid filled with one value. */
export function createGrid(rowCount, columnCount, value = EMPTY) {
  return Array.from({ length: rowCount }, () => Array(columnCount).fill(value));
}

/** Parse puzzle art ("#" filled, everything else blank) into a boolean grid. */
export function solutionFromRows(rows) {
  return rows.map((row) => Array.from(row, (character) => character === '#'));
}

/**
 * True when the line's runs of filled cells match its clue.
 *
 * This is deliberately based on the player's filled cells only: crosses do not
 * change the runs, so a line can be "complete" while still carrying notes.
 */
export function isLineComplete(cells, axis, index, clue) {
  let line;
  if (axis === 'row') {
    line = cells[index].map((value) => value === FILLED);
  } else {
    line = cells.map((row) => row[index] === FILLED);
  }
  return cluesMatch(cluesForLine(line), clue);
}

/**
 * True when every filled cell belongs to the solution and every solution cell
 * is filled. Crosses on blank cells are allowed and do not break the win.
 */
export function isSolved(cells, solution) {
  if (cells.length !== solution.length) return false;
  for (let row = 0; row < solution.length; row += 1) {
    if (cells[row].length !== solution[row].length) return false;
    for (let column = 0; column < solution[row].length; column += 1) {
      if ((cells[row][column] === FILLED) !== solution[row][column]) return false;
    }
  }
  return true;
}

/**
 * Cells that conflict with the solution, used by the optional "Check" helper.
 * Returns `{ filled, marked }` coordinate lists.
 */
export function findMistakes(cells, solution) {
  const mistakes = { filled: [], marked: [] };
  for (let row = 0; row < solution.length; row += 1) {
    for (let column = 0; column < solution[row].length; column += 1) {
      const value = cells[row]?.[column] ?? EMPTY;
      const belongs = solution[row][column];
      if (value === FILLED && !belongs) mistakes.filled.push([row, column]);
      if (value === MARKED && belongs) mistakes.marked.push([row, column]);
    }
  }
  return mistakes;
}

/** Number of cells that must end up filled. */
export function filledCellCount(solution) {
  let count = 0;
  for (const row of solution) for (const filled of row) if (filled) count += 1;
  return count;
}
