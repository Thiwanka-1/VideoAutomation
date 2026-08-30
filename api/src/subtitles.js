import fs from 'node:fs/promises';

export function srtTimestamp(seconds) {
  const milliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const secs = Math.floor((milliseconds % 60_000) / 1000);
  const millis = milliseconds % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

export function wrapSubtitle(value, maxColumns = 38) {
  const words = value.replace(/[\r\n]+/g, ' ').trim().split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    if (!current) current = word;
    else if (`${current} ${word}`.length <= maxColumns) current += ` ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.join('\n');
}

export function buildSrt(dialogue, timings) {
  if (dialogue.length !== timings.length) {
    throw new Error('Dialogue and subtitle timing counts do not match.');
  }
  return dialogue.map((line, index) => {
    const text = wrapSubtitle(`${line.character.toUpperCase()}: ${line.text}`);
    return `${index + 1}\n${srtTimestamp(timings[index].start)} --> ${srtTimestamp(timings[index].end)}\n${text}\n`;
  }).join('\n');
}

export async function writeSubtitles({ dialogue, timings, outputPath }) {
  await fs.writeFile(outputPath, buildSrt(dialogue, timings), 'utf8');
  return outputPath;
}
