/* Browser controller. Classic scripts intentionally support file:// and offline use. */
(function () {
  'use strict';
  const M = window.Music, L = window.Learning;
  const $ = id => document.getElementById(id);
  const paths = {
    staff: '<path d="M3 6h18M3 10h18M3 14h18M3 18h18M15 3v12"/><ellipse cx="12" cy="16" rx="3" ry="2"/>',
    repeat: '<path d="m17 2 4 4-4 4M3 11V8a2 2 0 0 1 2-2h16M7 22l-4-4 4-4m14-1v3a2 2 0 0 1-2 2H3"/>',
    chart: '<path d="M4 3v17h17M8 15v-4m5 4V7m5 8V4"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 8.5a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4M12 16h.01"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/>',
    shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6"/>',
    volume: '<path d="m11 5-6 4H2v6h3l6 4zm4 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
    mute: '<path d="m11 5-6 4H2v6h3l6 4zm5 4 5 6m0-6-5 6"/>',
    sliders: '<path d="M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-6 0v6"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    note: '<path d="M9 18V5l12-2v13M9 8l12-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="18" cy="16" rx="3" ry="2"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
  };
  const icon = name => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.note}</svg>`;
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });
  let state = L.empty(), view = 'practice', pool = [], current = null, answered = false, selected = new Set(), stepIndex = 0;
  let activeBase = 60, pianoMin = 48, pianoMax = 83, startedAt = 0, questionNumber = 0, nextTimer = null, toastTimer = null;
  const session = { count: 0, correct: 0, streak: 0 };
  const held = new Map(), activePointers = new Map();
  let storageAvailable = true;
  try {
    const raw = localStorage.getItem(L.STORAGE_KEY);
    if (raw) state = L.validate(JSON.parse(raw));
    localStorage.setItem('pujian-storage-check', '1'); localStorage.removeItem('pujian-storage-check');
  } catch (error) {
    storageAvailable = false;
    $('storage-warning').hidden = false;
    $('storage-warning').textContent = '本地记录暂时无法读取或保存。当前练习仍可继续，请在“数据与备份”中导出；原记录未被覆盖。' + (error instanceof SyntaxError ? ' 记录格式损坏。' : '');
  }
  function save() {
    if (!storageAvailable) return;
    try { localStorage.setItem(L.STORAGE_KEY, JSON.stringify(state)); }
    catch (_) { storageAvailable = false; $('storage-warning').hidden = false; $('storage-warning').textContent = '浏览器未能保存记录（可能存储已满）。请及时导出备份。'; }
  }
  function toast(message) {
    $('toast').textContent = message; $('toast').hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3500);
  }
  const clefName = clef => ({ treble: '高音谱表', bass: '低音谱表', grand: '高音 + 低音' })[clef];
  const percent = (correct, total) => total ? `${Math.round(correct / total * 100)}%` : '—';
  function shortDescription(q) { return `${clefName(q.spec.clef)} · ${q.spec.kind === 'single' ? '单音' : M.PATTERNS[q.spec.pattern]}`; }
  function answerText(q) {
    const notes = q.block ? q.notes : q.sequence;
    return notes.map(n => `${M.name(n)} (${M.name(n, true)})`).join(q.block ? ' + ' : ' · ');
  }
  function syncSettings() {
    document.querySelectorAll('[data-setting]').forEach(el => { el.value = state.settings[el.dataset.setting]; });
    document.querySelectorAll('[data-clef]').forEach(el => { const on = el.dataset.clef === state.settings.clef; el.classList.toggle('selected', on); el.setAttribute('aria-pressed', String(on)); });
    $('auto-check').checked = state.settings.autoNext; $('labels-check').checked = state.settings.labels;
    $('volume-slider').value = state.settings.volume;
    $('sound-button').innerHTML = icon(state.settings.sound ? 'volume' : 'mute');
    $('sound-button').setAttribute('aria-label', state.settings.sound ? '关闭声音' : '开启声音');
    $('pattern-select').disabled = state.settings.kind === 'single';
    $('family-select').disabled = state.settings.kind === 'single'; $('inversion-select').disabled = state.settings.kind === 'single';
  }
  function updateStats() {
    const reviews = L.reviews(state), today = state.daily[L.dayKey()] || { attempts: 0, correct: 0 };
    $('review-count').textContent = reviews.length; $('today-count').innerHTML = `${today.attempts} <small>题</small>`;
    $('daily-fill').style.width = Math.min(100, today.attempts / 20 * 100) + '%';
    $('daily-caption').textContent = today.attempts ? `今日正确率 ${percent(today.correct, today.attempts)} · ${today.attempts >= 20 ? '已完成 20 题参考目标' : '每日参考 20 题'}` : '从第一个音开始 · 每日参考 20 题';
    $('session-accuracy').textContent = percent(session.correct, session.count);
    $('accuracy-ring').style.background = `conic-gradient(var(--green) ${session.count ? session.correct / session.count * 360 : 0}deg,#dae3cf 0deg)`;
    $('session-count').textContent = session.count; $('session-streak').textContent = session.streak;
    if (view === 'review') renderReviewList();
  }
  function cancelNext() { clearTimeout(nextTimer); nextTimer = null; }
  function setView(nextView) {
    cancelNext(); stopAll(); view = nextView;
    document.querySelectorAll('[data-view]').forEach(el => { const on = el.dataset.view === view; el.classList.toggle('active', on); if (on) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current'); });
    $('trainer-view').hidden = view === 'progress'; $('progress-view').hidden = view !== 'progress';
    const titles = { practice: ['READ. PLAY. REMEMBER.', '把看到的，弹出来', '从一个音到一组和弦，在指尖记住五线谱。'], review: ['REPEAT. REFINE. REMEMBER.', '把错过的，再弹对', '每道错题连续答对两次，让记忆更扎实。'], progress: ['SMALL STEPS. REAL PROGRESS.', '每一次练习，都算数', '看看你走过的路，也找到下一次练习的方向。'] };
    $('page-eyebrow').textContent = titles[view][0]; $('page-title').innerHTML = `${titles[view][1]}<span>。</span>`; $('page-description').textContent = titles[view][2];
    document.querySelector('.primary-settings').hidden = view === 'review';
    $('advanced-settings').hidden = true; $('advanced-button').setAttribute('aria-expanded', 'false');
    $('review-setting-note').hidden = view !== 'review'; $('review-list-section').hidden = view !== 'review';
    if (view === 'progress') renderProgress(); else { if (view === 'practice') pool = M.bank(state.settings); nextQuestion(); }
    updateStats();
  }
  function nextQuestion(forced) {
    cancelNext(); stopAll(); selected.clear(); stepIndex = 0; answered = false;
    const candidates = view === 'review' ? L.reviews(state).map(r => r.q) : pool;
    current = forced || M.pick(candidates, state.stats, current && current.id);
    questionNumber++;
    $('question-number').textContent = `第 ${String(questionNumber).padStart(2, '0')} 题`;
    $('next-button').hidden = true; $('reveal-button').disabled = !current; $('listen-button').disabled = !current; $('skip-button').disabled = !current;
    $('chord-controls').hidden = !current || !current.block;
    $('chord-heading').hidden = !current || current.spec.kind !== 'chord';
    $('feedback').className = 'feedback neutral'; $('feedback-icon').innerHTML = icon('note');
    if (!current) {
      $('score').innerHTML = view === 'review' ? `<div class="empty-score">${icon('check')}<h2>这一页，清空了。</h2><p>目前没有待复习的错题。<br>去自由练习，认识更多音符吧。</p><button class="button primary" id="empty-practice">继续自由练习</button></div>` : `<div class="empty-score">${icon('sliders')}<h2>这个组合暂时没有题目</h2><p>请尝试加入变化音，或更换和弦类型、转位。<br>三音和弦没有第三转位。</p></div>`;
      $('empty-practice')?.addEventListener('click', () => setView('practice'));
      $('feedback-title').textContent = view === 'review' ? '所有错题都已复习完成。' : '调整设置后，就可以继续练习。';
      $('feedback-detail').textContent = view === 'review' ? '每一次重复，都在让记忆更牢固。' : '例如：常见七和弦 + 白键和黑键。';
      $('instruction').textContent = '也可以在下方自由弹奏';
      $('clef-tag').textContent = view === 'review' ? '复习完成' : '练习设置'; $('kind-tag').textContent = '自由弹奏';
      $('bank-size').textContent = view === 'review' ? '待复习 0 题' : '当前题库 0 题';
      renderPiano(); updateStats(); return;
    }
    const q = current;
    $('chord-name').textContent = q.spec.kind === 'chord' ? q.title : '';
    $('chord-symbol').textContent = q.chordSymbol || '';
    const range = M.keyboardRange(q);
    activeBase = range.base; pianoMin = range.min; pianoMax = range.max;
    $('clef-tag').textContent = clefName(q.spec.clef);
    $('kind-tag').textContent = q.spec.kind === 'single' ? (q.spec.clef === 'grand' ? '双手单音' : '单音识谱') : M.PATTERNS[q.spec.pattern];
    $('instruction').textContent = q.block ? '选出所有音符，Enter 提交（可切换八度）' : q.sequence.length > 1 ? '从左到右逐音弹奏，不考察节拍' : '在下方钢琴弹出谱面上的音符';
    const reviewRecord = state.stats[q.id];
    $('feedback-title').textContent = view === 'review' ? `再认识它一次 · 连续正确 ${reviewRecord?.reviewStreak || 0}/2` : q.block ? '把谱面上的音，组合在一起。' : q.sequence.length > 1 ? '跟着谱面，从第一个音开始。' : '准备好，听见你的第一个音。';
    $('feedback-detail').textContent = q.block ? '可同时按键或逐键选音；点选已选琴键可取消。' : '按下对应按键，或用鼠标点击钢琴。';
    $('bank-size').textContent = view === 'review' ? `待复习 ${candidates.length} 题 · 全部错题` : `当前题库 ${pool.length} 题 · 按正确率加权抽取`;
    renderScore(); renderPiano(); updateStats();
    $('score').classList.remove('score-enter'); void $('score').offsetWidth; $('score').classList.add('score-enter');
    startedAt = performance.now();
  }
  function renderScore(wrongAt = -1) {
    if (!current) return;
    const q = current, sequential = q.spec.pattern !== 'block' && q.sequence.length > 1;
    const width = sequential ? Math.max(560, q.sequence.length * 65 + 130) : Math.max(320, Math.min(700, $('score').clientWidth));
    const grand = q.spec.clef === 'grand';
    const staves = grand ? ['treble', 'bass'] : [q.spec.clef];
    const bottom = clef => grand ? (clef === 'treble' ? 110 : 250) : 128;
    const yOf = (n, clef) => bottom(clef) - (n.step - (clef === 'treble' ? 30 : 18)) * 6;
    const minY = Math.min(...q.voices.flatMap(v => v.notes.map(n => yOf(n, v.clef))));
    const maxY = Math.max(...q.voices.flatMap(v => v.notes.map(n => yOf(n, v.clef))));
    const offset = Math.max(0, 36 - minY), height = Math.max(grand ? 320 : 220, maxY + 47) + offset;
    $('score').classList.toggle('is-grand', grand);
    let svg = `<svg style="min-width:${sequential ? Math.min(width, 550) : 0}px" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><g transform="translate(0 ${offset})">`;
    for (const clef of staves) {
      const b = bottom(clef);
      for (let i = 0; i < 5; i++) svg += `<line class="staff-line" x1="22" y1="${b - i * 12}" x2="${width - 22}" y2="${b - i * 12}"/>`;
      svg += `<line class="staff-line" x1="${width - 22}" y1="${b - 48}" x2="${width - 22}" y2="${b}"/><text class="music" x="36" y="${b - (clef === 'treble' ? 12 : 36)}">${clef === 'treble' ? '\uE050' : '\uE062'}</text>`;
    }
    if (grand) svg += `<path d="M20 62h-6v188h6" stroke="#8b9783" stroke-width="2" fill="none"/>`;
    function drawNotes(notes, clef, x, sequenceIndex = -1) {
      const b = bottom(clef), ys = notes.map(n => yOf(n, clef));
      const stemUp = notes.reduce((a, n) => a + n.step, 0) / notes.length < (clef === 'treble' ? 34 : 22);
      let ledgerLines = new Set();
      for (const y of ys) {
        for (let ly = b + 12; ly <= y + .01; ly += 12) ledgerLines.add(ly);
        for (let ly = b - 60; ly >= y - .01; ly -= 12) ledgerLines.add(ly);
      }
      for (const y of ledgerLines) svg += `<line class="ledger" x1="${x - 13}" y1="${y}" x2="${x + 16}" y2="${y}"/>`;
      const accs = [];
      let previousShift = false;
      for (let i = 0; i < notes.length; i++) {
        const n = notes[i], y = ys[i];
        const close = i > 0 && Math.abs(ys[i - 1] - y) <= 6;
        const shift = close && !previousShift ? (stemUp ? 12 : -12) : 0; previousShift = !!shift;
        let cls = 'note-head';
        if (sequenceIndex >= 0 && sequenceIndex < stepIndex) cls += ' note-done';
        if (sequenceIndex >= 0 && sequenceIndex === wrongAt) cls += ' note-error';
        if (!answered && sequenceIndex === stepIndex) cls += ' note-current';
        svg += `<ellipse class="${cls}" cx="${x + shift}" cy="${y}" rx="7.2" ry="4.9" transform="rotate(-20 ${x + shift} ${y})"/>`;
        if (n.accidental) {
          let col = 0;
          while (accs.some(a => a.col === col && Math.abs(a.y - y) < 30)) col++;
          accs.push({ col, y });
          const glyphs = { '-2': '\uE264', '-1': '\uE260', 1: '\uE262', 2: '\uE263' };
          svg += `<text class="music" style="font-size:39px" x="${x - 23 - col * 14}" y="${y}">${glyphs[n.accidental]}</text>`;
        }
      }
      const low = Math.max(...ys), high = Math.min(...ys);
      svg += stemUp ? `<path d="M${x + 6.5} ${low}V${high - 35}" stroke="#253631" stroke-width="1.3"/>` : `<path d="M${x - 6.5} ${high}V${low + 35}" stroke="#253631" stroke-width="1.3"/>`;
    }
    if (sequential) {
      q.sequence.forEach((n, i) => {
        const voice = q.voices.find(v => v.notes.some(vn => vn.midi === n.midi && vn.step === n.step));
        const x = 110 + (width - 162) * (i + .5) / q.sequence.length;
        drawNotes([n], voice.clef, x, i);
        svg += `<text x="${x}" y="${grand ? 300 : 200}" font-family="sans-serif" font-size="10" text-anchor="middle" fill="${i < stepIndex ? '#7e9e60' : '#b0b7a8'}">${i + 1}</text>`;
      });
    } else for (const voice of q.voices) drawNotes(voice.notes, voice.clef, width * .56);
    svg += '</g></svg>';
    $('score').innerHTML = svg;
    $('score').setAttribute('aria-label', `${clefName(q.spec.clef)}，${q.title}，${q.spec.kind === 'single' ? '单音识谱' : M.PATTERNS[q.spec.pattern]}，共 ${q.block ? q.notes.length : q.sequence.length} 个音。请读谱，在钢琴输入。`);
  }
  function renderPiano() {
    const whites = [];
    for (let m = pianoMin; m <= pianoMax; m++) if (M.NATURAL.includes(m % 12)) whites.push(m);
    const keyMap = new Map();
    for (const key of [...M.WHITE_KEYS, ...Object.keys(M.BLACK_KEYS)]) keyMap.set(M.keyMidi(key, activeBase), key.toUpperCase());
    const label = midi => state.settings.labels ? `<span class="key-label ${midi === 60 ? 'middle-c' : ''}">${M.name(M.fromMidi(midi))}</span>` : '';
    let html = whites.map(midi => `<button class="piano-key white-key ${keyMap.has(midi) ? 'mapped' : ''}" data-midi="${midi}" aria-label="${M.name(M.fromMidi(midi))}${keyMap.has(midi) ? `，键盘 ${keyMap.get(midi)}` : ''}">${keyMap.has(midi) ? `<span class="computer-key">${keyMap.get(midi)}</span>` : ''}${label(midi)}</button>`).join('');
    for (let m = pianoMin; m <= pianoMax; m++) if (!M.NATURAL.includes(m % 12)) {
      const leftWhite = whites.filter(w => w < m).length;
      html += `<button class="piano-key black-key ${keyMap.has(m) ? 'mapped' : ''}" style="left:${(leftWhite - .31) / whites.length * 100}%;width:${.62 / whites.length * 100}%" data-midi="${m}" aria-label="${M.name(M.fromMidi(m))}${keyMap.has(m) ? `，键盘 ${keyMap.get(m)}` : ''}">${keyMap.has(m) ? `<span class="computer-key">${keyMap.get(m)}</span>` : ''}${label(m)}</button>`;
    }
    $('piano').innerHTML = html;
    $('piano').style.minWidth = Math.max(560, whites.length * 38) + 'px';
    $('octave-label').textContent = `${M.name(M.fromMidi(activeBase))}–${M.name(M.fromMidi(activeBase + M.KEYBOARD_SPAN))}`;
    $('octave-down').disabled = activeBase <= pianoMin;
    $('octave-up').disabled = activeBase + 12 + M.KEYBOARD_SPAN > pianoMax;
    updatePianoHighlights();
    const selectedOctave = $('piano').querySelector(`[data-midi="${activeBase}"]`);
    if (selectedOctave) {
      const pane = $('piano-scroll'), target = selectedOctave.offsetLeft - pane.clientWidth * .15;
      pane.scrollLeft = Math.max(0, target);
    }
  }
  function updatePianoHighlights() {
    $('piano').querySelectorAll('[data-midi]').forEach(el => {
      const midi = Number(el.dataset.midi);
      el.classList.toggle('active', [...held.values(), ...activePointers.values()].includes(midi));
      el.classList.toggle('selected-key', selected.has(midi));
      el.classList.toggle('answer-key', !!(answered && current && current.notes.some(n => n.midi === midi)));
      el.setAttribute('aria-pressed', String(selected.has(midi)));
    });
    $('input-progress').textContent = current?.block ? `已选 ${selected.size} 个音` : current && current.sequence.length > 1 ? `已弹 ${stepIndex}/${current.sequence.length} 个音` : '中央 C = C4';
    $('submit-button').disabled = answered || !selected.size;
    $('clear-button').disabled = answered || !selected.size;
  }
  function inputNote(midi, toggle = false) {
    if (!current || answered || view === 'progress' || document.querySelector('dialog[open]')) return;
    if (current.block) {
      if (toggle && selected.has(midi)) selected.delete(midi); else selected.add(midi);
      $('feedback-title').textContent = selected.size ? `已选 ${selected.size} 个音 · 准备好后按 Enter` : '把谱面上的音，组合在一起。';
      $('feedback-detail').textContent = [...selected].sort((a, b) => a - b).map(m => M.name(M.fromMidi(m))).join(' + ') || '点选已选琴键可取消，Backspace 清空。';
      updatePianoHighlights();
    } else {
      if (midi !== current.sequence[stepIndex].midi) { finish(false, 'answer', `你弹了 ${M.name(M.fromMidi(midi))}。`, stepIndex); return; }
      stepIndex++; renderScore(); updatePianoHighlights();
      if (stepIndex === current.sequence.length) finish(true);
      else { $('feedback-title').textContent = `这个音对了 · ${stepIndex}/${current.sequence.length}`; $('feedback-detail').textContent = '继续弹奏谱面上的下一个音。'; }
    }
  }
  function finish(correct, reason = 'answer', extra = '', wrongAt = -1) {
    if (!current || answered) return;
    answered = true; cancelNext();
    const outcome = L.record(state, current, correct, performance.now() - startedAt, reason);
    session.count++; session.correct += Number(correct); session.streak = correct ? session.streak + 1 : 0;
    save(); updateStats(); renderScore(wrongAt); updatePianoHighlights();
    $('feedback').className = `feedback ${correct ? 'success' : 'error'}`;
    $('feedback-icon').innerHTML = icon(correct ? 'check' : reason === 'reveal' ? 'eye' : 'repeat');
    $('feedback-title').textContent = correct ? outcome.removed ? '连续两次答对，这道题毕业了。' : outcome.wasReview ? '答对了，再连续答对一次即可移除。' : session.streak >= 3 ? `${session.streak} 题连续答对，手感越来越好了。` : '答对了，记住这一刻的手感。' : reason === 'reveal' ? '一起看一眼答案，下次再试试。' : reason === 'skip' ? '已记入复习，下次再认识它。' : '差一点，这道题会陪你再练几次。';
    const title = current.spec.kind === 'chord' ? `${current.title} · ` : '';
    $('feedback-detail').textContent = `${extra}${title}${answerText(current)}${correct ? '' : '；已加入错题本。'}`;
    $('next-button').hidden = false; $('reveal-button').disabled = true;
    if (document.activeElement === $('submit-button')) $('next-button').focus({ preventScroll: true });
    if (correct && state.settings.autoNext) nextTimer = setTimeout(() => { if (!document.querySelector('dialog[open]')) nextQuestion(); }, 1400);
  }
  function submit() { if (current?.block && !answered && selected.size) finish(M.exactChord([...selected], current)); }
  function advance() { if (!current) return; if (!answered) finish(false, 'skip'); else nextQuestion(); }
  function clearInput() { if (answered) return; selected.clear(); stepIndex = 0; renderScore(); updatePianoHighlights(); if (current) { $('feedback-title').textContent = '已清空，重新试一遍。'; $('feedback-detail').textContent = current.block ? '选出所有音符，按 Enter 提交。' : '从谱面第一个音重新开始。'; } }
  function shiftOctave(delta) {
    const value = activeBase + delta * 12;
    if (value < pianoMin || value + M.KEYBOARD_SPAN > pianoMax) return;
    // Keep the MIDI bound at keydown, so a held key releases the original note.
    activeBase = value; renderPiano();
  }
  let audioContext = null, master = null;
  const voices = new Map(), demoTimers = new Set();
  function ensureAudio() {
    if (!state.settings.sound) return false;
    try {
      if (!audioContext) {
        const Context = window.AudioContext || window.webkitAudioContext;
        if (!Context) return false;
        audioContext = new Context(); master = audioContext.createGain(); master.gain.value = state.settings.volume / 100 * .42;
        const compressor = audioContext.createDynamicsCompressor(); master.connect(compressor); compressor.connect(audioContext.destination);
      }
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
      return true;
    } catch (_) { return false; }
  }
  function playTone(midi, token) {
    if (!ensureAudio()) return;
    releaseTone(token);
    const now = audioContext.currentTime, frequency = 440 * 2 ** ((midi - 69) / 12);
    const gain = audioContext.createGain(); gain.connect(master);
    gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(.29, now + .008); gain.gain.exponentialRampToValueAtTime(.065, now + .32); gain.gain.exponentialRampToValueAtTime(.0001, now + 3.2);
    const oscs = [1, 2, 3, 4].map((multiple, i) => {
      const osc = audioContext.createOscillator(), partial = audioContext.createGain();
      osc.type = 'sine'; osc.frequency.value = frequency * multiple; partial.gain.value = [1, .32, .12, .035][i];
      osc.connect(partial); partial.connect(gain); osc.start(now); osc.stop(now + 3.4); return osc;
    });
    const voice = { gain, oscs, timer: setTimeout(() => { if (voices.get(token) === voice) voices.delete(token); gain.disconnect(); }, 3600) };
    voices.set(token, voice);
  }
  function releaseTone(token) {
    const v = voices.get(token); if (!v || !audioContext) return;
    const t = audioContext.currentTime, param = v.gain.gain;
    if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(t);
    else { param.cancelScheduledValues(t); param.setValueAtTime(Math.max(.0001, param.value), t); }
    param.exponentialRampToValueAtTime(.0001, t + .18);
    v.oscs.forEach(osc => { try { osc.stop(t + .2); } catch (_) {} });
    voices.delete(token); clearTimeout(v.timer); setTimeout(() => v.gain.disconnect(), 250);
  }
  function stopAll() {
    for (const token of voices.keys()) releaseTone(token);
    for (const timer of demoTimers) clearTimeout(timer); demoTimers.clear();
    held.clear(); activePointers.clear();
  }
  function listen() {
    if (!current) return;
    if (!answered) finish(false, 'reveal');
    cancelNext(); stopAll();
    if (!state.settings.sound) { state.settings.sound = true; save(); syncSettings(); }
    ensureAudio();
    const q = current, notes = q.block ? q.notes : q.sequence;
    notes.forEach((n, i) => {
      const delay = q.block ? 0 : i * 400;
      const t = setTimeout(() => { demoTimers.delete(t); playTone(n.midi, `demo-${i}`); const release = setTimeout(() => { demoTimers.delete(release); releaseTone(`demo-${i}`); }, q.block ? 1000 : 350); demoTimers.add(release); }, delay);
      demoTimers.add(t);
    });
  }
  function renderReviewList() {
    const records = L.reviews(state).sort((a, b) => b.wrong - a.wrong);
    $('review-list-count').textContent = records.length;
    $('review-list').innerHTML = records.length ? records.map((r, index) => `<button class="review-item ${current?.id === r.q.id ? 'current' : ''}" data-review-index="${index}"><div><strong>${escape(r.q.title)}</strong><small>${escape(shortDescription(r.q))}<br>答错 ${r.wrong} 次 · 连续正确 ${r.reviewStreak}/2</small></div><div class="review-dots" aria-label="连续正确 ${r.reviewStreak} 次"><i class="${r.reviewStreak ? 'done' : ''}"></i><i></i></div></button>`).join('') : '<div class="progress-empty">还没有待复习的错题，继续保持。</div>';
    $('review-list').querySelectorAll('[data-review-index]').forEach(el => el.addEventListener('click', () => nextQuestion(records[Number(el.dataset.reviewIndex)].q)));
  }
  function renderProgress() {
    const total = L.totals(state), records = Object.values(state.stats), reviews = L.reviews(state);
    const practiced = records.filter(r => r.attempts > 0).length, mastered = records.filter(r => r.streak >= 2 && !r.review).length;
    const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - 13 + i); const key = L.dayKey(d); return { label: `${d.getMonth() + 1}/${d.getDate()}`, ...(state.daily[key] || { attempts: 0, correct: 0 }) }; });
    const max = Math.max(5, ...days.map(d => d.attempts));
    const weakest = records.sort((a, b) => a.correct / a.attempts - b.correct / b.attempts || b.attempts - a.attempts).slice(0, 30);
    $('progress-view').innerHTML = `<div class="progress-summary"><div class="metric-card"><span>累计练习</span><strong>${total.attempts}</strong><small>已接触 ${practiced} 道不同题目</small></div><div class="metric-card"><span>累计正确率</span><strong>${percent(total.correct, total.attempts)}</strong><small>包含查看答案与跳过</small></div><div class="metric-card"><span>已熟悉的题目</span><strong>${mastered}</strong><small>最近连续答对至少 2 次</small></div><div class="metric-card"><span>等待复习</span><strong>${reviews.length}</strong><small>每题连续答对 2 次后移除</small></div></div><section class="chart-card"><h2>一点一点，积少成多</h2><p>最近 14 天的练习题数</p><div class="bar-chart" role="img" aria-label="最近十四天练习次数：${days.map(d => `${d.label} ${d.attempts}题`).join('，')}">${days.map(d => `<div class="bar-column"><div class="bar" style="height:${Math.max(3, d.attempts / max * 130)}px" title="${d.label}：${d.attempts} 题，${d.correct} 题正确">${d.attempts ? `<span>${d.attempts}</span>` : ''}</div><span>${d.label}</span></div>`).join('')}</div></section><section class="records-card"><h2>接下来，练这些</h2><p>按正确率由低到高排列，展示最多 30 道已练题目。</p>${weakest.length ? `<div class="table-scroll"><table class="records-table"><thead><tr><th>题目</th><th>音符</th><th>正确率</th><th>已练</th><th>复习进度</th></tr></thead><tbody>${weakest.map(r => { const q = M.makeQuestion(r.spec); return `<tr><td>${escape(q.title)}<small>${escape(shortDescription(q))}</small></td><td>${q.notes.map(n => escape(M.name(n))).join(' · ')}</td><td><span class="accuracy-pill">${percent(r.correct, r.attempts)}</span></td><td>${r.attempts}</td><td>${r.review ? `${r.reviewStreak}/2` : r.streak >= 2 ? '已熟悉' : '继续练习'}</td></tr>`; }).join('')}</tbody></table></div>` : '<div class="progress-empty">还没有学习记录。<br>从第一道题开始，这里会记住你的每一步。</div>'}</section>`;
  }
  function showDialog(id) { cancelNext(); stopAll(); updatePianoHighlights(); $(id).showModal(); }
  function confirmAction(title, description, action) {
    $('confirm-title').textContent = title; $('confirm-description').textContent = description;
    $('confirm-ok').onclick = () => { $('confirm-dialog').close(); action(); };
    $('confirm-cancel').onclick = () => $('confirm-dialog').close(); $('confirm-dialog').showModal();
  }
  function downloadBackup() {
    const blob = new Blob([JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `谱间-练习备份-${L.dayKey()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('备份已导出，请妥善保存。');
  }
  document.querySelectorAll('[data-view]').forEach(el => el.addEventListener('click', () => setView(el.dataset.view)));
  document.querySelector('.brand').addEventListener('click', event => { event.preventDefault(); setView('practice'); });
  document.querySelectorAll('[data-clef]').forEach(el => el.addEventListener('click', () => { state.settings.clef = el.dataset.clef; changeSettings(); }));
  document.querySelectorAll('[data-setting]').forEach(el => el.addEventListener('change', () => { state.settings[el.dataset.setting] = el.value; changeSettings(); }));
  function changeSettings() { cancelNext(); syncSettings(); save(); pool = M.bank(state.settings); nextQuestion(); }
  $('advanced-button').addEventListener('click', () => { $('advanced-settings').hidden = !$('advanced-settings').hidden; $('advanced-button').setAttribute('aria-expanded', String(!$('advanced-settings').hidden)); });
  $('auto-check').addEventListener('change', () => { state.settings.autoNext = $('auto-check').checked; if (!state.settings.autoNext) cancelNext(); save(); });
  $('labels-check').addEventListener('change', () => { state.settings.labels = $('labels-check').checked; save(); renderPiano(); });
  $('sound-button').addEventListener('click', () => { state.settings.sound = !state.settings.sound; if (!state.settings.sound) stopAll(); else ensureAudio(); updatePianoHighlights(); save(); syncSettings(); });
  $('volume-slider').addEventListener('input', () => { state.settings.volume = Number($('volume-slider').value); if (master) master.gain.setTargetAtTime(state.settings.volume / 100 * .42, audioContext.currentTime, .02); save(); });
  $('reveal-button').addEventListener('click', () => finish(false, 'reveal'));
  $('skip-button').addEventListener('click', () => { if (!answered) finish(false, 'skip'); nextQuestion(); });
  $('listen-button').addEventListener('click', listen); $('next-button').addEventListener('click', advance);
  $('submit-button').addEventListener('click', submit); $('clear-button').addEventListener('click', clearInput);
  $('octave-down').addEventListener('click', () => shiftOctave(-1)); $('octave-up').addEventListener('click', () => shiftOctave(1));
  $('piano').addEventListener('pointerdown', event => {
    const key = event.target.closest('[data-midi]'); if (!key || event.button > 0) return;
    event.preventDefault(); if (document.activeElement.tagName === 'BUTTON') document.activeElement.blur(); const midi = Number(key.dataset.midi); key.setPointerCapture(event.pointerId);
    activePointers.set(event.pointerId, midi); playTone(midi, `pointer-${event.pointerId}`); inputNote(midi, true); updatePianoHighlights();
  });
  function releasePointer(event) { activePointers.delete(event.pointerId); releaseTone(`pointer-${event.pointerId}`); updatePianoHighlights(); }
  $('piano').addEventListener('pointerup', releasePointer); $('piano').addEventListener('pointercancel', releasePointer); $('piano').addEventListener('lostpointercapture', releasePointer);
  // Keyboard and assistive-tech activation of an individual piano button.
  $('piano').addEventListener('click', event => { if (event.detail !== 0) return; const key = event.target.closest('[data-midi]'); if (!key) return; const midi = Number(key.dataset.midi); playTone(midi, 'accessible'); inputNote(midi, true); setTimeout(() => releaseTone('accessible'), 350); });
  document.addEventListener('keydown', event => {
    if (event.metaKey || event.ctrlKey || event.altKey || event.repeat || document.querySelector('dialog[open]')) return;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
    const key = M.eventKey(event.code, event.key);
    if (key === '?') { event.preventDefault(); showDialog('help-dialog'); return; }
    if (view === 'progress') return;
    // Enter/Space must retain native semantics on focused buttons.
    if (document.activeElement.tagName === 'BUTTON' && ['enter', ' '].includes(key)) return;
    if (key === 'enter') { event.preventDefault(); if (answered) nextQuestion(); else submit(); return; }
    if (key === 'backspace') { event.preventDefault(); clearInput(); return; }
    if (key === 'escape') { stopAll(); clearInput(); updatePianoHighlights(); return; }
    if (key === 'z' || key === 'x') { event.preventDefault(); shiftOctave(key === 'z' ? -1 : 1); return; }
    const midi = M.keyMidi(key, activeBase); if (midi === null) return;
    event.preventDefault(); if (document.activeElement.tagName === 'BUTTON') document.activeElement.blur(); if (held.has(event.code)) return;
    held.set(event.code, midi); playTone(midi, event.code); inputNote(midi); updatePianoHighlights();
  });
  document.addEventListener('keyup', event => { if (held.has(event.code)) { held.delete(event.code); releaseTone(event.code); updatePianoHighlights(); } });
  window.addEventListener('blur', () => { stopAll(); updatePianoHighlights(); cancelNext(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { stopAll(); cancelNext(); updatePianoHighlights(); } });
  $('help-button').addEventListener('click', () => showDialog('help-dialog')); $('backup-button').addEventListener('click', () => showDialog('backup-dialog'));
  // Mobile navigation has no sidebar utility area; keep help/data reachable in the heading.
  const mobileTools = document.createElement('div'); mobileTools.className = 'mobile-tools';
  mobileTools.innerHTML = '<button class="text-button" id="mobile-help">使用指南</button><button class="text-button" id="mobile-backup">数据与备份</button>';
  document.querySelector('main').append(mobileTools);
  $('mobile-help').addEventListener('click', () => showDialog('help-dialog')); $('mobile-backup').addEventListener('click', () => showDialog('backup-dialog'));
  document.querySelectorAll('.close-dialog').forEach(el => el.addEventListener('click', () => el.closest('dialog').close()));
  document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target !== dialog) return; const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); }));
  $('export-button').addEventListener('click', downloadBackup); $('import-button').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', async event => {
    const file = event.target.files[0]; event.target.value = ''; if (!file) return;
    if (file.size > 20 * 1024 * 1024) { toast('文件超过 20 MB，请选择有效的谱间备份。'); return; }
    try {
      const imported = L.validate(JSON.parse(await file.text())), t = L.totals(imported);
      confirmAction('导入这份备份？', `备份包含 ${t.attempts} 次练习和 ${L.reviews(imported).length} 道待复习题。确认后会替换当前记录，建议先导出当前备份。`, () => {
        state = imported; storageAvailable = true; $('storage-warning').hidden = true; save(); syncSettings();
        session.count = session.correct = session.streak = 0; $('backup-dialog').close(); setView('practice'); toast('记录已导入，可以继续练习。');
      });
    } catch (error) { toast('导入失败：' + (error instanceof SyntaxError ? '文件不是有效的 JSON。' : error.message)); }
  });
  $('reset-button').addEventListener('click', () => confirmAction('清空本机练习数据？', '这会删除当前浏览器里的正确率、错题和学习记录，无法撤销。建议先导出一份备份。', () => {
    state = L.empty(); storageAvailable = true; $('storage-warning').hidden = true; save(); syncSettings(); session.count = session.correct = session.streak = 0;
    $('backup-dialog').close(); setView('practice'); toast('已清空，重新开始吧。');
  }));
  // Reload when another tab has changed the same origin's records; avoid silent overwrites.
  window.addEventListener('storage', event => {
    if (event.key !== L.STORAGE_KEY || !event.newValue) return;
    try { state = L.validate(JSON.parse(event.newValue)); syncSettings(); if (view === 'progress') { updateStats(); renderProgress(); } else { pool = M.bank(state.settings); nextQuestion(); } toast('已同步另一个窗口的练习记录。'); } catch (_) {}
  });
  let resizeTimer;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (current && view !== 'progress') renderScore(); }, 100); });
  syncSettings(); setView('practice');
})();
