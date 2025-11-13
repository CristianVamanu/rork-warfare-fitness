# Data Preservation & Migration System

This document explains the comprehensive data preservation and migration system implemented in the Warfare Fitness app to ensure all user data remains intact during app updates.

## Overview

The app implements a multi-layered data protection strategy:

1. **Automatic Data Persistence** - All user data is automatically saved to AsyncStorage
2. **Data Migration & Versioning** - Automatic migration between app versions with backup/restore
3. **Data Integrity Verification** - Validates data correctness after migrations
4. **Backup System** - Creates backups before any migration or update
5. **Error Recovery** - Automatic rollback on migration failures

## Protected Data

The following data types are fully protected and persisted:

### User Profile Data
- User account information (email, name, avatar, etc.)
- Subscription tier and preferences
- Weight unit preferences

### Workout & Training Data
- **Workout Programs** - All 90-day programs and custom created programs
- **Active Program** - Current enrolled program and progress
- **Workout Logs** - Complete history of all completed workouts
- **Exercise Performances** - Every set, rep, and weight logged
- **Personal Records** - All PRs and achievements
- **Completed Days** - Progress tracking for each program day
- **Program Start Dates** - Enrollment and trial start dates

### Progress & Gamification Data
- **Streak** - Login streak counter
- **Power Level** - Total power accumulated
- **Missions** - All missions and completion status
- **Badges** - Earned badges collection
- **Achievements** - Complete achievement history
- **Cold Exposure Count** - Ice bath tracking
- **Post Count** - Community participation tracking
- **Power Metrics** - Login streak, workouts completed, spending history

### Nutrition & Wellness Data
- **Meal Logs** - All logged meals with macros
- **Hydration** - Water intake tracking
- **Hydration Target** - Daily water goal
- **Calorie Target** - Daily calorie goal
- **Fasting State** - Active fasting sessions
- **Ice Bath Logs** - Complete ice bath history

### Community Data
- **Posts** - All community posts
- **Comments** - Post comments
- **Likes** - Liked posts tracking
- **Moderation** - User moderation status
- **Slow Mode** - Posting restrictions

### Admin Settings
- App configuration
- Payment settings (encrypted)
- Notification settings
- Daily briefings
- Firebase configuration (encrypted)

## Data Migration System

### Version Management

The app uses a semantic versioning system to track data schema changes:

- **Current Version**: 1
- **Version Storage Key**: `wf_data_version`

### Migration Process

When the app starts, it automatically:

1. **Checks Current Version**
   - Reads stored data version
   - Compares with target version

2. **Creates Backup**
   - Backs up all critical data before migration
   - Stores backup with timestamp
   - Keeps last 5 backups automatically

3. **Runs Migrations**
   - Executes version-specific migration scripts
   - Migrates data in sequence (V0→V1→V2, etc.)
   - Logs all migration steps

4. **Verifies Integrity**
   - Validates migrated data structure
   - Checks for corrupted data
   - Ensures all required keys exist

5. **Handles Errors**
   - Automatically restores from backup on failure
   - Alerts user of migration issues
   - Preserves all data in backup

### Migration Flow Diagram

```
App Start
    ↓
Data Migration Guard Activated
    ↓
Check Current Version
    ↓
[Version Match?] → Yes → Continue to App
    ↓ No
Create Backup of All Data
    ↓
Run Migration Scripts (V0→V1→V2...)
    ↓
[Migration Success?] → No → Restore Backup → Alert User
    ↓ Yes
Verify Data Integrity
    ↓
[Integrity Valid?] → No → Restore Backup → Alert User
    ↓ Yes
Update Version Number
    ↓
Clean Up Old Backups (Keep 5)
    ↓
Continue to App
```

## Data Persistence Implementation

### Context Providers

All context providers (AppContext, TrainingContext, CommunityContext, FirebaseContext) implement:

1. **Load on Mount**
   ```typescript
   useEffect(() => {
     async function loadPersistedData() {
       // Load all data from AsyncStorage
       // Parse and validate
       // Set state
     }
     loadPersistedData();
   }, []);
   ```

2. **Save on Change**
   ```typescript
   const updateData = useCallback(async (newData) => {
     setData(newData);
     await AsyncStorage.setItem(KEY, JSON.stringify(newData));
   }, []);
   ```

3. **Error Handling**
   - Try/catch on all AsyncStorage operations
   - Fallback to default values on parse errors
   - Console logging for debugging

### Storage Keys

All storage keys are prefixed for easy identification:
- `wf_` - Training-related data
- `warfare_` - App-level data
- `wf_backup_v` - Backup data

## Backup System

### Automatic Backups

