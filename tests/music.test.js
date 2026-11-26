const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../music.js');
const L = require('../learning.js');

const c = M.note(28);
const q = M.makeQuestion({ clef: 'treble', kind: 'chord', rootStep: 28, quality: 'major' });
test('五线谱音高基准与唱名准确', () => {
  assert.equal(c.midi, 60); assert.equal(M.name(c), 'C4'); assert.equal(M.name(c, true), 'Do');
  assert.equal(M.note(18).midi, 43); assert.equal(M.name(M.note(18)), 'G2');
  assert.equal(M.note(30).midi, 64); assert.equal(M.name(M.note(30)), 'E4');
  assert.equal(M.name(M.note(34, -1)), 'B♭4');
  for (let midi = 24; midi <= 107; midi++) assert.equal(M.fromMidi(midi).midi, midi);
});
test('C 大三和弦与各转位保留真实音高', () => {
  assert.deepEqual(M.chord(c, 'major', 0).map(n => n.midi), [60, 64, 67]);
  assert.deepEqual(M.chord(c, 'major', 1).map(n => n.midi), [64, 67, 72]);
  assert.deepEqual(M.chord(c, 'major', 2).map(n => n.midi), [67, 72, 76]);
  assert.throws(() => M.chord(c, 'major', 3));
});
test('七和弦第三转位和变化音拼写准确', () => {
  assert.deepEqual(M.chord(c, 'dom7', 3).map(n => M.name(n)), ['B♭4', 'C5', 'E5', 'G5']);
  assert.deepEqual(M.chord(c, 'dim7').map(n => M.name(n)), ['C4', 'E♭4', 'G♭4', 'B𝄫4']);
  assert.deepEqual(M.chord(M.note(29, -1), 'major').map(n => M.name(n)), ['D♭4', 'F4', 'A♭4']);
});
test('柱式判定忽略按键顺序，要求完整、正确的八度', () => {
  assert.equal(M.exactChord([67, 60, 64], q), true);
  assert.equal(M.exactChord([60, 64], q), false);
  assert.equal(M.exactChord([60, 64, 67, 69], q), false);
  assert.equal(M.exactChord([72, 76, 79], q), false);
});
test('分解和弦的上行、下行和阿尔贝蒂顺序', () => {
  const question = pattern => M.makeQuestion({ ...q.spec, pattern });
  assert.deepEqual(question('up').sequence.map(n => n.midi), [60, 64, 67]);
  assert.deepEqual(question('down').sequence.map(n => n.midi), [67, 64, 60]);
  assert.deepEqual(question('alberti').sequence.map(n => n.midi), [60, 67, 64, 67, 60, 67, 64, 67]);
});
test('双谱表同时保留低音与高音，分解覆盖两手全部音', () => {
  const grand = M.makeQuestion({ clef: 'grand', kind: 'chord', rootStep: 14, quality: 'maj7', inversion: 1, pattern: 'alberti' });
  assert.deepEqual(grand.voices.map(v => v.clef), ['bass', 'treble']);
  assert.equal(grand.notes[0].midi, 36); assert.equal(grand.notes.length, 5);
  assert.deepEqual(new Set(grand.sequence.map(n => n.midi)), new Set(grand.notes.map(n => n.midi)));
  const single = M.bank({ clef: 'grand' }); assert.equal(single.length, 81); assert.equal(single[0].block, true);
});
test('扩展白键到分号和引号，黑键按钢琴位置保留空位', () => {
  assert.deepEqual(M.WHITE_KEYS.map(k => M.keyMidi(k, 60)), [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77]);
  assert.deepEqual(Object.keys(M.BLACK_KEYS).map(k => M.keyMidi(k, 60)), [61, 63, 66, 68, 70, 73, 75]);
  for (const key of ['q', 'r', 'i', '[']) assert.equal(M.keyMidi(key, 60), null);
  assert.equal(M.keyMidi('A', 36), 36); assert.equal(M.KEYBOARD_SPAN, 17);
});
test('中文输入法和 Shift 标点仍按物理键位输入', () => {
  assert.equal(M.eventKey('Semicolon', '；'), ';'); assert.equal(M.eventKey('Semicolon', ':'), ';');
  assert.equal(M.eventKey('Quote', '‘'), "'"); assert.equal(M.eventKey('Quote', '"'), "'");
  assert.equal(M.eventKey('KeyP', 'Process'), 'p'); assert.equal(M.eventKey('KeyA', 'A'), 'a');
  assert.equal(M.eventKey('', '’'), "'"); assert.equal(M.eventKey('', '；'), ';');
});
test('和弦中文名称、符号和转位均明确显示，已有错题 ID 保持兼容', () => {
  assert.equal(q.title, 'C 大三和弦 · 原位'); assert.equal(q.chordSymbol, 'C');
  assert.equal(q.id, 'treble:chord:28:0:major:0:block');
  const seventh = M.makeQuestion({ ...q.spec, quality: 'maj7', inversion: 3 });
  assert.equal(seventh.title, 'C 大七和弦 · 第三转位'); assert.equal(seventh.chordSymbol, 'Cmaj7');
  const minor = M.makeQuestion({ ...q.spec, rootStep: 34, accidental: -1, quality: 'minor', inversion: 1 });
  assert.equal(minor.title, 'B♭ 小三和弦 · 第一转位'); assert.equal(minor.chordSymbol, 'B♭m');
});
test('完整题库谱面拼写、ID、排序和序列不变量', () => {
  for (const clef of ['treble', 'bass', 'grand']) for (const kind of ['single', 'chord', 'mixed']) for (const accidentalMode of ['natural', 'chromatic']) {
    const pool = M.bank({ clef, kind, accidentals: accidentalMode, family: 'all', pattern: 'mixed', range: 'standard' });
    assert.ok(pool.length); assert.equal(new Set(pool.map(q => q.id)).size, pool.length);
    for (const q of pool) {
      assert.deepEqual(M.makeQuestion(q.spec), q);
      assert.ok(q.notes.every(n => n.midi >= 24 && n.midi <= 107 && Math.abs(n.accidental) <= 2));
      assert.ok(q.notes.every((n, i) => i === 0 || n.midi >= q.notes[i - 1].midi));
      assert.ok(q.sequence.every(n => q.notes.some(t => t.midi === n.midi)));
      assert.deepEqual(new Set(q.sequence.map(n => n.midi)), new Set(q.notes.map(n => n.midi)));
      const range = M.keyboardRange(q), reachable = new Set();
      for (let base = range.min; base + M.KEYBOARD_SPAN <= range.max; base += 12) for (const key of [...M.WHITE_KEYS, ...Object.keys(M.BLACK_KEYS)]) reachable.add(M.keyMidi(key, base));
      assert.ok(q.notes.every(n => reachable.has(n.midi)), '每个音都必须能通过 Z/X 和电脑键盘弹出');
      if (accidentalMode === 'natural') assert.ok(q.notes.every(n => n.accidental === 0));
    }
  }
});
test('无效设置组合返回空题库；设置输入采用白名单', () => {
  assert.equal(M.bank({ kind: 'chord', family: 'basic', inversion: '3' }).length, 0);
  assert.equal(M.settings({ clef: 'bad', volume: 200, sound: 'false' }).clef, 'treble');
  assert.equal(M.settings({ volume: 200 }).volume, 100);
  const chromatic = M.bank({ accidentals: 'chromatic' });
  assert.ok(chromatic.some(q => q.notes[0].accidental === -1));
  assert.ok(chromatic.some(q => q.notes[0].accidental === 1));
});
test('错题必须连续两次正确移除，错误重置进度，重新答错再次入列', () => {
  const s = L.empty();
  L.record(s, q, false, 500); assert.equal(L.reviews(s).length, 1);
  L.record(s, q, true, 500); assert.equal(s.stats[q.id].reviewStreak, 1); assert.equal(L.reviews(s).length, 1);
  L.record(s, q, false, 500); assert.equal(s.stats[q.id].reviewStreak, 0);
  L.record(s, q, true, 500); const result = L.record(s, q, true, 500);
  assert.equal(result.removed, true); assert.equal(L.reviews(s).length, 0);
  assert.equal(s.stats[q.id].wrong, 2); assert.equal(s.stats[q.id].correct, 3);
  L.record(s, q, false, 500); assert.equal(L.reviews(s).length, 1); assert.equal(s.stats[q.id].reviewStreak, 0);
});
test('查看答案和跳过按未掌握计入记录，普通正确不凭空进入错题', () => {
  const s = L.empty(); L.record(s, q, true, 300); assert.equal(L.reviews(s).length, 0);
  L.record(s, q, false, 300, 'reveal'); assert.equal(L.reviews(s).length, 1);
  L.record(s, q, false, 300, 'skip'); assert.equal(L.totals(s).attempts, 3); assert.equal(L.totals(s).correct, 1);
});
test('自适应权重偏向薄弱题、新题和待复习题；有其他题时避免连续重复', () => {
  assert.ok(M.weight({ attempts: 10, correct: 1 }) > M.weight({ attempts: 10, correct: 9 }));
  assert.ok(M.weight(null) > M.weight({ attempts: 100, correct: 100 }));
  assert.ok(M.weight({ attempts: 10, correct: 5, review: true }) > M.weight({ attempts: 10, correct: 5 }));
  const pool = M.bank({}); assert.notEqual(M.pick(pool, {}, pool[0].id, () => 0).id, pool[0].id);
  assert.equal(M.pick([q], {}, q.id).id, q.id); assert.equal(M.pick([], {}), null);
});
test('备份往返保留正确率、错题连续进度和本地日期', () => {
  const s = L.empty(); L.record(s, q, false, 500); L.record(s, q, true, 400);
  assert.deepEqual(L.validate(JSON.parse(JSON.stringify(s))), s);
  assert.equal(L.dayKey(new Date(2026, 10, 26, 1)), '2026-11-26');
});
test('导入拒绝不兼容版本、伪造音高、错误计数和脚本数据', () => {
  assert.throws(() => L.validate({ version: 9, stats: {} }));
  const s = L.empty(); L.record(s, q, false, 300);
  const clone = () => JSON.parse(JSON.stringify(s));
  const a = clone(); a.stats[q.id].spec.rootStep = 999; assert.throws(() => L.validate(a));
  const b = clone(); b.stats[q.id].correct = 99; assert.throws(() => L.validate(b));
  const c = clone(); c.stats[q.id].spec.quality = '<script>'; assert.throws(() => L.validate(c));
  assert.throws(() => M.makeQuestion({ clef: 'treble', kind: 'single', rootStep: 28, pattern: 'alberti' }));
  assert.throws(() => M.makeQuestion({ clef: 'treble', kind: 'single', rootStep: 14 }));
});
