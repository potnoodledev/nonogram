import { countSolutions, parseStarBattleCode, solveStarBattle } from './starbattle.js';

/**
 * Star Battle puzzles.
 *
 * Each definition is a compact region code: "<size>/<stars>:" followed by one
 * letter per cell, row by row, where the letter names the cell's region. The
 * solution is derived from the region layout at load time, so it cannot drift
 * from the puzzle. The unit tests verify that every layout has exactly one
 * solution.
 *
 * The region layouts are adapted from the Star Battle levels in RetroStoneVC
 * (https://github.com/potnoodledev/RetroStoneVC), released under the MIT
 * licence, © 2026 Pierre-Louis Boyer (8BCraft). The selection, names and
 * difficulty grouping are this project's.
 */
const STAR_BATTLE_DEFINITIONS = [
  {
    id: 'north-star',
    name: 'North Star',
    difficulty: 'Easy',
    code: '6/1:eeebbbeeeebbddeefbadecffddccffddcccf',
  },
  {
    id: 'little-dipper',
    name: 'Little Dipper',
    difficulty: 'Easy',
    code: '6/1:ffebbbeeebbbeeebbbdeeeebdddccbddccca',
  },
  {
    id: 'starlight',
    name: 'Starlight',
    difficulty: 'Easy',
    code: '6/1:eeddddeeddddeaadddeaacffbbaaffbbbaaa',
  },
  {
    id: 'constellation',
    name: 'Constellation',
    difficulty: 'Medium',
    code: '8/1:dhhaaaeedhfaaaeefffffafebbfffffebbbggeeebggggceebggggceegggggcce',
  },
  {
    id: 'night-watch',
    name: 'Night Watch',
    difficulty: 'Medium',
    code: '8/1:bggggggcbhhhgggcbbdhggggdddhggggdddgggaaeddfaaaaddfffaaafffffffa',
  },
  {
    id: 'orbit',
    name: 'Orbit',
    difficulty: 'Medium',
    code: '8/1:gggeeaaaffgaaaahfffaaahhdddddahhdddddddhddddbbdbcdbbbbbbccbbbbbb',
  },
  {
    id: 'binary-star',
    name: 'Binary Star',
    difficulty: 'Hard',
    code: '10/2:gggcccccffgggccccfffeccccciiffeeecccifffeeeeiiiiiihhhiijiaiihhhiijaaiihhhhjjadddhhbbjaadddhbbaaaaadd',
  },
  {
    id: 'deep-space',
    name: 'Deep Space',
    difficulty: 'Hard',
    code: '10/2:hhhhhiiiiibhbhiiiiiibhbbeiiiiibbbeegciicbbbeggccccfffeggcccceffeggddddeeeejgddddeeejjgdadaeeeejaaaaa',
  },
  {
    id: 'event-horizon',
    name: 'Event Horizon',
    difficulty: 'Hard',
    code: '10/2:dddggfffaaddddgggaaadhddgggaaahhhdddgaaahhidddgacahiiiiicccchiiicccccchbbbccccccbbbjjccecebbbjjjceee',
  },
];

export const STAR_BATTLE_DIFFICULTIES = ['Easy', 'Medium', 'Hard'];

function buildPuzzle(definition) {
  const { size, stars, regions } = parseStarBattleCode(definition.code);
  const solution = solveStarBattle(regions, stars);

  if (!solution || countSolutions(regions, stars, 2) !== 1) {
    throw new Error(`Star Battle puzzle "${definition.id}" must have exactly one solution.`);
  }

  return {
    ...definition,
    size: { rows: size, columns: size },
    stars,
    starTotal: size * stars,
    regions,
    solution,
  };
}

export const STAR_BATTLE_PUZZLES = STAR_BATTLE_DEFINITIONS.map(buildPuzzle);

export function starbattleIndexById(id) {
  return STAR_BATTLE_PUZZLES.findIndex((puzzle) => puzzle.id === id);
}
