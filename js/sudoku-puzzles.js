import { parseGrid, solve, SUDOKU_EMPTY } from './sudoku.js';

/**
 * Sudoku puzzles. Each definition is 81 characters: 1–9 are givens and "."
 * is blank, read left to right, top to bottom.
 *
 * The solution is derived from the givens at load time, so the two can never
 * drift apart. The unit tests verify that every puzzle has exactly one
 * solution, which lets the game lock a board as soon as it matches.
 */
const SUDOKU_DEFINITIONS = [
  {
    id: 'first-light',
    name: 'First Light',
    difficulty: 'Easy',
    givens: '......938..19..4.59.8.25..1...38.25..8.257.1.257..9.84..6.....28.25...931.38425.6',
  },
  {
    id: 'open-door',
    name: 'Open Door',
    difficulty: 'Easy',
    givens: '1.29.3.74784....69.....8..2968....232.38..7454..3.1...326....51.9.154.3.5.16..9..',
  },
  {
    id: 'sweet-spot',
    name: 'Sweet Spot',
    difficulty: 'Easy',
    givens: '...7.524323.186..9.9.2.....3.1857.2..4....87.857.423..67.....3152...3.8....6785..',
  },
  {
    id: 'crossroads',
    name: 'Crossroads',
    difficulty: 'Medium',
    givens: '9...1.635.8...6.94.....78.....7215......9.17...2835...42.1...5....56.....9...23.8',
  },
  {
    id: 'long-way-round',
    name: 'Long Way Round',
    difficulty: 'Medium',
    givens: '.....581....18..9......32.5...5.2.6.896...1......9.7..93.4.76..1.2.39..77....1..9',
  },
  {
    id: 'middle-ground',
    name: 'Middle Ground',
    difficulty: 'Medium',
    givens: '3.1....454...7.......9..1..8....96..9...3.5.2.3.5...9.7..2.6.58.8.39.2.16...8..79',
  },
  {
    id: 'tight-knot',
    name: 'Tight Knot',
    difficulty: 'Hard',
    givens: '.6.14.2737.....1......73....9..2..5...3..9..4..8...61.......9......81....1.4...65',
  },
  {
    id: 'night-shift',
    name: 'Night Shift',
    difficulty: 'Hard',
    givens: '.72...1.....3..4..6..98......31.589.7.............8.3.5..8..9.....5.3.1..61.79...',
  },
  {
    id: 'final-countdown',
    name: 'Final Countdown',
    difficulty: 'Hard',
    givens: '...2..........618.7.9.....4215...8.....52...3..4..7...421...5..5..1..63......8...',
  },
];

const DIFFICULTY_ORDER = ['Easy', 'Medium', 'Hard'];

/** Turn the compact definitions into ready-to-play puzzles. */
export const SUDOKU_PUZZLES = SUDOKU_DEFINITIONS.map((definition) => {
  const givens = parseGrid(definition.givens);
  const solution = solve(givens);
  if (!solution) {
    throw new Error(`Sudoku "${definition.id}" has no solution.`);
  }

  let givensCount = 0;
  for (const row of givens) {
    for (const value of row) if (value !== SUDOKU_EMPTY) givensCount += 1;
  }

  return {
    ...definition,
    size: { rows: 9, columns: 9 },
    givens,
    solution,
    givensCount,
  };
});

export const SUDOKU_DIFFICULTIES = DIFFICULTY_ORDER.filter((difficulty) =>
  SUDOKU_PUZZLES.some((puzzle) => puzzle.difficulty === difficulty),
);

export function sudokuIndexById(id) {
  return SUDOKU_PUZZLES.findIndex((puzzle) => puzzle.id === id);
}

export function getSudokuById(id) {
  return SUDOKU_PUZZLES.find((puzzle) => puzzle.id === id) ?? null;
}
