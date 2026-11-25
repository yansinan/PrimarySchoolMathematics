/**
 * Generic snapshot merge with per-store policies.
 *
 * The server never merges: merging is a client concern because only the client
 * knows what a record means. This module covers the common case and stays
 * business-agnostic by describing each store with a policy instead of knowing
 * store names.
 *
 * Snapshot shape it understands:
 *
 *   { schemaVersion: 1, stores: { [storeName]: records[] } }
 *
 * That is exactly what `StorageAdapter.exportAll()` produces in the reference
 * application. Projects with a different shape should pass their own `merge`
 * to `createSnapshotSync` instead of using this helper.
 */

/** @typedef {{mode: 'union'|'lww'|'content'|'local'|'remote', key?: string, timeField?: string}} Policy */

export const DEFAULT_POLICY = Object.freeze({ mode: 'local' });

function recordsOf(snapshot, store) {
  const list = snapshot?.stores?.[store];
  return Array.isArray(list) ? list : [];
}

function keyOf(record, field) {
  if (!record || typeof record !== 'object') return '';
  const value = record[field];
  if (value === undefined || value === null) return '';
  return String(value);
}

function timeOf(record, field) {
  const raw = record?.[field];
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const parsed = Date.parse(String(raw ?? ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortByKey(list, key) {
  return list.sort((a, b) => keyOf(a, key).localeCompare(keyOf(b, key)));
}

/**
 * Append-only stores: every record survives, duplicates are dropped by key.
 * Remote is visited first so a record already pushed by another device keeps
 * its position; values are assumed immutable for this mode.
 * @param {any[]} local
 * @param {any[]} remote
 * @param {{key?: string}} [options]
 */
export function unionRecords(local, remote, { key = 'id' } = {}) {
  const seen = new Set();
  const out = [];
  for (const record of [...remote, ...local]) {
    const id = keyOf(record, key);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(record);
  }
  return sortByKey(out, key);
}

/**
 * Last-writer-wins by timestamp; ties keep the remote record so two devices
 * converge on the same value.
 * @param {any[]} local
 * @param {any[]} remote
 * @param {{key?: string, timeField?: string}} [options]
 */
export function latestWins(local, remote, { key = 'id', timeField = 'updatedAt' } = {}) {
  /** @type {Map<string, any>} */
  const byKey = new Map();
  for (const record of remote) {
    const id = keyOf(record, key);
    if (id && !byKey.has(id)) byKey.set(id, record);
  }
  for (const record of local) {
    const id = keyOf(record, key);
    if (!id) continue;
    const existing = byKey.get(id);
    if (!existing) {
      byKey.set(id, record);
      continue;
    }
    if (timeOf(record, timeField) > timeOf(existing, timeField)) byKey.set(id, record);
  }
  return sortByKey([...byKey.values()], key);
}

/**
 * Content stores are published as a whole by whoever has the newer revision.
 * @param {any} snapshot
 * @returns {number}
 */
export function defaultRevisionOf(snapshot) {
  const direct = Number(snapshot?.contentRevision);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const record = recordsOf(snapshot, 'meta').find((item) => item && item.key === 'contentRevision');
  const value = Number(record?.value);
  return Number.isFinite(value) ? value : 0;
}

/**
 * Merge every store with its policy.
 * @param {any} local
 * @param {any} remote
 * @param {{
 *   policies?: Record<string, Policy>,
 *   defaultPolicy?: Policy,
 *   revisionOf?: (snapshot: any) => number,
 * }} [options]
 * @returns {Record<string, any[]>}
 */
export function mergeStores(local, remote, options = {}) {
  const {
    policies = {},
    defaultPolicy = DEFAULT_POLICY,
    revisionOf = defaultRevisionOf,
  } = options;
  const localStores = local?.stores ?? {};
  const remoteStores = remote?.stores ?? {};
  const names = new Set([...Object.keys(localStores), ...Object.keys(remoteStores)]);
  const localRevision = revisionOf(local);
  const remoteRevision = revisionOf(remote);
  const preference = remoteRevision > localRevision ? remote : local;

  /** @type {Record<string, any[]>} */
  const stores = {};
  for (const store of names) {
    const policy = policies[store] ?? defaultPolicy;
    const localRecords = recordsOf(local, store);
    const remoteRecords = recordsOf(remote, store);
    switch (policy.mode) {
      case 'union':
        stores[store] = unionRecords(localRecords, remoteRecords, policy);
        break;
      case 'lww':
        stores[store] = latestWins(localRecords, remoteRecords, policy);
        break;
      case 'content':
        stores[store] = recordsOf(preference, store);
        break;
      case 'remote':
        stores[store] = remoteRecords;
        break;
      case 'local':
        stores[store] = localRecords;
        break;
      default:
        throw new RangeError(`unknown merge mode: ${String(policy.mode)}`);
    }
  }
  return stores;
}

/**
 * Merge two exportAll() snapshots.
 *
 * @param {any} local
 * @param {any} remote  null when the server has no snapshot yet
 * @param {{
 *   policies?: Record<string, Policy>,
 *   defaultPolicy?: Policy,
 *   revisionOf?: (snapshot: any) => number,
 *   preferRemote?: boolean,
 *   now?: () => string,
 * }} [options]
 */
export function mergeSnapshots(local, remote, options = {}) {
  const { preferRemote = false, now = () => new Date().toISOString() } = options;
  if (!local || typeof local !== 'object') {
    throw new TypeError('local snapshot is required');
  }
  if (!remote) return { ...local };
  if (preferRemote) {
    // First bind: the newly paired device adopts the user's existing data
    // instead of polluting it with pre-binding practice.
    return { ...remote, exportedAt: now() };
  }
  return { ...local, stores: mergeStores(local, remote, options), exportedAt: now() };
}