Backups are automatically created:
- Before every migration
- Can be manually triggered via admin tools
- Stored with version number and timestamp

### Backup Contents

Each backup contains:
```json
{
  "wf_programs": "...",
  "wf_workout_logs": "...",
  "warfare_streak": "...",
  // ... all 30+ critical data keys
}
```

### Backup Management

- **Max Backups**: 5 most recent
- **Auto-Cleanup**: Deletes older backups automatically
- **Storage Key**: `wf_backup_v{version}_{timestamp}`
- **Latest Backup Pointer**: `wf_latest_backup`

### Restore Process

```typescript
// Restore from latest backup
await restoreFromBackup();

// Restore from specific backup
await restoreFromBackup('wf_backup_v1_1234567890');
```

## Data Integrity Verification

After migration, the system verifies:

1. **Data Existence** - All critical keys present
2. **Data Parseability** - JSON data is valid
3. **Data Structure** - Objects match expected schema

If verification fails:
- Backup is automatically restored
- User is notified
- App continues with pre-migration data

## Developer Guide

### Adding New Data Fields

When adding new persisted data:

1. Add storage key constant
2. Add to `CRITICAL_DATA_KEYS` in `lib/data-migration.ts`
3. Implement load logic in context provider
4. Implement save logic in update methods

### Creating New Migrations

To migrate data schema:

1. Increment `CURRENT_VERSION` in `lib/data-migration.ts`
2. Add migration function:
   ```typescript
   async function migrateV1toV2(): Promise<{ success: boolean; errors: string[] }> {
     // Your migration logic
   }
   ```
3. Call migration in `runMigrations()` function
4. Test thoroughly with real data

### Testing Migrations

```typescript
// Export current data
const exportedData = await exportAllData();
// Save to file for testing

// Import data
await importData(exportedData);

// Verify integrity
const { valid, corruptedKeys } = await verifyDataIntegrity();
```

## User-Facing Features

### Data Export

Users can export their data for backup:
- Admin → Settings → Export Data
- Generates JSON file with all data
- Can be saved to device storage

### Data Import

Users can import previously exported data:
- Admin → Settings → Import Data
- Validates data before importing
- Creates backup before import
- Verifies integrity after import

## Error Handling

### Migration Errors

If migration fails:
1. Data is restored from backup
2. User sees: "Data Migration Error" alert
3. User data remains at previous version
4. App continues to function normally

### Integrity Errors

If data integrity check fails:
1. User sees: "Data Integrity Warning" alert
2. Corrupted keys are logged
3. Data remains preserved in backup
4. User can contact support with logs

### Recovery Options

Users have several recovery options:
1. **Automatic Restore** - Happens automatically on errors
2. **Manual Export/Import** - User-initiated data backup
3. **Contact Support** - With console logs for debugging

## Performance Considerations

### Optimization Strategies

1. **Batch Operations** - Use `AsyncStorage.multiGet/multiSet`
2. **Lazy Loading** - Load data only when needed
3. **Debounced Saves** - Avoid excessive writes
4. **Selective Loading** - Load only changed data

### Storage Limits

- **AsyncStorage Limit**: ~6MB on iOS, ~10MB on Android
- **Current Usage**: < 1MB for typical user
- **Max Backups**: 5 to prevent storage bloat

## Monitoring & Logging

All critical operations are logged with prefix:
- `[Migration]` - Migration operations
- `[AppContext]` - App-level data operations
- `[TrainingContext]` - Training data operations
- `[Community]` - Community data operations

Console logs include:
- Operation type (load, save, migrate)
- Success/failure status
- Error details if applicable
- Data sizes and key counts

## Security Considerations

### Data Encryption

Sensitive data (Firebase config, payment keys) is encrypted:
- Uses expo-crypto for hashing
- Generates unique device keys
- Validates data integrity with hash

### Data Privacy

- All data stored locally on device
- No automatic cloud sync (unless Firebase configured)
- User controls data export/import

## Testing Checklist

Before deploying updates:

- [ ] Test migration from previous version
- [ ] Verify all data persists after migration
- [ ] Test backup/restore functionality
- [ ] Verify data integrity checks
- [ ] Test error recovery scenarios
- [ ] Check console logs for errors
- [ ] Verify workout history preserved
- [ ] Confirm streak/power level intact
- [ ] Test with corrupted data scenarios
- [ ] Validate export/import functionality

## Conclusion

This comprehensive data preservation system ensures that:

✅ All user data is automatically backed up
✅ Migrations are safe with automatic rollback
✅ Data integrity is verified after updates
✅ Users never lose progress or history
✅ Recovery options are available
✅ Performance remains optimal

The system is designed to be transparent to users while providing robust data protection for all scenarios.
