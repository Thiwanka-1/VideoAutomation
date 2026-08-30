import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSrt, srtTimestamp, wrapSubtitle } from '../src/subtitles.js';

test('formats SRT timestamps with millisecond rollover', () => {
  assert.equal(srtTimestamp(61.2346), '00:01:01,235');
});

test('wraps long subtitle text', () => {
  const wrapped = wrapSubtitle('A subtitle line that should wrap cleanly into multiple readable lines', 24);
  assert.ok(wrapped.includes('\n'));
  assert.ok(wrapped.split('\n').every((line) => line.length <= 24));
});

test('builds numbered subtitle cues', () => {
  const srt = buildSrt(
    [{ character: 'Ada', text: 'It works on my machine.' }],
    [{ start: 0, end: 1.5 }],
  );
  assert.match(srt, /^1\n00:00:00,000 --> 00:00:01,500\nADA:/);
});
