# Game mode adapters

`js/game.js` owns everything that is common to a grid game: the board DOM,
roving keyboard focus, pointer handling, move count, timer, `localStorage`,
the Check helper, the mode/puzzle pickers and the win dialog.

A mode adapter supplies the rules and presentation. The objects in this
directory are complete examples; register a new one in `js/app.js`.

## Required fields and methods

- `id`, `title` — used in the URL hash, the mode tabs and the page title.
- `storageKey` — the `localStorage` key for this mode's progress.
- `puzzles`, `difficulties`, `puzzleIndexById(id)` — the catalogue.
- `seededPuzzle(seed)` — a generated puzzle for a seed, with the `seed:<seed>`
  id the shell stores progress under. The generators in `js/generators.js`
  already cover the three modes.
- `hint` — trusted HTML for the line below the board.
- `winTitle` — the heading shown in the win dialog.
- `createCells(puzzle)` — a fresh, independent cell grid.
- `validateCells(cells, puzzle)` — true when saved cells can be restored.
- `renderCell(game, row, column)` — update a cell's classes, text and ARIA label.
- `boardLayout(puzzle)` — `{ rows, columns, clues?, separatorEvery? }`. `clues`
  is `{ rows, columns }` when the board has clue gutters, as in the nonogram.
- `boardLabel(puzzle)` — the accessible label for the board.
- `isSolved(cells, puzzle)` — true when the board is complete and correct.
- `findMistakes(game)` — a list of `[row, column]` mistakes for Check.
- `buildTools(game, container)` — fill the toolbar slot with mode controls.
- `updateControls(game)` — refresh those controls after a selection or move.

## Optional hooks

- `isEditable(puzzle, row, column)` — block changes to fixed cells (Sudoku givens).
- `isValidValue(value)` — reject cell values outside the mode's alphabet.
- `refreshCompletion(game, row, column)` / `refreshAllCompletion(game)` — line or
  board completion state after one change or a full load/reset.
- `afterCellsChanged(game, row, column)` — additional whole-board work, such as
  Sudoku's duplicate detection.
- `firstEditableCell(puzzle)` / `initialHot(game)` — the initial tab target and
  highlighted cell.
- `clearHighlight(game, previous)` / `applyHighlight(game, row, column)` — update
  selection styling. The shell tracks the hot cell in `game.state.hot`.
- `onPointerDown(game, row, column, event)`, `onDragEnter(...)`,
  `onKeyboardClick(...)`, `onKeyDown(...)` — mode-specific input. `onKeyDown`
  returns true when it handled the key; the shell then prevents the default.
- `onPointerUp(game, event)` — called when a pointer is released over the board
  after `onPointerDown` started a drag. It lets a mode distinguish a tap from a
  drag; the shell clears `game.state.dragging` afterwards.
- `keepSelection` — when true, a cell stays selected when focus or the pointer
  leaves the board (used by Sudoku's digit pad).

`game.state` holds `cells`, `toolMode`, `moves`, `solved`, `hot`, `store` and the
timer fields. Use `game.setCell(row, column, value)` for changes so moves,
completion, persistence and the win check stay in one place.
