import { describe, it, expect, beforeEach } from 'vitest';

describe('scroll lock', () => {
  let body: { style: { overflow: string } };
  beforeEach(() => { body = { style: { overflow: '' } }; (globalThis as unknown as { document: unknown }).document = { body }; });

  it('is never left on, whatever order two overlays close in', async () => {
    const { lockScroll, scrollLockHolders } = await import('./scrollLock');
    const a = lockScroll(); const b = lockScroll();
    expect(body.style.overflow).toBe('hidden');
    a(); expect(body.style.overflow).toBe('hidden');
    b(); expect(body.style.overflow).toBe('');
    const c = lockScroll(); const d = lockScroll();
    d(); c(); c(); c(); // releasing twice must not unlock someone else's hold
    expect(body.style.overflow).toBe(''); expect(scrollLockHolders()).toBe(0);
    const e = lockScroll(); c(); expect(body.style.overflow).toBe('hidden'); e();
    expect(body.style.overflow).toBe('');
  });
});
