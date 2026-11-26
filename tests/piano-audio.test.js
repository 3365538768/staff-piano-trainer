const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const crypto = require('node:crypto');
const { closestSample } = require('../piano-audio.js');
const bundle = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/grand-piano.js'), 'utf8'), bundle);
const samples = bundle.window.GrandPianoSamples.samples;

test('25 个离线采样字节完整，覆盖全部可弹半音且只需最多移调一个半音', () => {
  assert.equal(samples.length, 25);
  for (const sample of samples) {
    const bytes = Buffer.from(sample.data, 'base64');
    assert.equal(bytes.byteLength, sample.bytes);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), sample.sha256);
    assert.equal(bytes.toString('ascii', 0, 3), 'ID3');
  }
  for (let midi = 36; midi <= 107; midi++) assert.ok(Math.abs(closestSample(samples, midi).midi - midi) <= 1);
});

function harness() {
  const decodes = [], sources = [];
  const param = () => ({ value: 1, setValueAtTime(v) { this.value = v; }, linearRampToValueAtTime(v) { this.value = v; }, setTargetAtTime(v) { this.value = v; }, cancelAndHoldAtTime() {} });
  const ctx = { currentTime: 0, state: 'running', destination: {}, createGain: () => ({ gain: param(), connect() {}, disconnect() {} }), createBufferSource() { const s = { playbackRate: { value: 1 }, connect() {}, disconnect() {}, start() { this.started = true; }, stop(at) { this.stopAt = at; } }; sources.push(s); return s; } };
  const env = { atob, OfflineAudioContext: class { decodeAudioData() { return new Promise(resolve => decodes.push(resolve)); } } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../piano-audio.js'), 'utf8'), env);
  const piano = new env.PianoAudio.GrandPiano({ samples: { samples: [{ midi: 60, data: 'AQID' }, { midi: 63, data: 'AQID' }] }, contextFactory: () => ctx });
  return { piano, sources, ctx, async ready() { const p = piano.prepare(); decodes.forEach(resolve => resolve({ duration: 10 })); await p; } };
}

test('采样解码期间的短按仍能发声并正确收音', async () => {
  const h = harness(); h.piano.noteOn(61, 'key'); h.piano.noteOff('key');
  assert.equal(h.sources.length, 0);
  await h.ready();
  assert.equal(h.sources.length, 1); assert.equal(h.sources[0].started, true);
  assert.equal(h.sources[0].playbackRate.value, 2 ** (1 / 12));
  assert.ok(h.sources[0].stopAt > .035);
});

test('切题、静音或失焦取消未解码按键，完成解码后不产生迟到的声音', async () => {
  const h = harness(); h.piano.noteOn(60, 'key'); h.piano.stopAll(); await h.ready();
  assert.equal(h.sources.length, 0); assert.equal(h.piano.voices.size, 0);
});

test('快速重弹同键时旧音结束不会移除新音，停止会缩短松键尾音', async () => {
  const h = harness(); await h.ready(); h.piano.noteOn(60, 'key');
  const old = h.sources[0]; h.piano.noteOn(60, 'key'); old.onended();
  assert.equal(h.piano.voices.size, 1); assert.equal(h.piano.voices.get('key').source, h.sources[1]);
  h.piano.noteOff('key'); const normalStop = h.sources[1].stopAt;
  h.piano.stopAll(); assert.ok(h.sources[1].stopAt < normalStop); assert.equal(h.piano.voices.size, 0);
});

test('多声部保留和弦，音量变化应用到现有声音，多音数量有界', async () => {
  const h = harness(); await h.ready();
  for (const n of [60, 64, 67]) h.piano.noteOn(n, 'chord' + n);
  assert.equal(h.piano.voices.size, 3);
  h.piano.setVolume(.8); assert.equal(h.piano.master.gain.value, .8 * .7);
  for (let i = 0; i < 100; i++) h.piano.noteOn(60, 'extra' + i);
  assert.equal(h.piano.voices.size, 64);
});
