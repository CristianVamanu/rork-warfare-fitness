import { describe, it, expect } from 'vitest';
import { harvestImageUrls } from '@/lib/shop/providers';
describe('harvestImageUrls', () => {
  it('finds gallery and nested urls, skips print files and variants when asked', () => {
    const p = {
      previewUrl: 'https://x/a.png',
      productImages: [{ id: 1, fileUrl: 'https://storage.googleapis.com/g/b?X-Goog=1' }, { fileUrl: 'https://x/c.jpg' }],
      printFileUrl: 'https://x/art.png',
      files: [{ type: 'default', url: 'https://x/notimage' }],
      variants: [{ imageUrl: 'https://x/v.png' }],
    };
    expect(harvestImageUrls(p, ['variants'])).toEqual(['https://x/a.png', 'https://storage.googleapis.com/g/b?X-Goog=1', 'https://x/c.jpg']);
    expect(harvestImageUrls(p.variants[0])).toEqual(['https://x/v.png']);
  });
});
