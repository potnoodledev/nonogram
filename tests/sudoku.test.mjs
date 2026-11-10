import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SUDOKU_SIZE,
  cellsFromGivens,
  countSolutions,
  digitCounts,
  findConflicts,
  findMistakes,
  isFilled,
  isGiven,
  isSolved,
  isValidSolution,
  parseGrid,
  solve,
} from '../js/sudoku.js';
import { SUDOKU_DIFFICULTIES, SUDOKU_PUZZLES } from '../js/sudoku-puzzles.js';

test('parseGrid reads 81 characters and rejects malformed grids', () => {
  const grid = parseGrid('.1' + '.'.repeat(79));
  assert.equal(grid.length, 9);
  assert.equal(grid.every((row) => row.length === 9), true);
  assert.equal(grid[0][1], 1);
  assert.equal(grid[0][0], 0);
  assert.throws(() => parseGrid('123'), /81 cells/);
  assert.throws(() => parseGrid('.'.repeat(80) + 'x'), /Unexpected/);
});

test('isValidSolution checks rows, columns and boxes', () => {
  const solution = SUDOKU_PUZZLES[0].solution;
  assert.equal(isValidSolution(solution), true);

  const duplicateRow = solution.map((row) => row.slice());
  duplicateRow[0][0] = duplicateRow[0][1];
  assert.equal(isValidSolution(duplicateRow), false);

  const duplicateColumn = solution.map((row) => row.slice());
  duplicateColumn[1][0] = duplicateColumn[0][0];
  assert.equal(isValidSolution(duplicateColumn), false);

  const duplicateBox = solution.map((row) => row.slice());
  duplicateBox[1][1] = duplicateBox[0][0];
  assert.equal(isValidSolution(duplicateBox), false);

  assert.equal(isValidSolution([[1]]), false);
});

test('findConflicts reports every duplicate in a row, column or box', () => {
  const cells = Array.from({ length: 9 }, () => Array(9).fill(0));
  cells[0][0] = 5;
  cells[0][8] = 5;
  assert.deepEqual([...findConflicts(cells)].sort((a, b) => a - b), [0, 8]);

  const column = Array.from({ length: 9 }, () => Array(9).fill(0));
  column[0][3] = 2;
  column[7][3] = 2;
  assert.deepEqual([...findConflicts(column)].sort((a, b) => a - b), [3, 66]);

  const box = Array.from({ length: 9 }, () => Array(9).fill(0));
  box[1][1] = 7;
  box[2][2] = 7;
  assert.deepEqual([...findConflicts(box)].sort((a, b) => a - b), [10, 20]);

  const clean = SUDOKU_PUZZLES[0].solution;
  assert.equal(findConflicts(clean).size, 0);
});

test('findMistakes only reports wrong, non-empty digits', () => {
  const puzzle = SUDOKU_PUZZLES[0];
  const cells = puzzle.solution.map((row) => row.slice());
  cells[0][0] = cells[0][0] === 1 ? 2 : 1;
  cells[0][1] = 0;
  assert.deepEqual(findMistakes(cells, puzzle.solution), [[0, 0]]);
});

test('isSolved requires every cell to match the solution', () => {
  const puzzle = SUDOKU_PUZZLES[0];
  assert.equal(isSolved(puzzle.givens, puzzle), false);
  assert.equal(isSolved(puzzle.solution, puzzle), true);

  const almost = puzzle.solution.map((row) => row.slice());
  almost[8][8] = 0;
  assert.equal(isSolved(almost, puzzle), false);
  assert.equal(isFilled(almost), false);
  assert.equal(isFilled(puzzle.solution), true);
});

test('cellsFromGivens copies the starting board and isGiven identifies fixed cells', () => {
  const puzzle = SUDOKU_PUZZLES[2];
  const cells = cellsFromGivens(puzzle);
  assert.deepEqual(cells, puzzle.givens);
  assert.notEqual(cells, puzzle.givens);
  cells[0][0] = cells[0][0] === 9 ? 8 : 9;
  assert.notDeepEqual(cells, puzzle.givens);
  assert.equal(isGiven(puzzle, 0, 0), puzzle.givens[0][0] !== 0);
});

test('digitCounts counts each placed digit', () => {
  const counts = digitCounts(SUDOKU_PUZZLES[0].solution);
  assert.equal(counts[0], 0);
  for (let digit = 1; digit <= 9; digit += 1) assert.equal(counts[digit], 9);
});

test('solve and countSolutions agree and reject contradictory givens', () => {
  const puzzle = SUDOKU_PUZZLES[1];
  const solution = solve(puzzle.givens);
  assert.ok(solution);
  assert.deepEqual(solution, puzzle.solution);
  assert.equal(countSolutions(puzzle.givens), 1);
  assert.equal(countSolutions(puzzle.givens, 1), 1);

  const contradictory = puzzle.givens.map((row) => row.slice());
  const givenColumns = contradictory[0]
    .map((value, column) => (value === 0 ? -1 : column))
    .filter((column) => column >= 0);
  assert.ok(givenColumns.length >= 2, 'fixture has two givens in its first row');
  contradictory[0][givenColumns[0]] = contradictory[0][givenColumns[1]];
  assert.equal(solve(contradictory), null);
  assert.equal(countSolutions(contradictory), 0);
});

test('Sudoku catalogue is valid, unique and grouped by difficulty', () => {
  assert.ok(SUDOKU_PUZZLES.length >= 6, 'expected at least six puzzles');
  assert.equal(new Set(SUDOKU_PUZZLES.map((puzzle) => puzzle.id)).size, SUDOKU_PUZZLES.length);
  assert.deepEqual(SUDOKU_DIFFICULTIES, ['Easy', 'Medium', 'Hard']);

  const averageGivens = {};
  for (const puzzle of SUDOKU_PUZZLES) {
    assert.equal(puzzle.size.rows, SUDOKU_SIZE);
    assert.equal(puzzle.size.columns, SUDOKU_SIZE);
    assert.equal(puzzle.givens.length, SUDOKU_SIZE);
    assert.equal(puzzle.solution.length, SUDOKU_SIZE);
    assert.equal(isValidSolution(puzzle.solution), true, `${puzzle.id} solution is valid`);
    assert.equal(findConflicts(puzzle.givens).size, 0, `${puzzle.id} givens do not clash`);
    assert.ok(puzzle.givensCount > 0 && puzzle.givensCount < 81, `${puzzle.id} has givens`);

    for (let row = 0; row < SUDOKU_SIZE; row += 1) {
      for (let column = 0; column < SUDOKU_SIZE; column += 1) {
        if (puzzle.givens[row][column] === 0) continue;
        assert.equal(
          puzzle.givens[row][column],
          puzzle.solution[row][column],
          `${puzzle.id} given at ${row},${column} matches the solution`,
        );
      }
    }

    assert.equal(countSolutions(puzzle.givens), 1, `${puzzle.id} has exactly one solution`);
    assert.ok(['Easy', 'Medium', 'Hard'].includes(puzzle.difficulty));

    const bucket = (averageGivens[puzzle.difficulty] ??= []);
    bucket.push(puzzle.givensCount);
  }

  const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  assert.ok(average(averageGivens.Easy) > average(averageGivens.Medium), 'Easy has more givens than Medium');
  assert.ok(average(averageGivens.Medium) > average(averageGivens.Hard), 'Medium has more givens than Hard');
});
