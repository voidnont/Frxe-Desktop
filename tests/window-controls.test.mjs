import test from 'node:test';
import assert from 'node:assert/strict';
import { requestAppExit } from '../web/window-controls.mjs';

test('close requests native app exit instead of normal window close', async () => {
  const calls = [];
  let closed = false;
  const result = await requestAppExit({
    invoke: async (command) => { calls.push(command); },
    currentWindow: { close: async () => { closed = true; } },
  });
  assert.equal(result, 'native-exit');
  assert.deepEqual(calls, ['exit_app']);
  assert.equal(closed, false);
});

test('close falls back to destroying the window if native exit fails', async () => {
  let destroyed = false;
  const result = await requestAppExit({
    invoke: async () => { throw new Error('native unavailable'); },
    currentWindow: { destroy: async () => { destroyed = true; } },
  });
  assert.equal(result, 'destroy');
  assert.equal(destroyed, true);
});
