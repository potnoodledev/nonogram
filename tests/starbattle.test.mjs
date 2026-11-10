import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DOT,
  EMPTY,
  STAR,
  countSolutions,
  createGrid,
  findClashes,
  findMistakes,
  isStarBattleSolved,
  parseStarBattleCode,
  solveStarBattle,
  starCount,
} from '../js/starbattle.js';
import { STAR_BATTLE_DIFFICULTIES, STAR_BATTLE_PUZZLES } from '../js/starbattle-puzzles.js';

function assertValidSolution(regions, stars, solution) {
  const size = regions.length;
  for (let index = 0; index < size; index += 1) {
    let rowStars = 0;
    let columnStars = 0;
    let regionStars = 0;
    for (let other = 0; other < size; other += 1) {
      if (solution[index][other]) rowStars += 1;
      if (solution[other][index]) columnStars += 1;
      for (let column = 0; column < size; column += 1) {
        if (regions[other][column] === index && solution[other][column]) regionStars += 1;
      }
    }
    assert.equal(rowStars, stars, `row ${index + 1}`);
    assert.equal(columnStars, stars, `column ${index + 1}`);
    assert.equal(regionStars, stars, `region ${index + 1}`);
  }

  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (!solution[row][column]) continue;
      for (let rowStep = -1; rowStep <= 1; rowStep += 1) {
        for (let columnStep = -1; columnStep <= 1; columnStep += 1) {
          if (rowStep === 0 && columnStep === 0) continue;
          const nextRow = row + rowStep;
          const nextColumn = column + columnStep;
          if (nextRow < 0 || nextRow >= size || nextColumn < 0 || nextColumn >= size) continue;
          assert.equal(solution[nextRow][nextColumn], false, `stars touch at ${row},${column}`);
        }
      }
    }
  }
}

test('parseStarBattleCode reads a region layout and rejects malformed codes', () => {
  const parsed = parseStarBattleCode('4/1:aaabccabcddbcddb');
  assert.equal(parsed.size, 4);
  assert.equal(parsed.stars, 1);
  assert.equal(parsed.regions.length, 4);
  assert.deepEqual(parsed.regions[0], [0, 0, 0, 1]);
  assert.deepEqual(parsed.regions[3], [2, 3, 3, 1]);

  assert.throws(() => parseStarBattleCode('nonsense'), /must look like/);
  assert.throws(() => parseStarBattleCode('3/1:aaabbbccc'), /4–10 rows/);
  assert.throws(() => parseStarBattleCode('11/1:'.padEnd(124, 'a')), /4–10 rows/);
  assert.throws(() => parseStarBattleCode('4/3:aaabccabcddbcddb'), /one or two stars/);
  assert.throws(() => parseStarBattleCode('4/1:aaabccab'), /needs 16 cells/);
  assert.throws(() => parseStarBattleCode('4/1:zzzzzzzzzzzzzzzz'), /Unexpected region/);
  assert.throws(() => parseStarBattleCode('4/1:abbcdddcdddcabbc'), /not one connected area/);
});

test('solveStarBattle finds a valid solution and countSolutions counts it', () => {
  const { regions, stars } = parseStarBattleCode('4/1:aaabccabcddbcddb');
  const solution = solveStarBattle(regions, stars);
  assert.ok(solution);
  assertValidSolution(regions, stars, solution);
  assert.ok(countSolutions(regions, stars, 2) >= 1);
  assert.equal(countSolutions(regions, stars, 1), 1);
});

test('every Star Battle puzzle has one valid, unique solution', () => {
  assert.ok(STAR_BATTLE_PUZZLES.length >= 9, 'expected at least nine puzzles');
  assert.equal(new Set(STAR_BATTLE_PUZZLES.map((puzzle) => puzzle.id)).size, STAR_BATTLE_PUZZLES.length);
  assert.deepEqual(STAR_BATTLE_DIFFICULTIES, ['Easy', 'Medium', 'Hard']);

  for (const puzzle of STAR_BATTLE_PUZZLES) {
    assert.equal(puzzle.size.rows, puzzle.size.columns);
    assert.equal(puzzle.starTotal, puzzle.size.rows * puzzle.stars);
    assertValidSolution(puzzle.regions, puzzle.stars, puzzle.solution);

    const solution = solveStarBattle(puzzle.regions, puzzle.stars);
    assert.deepEqual(solution, puzzle.solution, `${puzzle.id} solution is stable`);
    assert.equal(countSolutions(puzzle.regions, puzzle.stars, 2), 1, `${puzzle.id} is unique`);
  }

  assert.deepEqual(
    STAR_BATTLE_PUZZLES.map((puzzle) => [puzzle.size.columns, puzzle.stars]),
    [
      [6, 1],
      [6, 1],
      [6, 1],
      [8, 1],
      [8, 1],
      [8, 1],
      [10, 2],
      [10, 2],
      [10, 2],
    ],
  );
  for (const difficulty of STAR_BATTLE_DIFFICULTIES) {
    assert.equal(
      STAR_BATTLE_PUZZLES.filter((puzzle) => puzzle.difficulty === difficulty).length,
      3,
    );
  }
});

