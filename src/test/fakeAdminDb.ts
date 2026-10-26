/**
 * A small in-memory stand-in for the firebase-admin Firestore surface the
 * server routes actually use — built to MODEL FIRESTORE'S REAL SEMANTICS for
 * the one thing that has bitten this codebase three times:
 *
 *   update({ 'membership.status': 'none' })        → nested path, as intended
 *   set({ 'membership.status': 'none' }, {merge})  → a top-level field whose
 *                                                    NAME contains a dot
 *
 * A fake that flattened both into `{...doc, ...data}` passed 35 tests while
 * the production code was broken, because it modelled the bug as correct.
 * This one resolves dotted keys only where Firestore does, so a test that
 * asserts on the nested map fails for the dotted-set() shape.
 *
 * Supported: doc(path), collection().doc().get/set/update/delete, collection().where()
 * (equality, dotted paths) .limit().get(), doc refs on query results (`.ref`,
 * `.id`, `.data()`), runTransaction, batch, collectionGroup (by last segment),
 * FieldValue sentinels for serverTimestamp/delete/increment/arrayUnion/Remove.
 */

export const FV = {
  serverTimestamp: () => ({ __sentinel: 'ts' }),
  delete: () => ({ __sentinel: 'delete' }),
  increment: (n: number) => ({ __sentinel: 'inc', n }),
  arrayUnion: (...v: unknown[]) => ({ __sentinel: 'union', v }),
  arrayRemove: (...v: unknown[]) => ({ __sentinel: 'remove', v }),
};

type Doc = Record<string, unknown>;
const isSentinel = (v: unknown): v is { __sentinel: string; n?: number; v?: unknown[] } =>
  !!v && typeof v === 'object' && '__sentinel' in (v as object);
/** A map to recurse into — NOT a Date, Timestamp, array or sentinel. */
const isPlainMap = (v: unknown): v is Doc =>
  !!v && typeof v === 'object' && !Array.isArray(v) && !isSentinel(v) && (v as object).constructor === Object;

function applyValue(prev: unknown, next: unknown): unknown {
  if (!isSentinel(next)) return next;
  switch (next.__sentinel) {
    case 'ts': return '__ts__';
    case 'delete': return undefined;
    case 'inc': return ((prev as number) ?? 0) + (next.n ?? 0);
    case 'union': return Array.from(new Set([...((prev as unknown[]) ?? []), ...(next.v ?? [])]));
    case 'remove': return ((prev as unknown[]) ?? []).filter((x) => !(next.v ?? []).includes(x));
    default: return next;
  }
}

/** Deep-merge `data` into `target`, resolving sentinels at leaves. Dotted keys are NOT paths here. */
function mergeInto(target: Doc, data: Doc): Doc {
  const out: Doc = { ...target };
  for (const [k, v] of Object.entries(data)) {
    if (isPlainMap(v)) {
      out[k] = mergeInto((isPlainMap(out[k]) ? out[k] : {}), v);
    } else {
      const applied = applyValue(out[k], v);
      if (applied === undefined) delete out[k]; else out[k] = applied;
    }
  }
  return out;
}

/** update(): each key IS a dotted path. */
function updateInto(target: Doc, data: Doc): Doc {
  const out: Doc = JSON.parse(JSON.stringify(target));
  for (const [path, v] of Object.entries(data)) {
    const parts = path.split('.');
    let cur: Doc = out;
    for (let i = 0; i < parts.length - 1; i++) {
      if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) cur[parts[i]] = {};
      cur = cur[parts[i]] as Doc;
    }
    const last = parts[parts.length - 1];
    if (isPlainMap(v)) {
      cur[last] = mergeInto({}, v); // update replaces the map at that path
    } else {
      const applied = applyValue(cur[last], v);
      if (applied === undefined) delete cur[last]; else cur[last] = applied;
    }
  }
  return out;
}

function getPath(doc: Doc | undefined, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, p) => (acc && typeof acc === 'object' ? (acc as Doc)[p] : undefined), doc);
}

