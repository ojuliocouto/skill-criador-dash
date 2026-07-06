import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldCache } from '../functions/_middleware.js';

test('shouldCache: cacheia JSON 200 nao vazio', () => {
  assert.equal(shouldCache(200, 'application/json', '{"columns":["a"],"rows":[{}]}'), true);
  assert.equal(shouldCache(200, 'application/json; charset=utf-8', '[1,2]'), true);
});

test('shouldCache: NAO cacheia HTML (fallback de SPA durante deploy)', () => {
  assert.equal(shouldCache(200, 'text/html', '<meta charset="utf-8">...'), false);
  assert.equal(shouldCache(200, 'text/html; charset=utf-8', '<!doctype html>'), false);
});

test('shouldCache: NAO cacheia vazio, [] ou {}', () => {
  assert.equal(shouldCache(200, 'application/json', ''), false);
  assert.equal(shouldCache(200, 'application/json', '[]'), false);
  assert.equal(shouldCache(200, 'application/json', '{}'), false);
});

test('shouldCache: NAO cacheia status != 200', () => {
  assert.equal(shouldCache(404, 'application/json', '{"error":"x"}'), false);
  assert.equal(shouldCache(500, 'application/json', '{"error":"x"}'), false);
});
