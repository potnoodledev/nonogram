import { cluesForGrid, filledCellCount, solutionFromRows } from './nonogram.js';

/**
 * Puzzle art. "#" is a filled square, "." is blank.
 *
 * Clues are always derived from the art, so a picture only has to be edited in
 * one place. Add a puzzle here and it shows up in the game automatically.
 */
const PUZZLE_ART = [
  {
    id: 'heart',
    name: 'Heart',
    difficulty: 'Easy',
    rows: [
      '.#.#.',
      '#####',
      '#####',
      '.###.',
      '..#..',
    ],
  },
  {
    id: 'diamond',
    name: 'Diamond',
    difficulty: 'Easy',
    rows: [
      '...#...',
      '..###..',
      '.#####.',
      '#######',
      '.#####.',
      '..###..',
      '...#...',
    ],
  },
  {
    id: 'tree',
    name: 'Pine tree',
    difficulty: 'Medium',
    rows: [
      '....##....',
      '...####...',
      '..######..',
      '.########.',
      '....##....',
      '...####...',
      '..######..',
      '.########.',
      '....##....',
      '....##....',
    ],
  },
  {
    id: 'mushroom',
    name: 'Mushroom',
    difficulty: 'Medium',
    rows: [
      '..######..',
      '.########.',
      '##########',
      '##########',
      '##########',
      '.########.',
      '..######..',
      '....##....',
      '....##....',
      '..######..',
    ],
  },
  {
    id: 'boat',
    name: 'Sailboat',
    difficulty: 'Medium',
    rows: [
      '....#.....',
      '....##....',
      '....###...',
      '....####..',
      '....#####.',
      '....######',
      '##########',
      '.########.',
      '..######..',
      '..........',
    ],
  },
  {
    id: 'umbrella',
    name: 'Umbrella',
    difficulty: 'Hard',
    rows: [
      '....##....',
      '...####...',
      '..######..',
      '.########.',
      '##########',
      '##########',
      '#.#.#.#.#.',
      '...#......',
      '...#......',
      '...##.....',
    ],
  },
  {
    id: 'ghost',
    name: 'Ghost',
    difficulty: 'Hard',
    rows: [
      '..######..',
      '.########.',
      '##########',
      '##########',
      '##########',
      '##..##..##',
      '##########',
      '##########',
      '##########',
      '#.#.#.#.#.',
    ],
  },
  {
    id: 'cat',
    name: 'Cat',
    difficulty: 'Hard',
    rows: [
      '##......##',
      '###....###',
      '####..####',
      '##########',
      '##.####.##',
      '##########',
      '#..####..#',
      '#...##...#',
      '.########.',
      '..######..',
    ],
  },
  {
    id: 'rocket',
    name: 'Rocket',
    difficulty: 'Hard',
    rows: [
      '......###......',
      '.....#####.....',
      '.....#####.....',
      '....#######....',
      '....#######....',
      '....#######....',
      '...#########...',
      '...#########...',
      '...#########...',
      '..###########..',
      '..###########..',
      '.#############.',
      '###..#####..###',
      '###..#####..###',
      '....#######....',
    ],
  },
];

const DIFFICULTY_ORDER = ['Easy', 'Medium', 'Hard'];

/** Turn the art definitions into ready-to-play puzzles with computed clues. */
export const PUZZLES = PUZZLE_ART.map((definition) => {
  const columnCount = definition.rows[0]?.length ?? 0;
  const solution = solutionFromRows(definition.rows);
  const { rows, columns } = cluesForGrid(solution);

  return {
    ...definition,
    size: { rows: definition.rows.length, columns: columnCount },
    solution,
    clues: { rows, columns },
    filledCount: filledCellCount(solution),
  };
});

export const DIFFICULTIES = DIFFICULTY_ORDER.filter((difficulty) =>
  PUZZLES.some((puzzle) => puzzle.difficulty === difficulty),
);

export function puzzleIndexById(id) {
  return PUZZLES.findIndex((puzzle) => puzzle.id === id);
}

export function getPuzzleById(id) {
  return PUZZLES.find((puzzle) => puzzle.id === id) ?? null;
}
