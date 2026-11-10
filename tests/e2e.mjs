/**
 * End-to-end smoke test for the grid games (nonogram and sudoku).
 *
 * Requires Playwright (`npm i -D playwright && npx playwright install chromium`)
 * and a running static server (`npm run serve` in another terminal), then:
 *
 *   BASE_URL=http://127.0.0.1:4173/ npm run test:e2e
 *
 * Set PLAYWRIGHT_CHROMIUM to a Chromium binary to override the bundled browser.
 */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { PUZZLES } from '../js/puzzles.js';
import { STAR_BATTLE_PUZZLES } from '../js/starbattle-puzzles.js';
import { SUDOKU_PUZZLES } from '../js/sudoku-puzzles.js';

const baseUrl = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const outputDir = path.resolve('test-results');
await mkdir(outputDir, { recursive: true });

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error(
    'Playwright is not installed. Run "npm i -D playwright && npx playwright install chromium" first.',
  );
  process.exit(2);
}

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {},
);

const consoleErrors = [];
const cell = (row, column) => `.cell[data-row="${row}"][data-column="${column}"]`;
const cellAt = (page, row, column) => page.locator(cell(row, column));
const boardCells = (page) => page.locator('.cell');

async function newPage(viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(`console: ${message.text()}`);
  });
  return { context, page };
}

function assertNoHorizontalOverflow(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    if (root.scrollWidth > root.clientWidth + 1) {
      throw new Error(`page overflows horizontally: ${root.scrollWidth} > ${root.clientWidth}`);
    }
  });
}

function assertCluesNotClipped(page) {
  return page.evaluate(() => {
    for (const clue of document.querySelectorAll('.clue')) {
      if (clue.scrollHeight > clue.clientHeight + 1) {
        throw new Error(
          `clue is clipped: "${clue.getAttribute('aria-label')}" ${clue.scrollHeight} > ${clue.clientHeight}`,
        );
      }
    }
  });
}

/* --------------------------------------------------------------------------
   1. Load, structure and clue rendering
   -------------------------------------------------------------------------- */

{
  const { context, page } = await newPage();
  await page.goto(`${baseUrl}#heart`, { waitUntil: 'networkidle' });

  assert.equal(await page.title(), 'Heart — Nonogram');
  assert.equal(await page.locator('h1').textContent(), 'Heart');
  assert.equal(await page.locator('#puzzle-size').textContent(), '5 × 5');
  assert.equal(await page.evaluate(() => location.hash), '#nonogram/heart', 'legacy #heart links still work');
  assert.equal(await page.locator('[data-game-mode="nonogram"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await boardCells(page).count(), 25);
  assert.equal(await page.locator('.clue-row').count(), 5);
  assert.equal(await page.locator('.clue-column').count(), 5);
  assert.equal(await page.locator('#solved-badge').isVisible(), false, 'solved badge is hidden at start');
  assert.equal(await page.locator('#moves').textContent(), '0');

  const rowClues = await page.locator('.clue-row').evaluateAll((els) =>
    els.map((el) => [...el.querySelectorAll('.clue-number')].map((span) => span.textContent).join(' ')),
  );
  const columnClues = await page.locator('.clue-column').evaluateAll((els) =>
    els.map((el) => [...el.querySelectorAll('.clue-number')].map((span) => span.textContent).join(' ')),
  );
  assert.deepEqual(rowClues, ['1 1', '5', '5', '3', '1']);
  assert.deepEqual(columnClues, ['2', '4', '4', '4', '2']);

  await assertNoHorizontalOverflow(page);
  await assertCluesNotClipped(page);
  await page.screenshot({ path: path.join(outputDir, 'desktop-heart.png') });

  /* Right click marks a blank. */
  await cellAt(page, 0, 0).click({ button: 'right' });
  assert.match(await cellAt(page, 0, 0).getAttribute('class'), /is-marked/);
  assert.match(await cellAt(page, 0, 0).getAttribute('aria-label'), /marked blank/);

  /* Reset clears the board. */
  await page.getByRole('button', { name: 'Reset' }).click();
  assert.equal(await page.locator('.cell.is-marked').count(), 0);
  assert.equal(await page.locator('#moves').textContent(), '0');

  /* Mark mode paints crosses on tap. */
  await page.getByRole('button', { name: 'Mark', exact: true }).click();
  assert.equal(await page.locator('#mode-mark').getAttribute('aria-pressed'), 'true');
  await cellAt(page, 0, 1).click();
  assert.match(await cellAt(page, 0, 1).getAttribute('class'), /is-marked/);
  await page.getByRole('button', { name: 'Fill', exact: true }).click();
  assert.equal(await page.locator('#mode-fill').getAttribute('aria-pressed'), 'true');
  await page.getByRole('button', { name: 'Reset' }).click();

  /* Dragging paints a run of cells in one gesture. */
  const start = await cellAt(page, 0, 0).boundingBox();
  const end = await cellAt(page, 0, 2).boundingBox();
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 5 });
  await page.mouse.up();
  assert.equal(await page.locator('.cell.is-filled').count(), 3, 'drag fills three cells');
  assert.equal(await page.locator('#moves').textContent(), '3');
  await page.getByRole('button', { name: 'Reset' }).click();

  await context.close();
}

