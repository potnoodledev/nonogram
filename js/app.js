import { GridGame } from './game.js';
import { nonogramMode } from './modes/nonogram.js';
import { starbattleMode } from './modes/starbattle.js';
import { sudokuMode } from './modes/sudoku.js';

const dom = {
  board: document.getElementById('board'),
  gameModeButtons: [...document.querySelectorAll('[data-game-mode]')],
  puzzleTitle: document.getElementById('puzzle-title'),
  puzzleNumber: document.getElementById('puzzle-number'),
  puzzleTotal: document.getElementById('puzzle-total'),
  puzzleDifficulty: document.getElementById('puzzle-difficulty'),
  puzzleSize: document.getElementById('puzzle-size'),
  puzzleSelect: document.getElementById('puzzle-select'),
  prevPuzzle: document.getElementById('prev-puzzle'),
  nextPuzzle: document.getElementById('next-puzzle'),
  timer: document.getElementById('timer'),
  moves: document.getElementById('moves'),
  solvedBadge: document.getElementById('solved-badge'),
  modeControls: document.getElementById('mode-controls'),
  checkButton: document.getElementById('check-button'),
  resetButton: document.getElementById('reset-button'),
  feedback: document.getElementById('feedback'),
  boardHint: document.getElementById('board-hint'),
  winDialog: document.getElementById('win-dialog'),
  winTitle: document.getElementById('win-title'),
  winDetail: document.getElementById('win-detail'),
  playAgain: document.getElementById('play-again'),
  nextUnsolved: document.getElementById('next-unsolved'),
};

const game = new GridGame({
  modes: { nonogram: nonogramMode, sudoku: sudokuMode, starbattle: starbattleMode },
  dom,
});

game.boot();
