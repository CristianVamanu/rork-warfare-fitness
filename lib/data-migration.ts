import AsyncStorage from '@react-native-async-storage/async-storage';

export interface DataVersion {
  version: number;
  timestamp: string;
  description: string;
}

interface MigrationResult {
  success: boolean;
  fromVersion: number;
  toVersion: number;
  errors: string[];
  migratedKeys: string[];
}

const CURRENT_VERSION = 1;
const VERSION_KEY = 'wf_data_version';
const BACKUP_PREFIX = 'wf_backup_v';

const CRITICAL_DATA_KEYS = [
  'wf_programs',
  'wf_active_program_id',
  'wf_workout_logs',
  'wf_exercise_performances',
  'wf_achievements',
  'warfare_streak',
  'warfare_power_level',
  'warfare_missions',
  'warfare_last_date',
  'warfare_last_post_date',
  'warfare_last_login_date',
  'warfare_hydration',
  'warfare_hydration_target',
  'warfare_calorie_target',
  'warfare_meals',
  'warfare_subscription_tier',
  'warfare_admin_app_settings',
  'warfare_user',
  'warfare_cold_exposure_count',
  'warfare_post_count',
  'warfare_power_metrics',
  'warfare_fasting_state',
  'warfare_ice_baths',
  'warfare_all_users',
  'warfare_community',
  'warfare_community_moderation',
  'warfare_community_slow_mode',
  'warfare_community_last_posts',
];

async function getCurrentVersion(): Promise<number> {
  try {
    const versionStr = await AsyncStorage.getItem(VERSION_KEY);
    if (!versionStr) return 0;
    const version = parseInt(versionStr, 10);
    return isNaN(version) ? 0 : version;
  } catch (error) {
    console.error('[Migration] Failed to get current version:', error);
    return 0;
  }
}

async function setVersion(version: number): Promise<void> {
  try {
    await AsyncStorage.setItem(VERSION_KEY, version.toString());
    console.log('[Migration] Version set to:', version);
  } catch (error) {
    console.error('[Migration] Failed to set version:', error);
    throw error;
  }
}

export async function createBackup(version: number): Promise<boolean> {
  try {
    console.log('[Migration] Creating backup for version:', version);
    const backup: Record<string, string | null> = {};
    
    for (const key of CRITICAL_DATA_KEYS) {
      try {
        const value = await AsyncStorage.getItem(key);
        if (value !== null) {
          backup[key] = value;
        }
      } catch (error) {
        console.error(`[Migration] Failed to backup key ${key}:`, error);
      }
    }

    const backupKey = `${BACKUP_PREFIX}${version}_${Date.now()}`;
    await AsyncStorage.setItem(backupKey, JSON.stringify(backup));
    await AsyncStorage.setItem('wf_latest_backup', backupKey);
    
    console.log('[Migration] Backup created:', backupKey, 'Keys:', Object.keys(backup).length);
    return true;
  } catch (error) {
    console.error('[Migration] Backup failed:', error);
    return false;
  }
}

export async function restoreFromBackup(backupKey?: string): Promise<boolean> {
  try {
    const keyToRestore = backupKey ?? await AsyncStorage.getItem('wf_latest_backup');
    if (!keyToRestore) {
      console.error('[Migration] No backup found to restore');
      return false;
    }

    console.log('[Migration] Restoring from backup:', keyToRestore);
    const backupData = await AsyncStorage.getItem(keyToRestore);
    if (!backupData) {
      console.error('[Migration] Backup data not found');
      return false;
    }

    const backup: Record<string, string> = JSON.parse(backupData);
    
    for (const [key, value] of Object.entries(backup)) {
      try {
        await AsyncStorage.setItem(key, value);
      } catch (error) {
        console.error(`[Migration] Failed to restore key ${key}:`, error);
      }
    }

    console.log('[Migration] Restore completed. Keys restored:', Object.keys(backup).length);
    return true;
  } catch (error) {
    console.error('[Migration] Restore failed:', error);
    return false;
  }
}

export async function listBackups(): Promise<string[]> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const backupKeys = allKeys.filter(key => key.startsWith(BACKUP_PREFIX));
    return backupKeys.sort().reverse();
  } catch (error) {
    console.error('[Migration] Failed to list backups:', error);
    return [];
  }
}

export async function deleteOldBackups(keepCount: number = 5): Promise<void> {
  try {
    const backups = await listBackups();
    if (backups.length <= keepCount) return;

    const toDelete = backups.slice(keepCount);
    await AsyncStorage.multiRemove(toDelete);
    console.log('[Migration] Deleted old backups:', toDelete.length);
  } catch (error) {
    console.error('[Migration] Failed to delete old backups:', error);
  }
}

async function migrateV0toV1(): Promise<{ success: boolean; errors: string[] }> {
  const errors: string[] = [];
  
  try {
    console.log('[Migration] Running migration V0 -> V1: Initial version setup');
    
    const currentVersion = await getCurrentVersion();
    if (currentVersion >= 1) {
      console.log('[Migration] Already at V1 or higher, skipping');
      return { success: true, errors: [] };
    }

    for (const key of CRITICAL_DATA_KEYS) {
      try {
        const value = await AsyncStorage.getItem(key);
        if (value !== null) {
          try {
            const parsed = JSON.parse(value);
            if (parsed && typeof parsed === 'object') {
              if (Array.isArray(parsed)) {
                parsed.forEach((item: any) => {
                  if (item && typeof item === 'object' && !item.migratedAt) {
                    item.migratedAt = new Date().toISOString();
                  }
                });
              } else if (!parsed.migratedAt) {
                parsed.migratedAt = new Date().toISOString();
              }
              await AsyncStorage.setItem(key, JSON.stringify(parsed));
            }
          } catch {
            console.log(`[Migration] Key ${key} contains plain string value, skipping migration`);
          }
        }
      } catch (error) {
        const errorMsg = `Failed to migrate key ${key}: ${error}`;
        console.error('[Migration]', errorMsg);
        errors.push(errorMsg);
      }
    }

    return { success: true, errors };
  } catch (error) {
    const errorMsg = `Migration V0->V1 failed: ${error}`;
    console.error('[Migration]', errorMsg);
    return { success: false, errors: [errorMsg] };
  }
}

