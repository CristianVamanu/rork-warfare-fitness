import { useEffect, useRef } from 'react';
import { useApp } from '@/contexts/AppContext';
import { getFirebaseDb } from '@/lib/firebase-client';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export default function AdminSettingsSync() {
  const { adminSettings, updateAdminSettings } = useApp();
  const initialLoadDone = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (initialLoadDone.current) return;
    const load = async () => {
      try {
        const db = getFirebaseDb();
        if (!db) return;
        const snap = await getDoc(doc(db, 'warfare_admin', 'settings'));
        if (snap.exists()) {
          updateAdminSettings(snap.data() as any);
        }
      } catch (e) {
        console.error('[Sync] AdminSettings load failed', e);
      } finally {
        initialLoadDone.current = true;
      }
    };
    void load();
  }, [updateAdminSettings]);

  useEffect(() => {
    if (!initialLoadDone.current) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const db = getFirebaseDb();
        if (!db) return;
        await setDoc(doc(db, 'warfare_admin', 'settings'), adminSettings, { merge: true });
      } catch (e) {
        console.error('[Sync] AdminSettings save failed', e);
      }
    }, 1500);
    return () => clearTimeout(saveTimer.current);
  }, [adminSettings]);

  return null;
}
