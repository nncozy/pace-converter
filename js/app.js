(() => {
  'use strict';

  const STORAGE_KEYS = {
    distances: 'paceConverter.distances.v1',
    theme: 'paceConverter.theme',
    vdotRace: 'paceConverter.vdotRace.v1',
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
  const paceMinInput = document.getElementById('pace-min-input');
  const paceSecInput = document.getElementById('pace-sec-input');
  const vdotBtn = document.getElementById('vdot-btn');

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

  // 現在の基準ペース(ms/m)を上部の分・秒入力欄に反映する。
  // ペース欄自身が入力元のときは呼ばない(自分の入力中に上書きしないため)。
  function updatePaceSummaryFields() {
    if (currentPace === null) {
      paceMinInput.value = '';
      paceSecInput.value = '';
      return;
    }
    // ms/m と s/km は数値として同じ(×1000してから÷1000するだけなので)
    const totalSec = Math.round(currentPace);
    paceMinInput.value = String(Math.floor(totalSec / 60));
    paceSecInput.value = pad2(totalSec % 60);
  }

  // 上部のペース入力欄(分・秒)から currentPace を再計算し、全距離に反映する
  function recalcFromPaceSummary() {
    const min = parseInt(paceMinInput.value, 10) || 0;
    const sec = parseInt(paceSecInput.value, 10) || 0;
    currentPace = min * 60 + sec; // s/km == ms/m
    applyPaceToAllVisible();
  }

  function onPaceSummaryInput(e) {
    const input = e.target;
    const maxLen = input === paceMinInput ? 3 : 2;
    let digits = input.value.replace(/[^0-9]/g, '');
    if (digits.length > maxLen) digits = digits.slice(0, maxLen);
    if (digits !== input.value) input.value = digits;

    recalcFromPaceSummary();

    if (input === paceMinInput && digits.length === 2) {
      paceSecInput.focus();
      paceSecInput.select();
    }
  }

  function onPaceSummaryKeydown(e) {
    if (e.key !== 'Backspace') return;
    if (e.target !== paceSecInput || e.target.value !== '') return;
    e.preventDefault();
    paceMinInput.focus();
    paceMinInput.select();
  }

  function onPaceSummaryFocusOut(e) {
    const input = e.target;
    if (input === paceSecInput) {
      const v = clampUnitValue('mm', parseInt(input.value, 10));
      input.value = pad2(v);
    } else {
      const v = parseInt(input.value, 10);
      input.value = Number.isNaN(v) ? '00' : String(Math.min(Math.max(v, 0), 999));
    }
    recalcFromPaceSummary();
  }

  function onPaceSummaryFocusIn(e) {
    e.target.select();
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
    updatePaceSummaryFields();

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
    updatePaceSummaryFields();
    // フォーカスを残したままだとモバイルで数字キーボードが開いたままになるため外す
    const active = document.activeElement;
    if (active && (active.classList.contains('pace-input') || active.classList.contains('pace-summary-input'))) {
      active.blur();
    }
  }

  // ---------- カードの並び替え(ドラッグ&ドロップ) ----------
  //
  // position:fixed の left/top は動かさず固定し、指の移動量ぶんだけ
  // transform: translate3d() で追従させる(レイアウト計算を伴わずコンポジタ
  // だけで動くのでヌルヌル動く)。他のカードがどくアニメーションと、指を
  // 離した瞬間の着地アニメーションはFLIP(First-Last-Invert-Play)で行う。

  let dragCard = null;
  let dragPlaceholder = null;
  let dragPointerId = null;
  let dragStartClientX = 0;
  let dragStartClientY = 0;
  let dragStartTop = 0;
  let dragCardHeight = 0;
  let dragRafId = null;
  let dragPendingX = 0;
  let dragPendingY = 0;
  let dragTrackingStarted = false;

  const DRAG_SETTLE_MS = 180;

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
    dragStartClientX = e.clientX;
    dragStartClientY = e.clientY;
    dragStartTop = rect.top;
    dragCardHeight = rect.height;
    dragTrackingStarted = false;

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
    // 持ち上げの瞬間だけふわっと拡大させ、以降の追従はtransitionなし(遅延ゼロ)にする
    card.style.transition = 'transform 120ms ease, box-shadow 150ms ease';
    card.style.transform = 'scale(1.03)';
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
    dragPendingX = e.clientX;
    dragPendingY = e.clientY;
    if (dragRafId === null) {
      dragRafId = requestAnimationFrame(processDragFrame);
    }
  }

  function processDragFrame() {
    dragRafId = null;
    if (!dragCard) return;

    if (!dragTrackingStarted) {
      // 持ち上げアニメーションを一度見せたら、以降は追従優先でtransitionを切る
      dragCard.style.transition = 'none';
      dragTrackingStarted = true;
    }

    const dx = dragPendingX - dragStartClientX;
    const dy = dragPendingY - dragStartClientY;
    dragCard.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(1.03)`;

    const dragCenterY = dragStartTop + dy + dragCardHeight / 2;
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

    const needsMove = target
      ? dragPlaceholder.nextSibling !== target
      : listEl.lastElementChild !== dragPlaceholder;
    if (needsMove) {
      animateSiblingsReorder(() => {
        if (target) listEl.insertBefore(dragPlaceholder, target);
        else listEl.appendChild(dragPlaceholder);
      });
    }
  }

  // mutate前後のカード位置の差分だけ逆方向にtransformしておき、0へtransitionさせる(FLIP)
  function animateSiblingsReorder(mutate) {
    const cards = Array.from(listEl.querySelectorAll('.distance-card'));
    const firstTops = new Map();
    cards.forEach((el) => firstTops.set(el, el.getBoundingClientRect().top));

    mutate();

    cards.forEach((el) => {
      const firstTop = firstTops.get(el);
      const lastTop = el.getBoundingClientRect().top;
      const delta = firstTop - lastTop;
      if (!delta) return;
      el.style.transition = 'none';
      el.style.transform = `translateY(${delta}px)`;
      requestAnimationFrame(() => {
        el.style.transition = `transform ${DRAG_SETTLE_MS}ms ease`;
        el.style.transform = '';
        el.addEventListener(
          'transitionend',
          () => {
            el.style.transition = '';
          },
          { once: true }
        );
      });
    });
  }

  function onDragPointerEnd(e) {
    if (!dragCard || e.pointerId !== dragPointerId) return;
    if (dragRafId !== null) {
      cancelAnimationFrame(dragRafId);
      dragRafId = null;
    }

    const card = dragCard; // 非同期コールバック内でも安全に参照できるようローカルへ退避
    const handle = card.querySelector('.drag-handle');
    if (handle) {
      handle.removeEventListener('pointermove', onDragPointerMove);
      handle.removeEventListener('pointerup', onDragPointerEnd);
      handle.removeEventListener('pointercancel', onDragPointerEnd);
    }

    const beforeRect = card.getBoundingClientRect(); // ドラッグ中の見た目上の位置

    dragPlaceholder.parentNode.insertBefore(card, dragPlaceholder);
    dragPlaceholder.remove();
    card.style.position = '';
    card.style.left = '';
    card.style.top = '';
    card.style.width = '';
    card.style.zIndex = '';
    card.style.pointerEvents = '';
    card.classList.remove('dragging-card');
    document.body.classList.remove('dragging');

    // 通常フローに戻した後の本来の位置との差分ぶんアニメーションさせて着地させる(FLIP)
    const afterRect = card.getBoundingClientRect();
    const dx = beforeRect.left - afterRect.left;
    const dy = beforeRect.top - afterRect.top;
    if (dx || dy) {
      card.style.transition = 'none';
      card.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(1.03)`;
      requestAnimationFrame(() => {
        card.style.transition = `transform ${DRAG_SETTLE_MS}ms ease`;
        card.style.transform = '';
        card.addEventListener(
          'transitionend',
          () => {
            card.style.transition = '';
          },
          { once: true }
        );
      });
    } else {
      card.style.transition = '';
      card.style.transform = '';
    }

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

  // ---------- VDOT / トレーニングペース ----------
  //
  // Jack Daniels & Jimmy Gilbert の式（Oxygen Power, 1979）でレース実績から
  // VDOT（フィットネス指標）を算出し、同じ式を逆算してトレーニングペース
  // ゾーンごとの目安ペースを求める。ゾーンの%VO2max値(0.70/0.84/0.88/0.98/1.05)
  // は、公開されているVDOT換算表の実測値（例: VDOT50でE 5'07"/km, M 4'25"/km,
  // T 4'15"/km, I 3'54"/km, R 3'41"/km）と一致することを確認済み。

  // プリセットは10km以下のレース距離のみ（ハーフ/フルは想定利用者の対象外のため入れない。
  // 必要なら「その他」から自由入力できる）
  const VDOT_PRESET_DISTANCES = [
    { meters: 1500, label: '1500m' },
    { meters: 1609, label: '1マイル (1609m)' },
    { meters: 3000, label: '3000m' },
    { meters: 5000, label: '5000m' },
    { meters: 10000, label: '10000m' },
  ];

  const TRAINING_ZONES = [
    {
      key: 'E',
      label: 'イージー / LSD',
      desc: '楽に会話できるペース。有酸素の土台作り',
      pct: 0.70,
      hint: '会話ができるくらい余裕のあるペース。練習の大部分（週の7〜8割くらい）はこの強度で十分です。30分〜2時間ほど、息が弾みすぎない範囲でゆっくり走りましょう。',
    },
    {
      key: 'M',
      label: 'マラソン',
      desc: 'フルマラソンのレースペースの目安',
      pct: 0.84,
      hint: 'フルマラソンを走るときの目標ペースです。10kmまでしか出ない場合でも、「ちょっと頑張る」持続走（20〜60分ほど）の強度の目安として使えます。',
    },
    {
      key: 'T',
      label: '閾値走',
      desc: '「ややきつい」を1時間ほど保てるペース',
      pct: 0.88,
      hint: 'きついけど一言二言なら会話できる強度。乳酸がたまり始める境目を押し上げる練習です。20分間走り続けるか、5〜10分の反復を短い休憩（1〜2分のジョグ）を挟んで数本行うのがおすすめ。合計20〜40分くらいが目安です。',
    },
    {
      key: 'I',
      label: 'インターバル',
      desc: 'VO2maxを鍛える高強度ペース',
      pct: 0.98,
      hint: 'きついが全力ではない強度。3〜5分ほど走って、同じくらいの時間のジョグで回復、を繰り返します（例: 1000mを5本、間はジョグで2〜3分）。フォームが崩れるほど追い込まず、余裕がなくなったら本数を減らして大丈夫です。',
    },
    {
      key: 'R',
      label: 'レペティション',
      desc: 'フォームとスピードを鍛える全力に近いペース',
      pct: 1.05,
      hint: '速いフォームとスピード感を養うための短い反復走です。200〜400mほどを、しっかり休んで（反復と同じか長めのジョグ・レスト）繰り返します。追い込む練習ではないので、疲れすぎない本数に留めましょう。',
    },
  ];

  function vo2FromVelocity(v) {
    // vは m/min
    return -4.6 + 0.182258 * v + 0.000104 * v * v;
  }

  function percentVO2Max(tMin) {
    return (
      0.8 +
      0.1894393 * Math.exp(-0.012778 * tMin) +
      0.2989558 * Math.exp(-0.1932605 * tMin)
    );
  }

  function vdotFromPerformance(meters, totalSec) {
    const tMin = totalSec / 60;
    const v = meters / tMin; // m/min
    return vo2FromVelocity(v) / percentVO2Max(tMin);
  }

  // vo2FromVelocity(v) = vo2 を v について解く（2次方程式の解の公式）
  function velocityFromVO2(vo2) {
    const a = 0.000104;
    const b = 0.182258;
    const c = -(4.6 + vo2);
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return null;
    return (-b + Math.sqrt(discriminant)) / (2 * a); // m/min
  }

  function trainingPaceSecPerKm(vdot, pct) {
    const v = velocityFromVO2(vdot * pct);
    if (!v || v <= 0) return null;
    return (1000 / v) * 60;
  }

  function formatPaceSecPerKm(sec) {
    if (sec === null || !Number.isFinite(sec)) return '--\'--"';
    const total = Math.round(sec);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}'${pad2(s)}"`;
  }

  function loadVdotRace() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.vdotRace);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !Number.isFinite(parsed.meters) || parsed.meters <= 0) return null;
      if (!Number.isFinite(parsed.totalMs) || parsed.totalMs <= 0) return null;
      return parsed;
    } catch (e) {
      return null;
    }
  }

  function saveVdotRace(meters, totalMs) {
    try {
      localStorage.setItem(STORAGE_KEYS.vdotRace, JSON.stringify({ meters, totalMs }));
    } catch (e) {
      // 保存できなくても計算自体は継続させる
    }
  }

  let vdotModalOverlay,
    vdotDistanceSelect,
    vdotCustomWrap,
    vdotCustomInput,
    vdotHhInput,
    vdotMmInput,
    vdotSsInput,
    vdotCsInput,
    vdotResultEl;

  function vdotTimeInputs() {
    return [vdotHhInput, vdotMmInput, vdotSsInput, vdotCsInput];
  }

  function setVdotField(unit, value) {
    vdotTimeInputs()[UNITS.indexOf(unit)].value = pad2(value);
  }

  function getVdotDistanceMeters() {
    const raw = vdotDistanceSelect.value === 'custom' ? vdotCustomInput.value : vdotDistanceSelect.value;
    const v = parseInt(raw, 10);
    return Number.isFinite(v) && v > 0 ? v : null;
  }

  function getVdotTimeMs() {
    const hh = parseInt(vdotHhInput.value, 10) || 0;
    const mm = parseInt(vdotMmInput.value, 10) || 0;
    const ss = parseInt(vdotSsInput.value, 10) || 0;
    const cs = parseInt(vdotCsInput.value, 10) || 0;
    return (hh * 3600 + mm * 60 + ss) * 1000 + cs * 10;
  }

  function recalcVdot() {
    const meters = getVdotDistanceMeters();
    const totalMs = getVdotTimeMs();
    const zonePaceEls = TRAINING_ZONES.map((z) =>
      vdotModalOverlay.querySelector(`.vdot-zone-pace[data-zone="${z.key}"]`)
    );

    if (!meters || totalMs <= 0) {
      vdotResultEl.textContent = '--';
      zonePaceEls.forEach((el) => { el.textContent = '--\'--"'; });
      return;
    }

    const vdot = vdotFromPerformance(meters, totalMs / 1000);
    vdotResultEl.textContent = vdot.toFixed(1);
    TRAINING_ZONES.forEach((z, i) => {
      zonePaceEls[i].textContent = formatPaceSecPerKm(trainingPaceSecPerKm(vdot, z.pct));
    });
    saveVdotRace(meters, totalMs);
  }

  function onVdotDistanceChange() {
    vdotCustomWrap.classList.toggle('hidden', vdotDistanceSelect.value !== 'custom');
    recalcVdot();
  }

  function onVdotTimeInput(e) {
    const input = e.target;
    if (!input.classList.contains('vdot-time-input')) return;
    let digits = input.value.replace(/[^0-9]/g, '');
    if (digits.length > 2) digits = digits.slice(0, 2);
    if (digits !== input.value) input.value = digits;

    recalcVdot();

    if (digits.length === 2) {
      const inputs = vdotTimeInputs();
      const idx = UNITS.indexOf(input.dataset.vdotUnit);
      const next = inputs[idx + 1];
      if (next) {
        next.focus();
        next.select();
      } else {
        input.blur();
      }
    }
  }

  function onVdotTimeKeydown(e) {
    if (e.key !== 'Backspace') return;
    const input = e.target;
    if (!input.classList.contains('vdot-time-input')) return;
    if (input.value !== '') return;

    const inputs = vdotTimeInputs();
    const idx = UNITS.indexOf(input.dataset.vdotUnit);
    const prev = inputs[idx - 1];
    if (prev) {
      e.preventDefault();
      prev.focus();
      prev.select();
    }
  }

  function onVdotTimeFocusOut(e) {
    const input = e.target;
    if (!input.classList.contains('vdot-time-input')) return;
    const v = clampUnitValue(input.dataset.vdotUnit, parseInt(input.value, 10));
    input.value = pad2(v);
    recalcVdot();
  }

  function onVdotTimeFocusIn(e) {
    if (e.target.classList.contains('vdot-time-input')) e.target.select();
  }

  function buildVdotModal() {
    vdotModalOverlay = document.createElement('div');
    vdotModalOverlay.id = 'vdot-modal-overlay';
    vdotModalOverlay.className =
      'fixed inset-0 z-50 hidden items-end sm:items-center justify-center bg-black/60 px-0 sm:px-4';
    vdotModalOverlay.innerHTML = `
      <div id="vdot-modal-panel" class="w-full sm:max-w-sm sm:rounded-3xl rounded-t-3xl bg-white/95 dark:bg-neutral-900/95 backdrop-blur-sm border border-lime-600/10 dark:border-lime-400/10 shadow-2xl shadow-lime-900/10 dark:shadow-black/50 p-4 max-h-[85vh] overflow-y-auto">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-base font-bold text-neutral-900 dark:text-white">VDOTトレーニングペース</h2>
          <button id="vdot-modal-close" type="button" aria-label="閉じる"
            class="w-8 h-8 flex items-center justify-center rounded-full text-neutral-500 dark:text-neutral-400 active:bg-neutral-100 dark:active:bg-neutral-800">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <p class="text-xs text-neutral-500 dark:text-neutral-400 mb-1 leading-relaxed">直近のレース結果を入力すると、フィットネス指標「VDOT」と5つのトレーニングペースの目安を計算します。使わなくてもタイム換算機能は普通に使えます。</p>
        <p class="text-[10px] text-neutral-400 dark:text-neutral-600 mb-3 leading-relaxed">各ペースの名前をタップすると、練習の目安ややり方が見られます。</p>

        <label class="block text-xs font-semibold text-neutral-500 dark:text-neutral-400 mb-1">距離</label>
        <select id="vdot-distance-select"
          class="w-full bg-neutral-100 dark:bg-neutral-800 rounded-xl px-3 py-2 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-lime-600 dark:focus:ring-lime-400 mb-2">
          ${VDOT_PRESET_DISTANCES.map((d) => `<option value="${d.meters}">${d.label}</option>`).join('')}
          <option value="custom">その他（距離を指定）</option>
        </select>
        <div id="vdot-custom-distance-wrap" class="hidden mb-3">
          <input id="vdot-custom-distance-input" type="number" min="1" max="${MAX_METERS}" step="1" inputmode="numeric"
            placeholder="距離 (m)" autocomplete="off"
            class="w-full bg-neutral-100 dark:bg-neutral-800 rounded-xl px-3 py-2 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-lime-600 dark:focus:ring-lime-400">
        </div>

        <label class="block text-xs font-semibold text-neutral-500 dark:text-neutral-400 mb-1 mt-1">タイム</label>
        <div class="flex items-center justify-center gap-0.5 mb-1">
          <input id="vdot-hh-input" type="number" inputmode="numeric" pattern="[0-9]*" min="0" max="99" placeholder="00" autocomplete="off" aria-label="時"
            class="vdot-time-input w-11 bg-neutral-200 dark:bg-neutral-800 rounded-xl text-center text-lg font-mono py-2 focus:outline-none focus:ring-2 focus:ring-lime-600 dark:focus:ring-lime-400 text-neutral-900 dark:text-white transition-shadow" data-vdot-unit="hh">
          <span class="text-neutral-400 dark:text-neutral-500 font-mono text-lg px-0.5">:</span>
          <input id="vdot-mm-input" type="number" inputmode="numeric" pattern="[0-9]*" min="0" max="59" placeholder="00" autocomplete="off" aria-label="分"
            class="vdot-time-input w-11 bg-neutral-200 dark:bg-neutral-800 rounded-xl text-center text-lg font-mono py-2 focus:outline-none focus:ring-2 focus:ring-lime-600 dark:focus:ring-lime-400 text-neutral-900 dark:text-white transition-shadow" data-vdot-unit="mm">
          <span class="text-neutral-400 dark:text-neutral-500 font-mono text-lg px-0.5">:</span>
          <input id="vdot-ss-input" type="number" inputmode="numeric" pattern="[0-9]*" min="0" max="59" placeholder="00" autocomplete="off" aria-label="秒"
            class="vdot-time-input w-11 bg-neutral-200 dark:bg-neutral-800 rounded-xl text-center text-lg font-mono py-2 focus:outline-none focus:ring-2 focus:ring-lime-600 dark:focus:ring-lime-400 text-neutral-900 dark:text-white transition-shadow" data-vdot-unit="ss">
          <span class="text-neutral-400 dark:text-neutral-500 font-mono text-lg px-0.5">.</span>
          <input id="vdot-cs-input" type="number" inputmode="numeric" pattern="[0-9]*" min="0" max="99" placeholder="00" autocomplete="off" aria-label="ミリ秒"
            class="vdot-time-input w-11 bg-neutral-200 dark:bg-neutral-800 rounded-xl text-center text-lg font-mono py-2 focus:outline-none focus:ring-2 focus:ring-lime-600 dark:focus:ring-lime-400 text-neutral-900 dark:text-white transition-shadow" data-vdot-unit="cs">
        </div>
        <div class="flex justify-center gap-0.5 mb-3 text-[10px] text-neutral-400 dark:text-neutral-600 font-mono">
          <span class="w-11 text-center">時</span><span class="w-3"></span>
          <span class="w-11 text-center">分</span><span class="w-3"></span>
          <span class="w-11 text-center">秒</span><span class="w-3"></span>
          <span class="w-11 text-center">ms</span>
        </div>

        <div class="text-center mb-3">
          <div id="vdot-result-value" class="text-3xl font-black bg-gradient-to-r from-lime-600 to-green-500 dark:from-lime-400 dark:to-green-300 bg-clip-text text-transparent">--</div>
          <div class="text-[10px] text-neutral-400 dark:text-neutral-600">VDOT</div>
        </div>

        <div id="vdot-zone-list" class="space-y-1.5"></div>
      </div>
    `;
    document.body.appendChild(vdotModalOverlay);

    vdotDistanceSelect = vdotModalOverlay.querySelector('#vdot-distance-select');
    vdotCustomWrap = vdotModalOverlay.querySelector('#vdot-custom-distance-wrap');
    vdotCustomInput = vdotModalOverlay.querySelector('#vdot-custom-distance-input');
    vdotHhInput = vdotModalOverlay.querySelector('#vdot-hh-input');
    vdotMmInput = vdotModalOverlay.querySelector('#vdot-mm-input');
    vdotSsInput = vdotModalOverlay.querySelector('#vdot-ss-input');
    vdotCsInput = vdotModalOverlay.querySelector('#vdot-cs-input');
    vdotResultEl = vdotModalOverlay.querySelector('#vdot-result-value');

    const zoneListEl = vdotModalOverlay.querySelector('#vdot-zone-list');
    TRAINING_ZONES.forEach((z) => {
      const row = document.createElement('div');
      row.className = 'rounded-xl bg-neutral-100/70 dark:bg-neutral-800/70 overflow-hidden';
      row.innerHTML = `
        <button type="button" class="vdot-zone-toggle w-full flex items-center gap-2 px-3 py-2 text-left" aria-expanded="false">
          <span class="shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-gradient-to-br from-lime-600 to-green-500 dark:from-lime-400 dark:to-green-300 text-white dark:text-neutral-950 text-xs font-black">${z.key}</span>
          <div class="flex-1 min-w-0">
            <div class="text-xs font-semibold text-neutral-800 dark:text-neutral-200">${z.label}</div>
            <div class="text-[10px] text-neutral-400 dark:text-neutral-600 truncate">${z.desc}</div>
          </div>
          <div class="shrink-0 text-right">
            <div class="vdot-zone-pace text-sm font-mono font-bold text-neutral-900 dark:text-white" data-zone="${z.key}">--'--"</div>
            <div class="text-[9px] text-neutral-400 dark:text-neutral-600">/ km</div>
          </div>
          <svg class="vdot-zone-chevron shrink-0 w-4 h-4 text-neutral-400 dark:text-neutral-600 transition-transform" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
        <div class="vdot-zone-hint hidden px-3 pb-3 text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">${z.hint}</div>
      `;
      zoneListEl.appendChild(row);
    });

    zoneListEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.vdot-zone-toggle');
      if (!btn) return;
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!expanded));
      btn.nextElementSibling.classList.toggle('hidden', expanded);
      btn.querySelector('.vdot-zone-chevron').classList.toggle('rotate-180', !expanded);
    });

    vdotModalOverlay.querySelector('#vdot-modal-close').addEventListener('click', closeVdotModal);
    vdotModalOverlay.addEventListener('click', (e) => {
      if (e.target === vdotModalOverlay) closeVdotModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !vdotModalOverlay.classList.contains('hidden')) closeVdotModal();
    });

    vdotDistanceSelect.addEventListener('change', onVdotDistanceChange);
    vdotCustomInput.addEventListener('input', recalcVdot);
    vdotModalOverlay.addEventListener('input', onVdotTimeInput);
    vdotModalOverlay.addEventListener('keydown', onVdotTimeKeydown);
    vdotModalOverlay.addEventListener('focusout', onVdotTimeFocusOut);
    vdotModalOverlay.addEventListener('focusin', onVdotTimeFocusIn);
  }

  function openVdotModal() {
    const saved = loadVdotRace();
    if (saved) {
      const preset = VDOT_PRESET_DISTANCES.find((d) => d.meters === saved.meters);
      if (preset) {
        vdotDistanceSelect.value = String(preset.meters);
        vdotCustomWrap.classList.add('hidden');
        vdotCustomInput.value = '';
      } else {
        vdotDistanceSelect.value = 'custom';
        vdotCustomInput.value = String(saved.meters);
        vdotCustomWrap.classList.remove('hidden');
      }
      const { hh, mm, ss, cs } = msToFields(saved.totalMs);
      setVdotField('hh', hh);
      setVdotField('mm', mm);
      setVdotField('ss', ss);
      setVdotField('cs', cs);
    } else {
      vdotDistanceSelect.value = '5000';
      vdotCustomWrap.classList.add('hidden');
      vdotCustomInput.value = '';
      vdotTimeInputs().forEach((el) => { el.value = ''; });
    }

    recalcVdot();
    vdotModalOverlay.classList.remove('hidden');
    vdotModalOverlay.classList.add('flex');
    document.body.classList.add('modal-open');
  }

  function closeVdotModal() {
    vdotModalOverlay.classList.add('hidden');
    vdotModalOverlay.classList.remove('flex');
    document.body.classList.remove('modal-open');
  }

  // ---------- 初期化 ----------

  function init() {
    renderCards();
    updatePaceSummaryFields();
    listEl.addEventListener('input', onInput);
    listEl.addEventListener('keydown', onKeydown);
    listEl.addEventListener('focusin', onFocusIn);
    listEl.addEventListener('focusout', onFocusOut);
    listEl.addEventListener('pointerdown', onDragPointerDown);
    // アプリ切り替えなどでページが非表示になった場合、rAFが止まりドラッグが
    // 宙に浮いたままになるのを防ぐため、ドラッグ中なら強制的に確定させる
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && dragCard && dragPointerId !== null) {
        onDragPointerEnd({ pointerId: dragPointerId });
      }
    });
    resetBtn.addEventListener('click', resetAll);

    paceMinInput.addEventListener('input', onPaceSummaryInput);
    paceSecInput.addEventListener('input', onPaceSummaryInput);
    paceMinInput.addEventListener('keydown', onPaceSummaryKeydown);
    paceSecInput.addEventListener('keydown', onPaceSummaryKeydown);
    paceMinInput.addEventListener('focusout', onPaceSummaryFocusOut);
    paceSecInput.addEventListener('focusout', onPaceSummaryFocusOut);
    paceMinInput.addEventListener('focusin', onPaceSummaryFocusIn);
    paceSecInput.addEventListener('focusin', onPaceSummaryFocusIn);

    initTheme();

    buildModal();
    editDistancesBtn.addEventListener('click', openModal);

    buildVdotModal();
    vdotBtn.addEventListener('click', openVdotModal);
  }

  init();
})();
