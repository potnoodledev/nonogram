import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EMPTY,
  FILLED,
  MARKED,
  cluesForGrid,
  cluesForLine,
  cluesMatch,
  createGrid,
  filledCellCount,
  findMistakes,
  isLineComplete,
  isSolved,
  solutionFromRows,
} from '../js/nonogram.js';
import { DIFFICULTIES, PUZZLES } from '../js/puzzles.js';

test('cluesForLine counts runs of filled cells', () => {
  assert.deepEqual(cluesForLine([true, true, false, true]), [2, 1]);
  assert.deepEqual(cluesForLine([false, true, false, true, false]), [1, 1]);
  assert.deepEqual(cluesForLine([true, true, true]), [3]);
  assert.deepEqual(cluesForLine([false, false, false]), []);
  assert.deepEqual(cluesForLine([]), []);
});

test('cluesForGrid derives rows and columns independently', () => {
  const solution = solutionFromRows([
    '##.',
    '.#.',
    '..#',
  ]);
  const { rows, columns } = cluesForGrid(solution);
  assert.deepEqual(rows, [[2], [1], [1]]);
  assert.deepEqual(columns, [[1], [2], [1]]);
});

test('cluesMatch compares clue sequences', () => {
  assert.equal(cluesMatch([1, 2], [1, 2]), true);
  assert.equal(cluesMatch([1, 2], [1, 2, 3]), false);
  assert.equal(cluesMatch([2, 1], [1, 2]), false);
  assert.equal(cluesMatch([], []), true);
});

test('createGrid makes independent rows', () => {
  const grid = createGrid(2, 2);
  grid[0][0] = FILLED;
  assert.equal(grid[1][0], EMPTY);
});

test('isLineComplete checks rows and columns against their clue', () => {
  const cells = [
    [FILLED, FILLED, MARKED],
    [MARKED, FILLED, EMPTY],
    [EMPTY, EMPTY, FILLED],
  ];
  assert.equal(isLineComplete(cells, 'row', 0, [2]), true);
  assert.equal(isLineComplete(cells, 'row', 1, [1]), true);
  assert.equal(isLineComplete(cells, 'row', 2, [1]), true);
  assert.equal(isLineComplete(cells, 'row', 0, [1, 1]), false);
  assert.equal(isLineComplete(cells, 'column', 0, [1]), true);
  assert.equal(isLineComplete(cells, 'column', 1, [2]), true);
  assert.equal(isLineComplete(cells, 'column', 2, [1]), true);
  assert.equal(isLineComplete(cells, 'column', 2, [1, 1]), false);
});

test('isSolved accepts crosses on blanks and rejects wrong cells', () => {
  const solution = solutionFromRows(['##.', '.#.']);
  assert.equal(isSolved([[FILLED, FILLED, MARKED], [MARKED, FILLED, EMPTY]], solution), true);
  assert.equal(isSolved([[FILLED, FILLED, EMPTY], [EMPTY, FILLED, EMPTY]], solution), true);
  assert.equal(isSolved([[FILLED, EMPTY, EMPTY], [EMPTY, FILLED, EMPTY]], solution), false);
  assert.equal(isSolved([[FILLED, FILLED, FILLED], [EMPTY, FILLED, EMPTY]], solution), false);
  assert.equal(isSolved([[FILLED, FILLED, EMPTY]], solution), false);
});

test('findMistakes reports wrong fills and wrong marks', () => {
  const solution = solutionFromRows(['##.', '.#.']);
  const cells = [
    [FILLED, MARKED, FILLED],
    [MARKED, FILLED, EMPTY],
  ];
  assert.deepEqual(findMistakes(cells, solution), {
    filled: [[0, 2]],
    marked: [[0, 1]],
  });
});

test('filledCellCount counts picture cells', () => {
  assert.equal(filledCellCount(solutionFromRows(['##.', '.#.'])), 3);
});

test('puzzle catalogue is valid and solvable by its clues', () => {
  assert.ok(PUZZLES.length >= 6, 'expected at least six puzzles');
  assert.equal(new Set(PUZZLES.map((puzzle) => puzzle.id)).size, PUZZLES.length, 'ids are unique');
  assert.deepEqual(DIFFICULTIES, ['Easy', 'Medium', 'Hard']);

  for (const puzzle of PUZZLES) {
    const { rows, columns } = puzzle.size;
    assert.ok(rows > 0 && columns > 0, `${puzzle.id} has a size`);
    assert.equal(puzzle.solution.length, rows, `${puzzle.id} has the right row count`);
    assert.ok(puzzle.filledCount > 0, `${puzzle.id} has filled cells`);
    assert.ok(puzzle.filledCount < rows * columns, `${puzzle.id} is not a solid block`);

    for (const [rowIndex, row] of puzzle.solution.entries()) {
      assert.equal(row.length, columns, `${puzzle.id} row ${rowIndex} is rectangular`);
      const filledInRow = row.filter(Boolean).length;
      const clueSum = puzzle.clues.rows[rowIndex].reduce((sum, run) => sum + run, 0);
      assert.equal(clueSum, filledInRow, `${puzzle.id} row ${rowIndex} clues match the art`);
    }

    for (let column = 0; column < columns; column += 1) {
      const filledInColumn = puzzle.solution.filter((row) => row[column]).length;
      const clueSum = puzzle.clues.columns[column].reduce((sum, run) => sum + run, 0);
      assert.equal(clueSum, filledInColumn, `${puzzle.id} column ${column} clues match the art`);
    }

    assert.deepEqual(cluesForGrid(puzzle.solution), puzzle.clues, `${puzzle.id} clues are derived from the art`);
    assert.ok(['Easy', 'Medium', 'Hard'].includes(puzzle.difficulty), `${puzzle.id} has a difficulty`);
  }
});

test('puzzles start unsolved and are solved by their own solution', () => {
  for (const puzzle of PUZZLES) {
    const empty = createGrid(puzzle.size.rows, puzzle.size.columns);
    assert.equal(isSolved(empty, puzzle.solution), false, `${puzzle.id} is not solved at start`);

    const solved = puzzle.solution.map((row) => row.map((filled) => (filled ? FILLED : EMPTY)));
    assert.equal(isSolved(solved, puzzle.solution), true, `${puzzle.id} solution wins`);
  }
});
