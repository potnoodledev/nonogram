import assert from 'node:assert/strict';
import test from 'node:test';

import {
  countNonogramSolutions,
  difficultyForSeed,
  generateNonogram,
  generateStarBattle,
  generateSudoku,
} from '../js/generators.js';
import { cluesForGrid, filledCellCount } from '../js/nonogram.js';
import { PUZZLES } from '../js/puzzles.js';
import { createRng, hashSeed, normalizeSeed, puzzleIdForSeed, seedFromPuzzleId } from '../js/seed.js';
import { solveStarBattle, countSolutions as countStarBattleSolutions } from '../js/starbattle.js';
import {
  countSolutions as countSudokuSolutions,
  findConflicts,
  isValidSolution,
} from '../js/sudoku.js';

/* Seeds chosen to cover all three generated difficulties. */
const SEEDS = ['123456', 'hello', 'test'];

function regionCells(regions, region) {
  const cells = [];
  for (let row = 0; row < regions.length; row += 1) {
    for (let column = 0; column < regions[row].length; column += 1) {
      if (regions[row][column] === region) cells.push([row, column]);
    }
  }
  return cells;
}

test('seeds are trimmed, encoded in puzzle ids and read back', () => {
  assert.equal(normalizeSeed('  comet  '), 'comet');
  assert.equal(normalizeSeed(null), '');
  assert.equal(puzzleIdForSeed('comet'), 'seed:comet');
  assert.equal(seedFromPuzzleId('seed:comet'), 'comet');
  assert.equal(seedFromPuzzleId('heart'), null);
  assert.equal(seedFromPuzzleId(null), null);

  assert.equal(seedFromPuzzleId(puzzleIdForSeed('a/b c ☄')), 'a/b c ☄');
  assert.equal(normalizeSeed('  a/b c ☄  '), 'a/b c ☄');
});

test('seeded random numbers are deterministic and stay in range', () => {
  assert.equal(hashSeed('comet'), hashSeed('comet'));
  assert.notEqual(hashSeed('comet'), hashSeed('comets'));

  const first = createRng('comet');
  const second = createRng('comet');
  const firstRun = Array.from({ length: 20 }, () => first.int(100));
  const secondRun = Array.from({ length: 20 }, () => second.int(100));
  assert.deepEqual(firstRun, secondRun);
  assert.ok(firstRun.every((value) => value >= 0 && value < 100));

  assert.deepEqual(
    createRng('comet').shuffle([1, 2, 3, 4, 5]),
    createRng('comet').shuffle([1, 2, 3, 4, 5]),
  );
});

test('a seed chooses one difficulty for every mode', () => {
  for (const seed of SEEDS) {
    const difficulty = difficultyForSeed(seed);
    assert.ok(['Easy', 'Medium', 'Hard'].includes(difficulty));
    assert.equal(generateNonogram(seed).difficulty, difficulty);
    assert.equal(generateSudoku(seed).difficulty, difficulty);
    assert.equal(generateStarBattle(seed).difficulty, difficulty);
  }

  assert.deepEqual(
    SEEDS.map((seed) => difficultyForSeed(seed)),
    ['Easy', 'Medium', 'Hard'],
  );
});

test('the nonogram solver confirms the curated catalogue is unique', () => {
  for (const puzzle of PUZZLES) {
    assert.equal(countNonogramSolutions(puzzle.clues), 1, `${puzzle.id} has one solution`);
  }
});

test('generated nonograms are deterministic, unique and match their clues', () => {
  for (const seed of SEEDS) {
    const puzzle = generateNonogram(seed);
    const again = generateNonogram(seed);
    assert.deepEqual(again, puzzle, `${seed} is reproducible`);

    const { rows, columns } = puzzle.size;
    assert.equal(puzzle.solution.length, rows);
    assert.ok(puzzle.solution.every((row) => row.length === columns));
    assert.deepEqual(puzzle.clues, cluesForGrid(puzzle.solution));
    assert.equal(puzzle.filledCount, filledCellCount(puzzle.solution));
    assert.ok(puzzle.filledCount > 0 && puzzle.filledCount < rows * columns);
    assert.equal(countNonogramSolutions(puzzle.clues), 1, `${seed} has one solution`);

    for (let row = 0; row < rows; row += 1) {
      const filled = puzzle.solution[row].filter(Boolean).length;
      assert.ok(filled > 0 && filled < columns, `${seed} row ${row} is neither empty nor solid`);
    }
    for (let column = 0; column < columns; column += 1) {
      const filled = puzzle.solution.filter((row) => row[column]).length;
      assert.ok(filled > 0 && filled < rows, `${seed} column ${column} is neither empty nor solid`);
    }
  }

  assert.notDeepEqual(
    generateNonogram('comet').solution,
    generateNonogram('polats').solution,
    'different seeds make different pictures',
  );
});

