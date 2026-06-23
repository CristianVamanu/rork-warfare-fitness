import { useEffect, useRef } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useFirebase } from '@/contexts/FirebaseContext';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';

export default function AdminSettingsSync() {
  const { adminSettings, updateAdminSettings } = useApp();
  const { firebaseApp, isConfigured } = useFirebase();
  const initialLoadDone = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!isConfigured || !firebaseApp || initialLoadDone.current) return;
    const load = async () => {
      try {
        const db = getFirestore(firebaseApp);
        const snap = await getDoc(doc(db, 'warfare_admin', 'settings'));
        if (snap.exists()) {
          updateAdminSettings(snap.data() as any);
        }
      } catch (e) {
        console.error('[Sync] load failed', e);
      } finally {
        initialLoadDone.current = true;
      }
    };
    void load();
  }, [isConfigured, firebaseApp, updateAdminSettings]);

  useEffect(() => {
    if (!isConfigured || !firebaseApp || !initialLoadDone.current) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const db = getFirestore(firebaseApp);
        await setDoc(doc(db, 'warfare_admin', 'settings'), adminSettings, { merge: true });
      } catch (e) {
        console.error('[Sync] save failed', e);
      }
    }, 1500);
    return () => clearTimeout(saveTimer.current);
  }, [adminSettings, isConfigured, firebaseApp]);

  return null;
}
