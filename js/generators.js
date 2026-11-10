/**
 * Seeded level generators for the three game modes.
 *
 * Every generator is deterministic: the same seed and mode always produce the
 * same puzzle. The seed also chooses a difficulty, so the same seed gives an
 * Easy (or Medium, or Hard) level in each mode.
 *
 * Generated puzzles are checked before they are returned: every nonogram and
 * Star Battle layout has exactly one solution, and every Sudoku has exactly
 * one solution by construction. That keeps the promise the catalogue puzzles
 * make: the board can be completed by logic, and the game can lock a board as
 * soon as it matches.
 */

import { createGrid } from './grid.js';
import { cluesForGrid, filledCellCount } from './nonogram.js';
import { PUZZLES } from './puzzles.js';
import { STAR_BATTLE_PUZZLES } from './starbattle-puzzles.js';
import { countSolutions as countStarBattleSolutions } from './starbattle.js';
import { countSolutions as countSudokuSolutions } from './sudoku.js';
import { createRng, hashSeed, normalizeSeed } from './seed.js';

export const GENERATED_DIFFICULTIES = ['Easy', 'Medium', 'Hard'];

/** The difficulty a seed selects, shared by every mode. */
export function difficultyForSeed(seed) {
  return GENERATED_DIFFICULTIES[hashSeed(`${normalizeSeed(seed)}:difficulty`) % GENERATED_DIFFICULTIES.length];
}

/* --------------------------------------------------------------------------
   Nonogram
   -------------------------------------------------------------------------- */

const NONOGRAM_SIZES = { Easy: 5, Medium: 10, Hard: 15 };

/**
 * Every combination of filled runs that fits a line of `length` cells.
 * A line of length 15 and a clue such as [1, 1, 1] has a few hundred
 * combinations, which is small enough to keep in memory while solving.
 */
function linePatterns(length, clue) {
  const patterns = [];
  const cells = new Array(length).fill(0);

  function place(index, start) {
    if (index === clue.length) {
      patterns.push(cells.slice());
      return;
    }

    const run = clue[index];
    let tail = 0;
    for (let next = index + 1; next < clue.length; next += 1) tail += clue[next] + 1;
    const maxStart = length - tail - run;

    for (let position = start; position <= maxStart; position += 1) {
      for (let offset = 0; offset < run; offset += 1) cells[position + offset] = 1;
      place(index + 1, position + run + 1);
      for (let offset = 0; offset < run; offset += 1) cells[position + offset] = 0;
    }
  }

  place(0, 0);
  return patterns;
}

/**
 * Count the solutions of a nonogram, up to `limit`. Returns `limit` when the
 * search budget runs out, so a uniqueness check never mistakes a budget stop
 * for a unique puzzle.
 *
 * The solver alternates line-by-line constraint propagation with a guess on
 * the first unknown cell. Random pictures are usually decided by propagation
 * alone, and a puzzle that needs lots of guessing is rejected by the
 * generator rather than shown to a player.
 */