/* --------------------------------------------------------------------------
   2. Solving a puzzle, the win dialog and replay
   -------------------------------------------------------------------------- */

{
  const { context, page } = await newPage();
  await page.goto(`${baseUrl}#heart`, { waitUntil: 'networkidle' });
  const heart = PUZZLES.find((puzzle) => puzzle.id === 'heart');
  assert.ok(heart);

  let firstFill = true;
  for (let row = 0; row < heart.size.rows; row += 1) {
    for (let column = 0; column < heart.size.columns; column += 1) {
      if (!heart.solution[row][column]) continue;
      await cellAt(page, row, column).click();
      if (firstFill) {
        firstFill = false;
        await page.waitForFunction(
          () => document.querySelector('#timer')?.textContent !== '0:00',
          null,
          { timeout: 5000 },
        );
      }
    }
  }

  await page.locator('#win-dialog[open]').waitFor();
  assert.equal(await page.locator('#solved-badge').isVisible(), true);
  assert.equal(await page.locator('.clue.is-complete').count(), 10, 'all ten lines complete');
  const detail = await page.locator('#win-detail').textContent();
  assert.match(detail, /Heart · \d+:\d{2} · \d+ moves/);
  const elapsed = (await page.locator('#timer').textContent()).trim();
  assert.notEqual(elapsed, '0:00', 'solving time is recorded');
  assert.ok(detail.includes(elapsed), `win dialog shows the recorded time (${elapsed})`);
  assert.equal(await page.locator('.cell.is-filled').count(), heart.filledCount);
  await page.screenshot({ path: path.join(outputDir, 'desktop-solved.png') });

  await page.getByRole('button', { name: 'Play again' }).click();
  await page.locator('#win-dialog').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.cell.is-filled').count(), 0);
  assert.equal(await page.locator('#solved-badge').isVisible(), false);
  assert.equal(await page.locator('#moves').textContent(), '0');

  await context.close();
}

/* --------------------------------------------------------------------------
   3. Keyboard navigation, marking and mistake checking
   -------------------------------------------------------------------------- */

{
  const { context, page } = await newPage();
  await page.goto(`${baseUrl}#heart`, { waitUntil: 'networkidle' });
  await cellAt(page, 0, 0).focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Space');
  assert.match(await cellAt(page, 0, 1).getAttribute('class'), /is-filled/);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('x');
  assert.match(await cellAt(page, 1, 1).getAttribute('class'), /is-marked/);
  await page.keyboard.press('Delete');
  assert.doesNotMatch(await cellAt(page, 1, 1).getAttribute('class'), /is-marked|is-filled/);

  await page.getByRole('button', { name: 'Reset' }).click();
  await cellAt(page, 0, 0).click(); // (0, 0) is blank in the heart
  await page.getByRole('button', { name: 'Check' }).click();
  await page.locator('.cell.is-wrong').first().waitFor();
  assert.match(await page.locator('#feedback').textContent(), /wrong/);
  await assertCluesNotClipped(page);

  await context.close();
}

