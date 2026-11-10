/**
 * Core Star Battle rules and helpers.
 *
 * A board is a grid of integers so progress can be serialised to localStorage:
 *
 *   EMPTY - nothing marked
 *   STAR  - a star placed by the player
 *   DOT   - a note that the cell must stay empty
 *
 * A puzzle is a square grid cut into as many outlined regions as rows. Every
 * row, column and region must hold exactly `stars` stars (one on the smaller
 * boards, two on the 10 × 10 boards), and no two stars may touch, not even at
 * a corner. Every puzzle in the catalogue has exactly one solution.
 *
 * Region puzzles are stored in the same compact notation as RetroStoneVC's
 * levels: "<size>/<stars>:" followed by one letter per cell, row by row, where
 * the letter names the cell's region.
 */

import { createGrid } from './grid.js';

export { createGrid } from './grid.js';

export const EMPTY = 0;
export const STAR = 1;
export const DOT = 2;

const MIN_SIZE = 4;
const MAX_SIZE = 10;

function regionIndex(character, size) {
  const index = character.charCodeAt(0) - 97;
  return index >= 0 && index < size ? index : -1;
}

/**
 * Parse a compact region code into `{ size, stars, regions }`.
 *
 * Throws when the code is malformed, a region is missing, a region is too
 * small to hold its stars, or a region is not edge-connected.
 */
export function parseStarBattleCode(code) {
  const match = /^(\d+)\/(\d+):([a-z]+)$/.exec(String(code).trim());
  if (!match) {
    throw new Error(`Star Battle code must look like "6/1:aaaaaa...", received "${code}".`);
  }

  const size = Number(match[1]);
  const stars = Number(match[2]);
  const text = match[3];

  if (!Number.isInteger(size) || size < MIN_SIZE || size > MAX_SIZE) {
    throw new Error(`A Star Battle board has ${MIN_SIZE}–${MAX_SIZE} rows, received ${size}.`);
  }
  if (!Number.isInteger(stars) || stars < 1 || stars > 2 || stars * 2 - 1 > size) {
    throw new Error(`A Star Battle line holds one or two stars, received ${stars}.`);
  }
  if (text.length !== size * size) {
    throw new Error(`A ${size} × ${size} Star Battle board needs ${size * size} cells, received ${text.length}.`);
  }

  const regions = createGrid(size, size, 0);
  const regionSizes = new Array(size).fill(0);
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const region = regionIndex(text[row * size + column], size);
      if (region < 0) {
        throw new Error(
          `Unexpected region "${text[row * size + column]}" at row ${row + 1}, column ${column + 1}.`,
        );
      }
      regions[row][column] = region;
      regionSizes[region] += 1;
    }
  }

  for (let region = 0; region < size; region += 1) {
    if (regionSizes[region] < stars) {
      throw new Error(`Region ${String.fromCharCode(97 + region)} is too small for ${stars} stars.`);
    }
  }

  for (let region = 0; region < size; region += 1) {
    const first = findRegionCell(regions, region);
    const visited = createGrid(size, size, false);
    const queue = [first];
    visited[first[0]][first[1]] = true;
    let count = 1;

    while (queue.length > 0) {
      const [row, column] = queue.pop();
      for (const [rowStep, columnStep] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]) {
        const nextRow = row + rowStep;
        const nextColumn = column + columnStep;
        if (
          nextRow < 0 ||
          nextRow >= size ||
          nextColumn < 0 ||
          nextColumn >= size ||
          visited[nextRow][nextColumn] ||
          regions[nextRow][nextColumn] !== region
        ) {
          continue;
        }
        visited[nextRow][nextColumn] = true;
        count += 1;
        queue.push([nextRow, nextColumn]);
      }
    }

    if (count !== regionSizes[region]) {
      throw new Error(`Region ${String.fromCharCode(97 + region)} is not one connected area.`);
    }
  }

  return { size, stars, regions };
}

function findRegionCell(regions, region) {
  for (let row = 0; row < regions.length; row += 1) {
    for (let column = 0; column < regions[row].length; column += 1) {
      if (regions[row][column] === region) return [row, column];
    }
  }
  return [0, 0];
}

/* --------------------------------------------------------------------------
   Solver
   -------------------------------------------------------------------------- */

