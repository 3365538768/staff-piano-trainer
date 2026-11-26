(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./music.js') : root.Music);
  if (typeof module === 'object' && module.exports) module.exports = api; else root.Learning = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M) {
  'use strict';
  const VERSION = 1, STORAGE_KEY = 'pujian-piano-v1';
  function empty() { return { version: VERSION, settings: { ...M.DEFAULTS }, stats: {}, daily: {}, history: [] }; }
  function dayKey(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
  function record(state, q, correct, elapsedMs, reason = 'answer', now = new Date()) {
    let r = state.stats[q.id];
    if (!r) r = state.stats[q.id] = { spec: q.spec, attempts: 0, correct: 0, wrong: 0, streak: 0, review: false, reviewStreak: 0, totalMs: 0, lastAt: '' };
    const wasReview = r.review;
    r.attempts++; r.correct += Number(correct); r.wrong += Number(!correct);
    r.streak = correct ? r.streak + 1 : 0;
    r.totalMs += Math.round(Math.max(0, Math.min(elapsedMs, 3600000)));
    r.lastAt = now.toISOString();
    if (!correct) { r.review = true; r.reviewStreak = 0; }
    else if (r.review) { r.reviewStreak++; if (r.reviewStreak >= 2) { r.review = false; r.reviewStreak = 0; } }
    const day = dayKey(now), d = state.daily[day] || (state.daily[day] = { attempts: 0, correct: 0 });
    d.attempts++; d.correct += Number(correct);
    state.history.push({ id: q.id, correct, at: now.toISOString(), reason });
    state.history = state.history.slice(-4000);
    return { wasReview, removed: wasReview && !r.review, reviewStreak: r.reviewStreak };
  }
  function reviews(state) { return Object.values(state.stats).filter(r => r.review).map(r => ({ ...r, q: M.makeQuestion(r.spec) })); }
  function totals(state) { return Object.values(state.stats).reduce((a, r) => ({ attempts: a.attempts + r.attempts, correct: a.correct + r.correct, totalMs: a.totalMs + r.totalMs }), { attempts: 0, correct: 0, totalMs: 0 }); }
  function validate(raw) {
    if (!raw || raw.version !== VERSION || typeof raw.stats !== 'object' || !raw.stats || Array.isArray(raw.stats)) throw new Error('这不是有效的谱间备份文件（版本 1）。');
    const state = empty(); state.settings = M.settings(raw.settings);
    const entries = Object.entries(raw.stats);
    if (entries.length > 40000) throw new Error('备份记录过多。');
    const number = (n, max = 1e9) => Number.isSafeInteger(n) && n >= 0 && n <= max;
    for (const [id, r] of entries) {
      const q = M.makeQuestion(r.spec);
      if (id !== q.id || !number(r.attempts) || !number(r.correct) || !number(r.wrong) || r.attempts !== r.correct + r.wrong || !number(r.streak) || r.streak > r.correct || typeof r.review !== 'boolean' || ![0, 1].includes(r.reviewStreak) || (!r.review && r.reviewStreak !== 0) || !number(r.totalMs, Number.MAX_SAFE_INTEGER) || typeof r.lastAt !== 'string' || !Number.isFinite(Date.parse(r.lastAt))) throw new Error('备份中的练习记录不完整。');
      state.stats[id] = { spec: q.spec, attempts: r.attempts, correct: r.correct, wrong: r.wrong, streak: r.streak, review: r.review, reviewStreak: r.reviewStreak, totalMs: r.totalMs, lastAt: r.lastAt };
    }
    if (raw.daily && typeof raw.daily === 'object') for (const [day, d] of Object.entries(raw.daily)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(day) && number(d.attempts) && number(d.correct) && d.correct <= d.attempts) state.daily[day] = { attempts: d.attempts, correct: d.correct };
    }
    if (Array.isArray(raw.history)) state.history = raw.history.slice(-4000).filter(h => h && Object.hasOwn(state.stats, h.id) && typeof h.correct === 'boolean' && typeof h.at === 'string' && Number.isFinite(Date.parse(h.at))).map(h => ({ id: h.id, correct: h.correct, at: h.at, reason: ['answer', 'reveal', 'skip'].includes(h.reason) ? h.reason : 'answer' }));
    return state;
  }
  return { VERSION, STORAGE_KEY, empty, dayKey, record, reviews, totals, validate };
});