export function countNonogramSolutions(clues, limit = 2, nodeCap = 200000) {
  const rowCount = clues.rows.length;
  const columnCount = clues.columns.length;
  const rowCandidates = clues.rows.map((clue) => linePatterns(columnCount, clue));
  const columnCandidates = clues.columns.map((clue) => linePatterns(rowCount, clue));

  let nodes = 0;
  let count = 0;
  let capped = false;

  function search(cells) {
    nodes += 1;
    if (nodes > nodeCap) {
      capped = true;
      return;
    }

    while (true) {
      let changed = false;

      for (let row = 0; row < rowCount; row += 1) {
        const candidates = rowCandidates[row].filter((pattern) => {
          for (let column = 0; column < columnCount; column += 1) {
            const value = cells[row][column];
            if (value !== -1 && value !== pattern[column]) return false;
          }
          return true;
        });
        if (candidates.length === 0) return;

        for (let column = 0; column < columnCount; column += 1) {
          if (cells[row][column] !== -1) continue;
          const value = candidates[0][column];
          if (candidates.every((pattern) => pattern[column] === value)) {
            cells[row][column] = value;
            changed = true;
          }
        }
      }

      for (let column = 0; column < columnCount; column += 1) {
        const candidates = columnCandidates[column].filter((pattern) => {
          for (let row = 0; row < rowCount; row += 1) {
            const value = cells[row][column];
            if (value !== -1 && value !== pattern[row]) return false;
          }
          return true;
        });
        if (candidates.length === 0) return;

        for (let row = 0; row < rowCount; row += 1) {
          if (cells[row][column] !== -1) continue;
          const value = candidates[0][row];
          if (candidates.every((pattern) => pattern[row] === value)) {
            cells[row][column] = value;
            changed = true;
          }
        }
      }

      if (!changed) break;
    }

    let guess = null;
    for (let row = 0; row < rowCount && guess === null; row += 1) {
      for (let column = 0; column < columnCount; column += 1) {
        if (cells[row][column] === -1) {
          guess = [row, column];
          break;
        }
      }
    }

    if (guess === null) {
      count += 1;
      return;
    }

    for (const value of [1, 0]) {
      const next = cells.map((row) => row.slice());
      next[guess[0]][guess[1]] = value;
      search(next);
      if (count >= limit || capped) return;
    }
  }

  search(createGrid(rowCount, columnCount, -1));
  return capped ? limit : count;
}

function smoothArt(art) {
  const size = art.length;
  const next = createGrid(size, size, false);
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      let filled = 0;
      for (let rowStep = -1; rowStep <= 1; rowStep += 1) {
        for (let columnStep = -1; columnStep <= 1; columnStep += 1) {
          const rowAt = row + rowStep;
          const columnAt = column + columnStep;
          if (rowAt < 0 || rowAt >= size || columnAt < 0 || columnAt >= size) {
            if (art[row][column]) filled += 1;
          } else if (art[rowAt][columnAt]) {
            filled += 1;
          }
        }
      }
      next[row][column] = filled >= 5;
    }
  }
  return next;
}

function artLooksPlayable(art) {
  const size = art.length;
  let filled = 0;
  for (let row = 0; row < size; row += 1) {
    let inRow = 0;
    for (let column = 0; column < size; column += 1) if (art[row][column]) inRow += 1;
    if (inRow === 0 || inRow === size) return false;
    filled += inRow;
  }

  for (let column = 0; column < size; column += 1) {
    let inColumn = 0;
    for (let row = 0; row < size; row += 1) if (art[row][column]) inColumn += 1;
    if (inColumn === 0 || inColumn === size) return false;
  }

  const ratio = filled / (size * size);
  return ratio >= 0.28 && ratio <= 0.72;
}

/** A catalogue puzzle of the same size, used only if random art cannot be checked. */
function nonogramFallback(size, difficulty) {
  const puzzle = PUZZLES.find(
    (candidate) => candidate.size.rows === size && candidate.size.columns === size,
  );
  if (!puzzle) throw new Error(`No ${size} × ${size} nonogram fallback is available.`);

  return {
    difficulty,
    size: { rows: size, columns: size },
    solution: puzzle.solution.map((row) => row.slice()),
    clues: {
      rows: puzzle.clues.rows.map((clue) => clue.slice()),
      columns: puzzle.clues.columns.map((clue) => clue.slice()),
    },
    filledCount: puzzle.filledCount,
  };
}

/**
 * Generate a nonogram. The picture is mirrored left-to-right so it looks
 * deliberate, then smoothed into small clusters. Candidate pictures are
 * checked for a unique clue solution and rejected otherwise.
 */
export function generateNonogram(seed) {
  const difficulty = difficultyForSeed(seed);
  const size = NONOGRAM_SIZES[difficulty];
  const rng = createRng(`${normalizeSeed(seed)}:nonogram:${size}`);

  for (let attempt = 0; attempt < 400; attempt += 1) {
    let art = createGrid(size, size, false);
    const density = 0.42 + rng.next() * 0.18;
    const half = Math.ceil(size / 2);
    for (let row = 0; row < size; row += 1) {
      for (let column = 0; column < half; column += 1) {
        const filled = rng.next() < density;
        art[row][column] = filled;
        art[row][size - 1 - column] = filled;
      }
    }

    if (size >= 8) {
      art = smoothArt(art);
      if (attempt % 3 === 1) art = smoothArt(art);
    }

    if (!artLooksPlayable(art)) continue;

    const clues = cluesForGrid(art);
    if (countNonogramSolutions(clues) !== 1) continue;

    return {
      difficulty,
      size: { rows: size, columns: size },
      solution: art,
      clues,
      filledCount: filledCellCount(art),
    };
  }

  return nonogramFallback(size, difficulty);
}