export function makeAdminDb() {
  const docs = new Map<string, Doc>();

  const snapOf = (path: string) => ({
    id: path.split('/').pop()!,
    exists: docs.has(path),
    data: () => (docs.has(path) ? JSON.parse(JSON.stringify(docs.get(path))) : undefined),
    ref: docRef(path),
  });

  function docRef(path: string) {
    const ref = {
      id: path.split('/').pop()!,
      path,
      get: async () => snapOf(path),
      set: async (data: Doc, opts?: { merge?: boolean }) => {
        docs.set(path, opts?.merge ? mergeInto(docs.get(path) ?? {}, data) : mergeInto({}, data));
      },
      update: async (...args: unknown[]) => {
        if (!docs.has(path)) { const e = new Error('NOT_FOUND') as Error & { code?: number }; e.code = 5; throw e; }
        if (args.length > 1) {
          // varargs FieldPath form — single-segment names
          const cur = { ...docs.get(path)! };
          for (let i = 0; i < args.length; i += 2) delete cur[(args[i] as { path: string }).path];
          docs.set(path, cur);
          return;
        }
        docs.set(path, updateInto(docs.get(path)!, args[0] as Doc));
      },
      delete: async () => { docs.delete(path); },
      collection: (sub: string) => collectionRef(`${path}/${sub}`),
    };
    return ref;
  }

  function queryRef(
    colPath: string,
    filters: { path: string; value: unknown }[],
    max?: number,
    /** Document-id cursor, as produced by orderBy('__name__') + startAfter(). */
    after?: string,
  ) {
    const self = {
      where: (p: string, op: string, value: unknown) => {
        if (op !== '==') throw new Error(`fake: unsupported op ${op}`);
        return queryRef(colPath, [...filters, { path: p, value }], max, after);
      },
      // Only __name__ is supported: it is the one ordering the paging in the
      // backup route uses, and pretending to order by arbitrary fields would
      // let a test pass against behaviour Firestore does not actually have.
      orderBy: (field: string) => {
        if (field !== '__name__') throw new Error(`fake: only orderBy('__name__') is supported, got ${field}`);
        return queryRef(colPath, filters, max, after);
      },
      startAfter: (cursor: { id: string }) => queryRef(colPath, filters, max, cursor.id),
      limit: (n: number) => queryRef(colPath, filters, n, after),
      get: async () => {
        const rows = [...docs.entries()]
          .filter(([p]) => p.startsWith(colPath + '/') && p.slice(colPath.length + 1).split('/').length === 1)
          .filter(([, d]) => filters.every((f) => getPath(d, f.path) === f.value))
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .filter(([p]) => (after ? p.split('/').pop()! > after : true))
          .slice(0, max ?? Infinity)
          .map(([p]) => snapOf(p));
        return { docs: rows, empty: rows.length === 0, size: rows.length };
      },
    };
    return self;
  }

  function collectionRef(colPath: string) {
    return {
      doc: (id?: string) => docRef(`${colPath}/${id ?? `auto_${docs.size + 1}`}`),
      ...queryRef(colPath, []),
    };
  }

  const db = {
    docs,
    collection: (c: string) => collectionRef(c),
    /** Full-path document reference, as used by restores writing arbitrary paths. */
    doc: (path: string) => docRef(path),
    collectionGroup: (name: string) => ({
      where: (p: string, _op: string, value: unknown) => ({
        get: async () => {
          const rows = [...docs.entries()]
            .filter(([path]) => path.split('/').at(-2) === name)
            .filter(([, d]) => getPath(d, p) === value)
            .map(([path]) => snapOf(path));
          return { docs: rows, empty: rows.length === 0, size: rows.length };
        },
      }),
      get: async () => {
        const rows = [...docs.entries()].filter(([path]) => path.split('/').at(-2) === name).map(([path]) => snapOf(path));
        return { docs: rows, empty: rows.length === 0, size: rows.length };
      },
    }),
    runTransaction: async <T,>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const tx = {
        get: (ref: { get: () => Promise<unknown> }) => ref.get(),
        set: (ref: { set: (d: Doc, o?: { merge?: boolean }) => Promise<void> }, d: Doc, o?: { merge?: boolean }) => { void ref.set(d, o); },
        update: (ref: { update: (d: Doc) => Promise<void> }, d: Doc) => { void ref.update(d); },
        delete: (ref: { delete: () => Promise<void> }) => { void ref.delete(); },
      };
      return fn(tx);
    },
    batch: () => {
      const ops: (() => Promise<void>)[] = [];
      return {
        set: (ref: { set: (d: Doc, o?: { merge?: boolean }) => Promise<void> }, d: Doc, o?: { merge?: boolean }) => { ops.push(() => ref.set(d, o)); },
        update: (ref: { update: (d: Doc) => Promise<void> }, d: Doc) => { ops.push(() => ref.update(d)); },
        delete: (ref: { delete: () => Promise<void> }) => { ops.push(() => ref.delete()); },
        commit: async () => { for (const op of ops) await op(); },
      };
    },
    /** The named subscription map as it actually exists on the stored doc. */
    sub: (path: string, field: 'membership' | 'coaching') => ((docs.get(path)?.[field] ?? {}) as Doc),
  };
  return db;
}
