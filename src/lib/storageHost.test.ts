import { describe, it, expect } from 'vitest';
import { storageHostOf, needsReupload, storageHostLabel } from './storageHost';
import { resolveStorageProvider, DEFAULT_STORAGE_PROVIDER } from './uploadVideo';

// Real URLs taken from the live library, so a change in URL shape is caught
// here rather than by a member finding a clip that won't play.
const FIREBASE = 'https://firebasestorage.googleapis.com/v0/b/warfare-fitness.firebasestorage.app/o/exerciseLibrary%2F1783247634316_chin-up_or_pull-ups.mp4?alt=media&token=1fa5d838-c913-42b7-ba10-02232d632359';
const R2 = 'https://pub-f58fcee402604409bf644786bc3a9316.r2.dev/exerciseLibrary/1786001075417_Kettlebell_Sumo_Deadlift_with_High_Pull.mp4';

describe('storageHostOf', () => {
  it('recognises Firebase download URLs', () => {
    expect(storageHostOf(FIREBASE)).toBe('firebase');
  });

  it('recognises the newer firebasestorage.app bucket domain', () => {
    expect(storageHostOf('https://warfare-fitness.firebasestorage.app/a.mp4')).toBe('firebase');
  });

  it('recognises the raw GCS host', () => {
    expect(storageHostOf('https://storage.googleapis.com/bucket/a.mp4')).toBe('firebase');
  });

  it('recognises R2 public dev URLs', () => {
    expect(storageHostOf(R2)).toBe('r2');
  });

  it('recognises R2 S3-compatible endpoints', () => {
    expect(storageHostOf('https://abc.r2.cloudflarestorage.com/k/a.mp4')).toBe('r2');
  });

  it('reports missing values as none, not as a host', () => {
    expect(storageHostOf(undefined)).toBe('none');
    expect(storageHostOf('')).toBe('none');
    expect(storageHostOf('   ')).toBe('none');
    expect(storageHostOf(null)).toBe('none');
  });

  it('does not claim an unparseable value is Firebase', () => {
    // The badge and, more importantly, the delete router both key off this.
    // Guessing "firebase" for junk would send a delete to the wrong backend.
    expect(storageHostOf('not a url')).toBe('other');
    expect(storageHostOf('/relative/path.mp4')).toBe('other');
  });

  it('treats an unrelated CDN as other', () => {
    expect(storageHostOf('https://cdn.example.com/a.mp4')).toBe('other');
  });

  it('is not fooled by a lookalike hostname', () => {
    expect(storageHostOf('https://evil-r2.dev.example.com/a.mp4')).toBe('other');
    expect(storageHostOf('https://firebasestorage.googleapis.com.evil.com/a.mp4')).toBe('other');
  });
});

describe('needsReupload', () => {
  it('flags only Firebase-hosted files', () => {
    expect(needsReupload(FIREBASE)).toBe(true);
    expect(needsReupload(R2)).toBe(false);
    expect(needsReupload(undefined)).toBe(false);
  });
});

describe('storageHostLabel', () => {
  it('labels every host', () => {
    expect(storageHostLabel('firebase')).toBe('Firebase');
    expect(storageHostLabel('r2')).toBe('R2');
    expect(storageHostLabel('other')).toBe('External');
    expect(storageHostLabel('none')).toBe('No file');
  });
});

describe('resolveStorageProvider', () => {
  it('defaults to R2, never Firebase', () => {
    // The whole point of the change: a missing or unreadable config value
    // must not route an upload into the metered, billing-coupled bucket.
    expect(DEFAULT_STORAGE_PROVIDER).toBe('r2');
    expect(resolveStorageProvider(undefined)).toBe('r2');
    expect(resolveStorageProvider(null)).toBe('r2');
    expect(resolveStorageProvider('')).toBe('r2');
    expect(resolveStorageProvider('nonsense')).toBe('r2');
    expect(resolveStorageProvider(42)).toBe('r2');
  });

  it('honours an explicit setting in both directions', () => {
    expect(resolveStorageProvider('firebase')).toBe('firebase');
    expect(resolveStorageProvider('r2')).toBe('r2');
  });
});