test('generated Sudoku puzzles are valid, unique and use their solution', () => {
  for (const seed of SEEDS) {
    const puzzle = generateSudoku(seed);
    const again = generateSudoku(seed);
    assert.deepEqual(again, puzzle, `${seed} is reproducible`);

    assert.equal(isValidSolution(puzzle.solution), true, `${seed} has a valid solution`);
    assert.equal(findConflicts(puzzle.givens).size, 0, `${seed} givens do not clash`);
    assert.equal(countSudokuSolutions(puzzle.givens), 1, `${seed} has exactly one solution`);
    assert.ok(puzzle.givensCount > 0 && puzzle.givensCount < 81);

    let givenCount = 0;
    for (let row = 0; row < 9; row += 1) {
      for (let column = 0; column < 9; column += 1) {
        if (puzzle.givens[row][column] === 0) continue;
        givenCount += 1;
        assert.equal(puzzle.givens[row][column], puzzle.solution[row][column]);
      }
    }
    assert.equal(givenCount, puzzle.givensCount);
  }

  const easy = generateSudoku('123456');
  const medium = generateSudoku('hello');
  const hard = generateSudoku('test');
  assert.ok(easy.givensCount > medium.givensCount, 'Easy has more givens than Medium');
  assert.ok(medium.givensCount > hard.givensCount, 'Medium has more givens than Hard');
});

test('generated Star Battle boards are valid, unique and connected', () => {
  for (const seed of SEEDS) {
    const puzzle = generateStarBattle(seed);
    const again = generateStarBattle(seed);
    assert.deepEqual(again, puzzle, `${seed} is reproducible`);

    const size = puzzle.size.rows;
    assert.equal(puzzle.size.columns, size);
    assert.equal(puzzle.regions.length, size);
    assert.equal(puzzle.solution.length, size);
    assert.equal(puzzle.starTotal, size * puzzle.stars);

    const regionStars = new Array(size).fill(0);
    for (let row = 0; row < size; row += 1) {
      for (let column = 0; column < size; column += 1) {
        if (puzzle.solution[row][column]) regionStars[puzzle.regions[row][column]] += 1;
      }
    }
    assert.deepEqual(regionStars, new Array(size).fill(puzzle.stars));

    for (let index = 0; index < size; index += 1) {
      assert.equal(puzzle.solution[index].filter(Boolean).length, puzzle.stars, `row ${index}`);
      assert.equal(
        puzzle.solution.filter((row) => row[index]).length,
        puzzle.stars,
        `column ${index}`,
      );
    }

    for (let row = 0; row < size; row += 1) {
      for (let column = 0; column < size; column += 1) {
        if (!puzzle.solution[row][column]) continue;
        for (let rowStep = -1; rowStep <= 1; rowStep += 1) {
          for (let columnStep = -1; columnStep <= 1; columnStep += 1) {
            if (rowStep === 0 && columnStep === 0) continue;
            const nextRow = row + rowStep;
            const nextColumn = column + columnStep;
            if (nextRow < 0 || nextRow >= size || nextColumn < 0 || nextColumn >= size) continue;
            assert.equal(puzzle.solution[nextRow][nextColumn], false, `stars touch at ${row},${column}`);
          }
        }
      }
    }

    for (let region = 0; region < size; region += 1) {
      const cells = regionCells(puzzle.regions, region);
      assert.ok(cells.length >= puzzle.stars, `region ${region} has enough cells`);

      const start = cells[0];
      const seen = new Set([`${start[0]},${start[1]}`]);
      const queue = [start];
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
          if (nextRow < 0 || nextRow >= size || nextColumn < 0 || nextColumn >= size) continue;
          if (puzzle.regions[nextRow][nextColumn] !== region) continue;
          const key = `${nextRow},${nextColumn}`;
          if (seen.has(key)) continue;
          seen.add(key);
          queue.push([nextRow, nextColumn]);
        }
      }
      assert.equal(seen.size, cells.length, `region ${region} is connected`);
    }

    assert.deepEqual(solveStarBattle(puzzle.regions, puzzle.stars), puzzle.solution);
    assert.equal(countStarBattleSolutions(puzzle.regions, puzzle.stars, 2), 1);
  }

  assert.notDeepEqual(
    generateStarBattle('comet').regions,
    generateStarBattle('polats').regions,
    'different seeds make different layouts',
  );
});