/* --------------------------------------------------------------------------
   4. Progress is restored from localStorage
   -------------------------------------------------------------------------- */

{
  const { context, page } = await newPage();
  await page.goto(`${baseUrl}#heart`, { waitUntil: 'networkidle' });
  await cellAt(page, 0, 1).click();
  await page.waitForFunction(() => {
    const raw = localStorage.getItem('nonogram:progress:v1');
    if (!raw) return false;
    try {
      const saved = JSON.parse(raw);
      return saved.puzzles?.heart?.moves === 1 && saved.puzzles.heart.cells?.[0]?.[1] === 1; // 1 = FILLED
    } catch {
      return false;
    }
  });
  await page.reload({ waitUntil: 'networkidle' });
  assert.match(await cellAt(page, 0, 1).getAttribute('class'), /is-filled/);
  assert.equal(await page.locator('#moves').textContent(), '1');
  await page.getByRole('button', { name: 'Reset' }).click();
  await context.close();
}

/* --------------------------------------------------------------------------
   5. Puzzle switching, large boards and the mobile layout
   -------------------------------------------------------------------------- */

{
  const { context, page } = await newPage();
  await page.goto(`${baseUrl}#heart`, { waitUntil: 'networkidle' });
  await page.selectOption('#puzzle-select', 'tree');
  await page.locator('#puzzle-title').waitFor();
  assert.equal(await page.locator('#puzzle-title').textContent(), 'Pine tree');
  assert.equal(await boardCells(page).count(), 100);
  assert.equal(await page.locator('#puzzle-size').textContent(), '10 × 10');
  await assertNoHorizontalOverflow(page);
  await assertCluesNotClipped(page);
  await page.screenshot({ path: path.join(outputDir, 'desktop-tree.png') });
  await context.close();
}

{
  const { context, page } = await newPage({ width: 390, height: 844 });
  await page.goto(`${baseUrl}#rocket`, { waitUntil: 'networkidle' });
  assert.equal(await boardCells(page).count(), 225);
  assert.equal(await page.locator('#puzzle-difficulty').textContent(), 'Hard');
  await assertNoHorizontalOverflow(page);
  await assertCluesNotClipped(page);
  await page.screenshot({ path: path.join(outputDir, 'mobile-rocket.png'), fullPage: true });
  await context.close();
}

/* --------------------------------------------------------------------------
   6. Sudoku mode: board, controls, checking, conflicts and persistence
   -------------------------------------------------------------------------- */

