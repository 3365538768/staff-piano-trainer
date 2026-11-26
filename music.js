/* 谱间 — music theory and question generation. No runtime dependencies. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Music = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const SOLFEGE = ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si'];
  const NATURAL = [0, 2, 4, 5, 7, 9, 11];
  const ACCIDENTALS = { '-2': '𝄫', '-1': '♭', 0: '', 1: '♯', 2: '𝄪' };
  const CHORDS = {
    major: { name: '大三和弦', symbol: '', semis: [0, 4, 7], steps: [0, 2, 4] },
    minor: { name: '小三和弦', symbol: 'm', semis: [0, 3, 7], steps: [0, 2, 4] },
    dim: { name: '减三和弦', symbol: 'dim', semis: [0, 3, 6], steps: [0, 2, 4] },
    aug: { name: '增三和弦', symbol: 'aug', semis: [0, 4, 8], steps: [0, 2, 4] },
    sus2: { name: '挂二和弦', symbol: 'sus2', semis: [0, 2, 7], steps: [0, 1, 4] },
    sus4: { name: '挂四和弦', symbol: 'sus4', semis: [0, 5, 7], steps: [0, 3, 4] },
    dom7: { name: '属七和弦', symbol: '7', semis: [0, 4, 7, 10], steps: [0, 2, 4, 6] },
    maj7: { name: '大七和弦', symbol: 'maj7', semis: [0, 4, 7, 11], steps: [0, 2, 4, 6] },
    min7: { name: '小七和弦', symbol: 'm7', semis: [0, 3, 7, 10], steps: [0, 2, 4, 6] },
    halfdim7: { name: '半减七和弦', symbol: 'ø7', semis: [0, 3, 6, 10], steps: [0, 2, 4, 6] },
    dim7: { name: '减七和弦', symbol: 'dim7', semis: [0, 3, 6, 9], steps: [0, 2, 4, 6] }
  };
  const FAMILIES = { basic: ['major', 'minor'], triads: ['major', 'minor', 'dim', 'aug', 'sus2', 'sus4'], sevenths: ['dom7', 'maj7', 'min7', 'halfdim7', 'dim7'], all: Object.keys(CHORDS) };
  const INVERSIONS = ['原位', '第一转位', '第二转位', '第三转位'];
  const PATTERNS = { block: '柱式和弦', up: '上行分解', down: '下行分解', alberti: '阿尔贝蒂低音' };
  const DEFAULTS = { clef: 'treble', kind: 'single', family: 'basic', inversion: 'all', pattern: 'block', range: 'beginner', accidentals: 'natural', autoNext: true, labels: true, sound: true, volume: 55 };
  const ROOTS = [[0, 0], [1, -1], [1, 0], [2, -1], [2, 0], [3, 0], [3, 1], [4, 0], [5, -1], [5, 0], [6, -1], [6, 0]];
  const mod = (a, b) => ((a % b) + b) % b;
  function note(step, accidental = 0) {
    const letter = mod(step, 7), octave = Math.floor(step / 7);
    return { step, accidental, midi: (octave + 1) * 12 + NATURAL[letter] + accidental };
  }
  function fromMidi(midi) {
    const pc = mod(midi, 12), naturalIndex = NATURAL.indexOf(pc);
    const letter = naturalIndex < 0 ? NATURAL.indexOf(pc - 1) : naturalIndex;
    return note((Math.floor(midi / 12) - 1) * 7 + letter, naturalIndex < 0 ? 1 : 0);
  }
  function name(n, solfege = false) {
    return (solfege ? SOLFEGE[mod(n.step, 7)] : LETTERS[mod(n.step, 7)]) + ACCIDENTALS[n.accidental] + (solfege ? '' : Math.floor(n.step / 7));
  }
  function chord(root, quality, inversion = 0) {
    const def = CHORDS[quality];
    if (!def || inversion >= def.steps.length || inversion < 0) throw new Error('无效和弦');
    const notes = def.steps.map((offset, i) => {
      const natural = note(root.step + offset);
      return note(natural.step, root.midi + def.semis[i] - natural.midi);
    });
    return notes.slice(inversion).concat(notes.slice(0, inversion).map(n => note(n.step + 7, n.accidental)));
  }
  function settings(input = {}) {
    const s = { ...DEFAULTS };
    const choices = { clef: ['treble', 'bass', 'grand'], kind: ['single', 'chord', 'mixed'], family: Object.keys(FAMILIES), inversion: ['all', '0', '1', '2', '3'], pattern: ['block', 'up', 'down', 'alberti', 'mixed'], range: ['beginner', 'standard'], accidentals: ['natural', 'chromatic'] };
    for (const [k, values] of Object.entries(choices)) if (values.includes(input[k])) s[k] = input[k];
    for (const k of ['autoNext', 'labels', 'sound']) if (typeof input[k] === 'boolean') s[k] = input[k];
    if (Number.isFinite(input.volume)) s.volume = Math.min(100, Math.max(0, input.volume));
    return s;
  }
  function makeQuestion(spec) {
    const { clef, kind, rootStep, accidental = 0, quality = 'major', inversion = 0, pattern = 'block', upperStep, upperAccidental = 0 } = spec;
    if (!['treble', 'bass', 'grand'].includes(clef) || !['single', 'chord'].includes(kind) || !Number.isInteger(rootStep) || rootStep < 14 || rootStep > 42 || ![-1, 0, 1].includes(accidental) || !CHORDS[quality] || !Number.isInteger(inversion) || inversion < 0 || inversion >= CHORDS[quality].steps.length || !Object.hasOwn(PATTERNS, pattern)) throw new Error('题目数据无效');
    if (kind === 'single' && (pattern !== 'block' || quality !== 'major' || inversion !== 0)) throw new Error('单音题配置无效');
    if (kind === 'single' && clef === 'grand' && (!Number.isInteger(upperStep) || upperStep < 28 || upperStep > 42 || ![-1, 0, 1].includes(upperAccidental))) throw new Error('双谱表音高无效');
    const root = note(rootStep, accidental);
    let voices;
    if (kind === 'single') {
      voices = clef === 'grand' ? [{ clef: 'bass', notes: [root] }, { clef: 'treble', notes: [note(upperStep, upperAccidental)] }] : [{ clef, notes: [root] }];
    } else if (clef === 'grand') {
      voices = [{ clef: 'bass', notes: [root] }, { clef: 'treble', notes: chord(note(rootStep + 14, accidental), quality, inversion) }];
    } else voices = [{ clef, notes: chord(root, quality, inversion) }];
    const all = voices.flatMap(v => v.notes).sort((a, b) => a.midi - b.midi);
    if (all.some(n => n.midi < (clef === 'treble' ? 60 : 36) || n.midi > 96)) throw new Error('音高超出当前谱表练习范围');
    let sequence;
    if (pattern === 'down') sequence = [...all].reverse();
    else if (pattern === 'alberti') {
      // Low-high-middle-high; four-tone chords cycle through both middle voices.
      sequence = all.length === 3 ? [all[0], all[2], all[1], all[2], all[0], all[2], all[1], all[2]] : [all[0], all.at(-1), all[1], all.at(-1), all[0], all.at(-1), all[2], all.at(-1)];
      if (all.length === 5) sequence = [all[0], all[4], all[1], all[4], all[2], all[4], all[3], all[4]];
    } else sequence = all;
    const canonical = { clef, kind, rootStep, accidental, quality: kind === 'chord' ? quality : 'major', inversion: kind === 'chord' ? inversion : 0, pattern, ...(clef === 'grand' && kind === 'single' ? { upperStep, upperAccidental } : {}) };
    const id = Object.values(canonical).join(':');
    const title = kind === 'single' ? (clef === 'grand' ? '双手单音' : '单音识谱') : `${name(root).replace(/\d/g, '')}${CHORDS[quality].symbol} · ${INVERSIONS[inversion]}`;
    return { id, spec: canonical, voices, notes: all, sequence, block: pattern === 'block' && all.length > 1, title };
  }
  function bank(input) {
    const s = settings(input), out = [];
    const kinds = s.kind === 'mixed' ? ['single', 'chord'] : [s.kind];
    const roots = s.accidentals === 'natural' ? ROOTS.filter(r => r[1] === 0) : ROOTS;
    for (const kind of kinds) {
      if (kind === 'single') {
        const low = s.clef === 'treble' ? 28 : 14;
        const high = low + (s.range === 'beginner' ? 8 : 14);
        const candidates = [];
        for (let step = low; step <= high; step++) {
          const accidentals = [0], letter = mod(step, 7);
          if (s.accidentals === 'chromatic') {
            if (![2, 6].includes(letter)) accidentals.push(1);
            if (![0, 3].includes(letter)) accidentals.push(-1);
          }
          for (const accidental of accidentals) candidates.push({ step, accidental });
        }
        for (const r of candidates) {
          if (s.clef === 'grand') {
            for (const u of candidates) out.push(makeQuestion({ clef: s.clef, kind, rootStep: r.step, accidental: r.accidental, upperStep: u.step + 14, upperAccidental: u.accidental }));
          } else out.push(makeQuestion({ clef: s.clef, kind, rootStep: r.step, accidental: r.accidental }));
        }
      } else {
        for (const [letter, accidental] of roots) for (const quality of FAMILIES[s.family]) {
          const base = (s.clef === 'treble' ? 28 : 14) + letter;
          const invs = s.inversion === 'all' ? CHORDS[quality].steps.map((_, i) => i) : [Number(s.inversion)];
          for (const inversion of invs) {
            if (inversion >= CHORDS[quality].steps.length) continue;
            const notes = chord(note(base, accidental), quality, inversion);
            if (s.accidentals === 'natural' && notes.some(n => n.accidental !== 0)) continue;
            const patterns = s.pattern === 'mixed' ? ['block', 'up', 'down', 'alberti'] : [s.pattern];
            for (const pattern of patterns) out.push(makeQuestion({ clef: s.clef, kind, rootStep: base, accidental, quality, inversion, pattern }));
          }
        }
      }
    }
    return out;
  }
  function weight(record) {
    if (!record || !record.attempts) return 3;
    const accuracy = (record.correct + 1) / (record.attempts + 2);
    return 1 + 7 * (1 - accuracy) ** 2 + (record.review ? 3 : 0);
  }
  function pick(pool, stats, previousId, random = Math.random) {
    const available = pool.length > 1 ? pool.filter(q => q.id !== previousId) : pool;
    if (!available.length) return null;
    const weights = available.map(q => weight(stats[q.id]));
    let value = random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < available.length; i++) { value -= weights[i]; if (value <= 0) return available[i]; }
    return available.at(-1);
  }
  const WHITE_KEYS = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'];
  const BLACK_KEYS = { w: 1, e: 3, t: 6, y: 8, u: 10, o: 13 };
  function keyMidi(key, base) {
    const idx = WHITE_KEYS.indexOf(key.toLowerCase());
    return idx >= 0 ? base + NATURAL[idx % 7] + 12 * Math.floor(idx / 7) : Object.hasOwn(BLACK_KEYS, key.toLowerCase()) ? base + BLACK_KEYS[key.toLowerCase()] : null;
  }
  function exactChord(input, q) {
    const target = [...new Set(q.notes.map(n => n.midi))].sort((a, b) => a - b);
    const actual = [...new Set(input)].sort((a, b) => a - b);
    return target.length === actual.length && target.every((m, i) => m === actual[i]);
  }
  function keyboardRange(q) {
    const base = q.spec.clef === 'bass' ? 36 : 60;
    const min = q.spec.clef === 'treble' ? 60 : 36;
    // Include the complete A–L mapping at the highest needed octave.
    const max = Math.min(107, Math.max(min + 23, base + 14, Math.floor(q.notes.at(-1).midi / 12) * 12 + 14));
    return { base, min, max };
  }
  return { LETTERS, NATURAL, CHORDS, FAMILIES, INVERSIONS, PATTERNS, DEFAULTS, note, fromMidi, name, chord, settings, makeQuestion, bank, pick, weight, keyMidi, exactChord, keyboardRange, WHITE_KEYS, BLACK_KEYS };
});
