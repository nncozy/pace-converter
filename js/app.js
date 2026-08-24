(() => {
  'use strict';

  const STORAGE_KEYS = {
    distances: 'paceConverter.distances.v1',
    theme: 'paceConverter.theme',
  };

  const DEFAULT_METERS = [50, 200, 400, 800, 1000, 1500, 3000, 5000, 10000];
  const MAX_METERS = 200000; // 200km 相当を上限とする

  // 表示順: 時・分・秒・ミリ秒(2桁=センチ秒)
  const UNITS = ['hh', 'mm', 'ss', 'cs'];
  const UNIT_MAX = { hh: 99, mm: 59, ss: 59, cs: 99 };
  const UNIT_LABEL = { hh: '時', mm: '分', ss: '秒', cs: 'ms' };
  const SEPARATOR = { hh: ':', mm: ':', ss: '.', cs: '' };

  const SUN_ICON = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5">
      <circle cx="12" cy="12" r="4"></circle>
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path>
    </svg>`;
  const MOON_ICON = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
    </svg>`;

  const listEl = document.getElementById('distance-list');
  const resetBtn = document.getElementById('reset-btn');
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  const editDistancesBtn = document.getElementById('edit-distances-btn');
  const paceSummaryValue = document.getElementById('pace-summary-value');

  // 現在の基準ペース（ms/m）。未入力なら null。
  let currentPace = null;
  let distances = loadDistances();

  // ---------- 距離リストの永続化 ----------

  function cloneDefaults() {
    return DEFAULT_METERS.map((meters, i) => ({ meters, custom: false, visible: true, order: i }));
  }

  function loadDistances() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.distances);
      if (!raw) return cloneDefaults();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) return cloneDefaults();
      let cleaned = parsed
        .filter((d) => d && Number.isFinite(d.meters) && d.meters > 0)
        .map((d) => ({
          meters: Math.round(d.meters),
          custom: !!d.custom,
          visible: d.visible !== false,
          order: Number.isFinite(d.order) ? d.order : null,
        }));
      if (!cleaned.length) return cloneDefaults();
      // 表示順(order)を持たない古いデータからの移行: これまで通り距離の昇順を初期順にする
      if (cleaned.some((d) => d.order === null)) {
        cleaned = cleaned.slice().sort((a, b) => a.meters - b.meters);
        cleaned.forEach((d, i) => { d.order = i; });
      }
      return cleaned;
    } catch (e) {
      return cloneDefaults();
    }
  }

  function saveDistances() {
    try {
      localStorage.setItem(STORAGE_KEYS.distances, JSON.stringify(distances));
    } catch (e) {
      // 保存できなくても、その場でのアプリ利用自体は継続させる
    }
  }

  function sortedDistances() {
    return distances.slice().sort((a, b) => a.order - b.order);
  }

  function sortedByMeters() {
    return distances.slice().sort((a, b) => a.meters - b.meters);
  }

  function visibleDistances() {
    return sortedDistances().filter((d) => d.visible);
  }

  // ドラッグ&ドロップで確定した表示順(距離のmeters配列)を永続化する。
  // 非表示中の距離は今回のドラッグ対象外なので、既存の並びを保ったまま末尾に付け直す。
  function persistVisibleOrder(orderedMeters) {
    orderedMeters.forEach((meters, i) => {
      const d = distances.find((x) => x.meters === meters);
      if (d) d.order = i;
    });
    const hidden = distances.filter((d) => !d.visible).sort((a, b) => a.order - b.order);
    hidden.forEach((d, i) => { d.order = orderedMeters.length + i; });
    saveDistances();
  }

  function altLabel(meters) {
    return meters >= 1000 && meters % 1000 === 0 ? `${meters / 1000}km` : null;
  }

  function addCustomDistance(meters) {
    if (!Number.isFinite(meters) || meters <= 0 || !Number.isInteger(meters)) {
      return { ok: false, error: '1m以上の整数で入力してください' };
    }
    if (meters > MAX_METERS) {
      return { ok: false, error: `${MAX_METERS.toLocaleString('ja-JP')}m以下で入力してください` };
    }
    if (distances.some((d) => d.meters === meters)) {
      return { ok: false, error: 'その距離はすでに追加されています' };
    }
    const maxOrder = distances.reduce((m, d) => Math.max(m, d.order), -1);
    distances.push({ meters, custom: true, visible: true, order: maxOrder + 1 });
    saveDistances();
    return { ok: true };
  }

  function removeCustomDistance(meters) {
    distances = distances.filter((d) => !(d.meters === meters && d.custom));
    saveDistances();
  }

  function setVisibility(meters, visible) {
    const d = distances.find((x) => x.meters === meters);
    if (d) {
      d.visible = visible;
      saveDistances();
    }
  }

  // ---------- 距離カード（メイン画面） ----------

  function pad2(n) {
    return String(Math.max(0, n)).padStart(2, '0');
  }

  // 現在の基準ペース(ms/m)を「4'00"」のようなkmあたりの表示に整形する
  function updatePaceSummary() {
    if (currentPace === null) {
      paceSummaryValue.textContent = `--'--"`;
      return;
    }
    // ms/m と s/km は数値として同じ(×1000してから÷1000するだけなので)
    const totalSec = Math.round(currentPace);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    paceSummaryValue.textContent = `${min}'${pad2(sec)}"`;
  }

  function renderCards() {
    const visible = visibleDistances();
    listEl.innerHTML = '';

    if (visible.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'text-center text-sm text-neutral-400 dark:text-neutral-600 py-10 leading-relaxed';
      empty.textContent = '表示する距離がありません。左上の編集ボタンから距離を追加・表示してください。';
      listEl.appendChild(empty);
      return;
    }

    const frag = document.createDocumentFragment();

    visible.forEach(({ meters }) => {
      const alt = altLabel(meters);
      const card = document.createElement('div');
      card.className =
        'distance-card bg-white/90 dark:bg-neutral-900/90 backdrop-blur-sm rounded-2xl p-3.5 border border-lime-600/10 dark:border-lime-400/10 shadow-lg shadow-lime-900/5 dark:shadow-black/30';
      card.dataset.distance = String(meters);

      const header = document.createElement('div');
      header.className = 'flex items-center gap-2 mb-2';
      header.innerHTML = `
        <button type="button" class="drag-handle shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-neutral-400 dark:text-neutral-600 touch-none cursor-grab active:cursor-grabbing" aria-label="${meters}mを並び替え" data-distance="${meters}">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <circle cx="9" cy="6" r="1.6"></circle><circle cx="15" cy="6" r="1.6"></circle>
            <circle cx="9" cy="12" r="1.6"></circle><circle cx="15" cy="12" r="1.6"></circle>
            <circle cx="9" cy="18" r="1.6"></circle><circle cx="15" cy="18" r="1.6"></circle>
          </svg>
        </button>
        <div class="flex-1 flex items-baseline justify-center gap-1.5">
          <span class="font-extrabold text-lime-600 dark:text-lime-400 text-lg">${meters.toLocaleString('ja-JP')}</span>
          <span class="text-xs text-neutral-500 dark:text-neutral-500 font-normal">m</span>
          ${alt ? `<span class="text-[10px] text-neutral-400 dark:text-neutral-600 font-normal ml-1">(${alt})</span>` : ''}
        </div>
        <span class="w-7 h-7 shrink-0" aria-hidden="true"></span>
      `;
      card.appendChild(header);

      const row = document.createElement('div');
      row.className = 'flex items-center justify-center gap-0.5';

      UNITS.forEach((unit, idx) => {
        if (idx > 0 && SEPARATOR[UNITS[idx - 1]]) {
          const sep = document.createElement('span');
          sep.className = 'text-neutral-400 dark:text-neutral-500 font-mono text-lg px-0.5';
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
          'pace-input w-12 bg-neutral-200 dark:bg-neutral-800 rounded-xl text-center text-xl font-mono py-2.5 ' +
          'focus:outline-none focus:ring-2 focus:ring-lime-600 dark:focus:ring-lime-400 text-neutral-900 dark:text-white transition-shadow';
        input.dataset.distance = String(meters);
        input.dataset.unit = unit;

        row.appendChild(input);
      });

      card.appendChild(row);

      const labels = document.createElement('div');
      labels.className =
        'flex justify-center gap-0.5 mt-1 text-[10px] text-neutral-400 dark:text-neutral-600 font-mono';
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
    const pace = totalMs / sourceDistance; // ms / m
    currentPace = pace;
    updatePaceSummary();

    visibleDistances().forEach(({ meters }) => {
      if (meters === sourceDistance) return;
      const { hh, mm, ss, cs } = msToFields(pace * meters);
      setFieldValue(meters, 'hh', hh);
      setFieldValue(meters, 'mm', mm);
      setFieldValue(meters, 'ss', ss);
      setFieldValue(meters, 'cs', cs);
    });
  }

  // 現在のペースを、表示中の全距離の欄に反映する（距離の追加・表示切替の直後に使用）
  function applyPaceToAllVisible() {
    if (currentPace === null) return;
    visibleDistances().forEach(({ meters }) => {
      const { hh, mm, ss, cs } = msToFields(currentPace * meters);
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
    if (!input.classList.contains('pace-input')) return;
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
    if (!input.classList.contains('pace-input')) return;
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

  function onFocusOut(e) {
    const input = e.target;
    if (!input.classList.contains('pace-input')) return;
    const distance = Number(input.dataset.distance);
    const unit = input.dataset.unit;
    const value = clampUnitValue(unit, parseInt(input.value, 10));
    setFieldValue(distance, unit, value);
    recalcFrom(distance);
  }

  function onFocusIn(e) {
    const input = e.target;
    if (!input.classList.contains('pace-input')) return;
    input.select();
  }

  function resetAll() {
    currentPace = null;
    visibleDistances().forEach(({ meters }) => {
      UNITS.forEach((unit) => {
        getInput(meters, unit).value = '';
      });
    });
    // フォーカスを残したままだとモバイルで数字キーボードが開いたままになるため外す
    if (document.activeElement && document.activeElement.classList.contains('pace-input')) {
      document.activeElement.blur();
    }
    updatePaceSummary();
  }

  // ---------- カードの並び替え(ドラッグ&ドロップ) ----------

  let dragCard = null;
  let dragPlaceholder = null;
  let dragPointerId = null;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let dragCardHeight = 0;

  function onDragPointerDown(e) {
    if (dragCard) return; // 既にドラッグ中なら多重開始しない
    const handle = e.target.closest('.drag-handle');
    if (!handle) return;
    // 1本指のみ対象(ピンチ操作などとの競合を避ける)
    if (e.pointerType === 'touch' && e.isPrimary === false) return;

    const card = handle.closest('.distance-card');
    if (!card) return;
    e.preventDefault();

    const rect = card.getBoundingClientRect();
    dragCard = card;
    dragPointerId = e.pointerId;
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
    dragCardHeight = rect.height;

    dragPlaceholder = document.createElement('div');
    dragPlaceholder.className =
      'rounded-2xl border-2 border-dashed border-lime-600/30 dark:border-lime-400/30';
    dragPlaceholder.style.height = `${rect.height}px`;
    card.parentNode.insertBefore(dragPlaceholder, card);

    card.style.position = 'fixed';
    card.style.left = `${rect.left}px`;
    card.style.top = `${rect.top}px`;
    card.style.width = `${rect.width}px`;
    card.style.zIndex = '1000';
    card.style.pointerEvents = 'none';
    card.classList.add('dragging-card');
    document.body.classList.add('dragging');
    document.body.appendChild(card);

    try {
      handle.setPointerCapture(e.pointerId);
    } catch (err) {}

    handle.addEventListener('pointermove', onDragPointerMove);
    handle.addEventListener('pointerup', onDragPointerEnd);
    handle.addEventListener('pointercancel', onDragPointerEnd);
  }

  function onDragPointerMove(e) {
    if (!dragCard || e.pointerId !== dragPointerId) return;
    e.preventDefault();

    const x = e.clientX - dragOffsetX;
    const y = e.clientY - dragOffsetY;
    dragCard.style.left = `${x}px`;
    dragCard.style.top = `${y}px`;

    const dragCenterY = y + dragCardHeight / 2;
    const siblings = Array.from(listEl.children).filter(
      (el) => el !== dragPlaceholder && el !== dragCard && el.classList.contains('distance-card')
    );

    let target = null;
    for (const sib of siblings) {
      const r = sib.getBoundingClientRect();
      if (dragCenterY < r.top + r.height / 2) {
        target = sib;
        break;
      }
    }
    if (target) {
      if (dragPlaceholder.nextSibling !== target) listEl.insertBefore(dragPlaceholder, target);
    } else if (listEl.lastElementChild !== dragPlaceholder) {
      listEl.appendChild(dragPlaceholder);
    }
  }

  function onDragPointerEnd(e) {
    if (!dragCard || e.pointerId !== dragPointerId) return;
    const handle = dragCard.querySelector('.drag-handle');
    if (handle) {
      handle.removeEventListener('pointermove', onDragPointerMove);
      handle.removeEventListener('pointerup', onDragPointerEnd);
      handle.removeEventListener('pointercancel', onDragPointerEnd);
    }

    dragPlaceholder.parentNode.insertBefore(dragCard, dragPlaceholder);
    dragPlaceholder.remove();
    dragCard.style.position = '';
    dragCard.style.left = '';
    dragCard.style.top = '';
    dragCard.style.width = '';
    dragCard.style.zIndex = '';
    dragCard.style.pointerEvents = '';
    dragCard.classList.remove('dragging-card');
    document.body.classList.remove('dragging');

    const newOrder = Array.from(listEl.querySelectorAll('.distance-card')).map((c) =>
      Number(c.dataset.distance)
    );
    persistVisibleOrder(newOrder);

    dragCard = null;
    dragPlaceholder = null;
    dragPointerId = null;
  }

  // ---------- テーマ切り替え ----------

  const THEME_COLOR = { dark: '#0a0e08', light: '#f7faf2' };

  function currentTheme() {
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  }

  function applyThemeIcon(theme) {
    themeToggleBtn.innerHTML = theme === 'dark' ? SUN_ICON : MOON_ICON;
    themeToggleBtn.setAttribute(
      'aria-label',
      theme === 'dark' ? 'ライトモードに切り替え' : 'ダークモードに切り替え'
    );
    const meta = document.getElementById('theme-color-meta');
    if (meta) meta.setAttribute('content', THEME_COLOR[theme]);
  }

  function initTheme() {
    applyThemeIcon(currentTheme());
    themeToggleBtn.addEventListener('click', () => {
      const next = currentTheme() === 'dark' ? 'light' : 'dark';
      document.documentElement.classList.toggle('dark', next === 'dark');
      try {
        localStorage.setItem(STORAGE_KEYS.theme, next);
      } catch (e) {}
      applyThemeIcon(next);
    });
  }

  // ---------- 距離編集モーダル ----------

  let modalOverlay, modalList, newDistanceInput, newDistanceError;

  function buildModal() {
    modalOverlay = document.createElement('div');
    modalOverlay.id = 'distance-modal-overlay';
    modalOverlay.className =
      'fixed inset-0 z-50 hidden items-end sm:items-center justify-center bg-black/60 px-0 sm:px-4';
    modalOverlay.innerHTML = `
      <div id="distance-modal-panel" class="w-full sm:max-w-sm sm:rounded-3xl rounded-t-3xl bg-white/95 dark:bg-neutral-900/95 backdrop-blur-sm border border-lime-600/10 dark:border-lime-400/10 shadow-2xl shadow-lime-900/10 dark:shadow-black/50 p-4 max-h-[80vh] flex flex-col">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-base font-bold text-neutral-900 dark:text-white">距離を編集</h2>
          <button id="distance-modal-close" type="button" aria-label="閉じる"
            class="w-8 h-8 flex items-center justify-center rounded-full text-neutral-500 dark:text-neutral-400 active:bg-neutral-100 dark:active:bg-neutral-800">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <p class="text-xs text-neutral-500 dark:text-neutral-400 mb-2">チェックを外すと一覧から非表示になります。</p>
        <div id="distance-modal-list" class="flex-1 overflow-y-auto space-y-0.5 -mx-1 px-1"></div>
        <div class="mt-3 pt-3 border-t border-lime-600/10 dark:border-lime-400/10">
          <div class="flex gap-2">
            <input id="new-distance-input" type="number" min="1" max="${MAX_METERS}" step="1" inputmode="numeric"
              placeholder="距離を追加 (m)"
              class="flex-1 min-w-0 bg-neutral-100 dark:bg-neutral-800 rounded-xl px-3 py-2 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-lime-600 dark:focus:ring-lime-400">
            <button id="add-distance-btn" type="button"
              class="px-4 py-2 rounded-xl bg-gradient-to-r from-lime-600 to-green-500 dark:from-lime-400 dark:to-green-300 text-white dark:text-neutral-950 text-sm font-bold shadow-md shadow-lime-600/30 dark:shadow-lime-400/20 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 transition shrink-0">
              追加
            </button>
          </div>
          <p id="new-distance-error" class="text-xs text-red-500 mt-1 hidden"></p>
        </div>
      </div>
    `;
    document.body.appendChild(modalOverlay);

    modalList = modalOverlay.querySelector('#distance-modal-list');
    newDistanceInput = modalOverlay.querySelector('#new-distance-input');
    newDistanceError = modalOverlay.querySelector('#new-distance-error');

    modalOverlay.querySelector('#distance-modal-close').addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) closeModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modalOverlay.classList.contains('hidden')) closeModal();
    });

    modalOverlay.querySelector('#add-distance-btn').addEventListener('click', handleAddDistance);
    newDistanceInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAddDistance();
      }
    });

    modalList.addEventListener('change', (e) => {
      if (e.target.matches('.visibility-checkbox')) {
        const meters = Number(e.target.dataset.meters);
        setVisibility(meters, e.target.checked);
        onDistancesChanged();
      }
    });
    modalList.addEventListener('click', (e) => {
      const delBtn = e.target.closest('.delete-distance-btn');
      if (delBtn) {
        const meters = Number(delBtn.dataset.meters);
        removeCustomDistance(meters);
        onDistancesChanged();
      }
    });
  }

  function renderModalList() {
    modalList.innerHTML = '';
    sortedByMeters().forEach(({ meters, visible, custom }) => {
      const alt = altLabel(meters);
      const row = document.createElement('label');
      row.className =
        'flex items-center justify-between gap-2 py-2 px-2 rounded-lg active:bg-neutral-100 dark:active:bg-neutral-800';
      row.innerHTML = `
        <span class="flex items-center gap-2 min-w-0">
          <input type="checkbox" data-meters="${meters}" class="visibility-checkbox w-4 h-4 accent-lime-600 dark:accent-lime-400 shrink-0" ${visible ? 'checked' : ''}>
          <span class="text-sm text-neutral-800 dark:text-neutral-200 truncate">
            ${meters.toLocaleString('ja-JP')}m${alt ? ` <span class="text-neutral-400 dark:text-neutral-600">(${alt})</span>` : ''}
          </span>
        </span>
        ${custom
          ? `<button type="button" data-meters="${meters}" aria-label="${meters}mを削除"
              class="delete-distance-btn shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-neutral-400 dark:text-neutral-600 active:text-red-500 active:bg-neutral-100 dark:active:bg-neutral-800">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>`
          : '<span class="w-7 h-7 shrink-0"></span>'}
      `;
      modalList.appendChild(row);
    });
  }

  function handleAddDistance() {
    const meters = parseInt(newDistanceInput.value, 10);
    const result = addCustomDistance(meters);
    if (!result.ok) {
      newDistanceError.textContent = result.error;
      newDistanceError.classList.remove('hidden');
      return;
    }
    newDistanceError.classList.add('hidden');
    newDistanceInput.value = '';
    onDistancesChanged();
    newDistanceInput.focus();
  }

  function onDistancesChanged() {
    renderCards();
    applyPaceToAllVisible();
    renderModalList();
  }

  function openModal() {
    renderModalList();
    modalOverlay.classList.remove('hidden');
    modalOverlay.classList.add('flex');
    document.body.classList.add('modal-open');
    newDistanceInput.value = '';
    newDistanceError.classList.add('hidden');
  }

  function closeModal() {
    modalOverlay.classList.add('hidden');
    modalOverlay.classList.remove('flex');
    document.body.classList.remove('modal-open');
  }

  // ---------- 初期化 ----------

  function init() {
    renderCards();
    updatePaceSummary();
    listEl.addEventListener('input', onInput);
    listEl.addEventListener('keydown', onKeydown);
    listEl.addEventListener('focusin', onFocusIn);
    listEl.addEventListener('focusout', onFocusOut);
    listEl.addEventListener('pointerdown', onDragPointerDown);
    resetBtn.addEventListener('click', resetAll);

    initTheme();

    buildModal();
    editDistancesBtn.addEventListener('click', openModal);
  }

  init();
})();