{
  const { context, page } = await newPage();
  await page.goto(`${baseUrl}#sudoku/first-light`, { waitUntil: 'networkidle' });
  const puzzle = SUDOKU_PUZZLES.find((candidate) => candidate.id === 'first-light');
  assert.ok(puzzle);

  assert.equal(await page.title(), 'First Light — Sudoku');
  assert.equal(await page.locator('h1').textContent(), 'First Light');
  assert.equal(await page.locator('#puzzle-size').textContent(), '9 × 9');
  assert.equal(await boardCells(page).count(), 81);
  assert.equal(await page.locator('.cell.is-given').count(), puzzle.givensCount);
  assert.equal(await page.locator('.clue-row').count(), 0, 'Sudoku has no clue rows');
  assert.equal(await page.locator('#solved-badge').isVisible(), false);
  assert.equal(await page.locator('#moves').textContent(), '0');
  assert.equal(await page.locator('[data-game-mode="sudoku"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.evaluate(() => location.hash), '#sudoku/first-light');

  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: path.join(outputDir, 'desktop-sudoku.png') });

  /* Selecting an editable cell and typing a digit, then typing it again
     toggles the digit off. */
  const firstOpen = puzzle.givens
    .map((row, rowIndex) => row.map((value, columnIndex) => (value === 0 ? [rowIndex, columnIndex] : null)))
    .flat()
    .find(Boolean);
  assert.ok(firstOpen);
  await cellAt(page, ...firstOpen).click();
  await page.keyboard.press('4');
  assert.equal(await cellAt(page, ...firstOpen).textContent(), '4');
  assert.equal(await page.locator('#moves').textContent(), '1');
  await page.keyboard.press('4');
  assert.equal(await cellAt(page, ...firstOpen).textContent(), '');

  /* The on-screen digit pad fills and erases a selected cell. */
  await cellAt(page, ...firstOpen).click();
  await page.locator('[data-digit="7"]').click();
  assert.equal(await cellAt(page, ...firstOpen).textContent(), '7');
  await page.locator('[data-digit="0"]').click();
  assert.equal(await cellAt(page, ...firstOpen).textContent(), '');

  /* Givens cannot be edited, and the digit pad disables itself for them. */
  const given = await page.locator('.cell.is-given').first().evaluate((el) => ({
    row: Number(el.dataset.row),
    column: Number(el.dataset.column),
    text: el.textContent,
  }));
  await cellAt(page, given.row, given.column).click();
  assert.equal(await page.locator('[data-digit="5"]').isDisabled(), true);
  await page.keyboard.press('5');
  assert.equal(await cellAt(page, given.row, given.column).textContent(), given.text);

  /* Arrow keys move the roving focus target. */
  await cellAt(page, ...firstOpen).focus();
  await page.keyboard.press('ArrowRight');
  const focused = await page.evaluate(() => ({
    row: Number(document.activeElement?.dataset.row),
    column: Number(document.activeElement?.dataset.column),
  }));
  assert.equal(focused.row, firstOpen[0]);
  assert.equal(focused.column, firstOpen[1] + 1);

  /* Check highlights a wrong digit. */
  await page.getByRole('button', { name: 'Reset' }).click();
  const wrongCell = puzzle.givens
    .map((row, rowIndex) => row.map((value, columnIndex) => (value === 0 ? [rowIndex, columnIndex] : null)))
    .flat()
    .find(Boolean);
  const wrongDigit = (puzzle.solution[wrongCell[0]][wrongCell[1]] % 9) + 1;
  await cellAt(page, ...wrongCell)
    .click();
  await page.keyboard.press(String(wrongDigit));
  await page.getByRole('button', { name: 'Check' }).click();
  await page.locator('.cell.is-wrong').first().waitFor();
  assert.match(await page.locator('#feedback').textContent(), /wrong/);
  assert.equal(await page.locator('.cell.is-wrong').count(), 1);

  /* Duplicate digits in a row are flagged as conflicts immediately. */
  await page.getByRole('button', { name: 'Reset' }).click();
  const openCells = puzzle.givens
    .map((row, rowIndex) => row.map((value, columnIndex) => (value === 0 ? [rowIndex, columnIndex] : null)))
    .flat()
    .filter(Boolean);
  const conflictRow = openCells.find(([row]) => openCells.filter(([other]) => other === row).length >= 2)?.[0];
  const conflictCells = openCells.filter(([row]) => row === conflictRow).slice(0, 2);
  assert.equal(conflictCells.length, 2, 'a row with two editable cells');
  for (const [row, column] of conflictCells) {
    await cellAt(page, row, column).click();
    await page.keyboard.press('1');
  }
  assert.ok((await page.locator('.cell.is-conflict').count()) >= 2, 'duplicate digits conflict');
  await page.getByRole('button', { name: 'Reset' }).click();

  /* Progress is stored under the Sudoku key and restored after a reload. */
  const savedCell = openCells[0];
  const savedDigit = puzzle.solution[savedCell[0]][savedCell[1]];
  await cellAt(page, ...savedCell).click();
  await page.keyboard.press(String(savedDigit));
  await page.waitForFunction(() => {
    const raw = localStorage.getItem('sudoku:progress:v1');
    if (!raw) return false;
    try {
      const saved = JSON.parse(raw);
      return saved.puzzles?.['first-light']?.moves === 1;
    } catch {
      return false;
    }
  });
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await cellAt(page, ...savedCell).textContent(), String(savedDigit));
  assert.equal(await page.locator('#moves').textContent(), '1');
  await page.getByRole('button', { name: 'Reset' }).click();

  /* Switching modes keeps each mode's own puzzle and URL. */
  await page.locator('[data-game-mode="nonogram"]').click();
  assert.equal(await page.title(), 'Heart — Nonogram');
  assert.equal(await boardCells(page).count(), 25);
  assert.equal(await page.locator('[data-game-mode="nonogram"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.evaluate(() => location.hash), '#nonogram/heart');

  await page.locator('[data-game-mode="sudoku"]').click();
  assert.equal(await page.title(), 'First Light — Sudoku');
  assert.equal(await boardCells(page).count(), 81);
  assert.equal(await page.evaluate(() => location.hash), '#sudoku/first-light');

  /* Reloading without a hash remembers the last mode. */
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  assert.equal(await page.title(), 'First Light — Sudoku');
  assert.equal(await page.locator('[data-game-mode="sudoku"]').getAttribute('aria-pressed'), 'true');
  await context.close();
}

/* --------------------------------------------------------------------------
   7. Solving a Sudoku and replaying it
   -------------------------------------------------------------------------- */

{
  const { context, page } = await newPage();
  await page.goto(`${baseUrl}#sudoku/first-light`, { waitUntil: 'networkidle' });
  const puzzle = SUDOKU_PUZZLES.find((candidate) => candidate.id === 'first-light');
  assert.ok(puzzle);

  let firstFill = true;
  for (let row = 0; row < 9; row += 1) {
    for (let column = 0; column < 9; column += 1) {
      if (puzzle.givens[row][column] !== 0) continue;
      await cellAt(page, row, column).click();
      await page.keyboard.press(String(puzzle.solution[row][column]));
      if (firstFill) {
        firstFill = false;
        await page.waitForFunction(
          () => document.querySelector('#timer')?.textContent !== '0:00',
          null,
          { timeout: 5000 },
        );
      }
    }
  }

  await page.locator('#win-dialog[open]').waitFor();
  assert.equal(await page.locator('#solved-badge').isVisible(), true);
  assert.equal(await page.locator('.cell.has-value').count(), 81);
  const detail = await page.locator('#win-detail').textContent();
  assert.match(detail, /First Light · \d+:\d{2} · \d+ moves/);
  assert.equal(await page.locator('#win-title').textContent(), 'Grid solved!');
  await page.screenshot({ path: path.join(outputDir, 'desktop-sudoku-solved.png') });

  await page.getByRole('button', { name: 'Play again' }).click();
  await page.locator('#win-dialog').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.cell.has-value').count(), puzzle.givensCount);
  assert.equal(await page.locator('#solved-badge').isVisible(), false);
  assert.equal(await page.locator('#moves').textContent(), '0');
  await context.close();
}

/* --------------------------------------------------------------------------
   8. The mobile Sudoku layout
   -------------------------------------------------------------------------- */

{
  const { context, page } = await newPage({ width: 390, height: 844 });
  await page.goto(`${baseUrl}#sudoku/night-shift`, { waitUntil: 'networkidle' });
  assert.equal(await boardCells(page).count(), 81);
  assert.equal(await page.locator('#puzzle-difficulty').textContent(), 'Hard');
  assert.equal(await page.locator('.digit-pad').isVisible(), true);
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: path.join(outputDir, 'mobile-sudoku.png'), fullPage: true });
  await context.close();
}