/* --------------------------------------------------------------------------
   Sudoku
   -------------------------------------------------------------------------- */

function randomSolvedGrid(rng) {
  const rows = Array(9).fill(0);
  const columns = Array(9).fill(0);
  const boxes = Array(9).fill(0);
  const cells = new Array(81).fill(0);

  function boxOf(index) {
    const row = Math.floor(index / 9);
    const column = index % 9;
    return Math.floor(row / 3) * 3 + Math.floor(column / 3);
  }

  function search() {
    let best = -1;
    let bestMask = 0;
    let bestCount = 10;

    for (let index = 0; index < 81; index += 1) {
      if (cells[index] !== 0) continue;
      const row = Math.floor(index / 9);
      const column = index % 9;
      const mask = 0x1ff & ~(rows[row] | columns[column] | boxes[boxOf(index)]);
      let count = 0;
      let remaining = mask;
      while (remaining) {
        remaining &= remaining - 1;
        count += 1;
      }
      if (count === 0) return false;
      if (count < bestCount) {
        best = index;
        bestMask = mask;
        bestCount = count;
        if (count === 1) break;
      }
    }

    if (best === -1) return true;

    const row = Math.floor(best / 9);
    const column = best % 9;
    const box = boxOf(best);
    const digits = [];
    for (let digit = 1; digit <= 9; digit += 1) {
      if (bestMask & (1 << (digit - 1))) digits.push(digit);
    }
    rng.shuffle(digits);

    for (const digit of digits) {
      const bit = 1 << (digit - 1);
      cells[best] = digit;
      rows[row] |= bit;
      columns[column] |= bit;
      boxes[box] |= bit;
      if (search()) return true;
      cells[best] = 0;
      rows[row] ^= bit;
      columns[column] ^= bit;
      boxes[box] ^= bit;
    }
    return false;
  }

  search();

  const solution = [];
  for (let row = 0; row < 9; row += 1) {
    solution.push(cells.slice(row * 9, (row + 1) * 9));
  }
  return solution;
}

const SUDOKU_GIVENS = { Easy: 40, Medium: 32, Hard: 26 };

/**
 * Generate a Sudoku: build a random complete grid, then remove givens in a
 * random order while the puzzle keeps exactly one solution.
 */
export function generateSudoku(seed) {
  const difficulty = difficultyForSeed(seed);
  const target = SUDOKU_GIVENS[difficulty];
  const rng = createRng(`${normalizeSeed(seed)}:sudoku`);

  const solution = randomSolvedGrid(rng);
  const givens = solution.map((row) => row.slice());
  const positions = rng.shuffle(Array.from({ length: 81 }, (_, index) => index));
  let givensCount = 81;

  for (const position of positions) {
    if (givensCount <= target) break;
    const row = Math.floor(position / 9);
    const column = position % 9;
    const value = givens[row][column];
    givens[row][column] = 0;
    if (countSudokuSolutions(givens, 2) === 1) givensCount -= 1;
    else givens[row][column] = value;
  }

  return { difficulty, givens, solution, givensCount };
}

/* --------------------------------------------------------------------------
   Star Battle
   -------------------------------------------------------------------------- */

const STAR_BATTLE_SHAPES = {
  Easy: { size: 6, stars: 1 },
  Medium: { size: 8, stars: 1 },
  Hard: { size: 10, stars: 2 },
};

const STAR_BATTLE_MOVES = 30;
const STAR_BATTLE_MOVE_ATTEMPTS = 600;

