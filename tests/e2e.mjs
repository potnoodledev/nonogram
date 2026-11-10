/**
 * End-to-end smoke test for the nonogram game.
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
   Done
   -------------------------------------------------------------------------- */

assert.deepEqual(consoleErrors, [], 'no console or page errors');
await browser.close();
console.log('All end-to-end checks passed.');