/* --------------------------------------------------------------------------
   9. Star Battle: board, region outlines, input, checking and persistence
   -------------------------------------------------------------------------- */

{
  const { context, page } = await newPage();
  await page.goto(`${baseUrl}#starbattle/north-star`, { waitUntil: 'networkidle' });
  const puzzle = STAR_BATTLE_PUZZLES.find((candidate) => candidate.id === 'north-star');
  assert.ok(puzzle);

  assert.equal(await page.title(), 'North Star — Star Battle');
  assert.equal(await page.locator('h1').textContent(), 'North Star');
  assert.equal(await page.locator('#puzzle-size').textContent(), '6 × 6');
  assert.equal(await boardCells(page).count(), 36);
  assert.equal(await page.locator('.clue-row').count(), 0, 'Star Battle has no clue rows');
  assert.equal(await page.locator('[data-game-mode="starbattle"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.evaluate(() => location.hash), '#starbattle/north-star');
  assert.equal(await page.locator('.star-progress').textContent(), '0 / 6 stars');
  assert.ok((await page.locator('.cell.edge-top').count()) > 0, 'regions have top edges');
  assert.ok((await page.locator('.cell.edge-right').count()) > 0, 'regions have right edges');
  assert.ok((await page.locator('.cell.edge-bottom').count()) > 0, 'regions have bottom edges');
  assert.ok((await page.locator('.cell.edge-left').count()) > 0, 'regions have left edges');

  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: path.join(outputDir, 'desktop-starbattle.png') });

  /* Tap cycles empty -> star -> dot -> empty. */
  await cellAt(page, 0, 0).click();
  assert.match(await cellAt(page, 0, 0).getAttribute('class'), /is-star/);
  assert.equal(await cellAt(page, 0, 0).textContent(), '★');
  assert.equal(await page.locator('.star-progress').textContent(), '1 / 6 stars');
  await cellAt(page, 0, 0).click();
  assert.match(await cellAt(page, 0, 0).getAttribute('class'), /is-dot/);
  assert.equal(await page.locator('.star-progress').textContent(), '0 / 6 stars');
  await cellAt(page, 0, 0).click();
  assert.doesNotMatch(await cellAt(page, 0, 0).getAttribute('class'), /is-star|is-dot/);

  /* Right-click toggles a note without changing the stars. */
  await cellAt(page, 0, 1).click({ button: 'right' });
  assert.match(await cellAt(page, 0, 1).getAttribute('class'), /is-dot/);
  await cellAt(page, 0, 1).click({ button: 'right' });
  assert.doesNotMatch(await cellAt(page, 0, 1).getAttribute('class'), /is-dot/);
  await page.getByRole('button', { name: 'Reset' }).click();

  /* Dragging dots a run in one gesture. */
  const start = await cellAt(page, 0, 0).boundingBox();
  const end = await cellAt(page, 0, 2).boundingBox();
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 5 });
  await page.mouse.up();
  assert.equal(await page.locator('.cell.is-dot').count(), 3, 'drag dots three cells');
  assert.equal(await page.locator('.cell.is-star').count(), 0);
  assert.equal(await page.locator('#moves').textContent(), '3');
  await page.getByRole('button', { name: 'Reset' }).click();

  /* Keyboard: Space cycles, X dots and Delete clears. */
  await cellAt(page, 0, 0).focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Space');
  assert.match(await cellAt(page, 0, 1).getAttribute('class'), /is-star/);
  await page.keyboard.press('x');
  assert.match(await cellAt(page, 0, 1).getAttribute('class'), /is-dot/);
  await page.keyboard.press('Delete');
  assert.doesNotMatch(await cellAt(page, 0, 1).getAttribute('class'), /is-star|is-dot/);

  /* Selecting a cell highlights its row, column and region. */
  await cellAt(page, 0, 0).focus();
  assert.equal(await page.locator('.cell.is-hot').count(), 1);
  assert.ok((await page.locator('.cell.is-peer').count()) > 0, 'selected lines and region are highlighted');

  /* Check highlights a wrong star. */
  await page.getByRole('button', { name: 'Reset' }).click();
  const wrongStar = puzzle.solution.flatMap((row, rowIndex) =>
    row.map((isStar, columnIndex) => (isStar ? null : [rowIndex, columnIndex])),
  ).find(Boolean);
  await cellAt(page, ...wrongStar).click();
  await page.getByRole('button', { name: 'Check' }).click();
  await page.locator('.cell.is-wrong').first().waitFor();
  assert.match(await page.locator('#feedback').textContent(), /wrong/);
  assert.equal(await page.locator('.cell.is-wrong').count(), 1);

  /* Stars that touch are flagged immediately. */
  await page.getByRole('button', { name: 'Reset' }).click();
  await cellAt(page, 0, 0).click();
  await cellAt(page, 0, 1).click();
  assert.ok((await page.locator('.cell.is-conflict').count()) >= 2, 'touching stars conflict');

  /* Progress is stored under the Star Battle key and restored after reload. */
  await page.getByRole('button', { name: 'Reset' }).click();
  const savedStar = puzzle.solution.flatMap((row, rowIndex) =>
    row.map((isStar, columnIndex) => (isStar ? [rowIndex, columnIndex] : null)),
  ).find(Boolean);
  await cellAt(page, ...savedStar).click();
  await page.waitForFunction(([row, column]) => {
    const raw = localStorage.getItem('starbattle:progress:v1');
    if (!raw) return false;
    try {
      const saved = JSON.parse(raw);
      return saved.puzzles?.['north-star']?.moves === 1 && saved.puzzles['north-star'].cells?.[row]?.[column] === 1;
    } catch {
      return false;
    }
  }, savedStar);
  await page.reload({ waitUntil: 'networkidle' });
  assert.match(await cellAt(page, ...savedStar).getAttribute('class'), /is-star/);
  assert.equal(await page.locator('#moves').textContent(), '1');
  await page.getByRole('button', { name: 'Reset' }).click();

  /* Switching modes keeps each mode's own puzzle and URL. */
  await page.locator('[data-game-mode="nonogram"]').click();
  assert.equal(await page.locator('#puzzle-title').textContent(), 'Heart');
  assert.equal(await page.evaluate(() => location.hash), '#nonogram/heart');
  await page.locator('[data-game-mode="starbattle"]').click();
  assert.equal(await page.locator('#puzzle-title').textContent(), 'North Star');
  assert.equal(await page.evaluate(() => location.hash), '#starbattle/north-star');

  await context.close();
}

