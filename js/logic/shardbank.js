// Lifetime shard total (Round 2, R4; SPEC §4 "Shard total persistence";
// docs/decisions/0001-bank-shards-at-checkpoints.md). Pure: never touches the
// global localStorage. game.js passes in a Storage-like object or null.
//
// A run's shards are "banked" (added to the total and written) only at a few
// checkpoints (run end, abandon, page hide/close), never per frame. The run
// remembers how many of its shards are banked (run.shardsBanked, reset by
// resetRun), so banking again only adds the new ones.

import { parseHighScore } from './highscore.js';

// Same `neonWasteland.` prefix as the other saves (ADR-0010).
export const SHARD_TOTAL_KEY = 'neonWasteland.shardTotal';

/** Stored totals follow the high score's rules: plain digits only, else 0; capped at MAX_SAFE_INTEGER. */
export const parseShardTotal = parseHighScore;

/** total + n, with n floored and ignored if negative or not a number; capped at MAX_SAFE_INTEGER. */
export function addShards(total, n) {
  const add = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  const sum = total + add;
  return sum >= Number.MAX_SAFE_INTEGER ? Number.MAX_SAFE_INTEGER : sum;
}

/** Read the total. Missing storage, a throwing getItem, or garbage → 0. */
export function loadShardTotal(storage) {
  if (!storage) return 0;
  try {
    return parseShardTotal(storage.getItem(SHARD_TOTAL_KEY));
  } catch {
    return 0;
  }
}

/** Write the total. Returns false if storage is missing or throws; the game keeps going either way. */
export function saveShardTotal(storage, total) {
  if (!storage) return false;
  try {
    storage.setItem(SHARD_TOTAL_KEY, String(total));
    return true;
  } catch {
    return false;
  }
}

/** Shards this run has collected but not yet added to the total. */
export function unbankedShards(run) {
  const n = run.shardCount - run.shardsBanked;
  return n > 0 ? n : 0;
}

/**
 * Add the run's not-yet-banked shards to the total and save it. Returns the
 * new total. Starts from the larger of `total` (this session's) and the
 * stored value, so another tab's shards aren't overwritten and a session with
 * no storage still keeps its total in memory. With nothing new to bank it
 * doesn't write at all.
 */
export function bankRunShards(storage, total, run) {
  const n = unbankedShards(run);
  const stored = loadShardTotal(storage);
  const base = stored > total ? stored : total;
  if (n === 0) return base;
  const next = addShards(base, n);
  run.shardsBanked = run.shardCount;
  saveShardTotal(storage, next);
  return next;
}

/**
 * Spend `price` shards from the lifetime total (Round 3 shop, R7/R10) and
 * save the new total at once. Like banking, it starts from the larger of the
 * in-memory and stored totals, so another tab's shards aren't lost. Returns
 * { ok, total }: ok is false (and nothing is written) when the total can't
 * cover the price or the price isn't a positive whole number. Called only
 * from a shop click, never per frame.
 */
export function spendShards(storage, total, price) {
  const stored = loadShardTotal(storage);
  const base = stored > total ? stored : total;
  if (!Number.isInteger(price) || price <= 0 || base < price) return { ok: false, total: base };
  const next = base - price;
  saveShardTotal(storage, next); // without storage the spend still holds for this session
  return { ok: true, total: next };
}
