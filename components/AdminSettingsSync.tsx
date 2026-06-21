import { useEffect, useRef } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useFirebase } from '@/contexts/FirebaseContext';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';

export default function AdminSettingsSync() {
  const { adminSettings, updateAdminSettings, user } = useApp();
  const { firebaseApp, isConfigured } = useFirebase();
  const initialLoadDone = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  // Load from Firestore when Firebase becomes available
  useEffect(() => {
    if (!isConfigured || !firebaseApp || initialLoadDone.current) return;
    if (!user?.isAdmin) {
      initialLoadDone.current = true;
      return;
    }

    const load = async () => {
      try {
        const db = getFirestore(firebaseApp);
        const snap = await getDoc(doc(db, 'warfare_admin', 'settings'));
        if (snap.exists()) {
          updateAdminSettings(snap.data() as any);
          console.log('[Sync] Admin settings loaded from Firestore');
        }
        initialLoadDone.current = true;
      } catch (e) {
        console.error('[Sync] Failed to load admin settings:', e);
        initialLoadDone.current = true;
      }
    };
    void load();
  }, [isConfigured, firebaseApp, user?.isAdmin]);

  // Save to Firestore when adminSettings change (debounced)
  useEffect(() => {
    if (!isConfigured || !firebaseApp || !initialLoadDone.current) return;
    if (!user?.isAdmin) return;

    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const db = getFirestore(firebaseApp);
        await setDoc(doc(db, 'warfare_admin', 'settings'), adminSettings, { merge: true });
        console.log('[Sync] Admin settings saved to Firestore');
      } catch (e) {
        console.error('[Sync] Failed to save admin settings:', e);
      }
    }, 1000);

    return () => clearTimeout(saveTimer.current);
  }, [adminSettings, isConfigured, firebaseApp, user?.isAdmin]);

  return null;
}