function solve(regions, stars, limit) {
  const size = regions.length;
  const columnStars = new Array(size).fill(0);
  const regionStars = new Array(size).fill(0);
  const solution = createGrid(size, size, false);
  const regionCellsBelow = createGrid(size + 1, size, 0);
  for (let row = size - 1; row >= 0; row -= 1) {
    for (let region = 0; region < size; region += 1) {
      regionCellsBelow[row][region] = regionCellsBelow[row + 1][region];
    }
    for (let column = 0; column < size; column += 1) {
      regionCellsBelow[row][regions[row][column]] += 1;
    }
  }

  let count = 0;
  let first = null;

  /** Enough rows or cells left for every column and region still missing a star. */
  function feasible(row) {
    const rowsLeft = size - row - 1;
    for (let column = 0; column < size; column += 1) {
      if (columnStars[column] < stars && columnStars[column] + rowsLeft < stars) return false;
    }
    for (let region = 0; region < size; region += 1) {
      if (
        regionStars[region] < stars &&
        regionStars[region] + regionCellsBelow[row + 1][region] < stars
      ) {
        return false;
      }
    }
    return true;
  }

  function place(row, startColumn, left, rowMask, previousMask) {
    if (count >= limit) return;

    if (left === 0) {
      if (!feasible(row)) return;
      if (row === size - 1) {
        count += 1;
        if (first === null) first = solution.map((line) => line.slice());
        return;
      }
      search(row + 1, rowMask);
      return;
    }

    for (let column = startColumn; column <= size - left; column += 1) {
      const bit = 1 << column;
      if (previousMask & (bit | (bit >> 1) | (bit << 1))) continue;

      const region = regions[row][column];
      if (columnStars[column] >= stars || regionStars[region] >= stars) continue;

      columnStars[column] += 1;
      regionStars[region] += 1;
      solution[row][column] = true;
      place(row, column + 2, left - 1, rowMask | bit, previousMask);
      solution[row][column] = false;
      regionStars[region] -= 1;
      columnStars[column] -= 1;

      if (count >= limit) return;
    }
  }

  function search(row, previousMask) {
    if (count >= limit) return;
    if (row >= size) return;
    place(row, 0, stars, 0, previousMask);
  }

  search(0, 0);
  return { count, first };
}

/** The first solution of a region layout, as a boolean grid, or null. */
export function solveStarBattle(regions, stars) {
  return solve(regions, stars, 1).first;
}

/** How many solutions the layout has, counted up to `limit`. */
export function countSolutions(regions, stars, limit = 2) {
  return solve(regions, stars, limit).count;
}

/* --------------------------------------------------------------------------
   Player state
   -------------------------------------------------------------------------- */

/** True when every solution star is marked and no other star is. */
export function isStarBattleSolved(cells, solution) {
  if (cells.length !== solution.length) return false;
  for (let row = 0; row < solution.length; row += 1) {
    if (cells[row].length !== solution[row].length) return false;
    for (let column = 0; column < solution[row].length; column += 1) {
      if ((cells[row][column] === STAR) !== solution[row][column]) return false;
    }
  }
  return true;
}

/**
 * Cells that conflict with the solution, used by the optional "Check" helper:
 * a star where the solution is empty, or a dot where it has a star.
 */
export function findMistakes(cells, solution) {
  const mistakes = [];
  for (let row = 0; row < solution.length; row += 1) {
    for (let column = 0; column < solution[row].length; column += 1) {
      const value = cells[row]?.[column] ?? EMPTY;
      if (value === STAR && !solution[row][column]) mistakes.push([row, column]);
      if (value === DOT && solution[row][column]) mistakes.push([row, column]);
    }
  }
  return mistakes;
}

/** The number of stars on the board. */
export function starCount(cells) {
  let count = 0;
  for (const row of cells) for (const value of row) if (value === STAR) count += 1;
  return count;
}

/**
 * Stars that break the rules right now: two stars touching, or more than the
 * allowed number in a row, column or region. Used for immediate feedback.
 */
export function findClashes(cells, puzzle) {
  const { regions } = puzzle;
  const stars = puzzle.stars;
  const size = regions.length;
  const clashes = new Set();
  const starCells = [];

  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (cells[row][column] === STAR) starCells.push([row, column]);
    }
  }

  for (const [row, column] of starCells) {
    for (let rowStep = -1; rowStep <= 1; rowStep += 1) {
      for (let columnStep = -1; columnStep <= 1; columnStep += 1) {
        if (rowStep === 0 && columnStep === 0) continue;
        const nextRow = row + rowStep;
        const nextColumn = column + columnStep;
        if (nextRow < 0 || nextRow >= size || nextColumn < 0 || nextColumn >= size) continue;
        if (cells[nextRow][nextColumn] === STAR) {
          clashes.add(row * size + column);
          clashes.add(nextRow * size + nextColumn);
        }
      }
    }
  }

  const rowStars = Array.from({ length: size }, () => []);
  const columnStars = Array.from({ length: size }, () => []);
  const regionStars = Array.from({ length: size }, () => []);

  for (const [row, column] of starCells) {
    const cell = row * size + column;
    rowStars[row].push(cell);
    columnStars[column].push(cell);
    regionStars[regions[row][column]].push(cell);
  }

  for (const unit of [...rowStars, ...columnStars, ...regionStars]) {
    if (unit.length > stars) for (const cell of unit) clashes.add(cell);
  }

  return clashes;
}
