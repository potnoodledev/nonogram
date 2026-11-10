/**
 * Seeds and seeded randomness.
 *
 * A seed is any short piece of text. The same seed always produces the same
 * puzzle, and the same seed produces matching levels in every game mode.
 */

/** The puzzle id prefix that marks a generated level, e.g. "seed:comet". */
export const SEED_PREFIX = 'seed:';

/** Trim surrounding whitespace so "  comet " and "comet" are the same seed. */
export function normalizeSeed(value) {
  return String(value ?? '').trim();
}

/** The puzzle id for a level generated from a seed. */
export function puzzleIdForSeed(seed) {
  return `${SEED_PREFIX}${normalizeSeed(seed)}`;
}

/** The seed inside a generated puzzle id, or null for a catalogue puzzle. */
export function seedFromPuzzleId(id) {
  return typeof id === 'string' && id.startsWith(SEED_PREFIX)
    ? id.slice(SEED_PREFIX.length)
    : null;
}

/**
 * Hash a seed into a 32-bit unsigned integer (FNV-1a plus a final avalanche),
 * so short, similar seeds such as "seed-1" and "seed-2" start far apart.
 */
export function hashSeed(seed) {
  let hash = 2166136261 >>> 0;
  for (const character of normalizeSeed(seed)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 2246822507);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 3266489909);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/**
 * A small deterministic random number generator (mulberry32). Give it the same
 * string and it produces the same sequence, which is what makes a generated
 * level reproducible.
 */
export function createRng(seed) {
  let state = hashSeed(seed);

  const rng = {
    /** A float in [0, 1). */
    next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    },

    /** An integer in [0, max). */
    int(max) {
      return Math.floor(rng.next() * max);
    },

    /** One random element of a non-empty array. */
    pick(values) {
      return values[rng.int(values.length)];
    },

    /** Shuffle an array in place and return it. */
    shuffle(values) {
      for (let index = values.length - 1; index > 0; index -= 1) {
        const other = rng.int(index + 1);
        [values[index], values[other]] = [values[other], values[index]];
      }
      return values;
    },
  };

  return rng;
}

/** A fresh, human-typeable seed for the "Random" button. */
export function randomSeed() {
  const cryptoObject = globalThis.crypto;
  if (cryptoObject?.getRandomValues) {
    const values = new Uint32Array(2);
    cryptoObject.getRandomValues(values);
    return `${values[0].toString(36)}${values[1].toString(36)}`;
  }
  return Math.random().toString(36).slice(2, 12);
}
