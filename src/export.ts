import type { RoomSnapshot } from '../shared/types';

export function csvCell(value: string): string {
  const safe = /^[\t\r\n]/.test(value) || /^[\s\u0000-\u001f]*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function roomCsv(room: RoomSnapshot): string {
  return '\uFEFF' + [['Story', 'Agreed estimate'], ...room.stories.map(story => [story.title, story.score ?? ''])].map(row => row.map(csvCell).join(',')).join('\r\n');
}

export function downloadCsv(room: RoomSnapshot) {
  const blob = new Blob([roomCsv(room)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${room.title.replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 70) || 'scrum-poker'}-estimates.csv`;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
