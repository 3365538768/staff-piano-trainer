/* Sample-only grand piano playback. The recordings and their license live in assets/. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PianoAudio = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  function closestSample(samples, midi) {
    if (!Number.isFinite(midi) || !samples.length) throw new Error('无效钢琴音高');
    return samples.reduce((best, sample) => Math.abs(sample.midi - midi) < Math.abs(best.midi - midi) ? sample : best);
  }
  class GrandPiano {
    constructor({ samples = root.GrandPianoSamples, onError = () => {}, contextFactory } = {}) {
      if (!samples || !Array.isArray(samples.samples) || !samples.samples.length) throw new Error('三角钢琴音源缺失');
      this.samples = samples.samples;
      this.onError = onError;
      this.contextFactory = contextFactory || (() => new (root.AudioContext || root.webkitAudioContext)());
      this.context = null; this.master = null; this.volume = .55;
      this.buffers = new Map(); this.loading = new Map(); this.voices = new Map();
      this.preparePromise = null; this.reportedError = false;
    }
    report(error) {
      if (!this.reportedError) { this.reportedError = true; this.onError(error); }
    }
    prepare() {
      if (this.preparePromise) return this.preparePromise;
      try {
        // Decoding offline is allowed before the first gesture, and needs no file:// fetch.
        const Offline = root.OfflineAudioContext || root.webkitOfflineAudioContext;
        const decoder = new Offline(2, 1, 44100);
        for (const sample of this.samples) {
          const bytes = Uint8Array.from(root.atob(sample.data), ch => ch.charCodeAt(0));
          const promise = decoder.decodeAudioData(bytes.buffer).then(buffer => { this.buffers.set(sample.midi, buffer); return buffer; });
          this.loading.set(sample.midi, promise);
        }
        this.preparePromise = Promise.all([...this.loading.values()]);
      } catch (error) { this.preparePromise = Promise.reject(error); }
      this.preparePromise.catch(error => this.report(error));
      return this.preparePromise;
    }
    unlock() {
      if (!this.context) {
        this.context = this.contextFactory(); this.master = this.context.createGain();
        this.master.gain.value = this.volume * .7;
        // Direct recording playback: no synthesized layers or added spatial effects.
        this.master.connect(this.context.destination);
      }
      if (this.context.state === 'suspended') this.context.resume().catch(error => this.report(error));
    }
    setVolume(value) {
      this.volume = Math.min(1, Math.max(0, value));
      if (this.master) this.master.gain.setTargetAtTime(this.volume * .7, this.context.currentTime, .02);
    }
    noteOn(midi, token) {
      try { this.unlock(); this.prepare(); }
      catch (error) { this.report(error); return; }
      // Retriggers get their own source; keyup must never stop a newer note by mistake.
      const old = this.voices.get(token); if (old) this.cancel(old);
      if (this.voices.size >= 64) this.cancel(this.voices.values().next().value);
      const sample = closestSample(this.samples, midi);
      const voice = { token, midi, rootMidi: sample.midi, source: null, gain: null, released: false, cancelled: false, releaseScheduled: false };
      this.voices.set(token, voice);
      const start = buffer => {
        if (voice.cancelled || this.voices.get(token) !== voice) return;
        const now = this.context.currentTime, source = this.context.createBufferSource(), gain = this.context.createGain();
        source.buffer = buffer; source.playbackRate.value = 2 ** ((midi - sample.midi) / 12);
        gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(1, now + .003);
        source.connect(gain); gain.connect(this.master);
        Object.assign(voice, { source, gain, startedAt: now });
        source.onended = () => { source.disconnect(); gain.disconnect(); if (this.voices.get(token) === voice) this.voices.delete(token); };
        source.start(now);
        // Preserve a quick tap made while its sample was still decoding.
        if (voice.released) this.release(voice);
      };
      if (this.buffers.has(sample.midi)) start(this.buffers.get(sample.midi));
      else {
        const pending = this.loading.get(sample.midi);
        if (!pending) { this.cancel(voice); return; }
        pending.then(start).catch(error => { this.cancel(voice); this.report(error); });
      }
    }
    release(voice, fast = false) {
      if (!voice.source || voice.releaseScheduled) return;
      voice.releaseScheduled = true;
      const now = this.context.currentTime;
      const start = fast ? now : Math.max(now, voice.startedAt + .035);
      const end = start + (fast ? .025 : voice.midi < 72 ? .55 : .4);
      const gain = voice.gain.gain;
      if (typeof gain.cancelAndHoldAtTime === 'function') gain.cancelAndHoldAtTime(start);
      else { gain.cancelScheduledValues(start); gain.setValueAtTime(Math.max(.0001, gain.value), start); }
      gain.linearRampToValueAtTime(0, end);
      try { voice.source.stop(end + .005); } catch (_) {}
    }
    noteOff(token) {
      const voice = this.voices.get(token); if (!voice) return;
      voice.released = true; this.release(voice);
    }
    cancel(voice) {
      voice.cancelled = true;
      if (voice.source) {
        // A stop command also shortens an already scheduled normal release.
        voice.releaseScheduled = false; this.release(voice, true);
      }
      if (this.voices.get(voice.token) === voice) this.voices.delete(voice.token);
    }
    stopAll() { for (const voice of [...this.voices.values()]) this.cancel(voice); }
  }
  return { GrandPiano, closestSample };
});
