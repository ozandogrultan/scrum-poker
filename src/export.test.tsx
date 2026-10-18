import { describe, expect, it } from 'vitest';
import { csvCell, roomCsv } from './export';
import { snapshot } from './test-fixtures';

describe('CSV export', () => {
  it.each(['=HYPERLINK("https://invalid")', '  +2', '-5', '@SUM(1)', '\tinnocent', '\rtext', '\ntext', '\u0000=1'])('neutralizes formula-like cells: %j', value => {
    expect(csvCell(value)).toBe(`"'${value.replace(/"/g, '""')}"`);
  });
  it('quotes commas, double quotes, and line breaks without exporting capabilities', () => {
    const room = snapshot({ stories: [{ id: 'one', title: 'A "quoted", multiline\nstory', score: '5' }] });
    const output = roomCsv(room);
    expect(output).toContain('"A ""quoted"", multiline\nstory","5"');
    expect(output).not.toContain('fixture-only');
    expect(output).not.toContain(room.id);
  });
});
