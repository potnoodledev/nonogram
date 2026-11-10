/**
 * Capture the README and pull-request screenshots from a running site.
 *
 *   BASE_URL=http://127.0.0.1:4173/ npm run capture:evidence
 *
 * Set CAPTURE_PREFIX to write a different set (for example "before" when the
 * script is pointed at the previous revision). The Sudoku captures are skipped
 * when the served site does not have the mode.
 *
 * Requires Playwright and a local server, like the browser smoke test.
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { PUZZLES } from '../js/puzzles.js';
import { SUDOKU_PUZZLES } from '../js/sudoku-puzzles.js';

const baseUrl = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const prefix = process.env.CAPTURE_PREFIX ?? 'after';
const outputDir = path.resolve(process.env.CAPTURE_DIR ?? 'docs/evidence');
await mkdir(outputDir, { recursive: true });

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('Playwright is not installed. Run "npm i -D playwright && npx playwright install chromium" first.');
  process.exit(2);
}

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {},
);
const errors = [];
const heart = PUZZLES.find((puzzle) => puzzle.id === 'heart');
const firstLight = SUDOKU_PUZZLES.find((puzzle) => puzzle.id === 'first-light');
const cell = (row, column) => `.cell[data-row="${row}"][data-column="${column}"]`;

async function openPage(viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  return { context, page };
}

/** Partly solve Heart so the capture shows the board in use. */
async function fillHeart(page) {
  for (let row = 0; row < heart.size.rows - 1; row += 1) {
    for (let column = 0; column < heart.size.columns; column += 1) {
      if (!heart.solution[row][column]) continue;
      await page.locator(cell(row, column)).click();
    }
  }
}

async function captureNonogram(viewport, name, fullPage) {
  const { context, page } = await openPage(viewport);
  await page.goto(`${baseUrl}#heart`, { waitUntil: 'networkidle' });
  await fillHeart(page);
  await page.screenshot({ path: path.join(outputDir, `${prefix}-${name}.png`), fullPage });
  await context.close();
}

async function captureSudoku(viewport, name, fullPage) {
  const { context, page } = await openPage(viewport);
  await page.goto(`${baseUrl}#sudoku/first-light`, { waitUntil: 'networkidle' });

  const blanks = firstLight.givens
    .map((row, rowIndex) => row.map((value, columnIndex) => (value === 0 ? [rowIndex, columnIndex] : null)))
    .flat()
    .filter(Boolean);
  for (const [row, column] of blanks.slice(0, 3)) {
    await page.locator(cell(row, column)).click();
    await page.keyboard.press(String(firstLight.solution[row][column]));
  }
  const [selectedRow, selectedColumn] = blanks[3];
  await page.locator(cell(selectedRow, selectedColumn)).click();

  await page.screenshot({ path: path.join(outputDir, `${prefix}-${name}.png`), fullPage });
  await context.close();
}

const hasSudoku = await (async () => {
  const { context, page } = await openPage({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}#sudoku/first-light`, { waitUntil: 'networkidle' });
  const present = (await page.locator('[data-game-mode="sudoku"]').count()) > 0;
  await context.close();
  return present;
})();

await captureNonogram({ width: 1440, height: 900 }, 'nonogram-desktop', false);
if (hasSudoku) await captureSudoku({ width: 1440, height: 900 }, 'sudoku-desktop', false);
await captureNonogram({ width: 390, height: 844 }, 'nonogram-mobile', true);
if (hasSudoku) await captureSudoku({ width: 390, height: 844 }, 'sudoku-mobile', true);

assertNoErrors();
await browser.close();

function assertNoErrors() {
  if (errors.length > 0) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else {
    console.log(`Captured ${prefix} screenshots in ${outputDir}.`);
  }
}
