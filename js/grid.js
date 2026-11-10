/** Small helpers shared by every grid game. */

/** Build a grid filled with one value, with independent rows. */
export function createGrid(rowCount, columnCount, value = 0) {
  return Array.from({ length: rowCount }, () => Array(columnCount).fill(value));
}

/** Deep-copy a grid of primitive cell values. */
export function cloneGrid(cells) {
  return cells.map((row) => row.slice());
}

/** Format a duration in seconds as m:ss (or h:mm:ss for long games). */
export function formatTime(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
