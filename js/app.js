(() => {
  'use strict';

  // 対象距離（メートル）
  const DISTANCES = [
    { meters: 50, alt: null },
    { meters: 200, alt: null },
    { meters: 400, alt: null },
    { meters: 800, alt: null },
    { meters: 1000, alt: '1km' },
    { meters: 1500, alt: null },
    { meters: 3000, alt: null },
    { meters: 5000, alt: null },
    { meters: 10000, alt: '10km' },
  ];

  // 表示順: 時・分・秒・ミリ秒(2桁=センチ秒)
  const UNITS = ['hh', 'mm', 'ss', 'cs'];
  const UNIT_MAX = { hh: 99, mm: 59, ss: 59, cs: 99 };
  const UNIT_LABEL = { hh: '時', mm: '分', ss: '秒', cs: 'ms' };
  const SEPARATOR = { hh: ':', mm: ':', ss: '.', cs: '' };

  const listEl = document.getElementById('distance-list');
  const resetBtn = document.getElementById('reset-btn');

  function pad2(n) {
    return String(Math.max(0, n)).padStart(2, '0');
  }

  function buildUI() {
    const frag = document.createDocumentFragment();

    DISTANCES.forEach(({ meters, alt }) => {
      const card = document.createElement('div');
      card.className =
        'distance-card bg-neutral-900 rounded-2xl p-3 border border-neutral-800';
      card.dataset.distance = String(meters);

      const header = document.createElement('div');
      header.className = 'flex items-baseline justify-center gap-1.5 mb-2';
      header.innerHTML = `
        <span class="font-bold text-lime-400 text-lg">${meters.toLocaleString('ja-JP')}</span>
        <span class="text-xs text-neutral-500 font-normal">m</span>
        ${alt ? `<span class="text-[10px] text-neutral-600 font-normal ml-1">(${alt})</span>` : ''}
      `;
      card.appendChild(header);

      const row = document.createElement('div');
      row.className = 'flex items-center justify-center gap-0.5';

      UNITS.forEach((unit, idx) => {
        if (idx > 0 && SEPARATOR[UNITS[idx - 1]]) {
          const sep = document.createElement('span');
          sep.className = 'text-neutral-500 font-mono text-lg px-0.5';
          sep.textContent = SEPARATOR[UNITS[idx - 1]];
          row.appendChild(sep);
        }

        const input = document.createElement('input');
        input.type = 'number';
        input.inputMode = 'numeric';
        input.pattern = '[0-9]*';
        input.min = '0';
        input.max = String(UNIT_MAX[unit]);
        input.placeholder = '00';
        input.autocomplete = 'off';
        input.setAttribute('aria-label', `${meters}m ${UNIT_LABEL[unit]}`);
        input.className =
          'pace-input w-12 bg-neutral-800 rounded-lg text-center text-xl font-mono py-2.5 ' +
          'focus:outline-none focus:ring-2 focus:ring-lime-400 text-white';
        input.dataset.distance = String(meters);
        input.dataset.unit = unit;

        row.appendChild(input);
      });

      card.appendChild(row);

      const labels = document.createElement('div');
      labels.className =
        'flex justify-center gap-0.5 mt-1 text-[10px] text-neutral-600 font-mono';
      UNITS.forEach((unit, idx) => {
        if (idx > 0 && SEPARATOR[UNITS[idx - 1]]) {
          const spacer = document.createElement('span');
          spacer.className = 'w-3';
          labels.appendChild(spacer);
        }
        const l = document.createElement('span');
        l.className = 'w-12 text-center';
        l.textContent = UNIT_LABEL[unit];
        labels.appendChild(l);
      });
      card.appendChild(labels);

      frag.appendChild(card);
    });

    listEl.appendChild(frag);
  }

  function getInput(distance, unit) {
    return listEl.querySelector(
      `input[data-distance="${distance}"][data-unit="${unit}"]`
    );
  }

  function getRowInputs(distance) {
    return UNITS.map((u) => getInput(distance, u));
  }

  function getFieldValue(distance, unit) {
    const el = getInput(distance, unit);
    const v = parseInt(el.value, 10);
    return Number.isNaN(v) ? 0 : v;
  }

  function setFieldValue(distance, unit, value) {
    getInput(distance, unit).value = pad2(value);
  }

  // 距離の入力値を合計ミリ秒に変換（ミリ秒欄は2桁=センチ秒として ×10）
  function distanceToMs(distance) {
    const hh = getFieldValue(distance, 'hh');
    const mm = getFieldValue(distance, 'mm');
    const ss = getFieldValue(distance, 'ss');
    const cs = getFieldValue(distance, 'cs');
    return (hh * 3600 + mm * 60 + ss) * 1000 + cs * 10;
  }

  // 合計ミリ秒を hh/mm/ss/cs に変換（繰り上がり処理込み）
  function msToFields(ms) {
    ms = Math.max(0, Math.round(ms / 10) * 10);
    let hh = Math.floor(ms / 3600000);
    ms -= hh * 3600000;
    let mm = Math.floor(ms / 60000);
    ms -= mm * 60000;
    let ss = Math.floor(ms / 1000);
    ms -= ss * 1000;
    let cs = Math.round(ms / 10);

    if (cs >= 100) { cs -= 100; ss += 1; }
    if (ss >= 60) { ss -= 60; mm += 1; }
    if (mm >= 60) { mm -= 60; hh += 1; }

    return { hh, mm, ss, cs };
  }

  // sourceDistance の入力を基準に、他のすべての距離の欄を再計算して書き換える
  function recalcFrom(sourceDistance) {
    const totalMs = distanceToMs(sourceDistance);
    const pacePerMeter = totalMs / sourceDistance; // ms / m

    DISTANCES.forEach(({ meters }) => {
      if (meters === sourceDistance) return;
      const targetMs = pacePerMeter * meters;
      const { hh, mm, ss, cs } = msToFields(targetMs);
      setFieldValue(meters, 'hh', hh);
      setFieldValue(meters, 'mm', mm);
      setFieldValue(meters, 'ss', ss);
      setFieldValue(meters, 'cs', cs);
    });
  }

  function clampUnitValue(unit, value) {
    if (Number.isNaN(value)) return 0;
    return Math.min(Math.max(value, 0), UNIT_MAX[unit]);
  }

  function onInput(e) {
    const input = e.target;
    const distance = Number(input.dataset.distance);
    const unit = input.dataset.unit;

    // 数字以外を除去し、2桁で切り詰める
    let digits = input.value.replace(/[^0-9]/g, '');
    if (digits.length > 2) digits = digits.slice(0, 2);
    if (digits !== input.value) input.value = digits;

    recalcFrom(distance);

    // 2桁入力されたら自動的に右隣の欄へフォーカス移動
    if (digits.length === 2) {
      const inputs = getRowInputs(distance);
      const idx = UNITS.indexOf(unit);
      const next = inputs[idx + 1];
      if (next) {
        next.focus();
        next.select();
      } else {
        input.blur();
      }
    }
  }

  function onKeydown(e) {
    if (e.key !== 'Backspace') return;
    const input = e.target;
    if (input.value !== '') return;

    const distance = Number(input.dataset.distance);
    const unit = input.dataset.unit;
    const inputs = getRowInputs(distance);
    const idx = UNITS.indexOf(unit);
    const prev = inputs[idx - 1];
    if (prev) {
      e.preventDefault();
      prev.focus();
      prev.select();
    }
  }

  function onBlur(e) {
    const input = e.target;
    const distance = Number(input.dataset.distance);
    const unit = input.dataset.unit;
    const value = clampUnitValue(unit, parseInt(input.value, 10));
    setFieldValue(distance, unit, value);
    recalcFrom(distance);
  }

  function onFocus(e) {
    e.target.select();
  }

  function resetAll() {
    DISTANCES.forEach(({ meters }) => {
      UNITS.forEach((unit) => {
        getInput(meters, unit).value = '';
      });
    });
    const first = getInput(DISTANCES[0].meters, 'hh');
    if (first) first.focus();
  }

  function attachListeners() {
    listEl.querySelectorAll('.pace-input').forEach((input) => {
      input.addEventListener('input', onInput);
      input.addEventListener('keydown', onKeydown);
      input.addEventListener('blur', onBlur);
      input.addEventListener('focus', onFocus);
    });
    resetBtn.addEventListener('click', resetAll);
  }

  buildUI();
  attachListeners();
})();
