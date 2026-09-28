import assert from 'node:assert/strict';
import { test } from 'node:test';
import { identity, LOCAL_USER_ID } from '../lib/server';

test('study endpoints accept only loopback requests and same-origin writes', async () => {
  assert.equal(await identity(new Request('http://127.0.0.1:5173/api/study')), LOCAL_USER_ID);
  await assert.rejects(identity(new Request('http://example.com/api/study')), { status: 403 });
  await assert.rejects(identity(new Request('http://127.0.0.1:5173/api/study', {
    method: 'POST', headers: { origin: 'https://example.com' },
  }), true), { status: 403 });
  assert.equal(await identity(new Request('http://127.0.0.1:5173/api/study', {
    method: 'POST', headers: { origin: 'http://127.0.0.1:5173' },
  }), true), LOCAL_USER_ID);
});
