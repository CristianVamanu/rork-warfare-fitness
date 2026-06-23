/**
 * Firestore sync helpers.
 * Dual-write strategy: every mutation writes to AsyncStorage (offline/fast)
 * AND Firestore (cross-device persistence). On load, Firestore is preferred;
 * AsyncStorage is the fallback for unauthenticated or offline scenarios.
 */
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  query,
  orderBy,
  limit,
  Firestore,
  DocumentData,
  QueryConstraint,
} from 'firebase/firestore';

/** Write a single document to a Firestore path. Silently no-ops if db is null. */
export async function syncDocToFirestore(
  db: Firestore | null,
  path: string[],
  data: DocumentData
): Promise<void> {
  if (!db) return;
  try {
    await setDoc(doc(db, path.join('/')), { ...data, _syncedAt: new Date().toISOString() }, { merge: true });
  } catch (e) {
    console.error('[Sync] Firestore write failed:', path.join('/'), e);
  }
}

/** Delete a document from Firestore. Silently no-ops if db is null. */
export async function deleteDocFromFirestore(
  db: Firestore | null,
  path: string[]
): Promise<void> {
  if (!db) return;
  try {
    await deleteDoc(doc(db, path.join('/')));
  } catch (e) {
    console.error('[Sync] Firestore delete failed:', path.join('/'), e);
  }
}

/** Load a collection from Firestore into an array, ordered + limited. Returns null if unavailable. */
export async function loadCollectionFromFirestore<T>(
  db: Firestore | null,
  collectionPath: string[],
  orderByField: string,
  direction: 'asc' | 'desc' = 'desc',
  maxItems: number = 500,
  extra?: QueryConstraint[]
): Promise<T[] | null> {
  if (!db) return null;
  try {
    const constraints: QueryConstraint[] = [
      orderBy(orderByField, direction),
      limit(maxItems),
      ...(extra ?? []),
    ];
    const snap = await getDocs(query(collection(db, collectionPath.join('/')), ...constraints));
    if (snap.empty) return null;
    return snap.docs.map(d => d.data() as T);
  } catch (e) {
    console.error('[Sync] Firestore load failed:', collectionPath.join('/'), e);
    return null;
  }
}

/** Load a single Firestore document. Returns null if missing or unavailable. */
export async function loadDocFromFirestore<T>(
  db: Firestore | null,
  path: string[]
): Promise<T | null> {
  if (!db) return null;
  try {
    const snap = await getDoc(doc(db, path.join('/')));
    return snap.exists() ? (snap.data() as T) : null;
  } catch (e) {
    console.error('[Sync] Firestore doc load failed:', path.join('/'), e);
    return null;
  }
}