test('isStarBattleSolved requires exactly the solution stars and ignores notes', () => {
  const puzzle = STAR_BATTLE_PUZZLES[0];
  const cells = createGrid(puzzle.size.rows, puzzle.size.columns, EMPTY);
  for (let row = 0; row < puzzle.size.rows; row += 1) {
    for (let column = 0; column < puzzle.size.columns; column += 1) {
      cells[row][column] = puzzle.solution[row][column] ? STAR : DOT;
    }
  }
  assert.equal(isStarBattleSolved(cells, puzzle.solution), true);

  const missing = cells.map((row) => row.slice());
  const firstStar = puzzle.solution.flatMap((row, rowIndex) =>
    row.map((isStar, columnIndex) => (isStar ? [rowIndex, columnIndex] : null)),
  ).find(Boolean);
  missing[firstStar[0]][firstStar[1]] = DOT;
  assert.equal(isStarBattleSolved(missing, puzzle.solution), false);

  const extra = cells.map((row) => row.slice());
  const emptyCell = puzzle.solution.flatMap((row, rowIndex) =>
    row.map((isStar, columnIndex) => (isStar ? null : [rowIndex, columnIndex])),
  ).find(Boolean);
  extra[emptyCell[0]][emptyCell[1]] = STAR;
  assert.equal(isStarBattleSolved(extra, puzzle.solution), false);
});

test('findMistakes reports wrong stars and dots on solution stars', () => {
  const puzzle = STAR_BATTLE_PUZZLES[0];
  const cells = createGrid(puzzle.size.rows, puzzle.size.columns, EMPTY);

  const solutionCells = puzzle.solution.flatMap((row, rowIndex) =>
    row.map((isStar, columnIndex) => (isStar ? [rowIndex, columnIndex] : null)),
  ).filter(Boolean);
  const emptyCells = puzzle.solution.flatMap((row, rowIndex) =>
    row.map((isStar, columnIndex) => (isStar ? null : [rowIndex, columnIndex])),
  ).filter(Boolean);

  cells[solutionCells[0][0]][solutionCells[0][1]] = DOT;
  cells[emptyCells[0][0]][emptyCells[0][1]] = STAR;
  cells[emptyCells[1][0]][emptyCells[1][1]] = DOT;
  assert.deepEqual(
    findMistakes(cells, puzzle.solution),
    [emptyCells[0], solutionCells[0]].sort((a, b) => a[0] - b[0] || a[1] - b[1]),
  );
});

test('findClashes flags touching stars and overfull lines or regions', () => {
  const { regions, stars } = parseStarBattleCode('4/1:aaabccabcddbcddb');
  const puzzle = { regions, stars };

  const touching = createGrid(4, 4, EMPTY);
  touching[0][0] = STAR;
  touching[1][1] = STAR;
  assert.deepEqual([...findClashes(touching, puzzle)].sort((a, b) => a - b), [0, 5]);

  const overfullRow = createGrid(4, 4, EMPTY);
  overfullRow[0][0] = STAR;
  overfullRow[0][3] = STAR;
  assert.deepEqual([...findClashes(overfullRow, puzzle)].sort((a, b) => a - b), [0, 3]);

  const overfullColumn = createGrid(4, 4, EMPTY);
  overfullColumn[0][0] = STAR;
  overfullColumn[2][0] = STAR;
  assert.deepEqual([...findClashes(overfullColumn, puzzle)].sort((a, b) => a - b), [0, 8]);

  const overfullRegion = createGrid(4, 4, EMPTY);
  overfullRegion[0][0] = STAR;
  overfullRegion[1][2] = STAR;
  assert.deepEqual([...findClashes(overfullRegion, puzzle)].sort((a, b) => a - b), [0, 6]);

  const clean = createGrid(4, 4, EMPTY);
  clean[0][0] = STAR;
  assert.equal(findClashes(clean, puzzle).size, 0);
});

test('starCount counts placed stars only', () => {
  assert.equal(starCount(createGrid(4, 4, EMPTY)), 0);
  const cells = createGrid(4, 4, EMPTY);
  cells[0][0] = STAR;
  cells[0][1] = DOT;
  cells[0][2] = STAR;
  assert.equal(starCount(cells), 2);
});