/** Turn and mirror a curated layout; both keep every region connected. */
function transformLayout(base, size, symmetry) {
  const regions = createGrid(size, size, 0);
  const solution = createGrid(size, size, false);

  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      let sourceRow = symmetry & 2 ? size - 1 - row : row;
      let sourceColumn = symmetry & 1 ? size - 1 - column : column;
      if (symmetry & 4) [sourceRow, sourceColumn] = [sourceColumn, sourceRow];
      regions[row][column] = base.regions[sourceRow][sourceColumn];
      solution[row][column] = base.solution[sourceRow][sourceColumn];
    }
  }

  return { regions, solution };
}

/** True when the region is still one connected area without the given cell. */
function regionStaysConnected(regions, region, row, column) {
  const size = regions.length;
  const ignored = row * size + column;
  let start = -1;
  let expected = 0;
  for (let at = 0; at < size * size; at += 1) {
    const atRow = Math.floor(at / size);
    const atColumn = at % size;
    if (regions[atRow][atColumn] !== region || at === ignored) continue;
    expected += 1;
    if (start === -1) start = at;
  }
  if (start === -1) return false;

  const seen = new Uint8Array(size * size);
  const queue = [start];
  seen[start] = 1;
  let visited = 0;

  while (queue.length > 0) {
    const at = queue.pop();
    visited += 1;
    const atRow = Math.floor(at / size);
    const atColumn = at % size;
    for (const [rowStep, columnStep] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      const nextRow = atRow + rowStep;
      const nextColumn = atColumn + columnStep;
      if (nextRow < 0 || nextRow >= size || nextColumn < 0 || nextColumn >= size) continue;
      const next = nextRow * size + nextColumn;
      if (next === ignored || seen[next] || regions[nextRow][nextColumn] !== region) continue;
      seen[next] = 1;
      queue.push(next);
    }
  }

  return visited === expected;
}

/**
 * Move one non-star cell to a neighbouring region, keeping both regions
 * connected. The puzzle's solution stays valid because no star changes hands.
 */
function nudge(rng, size, regions, solution) {
  for (let tries = 0; tries < 50; tries += 1) {
    const row = rng.int(size);
    const column = rng.int(size);
    if (solution[row][column]) continue;

    const [rowStep, columnStep] = rng.pick([
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]);
    const nextRow = row + rowStep;
    const nextColumn = column + columnStep;
    if (nextRow < 0 || nextRow >= size || nextColumn < 0 || nextColumn >= size) continue;
    if (regions[nextRow][nextColumn] === regions[row][column]) continue;
    if (!regionStaysConnected(regions, regions[row][column], row, column)) continue;

    regions[row][column] = regions[nextRow][nextColumn];
    return true;
  }
  return false;
}

/**
 * Generate a Star Battle from a curated layout: turn or mirror it, then slide
 * cells between neighbouring regions. A move is kept only while the board
 * still has exactly one solution, so every generated board is a valid puzzle
 * and the curated solution never changes.
 */
export function generateStarBattle(seed) {
  const difficulty = difficultyForSeed(seed);
  const { size, stars } = STAR_BATTLE_SHAPES[difficulty];
  const rng = createRng(`${normalizeSeed(seed)}:starbattle:${size}:${stars}`);

  const bases = STAR_BATTLE_PUZZLES.filter(
    (puzzle) => puzzle.size.rows === size && puzzle.stars === stars,
  );
  const base = bases[rng.int(bases.length)];
  const { regions, solution } = transformLayout(base, size, rng.int(8));

  let accepted = 0;
  for (let attempt = 0; attempt < STAR_BATTLE_MOVE_ATTEMPTS && accepted < STAR_BATTLE_MOVES; attempt += 1) {
    const before = regions.map((row) => row.slice());
    if (!nudge(rng, size, regions, solution)) continue;
    if (countStarBattleSolutions(regions, stars, 2) === 1) accepted += 1;
    else {
      for (let row = 0; row < size; row += 1) regions[row] = before[row].slice();
    }
  }

  return {
    difficulty,
    size: { rows: size, columns: size },
    stars,
    starTotal: size * stars,
    regions,
    solution,
  };
}
