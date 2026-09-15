import { describe, it, expect } from 'vitest';
import { csvEscape, toCsv } from './csv';

/**
 * Exported leads are opened in Excel or Sheets, and both treat a cell starting
 * with =, +, - or @ as a formula even when it is quoted. A lead is filled in by
 * a stranger on a public form, so this is the one place their text becomes
 * something that can run on the admin's machine.
 */

describe('csvEscape', () => {
  it('quotes ordinary values', () => {
    expect(csvEscape('Cristian')).toBe('"Cristian"');
    expect(csvEscape(42)).toBe('"42"');
  });

  it('doubles embedded quotes so the cell does not end early', () => {
    expect(csvEscape('He said "hi"')).toBe('"He said ""hi"""');
  });

  it('keeps a comma inside one cell', () => {
    expect(toCsv(['A', 'B'], [['x,y', 'z']])).toBe('"A","B"\r\n"x,y","z"');
  });

  it('defuses every formula lead-in a spreadsheet acts on', () => {
    for (const bad of ['=1+1', '+1', '-1', '@SUM(A1)', '\tx', '\rx']) {
      expect(csvEscape(bad).startsWith('"\'')).toBe(true);
    }
  });

  it('leaves a minus sign alone in the middle of a value', () => {
    // Only the first character decides, so a real phone number or a date must
    // not get an apostrophe glued to the front of it.
    expect(csvEscape('07700 900-123')).toBe('"07700 900-123"');
    expect(csvEscape('2026-09-13')).toBe('"2026-09-13"');
  });

  it('separates rows with CRLF, which is what spreadsheets expect', () => {
    expect(toCsv(['H'], [['a'], ['b']])).toBe('"H"\r\n"a"\r\n"b"');
  });
});