export async function runMigrations(): Promise<MigrationResult> {
  const errors: string[] = [];
  const migratedKeys: string[] = [];
  
  try {
    console.log('[Migration] Starting migration process...');
    
    const currentVersion = await getCurrentVersion();
    console.log('[Migration] Current version:', currentVersion, 'Target version:', CURRENT_VERSION);

    if (currentVersion === CURRENT_VERSION) {
      console.log('[Migration] Already at current version, no migration needed');
      return {
        success: true,
        fromVersion: currentVersion,
        toVersion: CURRENT_VERSION,
        errors: [],
        migratedKeys: [],
      };
    }

    const backupSuccess = await createBackup(currentVersion);
    if (!backupSuccess) {
      const error = 'Failed to create backup before migration';
      console.error('[Migration]', error);
      errors.push(error);
      return {
        success: false,
        fromVersion: currentVersion,
        toVersion: currentVersion,
        errors,
        migratedKeys: [],
      };
    }

    if (currentVersion < 1) {
      console.log('[Migration] Running V0 -> V1 migration');
      const result = await migrateV0toV1();
      if (!result.success) {
        errors.push(...result.errors);
        console.error('[Migration] V0->V1 migration failed, attempting restore');
        await restoreFromBackup();
        return {
          success: false,
          fromVersion: currentVersion,
          toVersion: currentVersion,
          errors,
          migratedKeys: [],
        };
      }
      migratedKeys.push(...CRITICAL_DATA_KEYS);
    }

    await setVersion(CURRENT_VERSION);
    await deleteOldBackups(5);

    console.log('[Migration] Migration completed successfully');
    return {
      success: true,
      fromVersion: currentVersion,
      toVersion: CURRENT_VERSION,
      errors: [],
      migratedKeys,
    };
  } catch (error) {
    const errorMsg = `Migration process failed: ${error}`;
    console.error('[Migration]', errorMsg);
    errors.push(errorMsg);
    
    try {
      await restoreFromBackup();
      console.log('[Migration] Data restored from backup after failure');
    } catch (restoreError) {
      const restoreErrorMsg = `Failed to restore backup: ${restoreError}`;
      console.error('[Migration]', restoreErrorMsg);
      errors.push(restoreErrorMsg);
    }

    return {
      success: false,
      fromVersion: await getCurrentVersion(),
      toVersion: CURRENT_VERSION,
      errors,
      migratedKeys: [],
    };
  }
}

export async function verifyDataIntegrity(): Promise<{
  valid: boolean;
  missingKeys: string[];
  corruptedKeys: string[];
}> {
  const missingKeys: string[] = [];
  const corruptedKeys: string[] = [];

  try {
    console.log('[Migration] Verifying data integrity...');

    for (const key of CRITICAL_DATA_KEYS) {
      try {
        const value = await AsyncStorage.getItem(key);
        if (value === null) {
          continue;
        }

      } catch (error) {
        console.error(`[Migration] Error checking key ${key}:`, error);
        missingKeys.push(key);
      }
    }

    const valid = corruptedKeys.length === 0;
    console.log('[Migration] Data integrity check:', valid ? 'PASSED' : 'FAILED');
    
    if (corruptedKeys.length > 0) {
      console.error('[Migration] Corrupted keys:', corruptedKeys);
    }

    return { valid, missingKeys, corruptedKeys };
  } catch (error) {
    console.error('[Migration] Data integrity check failed:', error);
    return { valid: false, missingKeys: [], corruptedKeys: [] };
  }
}

export async function exportAllData(): Promise<string | null> {
  try {
    console.log('[Migration] Exporting all user data...');
    const allData: Record<string, string | null> = {};

    for (const key of CRITICAL_DATA_KEYS) {
      try {
        const value = await AsyncStorage.getItem(key);
        allData[key] = value;
      } catch (error) {
        console.error(`[Migration] Failed to export key ${key}:`, error);
      }
    }

    const exportData = {
      version: await getCurrentVersion(),
      exportedAt: new Date().toISOString(),
      data: allData,
    };

    console.log('[Migration] Export completed. Keys:', Object.keys(allData).length);
    return JSON.stringify(exportData, null, 2);
  } catch (error) {
    console.error('[Migration] Export failed:', error);
    return null;
  }
}

export async function importData(dataJson: string): Promise<boolean> {
  try {
    console.log('[Migration] Importing data...');
    
    await createBackup(await getCurrentVersion());

    const importData = JSON.parse(dataJson);
    const { version, data } = importData;

    console.log('[Migration] Import version:', version);

    for (const [key, value] of Object.entries(data)) {
      if (value !== null && CRITICAL_DATA_KEYS.includes(key)) {
        try {
          await AsyncStorage.setItem(key, value as string);
        } catch (error) {
          console.error(`[Migration] Failed to import key ${key}:`, error);
        }
      }
    }

    if (version !== undefined) {
      await setVersion(version);
    }

    const integrity = await verifyDataIntegrity();
    if (!integrity.valid) {
      console.error('[Migration] Imported data failed integrity check, restoring backup');
      await restoreFromBackup();
      return false;
    }

    console.log('[Migration] Import completed successfully');
    return true;
  } catch (error) {
    console.error('[Migration] Import failed:', error);
    await restoreFromBackup();
    return false;
  }
}
