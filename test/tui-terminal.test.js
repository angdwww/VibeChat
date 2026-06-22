import test from 'node:test';
import assert from 'node:assert/strict';
import { emitKeypressEvents } from 'node:readline';
import { PassThrough } from 'node:stream';
import {
  createRedrawScheduler,
  createMouseWheelDecoder,
  ENTER_FULLSCREEN,
  EXIT_FULLSCREEN,
  enterFullScreen,
  exitFullScreen
} from '../src/tui-terminal.js';

test('enters and exits the terminal alternate screen with bracketed paste', () => {
  const writes = [];
  const output = { write: (value) => writes.push(value) };

  enterFullScreen(output);
  exitFullScreen(output);

  assert.equal(writes[0], ENTER_FULLSCREEN);
  assert.match(writes[0], /\x1b\[\?1049h/);
  assert.match(writes[0], /\x1b\[\?2004h/);
  assert.match(writes[0], /\x1b\[\?1000h/);
  assert.doesNotMatch(writes[0], /\x1b\[\?1006h/);
  assert.match(writes[0], /\x1b\[\?1006l/);
  assert.equal(writes[1], EXIT_FULLSCREEN);
  assert.match(writes[1], /\x1b\[\?2004l/);
  assert.match(writes[1], /\x1b\[\?1049l/);
});

test('decodes legacy xterm mouse wheel events without passing them to the composer', () => {
  const directions = [];
  const decoder = createMouseWheelDecoder((direction) => directions.push(direction));
  const up = `\x1b[M${String.fromCharCode(96, 40, 44)}`;
  const down = `\x1b[M${String.fromCharCode(97, 40, 44)}`;

  assert.equal(decoder.push(`hello${up.slice(0, 4)}`), 'hello');
  assert.equal(decoder.push(`${up.slice(4)}${down}world`), 'world');

  assert.deepEqual(directions, ['up', 'down']);
});

test('filters mouse sequences before keyboard parsing so they cannot enter the composer', () => {
  const terminal = new PassThrough();
  const keyboard = new PassThrough();
  const directions = [];
  const decoder = createMouseWheelDecoder((direction) => directions.push(direction));
  const typed = [];
  emitKeypressEvents(keyboard);
  keyboard.on('keypress', (character) => {
    if (character) {
      typed.push(character);
    }
  });
  terminal.on('data', (chunk) => {
    const keyboardData = decoder.push(chunk);
    if (keyboardData) {
      keyboard.write(keyboardData);
    }
  });

  terminal.write('a\x1b[<64;40;12Mb');

  assert.deepEqual(directions, ['up']);
  assert.deepEqual(typed, ['a', 'b']);
});

test('coalesces repeated redraw requests and flushes once after paste', async () => {
  let draws = 0;
  const scheduler = createRedrawScheduler(() => {
    draws += 1;
  });

  scheduler.request();
  scheduler.request();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(draws, 1);

  scheduler.suspend();
  scheduler.request();
  scheduler.request();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(draws, 1);

  scheduler.resume();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(draws, 2);
});