/* --------------------------------------------------------------------------
   10. Solving a Star Battle, the win dialog and replay
   -------------------------------------------------------------------------- */

{
  const { context, page } = await newPage();
  await page.goto(`${baseUrl}#starbattle/north-star`, { waitUntil: 'networkidle' });
  const puzzle = STAR_BATTLE_PUZZLES.find((candidate) => candidate.id === 'north-star');
  assert.ok(puzzle);

  for (let row = 0; row < puzzle.size.rows; row += 1) {
    for (let column = 0; column < puzzle.size.columns; column += 1) {
      if (puzzle.solution[row][column]) await cellAt(page, row, column).click();
    }
  }

  await page.locator('#win-dialog[open]').waitFor();
  assert.equal(await page.locator('#solved-badge').isVisible(), true);
  assert.equal(await page.locator('.cell.is-star').count(), puzzle.starTotal);
  assert.equal(await page.locator('#win-title').textContent(), 'Every star in place!');
  const detail = await page.locator('#win-detail').textContent();
  assert.match(detail, /North Star · \d+:\d{2} · 6 moves/);
  await page.screenshot({ path: path.join(outputDir, 'desktop-starbattle-solved.png') });

  await page.getByRole('button', { name: 'Play again' }).click();
  await page.locator('#win-dialog').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.cell.is-star').count(), 0);
  assert.equal(await page.locator('#solved-badge').isVisible(), false);
  assert.equal(await page.locator('#moves').textContent(), '0');
  assert.equal(await page.locator('.star-progress').textContent(), '0 / 6 stars');
  await context.close();
}

/* --------------------------------------------------------------------------
   11. The mobile Star Battle layout
   -------------------------------------------------------------------------- */

{
  const { context, page } = await newPage({ width: 390, height: 844 });
  await page.goto(`${baseUrl}#starbattle/event-horizon`, { waitUntil: 'networkidle' });
  assert.equal(await boardCells(page).count(), 100);
  assert.equal(await page.locator('#puzzle-difficulty').textContent(), 'Hard');
  assert.equal(await page.locator('#puzzle-size').textContent(), '10 × 10');
  assert.equal(await page.locator('.star-progress').isVisible(), true);
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: path.join(outputDir, 'mobile-starbattle.png'), fullPage: true });
  await context.close();
}

/* --------------------------------------------------------------------------
   Done
   -------------------------------------------------------------------------- */

assert.deepEqual(consoleErrors, [], 'no console or page errors');
await browser.close();
console.log('All end-to-end checks passed.');
