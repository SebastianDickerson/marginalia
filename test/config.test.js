import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultConfig, buildConfig } from '../src/config.js';

test('defaultConfig is frozen', () => {
  assert.ok(Object.isFrozen(defaultConfig));
});

test('defaultConfig has no server.port (Worker has no listen port)', () => {
  assert.equal(defaultConfig.server?.port, undefined);
});

test('buildConfig overlays MODEL', () => {
  const cfg = buildConfig({ MODEL: 'claude-sonnet-test' });
  assert.equal(cfg.narrator.model, 'claude-sonnet-test');
});

test('buildConfig falls back to default model when env empty', () => {
  const cfg = buildConfig({});
  assert.equal(cfg.narrator.model, defaultConfig.narrator.model);
});

test('buildConfig overlays ELEVENLABS_MODEL_ID + DAILY_CHAR_CAP', () => {
  const cfg = buildConfig({
    ELEVENLABS_MODEL_ID: 'eleven_test',
    ELEVENLABS_DAILY_CHAR_CAP: '1234',
  });
  assert.equal(cfg.tts.elevenlabs.modelId, 'eleven_test');
  assert.equal(cfg.tts.elevenlabs.dailyCharCap, 1234);
});

test('buildConfig parses DAILY_CHAR_CAP as number; rejects NaN → default', () => {
  const cfg = buildConfig({ ELEVENLABS_DAILY_CHAR_CAP: 'not-a-number' });
  assert.equal(cfg.tts.elevenlabs.dailyCharCap, defaultConfig.tts.elevenlabs.dailyCharCap);
});
