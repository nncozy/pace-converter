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

  const PIN_ICON = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-[18px] h-[18px]">
      <path d="M12 17v5"></path>
      <path d="M9 10.76V5h6v5.76a2 2 0 0 0 .55 1.38L17 13.5V17H7v-3.5l1.45-1.36A2 2 0 0 0 9 10.76Z"></path>
      <path d="M7 5h10"></path>
    </svg>`;
  const UNPIN_ICON = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-[18px] h-[18px]">
      <path d="M12 17v5"></path>
      <path d="M9 10.76V5h6v5.76a2 2 0 0 0 .55 1.38L17 13.5V17H7v-3.5l1.45-1.36A2 2 0 0 0 9 10.76Z"></path>
      <path d="M7 5h10"></path>
      <line x1="3" y1="3" x2="21" y2="21"></line>
    </svg>`;
  const EYE_OFF_ICON = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-[18px] h-[18px]">
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19"></path>
      <path d="M6.61 6.61A18.44 18.44 0 0 0 2 12s3 8 10 8a9.1 9.1 0 0 0 5.39-1.61"></path>
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"></path>
      <line x1="2" y1="2" x2="22" y2="22"></line>
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
    return DEFAULT_METERS.map((meters, i) => ({ meters, custom: false, visible: true, pinned: false, order: i }));
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
          pinned: !!d.pinned,
          order: Number.isFinite(d.order) ? d.order : null,
        }));
      // 壊れた保存データで同じ距離が二重に入ると、カードもDOM上で二重になり
      // getInput()が常に先頭だけを拾ってしまうので、ここで先勝ちで潰しておく
      const seen = new Set();
      cleaned = cleaned.filter((d) => (seen.has(d.meters) ? false : (seen.add(d.meters), true)));
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

  // ピン留めした距離は、order によらず常に一覧の先頭ブロックにまとめて表示する
  function visibleDistances() {
    const visible = sortedDistances().filter((d) => d.visible);
    return visible.filter((d) => d.pinned).concat(visible.filter((d) => !d.pinned));
  }

  // ドラッグ&ドロップで確定した表示順(距離のmeters配列)を永続化する。
  // 非表示中の距離は今回のドラッグ対象外だが、末尾に押し出すと再表示時に
  // 元の場所を見失うため、並び替え前に直前にあった表示中の距離のすぐ後ろ
  // という相対位置を保ったまま挿入し直す。
  function persistVisibleOrder(orderedMeters) {
    const before = sortedDistances();
    const hiddenAfter = new Map(); // 直前の表示中distanceのmeters(先頭ならnull) -> 非表示distanceのmeters配列
    let lastVisible = null;
    before.forEach((d) => {
      if (d.visible) {
        lastVisible = d.meters;
      } else {
        if (!hiddenAfter.has(lastVisible)) hiddenAfter.set(lastVisible, []);
        hiddenAfter.get(lastVisible).push(d.meters);
      }
    });

    const result = [];
    const appendHiddenAfter = (anchor) => {
      const list = hiddenAfter.get(anchor);
      if (list) {
        result.push(...list);
        hiddenAfter.delete(anchor);
      }
    };

    appendHiddenAfter(null);
    orderedMeters.forEach((meters) => {
      result.push(meters);
      appendHiddenAfter(meters);
    });
    // アンカーだった距離が削除済みなどで行き場のなかった非表示距離は末尾に付ける
    hiddenAfter.forEach((list) => result.push(...list));

    result.forEach((meters, i) => {
      const d = distances.find((x) => x.meters === meters);
      if (d) d.order = i;
    });
    saveDistances();
  }

  // ドラッグできない環境(キーボード操作)向けに、表示中の距離を1つ前後に移動する。
  // directionは-1(前へ)か+1(後ろへ)。
  function moveVisibleDistance(meters, direction) {
    const visible = visibleDistances();
    const idx = visible.findIndex((d) => d.meters === meters);
    const targetIdx = idx + direction;
    if (idx === -1 || targetIdx < 0 || targetIdx >= visible.length) return;
    // ピン留めブロックとの境界は越えさせない（越えても描画時に戻されるため）。
    // ドラッグと違って何も動いて見えないので、黙って無視せず理由を知らせる。
    if (visible[idx].pinned !== visible[targetIdx].pinned) {
      showToast('ピン留めの境界はまたげません');
      return;
    }

    const newOrder = visible.map((d) => d.meters);
    [newOrder[idx], newOrder[targetIdx]] = [newOrder[targetIdx], newOrder[idx]];
    persistVisibleOrder(newOrder);
    renderCards();
    applyPaceToAllVisible();

    const handle = listEl.querySelector(`.drag-handle[data-distance="${meters}"]`);
    if (handle) handle.focus();
  }

  function onDragHandleKeydown(e) {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    const handle = e.target.closest('.drag-handle');
    if (!handle) return;
    e.preventDefault();
    moveVisibleDistance(Number(handle.dataset.distance), e.key === 'ArrowUp' ? -1 : 1);
  }

  // キリの良い1000mの倍数ではない有名な距離にも、VDOT機能側と同じ名称を表示する
  const KNOWN_DISTANCE_LABELS = { 1609: '1マイル', 21097: 'ハーフマラソン', 42195: 'フルマラソン' };

  function altLabel(meters) {
    if (KNOWN_DISTANCE_LABELS[meters]) return KNOWN_DISTANCE_LABELS[meters];
    return meters >= 1000 && meters % 1000 === 0 ? `${meters / 1000}km` : null;
  }

  function addCustomDistance(meters) {
    if (!Number.isFinite(meters) || meters <= 0 || !Number.isInteger(meters)) {
      return { ok: false, error: '1m以上の整数で入力してください' };
    }
    if (meters > MAX_METERS) {
      return { ok: false, error: `${MAX_METERS.toLocaleString('ja-JP')}m以下で入力してください` };
    }
    const existing = distances.find((d) => d.meters === meters);
    if (existing) {
      return {
        ok: false,
        error: existing.visible
          ? 'その距離はすでに追加されています'
          : 'その距離はすでに追加されています（上の一覧でチェックを入れると表示されます）',
      };
    }
    const maxOrder = distances.reduce((m, d) => Math.max(m, d.order), -1);
    distances.push({ meters, custom: true, visible: true, pinned: false, order: maxOrder + 1 });
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

  function setPinned(meters, pinned) {
    const d = distances.find((x) => x.meters === meters);
    if (d) {
      d.pinned = pinned;
      saveDistances();
    }
  }

  function isPinned(meters) {
    const d = distances.find((x) => x.meters === meters);
    return !!(d && d.pinned);
  }

  function formatMeters(meters) {
    return `${meters.toLocaleString('ja-JP')}m`;
  }

  // 一覧の再描画は入力欄も作り直すため、ペースを描画後に必ず入れ直す。
  // 別カードのスワイプ操作でこの再描画が走ると、いま入力中のカードの欄まで
  // 巻き込んで消えてフォーカスも外れてしまうため、編集中の値とフォーカスは
  // 描画後に元へ戻す（値は未確定の生の入力のまま、パディングせずに戻す）。
  function refreshCards() {
    const active = document.activeElement;
    let editing = null;
    if (active && active.classList.contains('pace-input')) {
      const card = active.closest('.distance-card');
      if (card) {
        editing = {
          distance: active.dataset.distance,
          unit: active.dataset.unit,
          values: UNITS.map((u) => card.querySelector(`input[data-unit="${u}"]`).value),
          selectionStart: active.selectionStart,
          selectionEnd: active.selectionEnd,
        };
      }
    }

    renderCards();
    applyPaceToAllVisible();

    if (editing) {
      const newCard = listEl.querySelector(`.distance-card[data-distance="${editing.distance}"]`);
      if (newCard) {
        UNITS.forEach((u, i) => {
          newCard.querySelector(`input[data-unit="${u}"]`).value = editing.values[i];
        });
        const input = newCard.querySelector(`input[data-unit="${editing.unit}"]`);
        if (input) {
          input.focus();
          try {
            input.setSelectionRange(editing.selectionStart, editing.selectionEnd);
          } catch (e) {}
        }
      }
    }
  }

  function togglePinDistance(meters) {
    const next = !isPinned(meters);
    setPinned(meters, next);
    refreshCards();
    showToast(
      next ? `${formatMeters(meters)}をピン留めしました` : `${formatMeters(meters)}のピン留めを解除しました`
    );
  }

  // 非表示は編集モーダルを開かないと戻せないので、取り消せるトーストを必ず出す
  function hideDistance(meters) {
    setVisibility(meters, false);
    refreshCards();
    showToast(`${formatMeters(meters)}を非表示にしました`, '元に戻す', () => {
      setVisibility(meters, true);
      refreshCards();
    });
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
    // 別カードで横方向に確定済みの(＝指がまだ乗っている)スワイプが進行中のときに
    // ここで作り直すと、そのカードのDOMごと消えて掴んでいる指の行き場がなくなり、
    // ジェスチャが宙に浮いたまま壊れる。ジェスチャが終わるまで描画を遅らせ、
    // detachSwipeListeners() 側で改めて描画する。
    if (swipe.card && swipe.decided) {
      pendingRenderCards = true;
      return;
    }

    const visible = visibleDistances();
    // 作り直すと開いていたスワイプのDOMごと消えるので、参照を先に手放す
    openSwipeCard = null;
    if (swipe.card) detachSwipeListeners();
    listEl.innerHTML = '';

    if (visible.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'text-center text-sm text-neutral-400 dark:text-neutral-600 py-10 leading-relaxed';
      empty.textContent = '表示する距離がありません。左上の編集ボタンから距離を追加・表示してください。';
      listEl.appendChild(empty);
      return;
    }

    const frag = document.createDocumentFragment();

    visible.forEach(({ meters, pinned }) => {
      const alt = altLabel(meters);
      // 外枠はスワイプで現れるアクション面を切り抜くためのもので、
      // 見た目(背景・枠線)は中の .card-surface 側が持ち、そこだけが横に動く
      const card = document.createElement('div');
      card.className =
        'distance-card relative overflow-hidden rounded-2xl shadow-lg shadow-lime-900/5 dark:shadow-black/30' +
        (pinned ? ' is-pinned' : '');
      card.dataset.distance = String(meters);

      card.appendChild(buildSwipeAction('pin', meters, pinned));
      card.appendChild(buildSwipeAction('hide', meters, pinned));

      const surface = document.createElement('div');
      surface.className =
        // 背面のスワイプ用アクションが透けないよう、カード面は不透明にする
        'card-surface relative bg-white dark:bg-neutral-900 rounded-2xl p-3.5 border border-lime-600/10 dark:border-lime-400/10';
      card.appendChild(surface);

      const header = document.createElement('div');
      header.className = 'flex items-center gap-2 mb-2';
      header.innerHTML = `
        <button type="button" class="drag-handle shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-neutral-400 dark:text-neutral-600 touch-none cursor-grab active:cursor-grabbing" aria-label="${meters}mを並び替え（矢印キーの上下でも移動できます）" data-distance="${meters}">
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
        ${pinned
          ? `<span class="w-7 h-7 shrink-0 flex items-center justify-center text-lime-600 dark:text-lime-400" role="img" aria-label="ピン留め中">${PIN_ICON}</span>`
          : '<span class="w-7 h-7 shrink-0" aria-hidden="true"></span>'}
      `;
      surface.appendChild(header);

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
        // "00"だと未入力なのか実際に0が入っているのか見分けがつかないため、
        // 上部のペースサマリー欄と同じく"--"を使う
        input.placeholder = '--';
        input.autocomplete = 'off';
        input.setAttribute('aria-label', `${meters}m ${UNIT_LABEL[unit]}`);
        input.className =
          'pace-input w-12 bg-neutral-200 dark:bg-neutral-800 rounded-xl text-center text-xl font-mono py-2.5 ' +
          'focus:outline-none focus:ring-2 focus:ring-lime-600 dark:focus:ring-lime-400 text-neutral-900 dark:text-white transition-shadow';
        input.dataset.distance = String(meters);
        input.dataset.unit = unit;

        row.appendChild(input);
      });

      surface.appendChild(row);

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
      surface.appendChild(labels);

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

    // 「時」欄は2桁固定のレイアウトなので、それを超える巨大な値は表示上99:59:59.99に丸める
    if (hh > UNIT_MAX.hh) {
      hh = UNIT_MAX.hh;
      mm = 59;
      ss = 59;
      cs = 99;
    }

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

  // 現在のペースを、表示中の全距離の欄に反映する（距離の追加・表示切替の直後に使用）。
  // 他のカードで進行中の入力を巻き込んで上書きしないよう、いま編集中の欄の
  // 距離だけは recalcFrom() と同じくスキップする。
  function applyPaceToAllVisible() {
    if (currentPace === null) return;
    const active = document.activeElement;
    const editingDistance =
      active && active.classList && active.classList.contains('pace-input')
        ? Number(active.dataset.distance)
        : null;
    visibleDistances().forEach(({ meters }) => {
      if (meters === editingDistance) return;
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

  // ---------- トースト（取り消し付きの通知） ----------

  let toastEl, toastMessageEl, toastActionBtn;
  let toastTimer = null;
  let toastAction = null;
  const toastQueue = [];

  function buildToast() {
    toastEl = document.createElement('div');
    toastEl.className =
      'fixed left-1/2 -translate-x-1/2 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-[60] hidden ' +
      'items-center gap-3 max-w-[92vw] rounded-2xl px-4 py-2.5 text-xs font-semibold leading-snug shadow-xl shadow-black/30 ' +
      'bg-neutral-900/95 text-white dark:bg-neutral-100/95 dark:text-neutral-900';
    toastEl.setAttribute('role', 'status');
    toastEl.innerHTML = `
      <span class="toast-message"></span>
      <button type="button" class="toast-action hidden shrink-0 font-bold underline underline-offset-2 text-lime-300 dark:text-lime-700"></button>
    `;
    document.body.appendChild(toastEl);
    toastMessageEl = toastEl.querySelector('.toast-message');
    toastActionBtn = toastEl.querySelector('.toast-action');
    toastActionBtn.addEventListener('click', () => {
      const fn = toastAction;
      hideToast();
      if (fn) fn();
    });
  }

  function hideToast() {
    if (toastTimer !== null) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }
    toastAction = null;
    toastEl.classList.add('hidden');
    toastEl.classList.remove('flex');
    // 積んであった通知があれば続けて出す（取り消しを取りこぼさないため）
    if (toastQueue.length) {
      const next = toastQueue.shift();
      presentToast(next.message, next.actionLabel, next.onAction);
    }
  }

  function presentToast(message, actionLabel, onAction) {
    toastMessageEl.textContent = message;
    toastAction = onAction || null;
    if (actionLabel && onAction) {
      toastActionBtn.textContent = actionLabel;
      toastActionBtn.classList.remove('hidden');
    } else {
      toastActionBtn.classList.add('hidden');
    }
    toastEl.classList.remove('hidden');
    toastEl.classList.add('flex');
    toastTimer = setTimeout(hideToast, 6000);
  }

  // 表示中のトーストがある間は上書きせず、キューに積んで順番に出す。
  // （例: 連続で複数の距離を非表示にしても、それぞれの「元に戻す」を取りこぼさない）
  function showToast(message, actionLabel, onAction) {
    if (!toastEl.classList.contains('hidden')) {
      toastQueue.push({ message, actionLabel, onAction });
      return;
    }
    presentToast(message, actionLabel, onAction);
  }

  // ---------- カードの横スワイプ（右=ピン留め / 左=非表示） ----------
  //
  // LINEのトーク一覧と同じ操作感。指の動きに合わせてカードの面(.card-surface)を
  // 横にずらし、その下から隠れているアクションボタンが現れる。少しだけずらして
  // 離せばボタンが出たまま留まり(タップで実行)、大きくスワイプすればそのまま実行する。

  const SWIPE_ACTION_WIDTH = 104; // アクションボタンの幅(px)。CSSの .swipe-action と合わせる
  const SWIPE_DIRECTION_SLOP = 8; // 縦スクロールと横スワイプのどちらかを決めるまでの猶予(px)
  const SWIPE_SETTLE_MS = 180;

  let openSwipeCard = null;
  // 別カードのスワイプ中に描画がブロックされた場合に、ジェスチャ終了後
  // detachSwipeListeners() から描画をやり直すためのフラグ
  let pendingRenderCards = false;
  const swipe = {
    card: null,
    surface: null,
    pointerId: null,
    startX: 0,
    startY: 0,
    baseX: 0,
    dx: 0,
    width: 0,
    decided: false,
    abandoned: false,
  };

  function swipeOffsetOf(card) {
    return Number(card.dataset.swipeOffset || 0);
  }

  function setSwipeOffset(card, x, animate) {
    const surface = card.querySelector('.card-surface');
    if (!surface) return;
    card.dataset.swipeOffset = String(x);
    surface.style.transition = animate ? `transform ${SWIPE_SETTLE_MS}ms ease` : 'none';
    surface.style.transform = x ? `translate3d(${x}px, 0, 0)` : '';
    card.classList.toggle('swipe-armed', Math.abs(x) >= swipeFullThreshold(card));

    // 動かした向きのアクションだけを見せる（両方見えていると何が起きるか分からない）。
    // 閉じるアニメーション中はカード面がまだ動いている途中なので、隠すのは着地後にする。
    if (x !== 0) {
      card.classList.toggle('swipe-showing-pin', x > 0);
      card.classList.toggle('swipe-showing-hide', x < 0);
      openSwipeCard = card;
    } else {
      const hide = () => {
        if (swipeOffsetOf(card) !== 0) return;
        card.classList.remove('swipe-showing-pin', 'swipe-showing-hide');
      };
      if (animate) setTimeout(hide, SWIPE_SETTLE_MS);
      else hide();
      if (openSwipeCard === card) openSwipeCard = null;
    }
  }

  function swipeFullThreshold(card) {
    // 指を動かしている間はカード幅が変わらないので、計測済みの値を使い回して
    // 毎フレームのレイアウト再計算を避ける
    const width = swipe.card === card && swipe.width ? swipe.width : card.getBoundingClientRect().width;
    return Math.max(SWIPE_ACTION_WIDTH + 40, width * 0.45);
  }

  function closeSwipe(card, animate) {
    if (!card) return;
    setSwipeOffset(card, 0, animate !== false);
  }

  function closeOpenSwipe() {
    if (openSwipeCard) closeSwipe(openSwipeCard);
  }

  function detachSwipeListeners() {
    if (!swipe.card) return;
    swipe.card.removeEventListener('pointermove', onSwipePointerMove);
    swipe.card.removeEventListener('pointerup', onSwipePointerUp);
    swipe.card.removeEventListener('pointercancel', onSwipePointerCancel);
    try {
      if (swipe.pointerId !== null) swipe.card.releasePointerCapture(swipe.pointerId);
    } catch (e) {}
    swipe.card = null;
    swipe.surface = null;
    swipe.pointerId = null;
    document.body.classList.remove('swiping');

    // このジェスチャに阻まれて後回しにしていた描画があれば、ここで改めて行う
    if (pendingRenderCards) {
      pendingRenderCards = false;
      renderCards();
      applyPaceToAllVisible();
    }
  }

  function onSwipePointerDown(e) {
    if (dragCard || swipe.card) return; // 並び替え中／多重スワイプはしない
    if (e.pointerType === 'touch' && e.isPrimary === false) return;
    if (e.target.closest('.drag-handle') || e.target.closest('.swipe-action')) return;
    const card = e.target.closest('.distance-card');
    if (!card) return;

    if (openSwipeCard && openSwipeCard !== card) closeSwipe(openSwipeCard);

    swipe.card = card;
    swipe.surface = card.querySelector('.card-surface');
    swipe.pointerId = e.pointerId;
    swipe.startX = e.clientX;
    swipe.startY = e.clientY;
    swipe.baseX = swipeOffsetOf(card);
    swipe.dx = swipe.baseX;
    swipe.width = card.getBoundingClientRect().width;
    swipe.decided = false;
    swipe.abandoned = false;

    card.addEventListener('pointermove', onSwipePointerMove);
    card.addEventListener('pointerup', onSwipePointerUp);
    card.addEventListener('pointercancel', onSwipePointerCancel);
  }

  function onSwipePointerMove(e) {
    if (!swipe.card || e.pointerId !== swipe.pointerId || swipe.abandoned) return;
    const dx = e.clientX - swipe.startX;
    const dy = e.clientY - swipe.startY;

    if (!swipe.decided) {
      if (Math.abs(dx) < SWIPE_DIRECTION_SLOP && Math.abs(dy) < SWIPE_DIRECTION_SLOP) return;
      if (Math.abs(dx) <= Math.abs(dy)) {
        // 縦方向の動き -> 普通のスクロールとして扱い、以降このジェスチャには関与しない
        swipe.abandoned = true;
        return;
      }
      swipe.decided = true;
      try {
        swipe.card.setPointerCapture(e.pointerId);
      } catch (err) {}
      // 入力欄を触ったまま横に払われた場合、モバイルで数字キーボードが
      // 開きっぱなしになるのでフォーカスを外す
      const active = document.activeElement;
      if (active && swipe.card.contains(active) && typeof active.blur === 'function') active.blur();
      document.body.classList.add('swiping');
    }

    e.preventDefault();
    const limit = swipe.width * 0.9;
    swipe.dx = Math.max(-limit, Math.min(limit, swipe.baseX + dx));
    setSwipeOffset(swipe.card, swipe.dx, false);
  }

  function onSwipePointerUp(e) {
    if (!swipe.card || e.pointerId !== swipe.pointerId) return;
    const card = swipe.card;
    const meters = Number(card.dataset.distance);
    const dx = swipe.dx;
    const decided = swipe.decided;
    const baseX = swipe.baseX;
    detachSwipeListeners();

    if (!decided) {
      // 開いた状態のカードをただタップしたときは閉じる（LINEと同じ挙動）
      if (baseX !== 0) closeSwipe(card);
      return;
    }

    const full = swipeFullThreshold(card);
    const openAt = SWIPE_ACTION_WIDTH * 0.5;

    if (dx >= full) {
      closeSwipe(card, false);
      togglePinDistance(meters);
    } else if (dx <= -full) {
      collapseAndHide(card, meters);
    } else if (dx >= openAt) {
      setSwipeOffset(card, SWIPE_ACTION_WIDTH, true);
    } else if (dx <= -openAt) {
      setSwipeOffset(card, -SWIPE_ACTION_WIDTH, true);
    } else {
      closeSwipe(card);
    }
  }

  function onSwipePointerCancel(e) {
    if (!swipe.card || e.pointerId !== swipe.pointerId) return;
    const card = swipe.card;
    detachSwipeListeners();
    closeSwipe(card);
  }

  // 大きく左に払い切ったときは、そのまま画面外へ抜けてから一覧を作り直す
  function collapseAndHide(card, meters) {
    const surface = card.querySelector('.card-surface');
    if (!surface) {
      hideDistance(meters);
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      hideDistance(meters);
    };
    card.dataset.swipeOffset = '0';
    surface.style.transition = `transform ${SWIPE_SETTLE_MS}ms ease, opacity ${SWIPE_SETTLE_MS}ms ease`;
    surface.style.transform = `translate3d(${-card.getBoundingClientRect().width}px, 0, 0)`;
    surface.style.opacity = '0';
    // タイマーではなく実際のアニメーション終了に合わせる(タイミングのズレを防ぐ)。
    // transitionendが発火しない環境向けに、少し長めのタイマーも保険で入れておく。
    surface.addEventListener('transitionend', finish, { once: true });
    setTimeout(finish, SWIPE_SETTLE_MS + 100);
  }

  function onSwipeActionClick(e) {
    const btn = e.target.closest('.swipe-action');
    if (!btn) return;
    e.preventDefault();
    const card = btn.closest('.distance-card');
    const meters = Number(btn.dataset.distance);
    if (btn.dataset.swipeAction === 'pin') {
      closeSwipe(card, false);
      togglePinDistance(meters);
    } else {
      collapseAndHide(card, meters);
    }
  }

  function buildSwipeAction(kind, meters, pinned) {
    const isPin = kind === 'pin';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.tabIndex = -1; // 閉じている間は見えないので、キーボードのタブ順には入れない
    btn.setAttribute('aria-hidden', 'true');
    btn.dataset.swipeAction = kind;
    btn.dataset.distance = String(meters);
    btn.className =
      'swipe-action absolute inset-y-0 flex items-center w-[104px] text-white ' +
      (isPin
        ? 'left-0 justify-start pl-4 bg-gradient-to-r from-lime-600 to-green-500 dark:from-lime-500 dark:to-green-400'
        : 'right-0 justify-end pr-4 bg-gradient-to-l from-neutral-500 to-neutral-400 dark:from-neutral-700 dark:to-neutral-600');
    const label = isPin ? (pinned ? 'ピン解除' : 'ピン留め') : '非表示';
    const icon = isPin ? (pinned ? UNPIN_ICON : PIN_ICON) : EYE_OFF_ICON;
    btn.innerHTML = `<span class="flex flex-col items-center gap-0.5 leading-none">${icon}<span class="text-[10px] font-bold">${label}</span></span>`;
    return btn;
  }

  // ---------- カードの並び替え(ドラッグ&ドロップ) ----------
  //
  // position:fixed の left/top は動かさず固定し、指の移動量ぶんだけ
  // transform: translate3d() で追従させる(レイアウト計算を伴わずコンポジタ
  // だけで動くのでヌルヌル動く)。他のカードがどくアニメーションと、指を
  // 離した瞬間の着地アニメーションはFLIP(First-Last-Invert-Play)で行う。

  let dragCard = null;
  let dragPlaceholder = null;
  // ドラッグ中に入れ替え先の候補となる、同じピン留めブロック内の他カード。
  // ドラッグ中は増減しないため、毎フレーム作り直さずドラッグ開始時に一度だけ求める。
  let dragGroup = [];
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
    closeOpenSwipe();

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

    // ピン留め中のカードは常に先頭ブロックにいるので、並び替えも同じブロック内に
    // 限定する。そうしないと離した瞬間に描画順へ戻されて跳ねて見える。
    // (キーボード操作の moveVisibleDistance() と同じく、モデル側の pinned を正とする)
    const dragPinned = isPinned(Number(card.dataset.distance));
    dragGroup = Array.from(listEl.children).filter(
      (el) =>
        el !== dragPlaceholder &&
        el.classList.contains('distance-card') &&
        isPinned(Number(el.dataset.distance)) === dragPinned
    );

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
    const group = dragGroup;
    if (!group.length) return;

    let target = null;
    for (const sib of group) {
      const r = sib.getBoundingClientRect();
      if (dragCenterY < r.top + r.height / 2) {
        target = sib;
        break;
      }
    }

    let ref = target;
    if (!ref) {
      // グループ末尾の次のノード(=もう一方のグループの先頭 or null)の前に置く
      ref = group[group.length - 1].nextSibling;
      while (ref === dragPlaceholder) ref = ref.nextSibling;
    }

    if (dragPlaceholder.nextSibling !== ref) {
      animateSiblingsReorder(() => {
        listEl.insertBefore(dragPlaceholder, ref);
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
    dragGroup = [];
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

  // ---------- モーダル共通のフォーカス制御 ----------
  //
  // キーボード/スクリーンリーダー利用者向けに、開いたら閉じるボタン等へ
  // フォーカスを移し、Tabキーがモーダルの外に出ないよう閉じ込め、閉じたら
  // 開く前にフォーカスしていた要素へ戻す。

  function getFocusableEls(panel) {
    return Array.from(
      panel.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => el.offsetParent !== null);
  }

  function trapFocusKeydown(panel, e) {
    if (e.key !== 'Tab') return;
    const focusables = getFocusableEls(panel);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  let modalReturnFocusEl = null;

  function focusModalOnOpen(panel, triggerEl) {
    modalReturnFocusEl = triggerEl || document.activeElement;
    const closeBtn = panel.querySelector('button[aria-label="閉じる"]');
    (closeBtn || panel).focus();
  }

  function restoreFocusOnClose() {
    if (modalReturnFocusEl && typeof modalReturnFocusEl.focus === 'function') {
      modalReturnFocusEl.focus();
    }
    modalReturnFocusEl = null;
  }

  // ---------- 距離編集モーダル ----------

  let modalOverlay, modalList, newDistanceInput, newDistanceError;

  function buildModal() {
    modalOverlay = document.createElement('div');
    modalOverlay.id = 'distance-modal-overlay';
    modalOverlay.className =
      'fixed inset-0 z-50 hidden items-end sm:items-center justify-center bg-black/60 px-0 sm:px-4';
    modalOverlay.innerHTML = `
      <div id="distance-modal-panel" role="dialog" aria-modal="true" aria-labelledby="distance-modal-title" tabindex="-1" class="w-full sm:max-w-sm sm:rounded-3xl rounded-t-3xl bg-white/95 dark:bg-neutral-900/95 backdrop-blur-sm border border-lime-600/10 dark:border-lime-400/10 shadow-2xl shadow-lime-900/10 dark:shadow-black/50 p-4 max-h-[80vh] flex flex-col outline-none">
        <div class="flex items-center justify-between mb-3">
          <h2 id="distance-modal-title" class="text-base font-bold text-neutral-900 dark:text-white">距離を編集</h2>
          <button id="distance-modal-close" type="button" aria-label="閉じる"
            class="w-8 h-8 flex items-center justify-center rounded-full text-neutral-500 dark:text-neutral-400 active:bg-neutral-100 dark:active:bg-neutral-800">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <p class="text-xs text-neutral-500 dark:text-neutral-400 mb-2 leading-relaxed">チェックを外すと一覧から非表示になります。ピンのアイコンを押すと、その距離を一覧の先頭に固定できます。</p>
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
      if (modalOverlay.classList.contains('hidden')) return;
      if (e.key === 'Escape') {
        closeModal();
        return;
      }
      trapFocusKeydown(modalOverlay.querySelector('#distance-modal-panel'), e);
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
        return;
      }
      const pinBtn = e.target.closest('.pin-distance-btn');
      if (pinBtn) {
        e.preventDefault(); // <label>内のボタンなのでチェックボックスに伝播させない
        const meters = Number(pinBtn.dataset.meters);
        setPinned(meters, !isPinned(meters));
        onDistancesChanged();
      }
    });
  }

  function renderModalList() {
    modalList.innerHTML = '';
    sortedByMeters().forEach(({ meters, visible, custom, pinned }) => {
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
        <span class="flex items-center gap-0.5 shrink-0">
          ${visible
            ? `<button type="button" data-meters="${meters}" aria-pressed="${pinned ? 'true' : 'false'}" aria-label="${meters}mのピン留めを切り替え"
                class="pin-distance-btn w-7 h-7 flex items-center justify-center rounded-full ${pinned ? 'text-lime-600 dark:text-lime-400' : 'text-neutral-300 dark:text-neutral-700'} active:bg-neutral-100 dark:active:bg-neutral-800">
                ${PIN_ICON}
              </button>`
            : '<span class="w-7 h-7"></span>'}
          ${custom
            ? `<button type="button" data-meters="${meters}" aria-label="${meters}mを削除"
                class="delete-distance-btn w-7 h-7 flex items-center justify-center rounded-full text-neutral-400 dark:text-neutral-600 active:text-red-500 active:bg-neutral-100 dark:active:bg-neutral-800">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>`
            : '<span class="w-7 h-7"></span>'}
        </span>
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
    focusModalOnOpen(modalOverlay.querySelector('#distance-modal-panel'), editDistancesBtn);
  }

  function closeModal() {
    modalOverlay.classList.add('hidden');
    modalOverlay.classList.remove('flex');
    document.body.classList.remove('modal-open');
    restoreFocusOnClose();
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

  // 予想タイムの対象距離（VDOTの有効範囲とされる1500m〜フルマラソンのみ）
  const VDOT_PREDICT_DISTANCES = [
    { meters: 1500, label: '1500m' },
    { meters: 1609, label: '1マイル' },
    { meters: 3000, label: '3000m' },
    { meters: 5000, label: '5000m' },
    { meters: 10000, label: '10000m' },
    { meters: 21097, label: 'ハーフマラソン' },
    { meters: 42195, label: 'フルマラソン' },
  ];

  // VDOTのレベル目安。境界値は実際にvdotFromPerformance()の逆算（二分探索）で検証済み
  // （例: サブ4=フルマラソン4時間切り相当はVDOT≈38、サブ3=3時間切り相当はVDOT≈53〜54）。
  const VDOT_LEVELS = [
    { max: 30, label: '初心者・健康維持レベル', desc: '5kmを30分前後で走るくらい。これから伸びる段階' },
    { max: 38, label: '市民ランナーレベル', desc: 'フルマラソン4時間台〜5時間程度が目安' },
    { max: 48, label: 'サブ4ペース目安のレベル', desc: 'フルマラソン4時間切り(サブ4)が見えてくる' },
    { max: 58, label: 'サブ3ペース目安のレベル', desc: 'フルマラソン3時間切り(サブ3)が見えてくる' },
    { max: 68, label: '上級・競技志向レベル', desc: 'フルマラソン2時間30〜50分台クラス' },
    { max: Infinity, label: 'エリート・トップクラスレベル', desc: '国内トップ〜世界トップクラス' },
  ];
  const VDOT_GAUGE_MIN = 20;
  const VDOT_GAUGE_MAX = 75;
  // 計算式が実測値と一致することを確認済みの範囲（1500m〜フルマラソン）。
  // 「その他」で範囲外の距離を入力すると数式は動くが、レベル判定などの結果は
  // 大きく外れうるため、そのまま鵜呑みにされないよう警告を出す
  const VDOT_VALID_MIN_METERS = 1500;
  const VDOT_VALID_MAX_METERS = 42195;

  function getVdotLevel(vdot) {
    return VDOT_LEVELS.find((l) => vdot < l.max) || VDOT_LEVELS[VDOT_LEVELS.length - 1];
  }

  function formatDurationSec(sec) {
    const total = Math.max(0, Math.round(sec));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
  }

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

  // 指定距離をこのVDOTで走った場合の予想タイム(秒)を求める。
  // vdotFromPerformance(meters, t)はtについて単調減少なので二分探索で逆算できる
  // （実測値: VDOT50で5km≈19'56", 10km≈41'20", ハーフ≈1:31:31, フル≈3:10:40 と一致確認済み）。
  function predictRaceTimeSec(vdot, meters) {
    let lo = 30; // 30秒
    let hi = 30 * 3600; // 30時間
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      const requiredVdot = vdotFromPerformance(meters, mid);
      if (requiredVdot > vdot) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
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
    vdotResultEl,
    vdotRangeWarningEl,
    vdotHelpToggle,
    vdotHelpText,
    vdotLevelLabelEl,
    vdotLevelDescEl,
    vdotLevelFillEl,
    vdotPredictToggle,
    vdotPredictPanel,
    vdotPredictListEl,
    vdotPredictHelpToggle,
    vdotPredictHelpText;

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

  function updateVdotLevel(vdot, outOfRange) {
    if (vdot === null) {
      vdotLevelLabelEl.textContent = '--';
      vdotLevelDescEl.textContent = '距離とタイムを入力すると目安が表示されます';
      vdotLevelFillEl.style.width = '0%';
      return;
    }
    if (outOfRange) {
      // 有効範囲外では「エリート」等の断定的なレベル判定を出さない
      // (100mを全力の秒数で入力すると計算上VDOTが跳ね上がるなど、誤解を招くため)
      vdotLevelLabelEl.textContent = '判定対象外';
      vdotLevelDescEl.textContent = '有効範囲外の距離のため、レベルの目安は表示できません';
      vdotLevelFillEl.style.width = '0%';
      return;
    }
    const level = getVdotLevel(vdot);
    vdotLevelLabelEl.textContent = level.label;
    vdotLevelDescEl.textContent = level.desc;
    const pct = Math.max(0, Math.min(100, ((vdot - VDOT_GAUGE_MIN) / (VDOT_GAUGE_MAX - VDOT_GAUGE_MIN)) * 100));
    vdotLevelFillEl.style.width = `${pct}%`;
  }

  function updateVdotPredictions(vdot) {
    const timeEls = vdotPredictListEl.querySelectorAll('.vdot-predict-time');
    if (vdot === null) {
      timeEls.forEach((el) => { el.textContent = '--'; });
      return;
    }
    timeEls.forEach((el) => {
      const meters = Number(el.dataset.meters);
      el.textContent = formatDurationSec(predictRaceTimeSec(vdot, meters));
    });
  }

  function recalcVdot() {
    const meters = getVdotDistanceMeters();
    const totalMs = getVdotTimeMs();
    const zonePaceEls = TRAINING_ZONES.map((z) =>
      vdotModalOverlay.querySelector(`.vdot-zone-pace[data-zone="${z.key}"]`)
    );

    if (!meters || totalMs <= 0) {
      vdotResultEl.textContent = '--';
      vdotRangeWarningEl.classList.add('hidden');
      zonePaceEls.forEach((el) => { el.textContent = '--\'--"'; });
      updateVdotLevel(null);
      updateVdotPredictions(null);
      return;
    }

    const outOfRange = meters < VDOT_VALID_MIN_METERS || meters > VDOT_VALID_MAX_METERS;
    if (outOfRange) {
      vdotRangeWarningEl.textContent =
        `距離が有効範囲(${VDOT_VALID_MIN_METERS.toLocaleString('ja-JP')}m〜フルマラソン)外です。計算結果は参考程度に見てください。`;
    }
    vdotRangeWarningEl.classList.toggle('hidden', !outOfRange);

    const vdot = vdotFromPerformance(meters, totalMs / 1000);
    vdotResultEl.textContent = vdot.toFixed(1);
    TRAINING_ZONES.forEach((z, i) => {
      zonePaceEls[i].textContent = formatPaceSecPerKm(trainingPaceSecPerKm(vdot, z.pct));
    });
    updateVdotLevel(vdot, outOfRange);
    updateVdotPredictions(vdot);
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
      <div id="vdot-modal-panel" role="dialog" aria-modal="true" aria-labelledby="vdot-modal-title" tabindex="-1" class="w-full sm:max-w-sm sm:rounded-3xl rounded-t-3xl bg-white/95 dark:bg-neutral-900/95 backdrop-blur-sm border border-lime-600/10 dark:border-lime-400/10 shadow-2xl shadow-lime-900/10 dark:shadow-black/50 p-4 max-h-[85vh] overflow-y-auto outline-none">
        <div class="flex items-center justify-between mb-3">
          <h2 id="vdot-modal-title" class="text-base font-bold text-neutral-900 dark:text-white">VDOTトレーニングペース</h2>
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
          <input id="vdot-hh-input" type="number" inputmode="numeric" pattern="[0-9]*" min="0" max="99" placeholder="--" autocomplete="off" aria-label="時"
            class="vdot-time-input w-11 bg-neutral-200 dark:bg-neutral-800 rounded-xl text-center text-lg font-mono py-2 focus:outline-none focus:ring-2 focus:ring-lime-600 dark:focus:ring-lime-400 text-neutral-900 dark:text-white transition-shadow" data-vdot-unit="hh">
          <span class="text-neutral-400 dark:text-neutral-500 font-mono text-lg px-0.5">:</span>
          <input id="vdot-mm-input" type="number" inputmode="numeric" pattern="[0-9]*" min="0" max="59" placeholder="--" autocomplete="off" aria-label="分"
            class="vdot-time-input w-11 bg-neutral-200 dark:bg-neutral-800 rounded-xl text-center text-lg font-mono py-2 focus:outline-none focus:ring-2 focus:ring-lime-600 dark:focus:ring-lime-400 text-neutral-900 dark:text-white transition-shadow" data-vdot-unit="mm">
          <span class="text-neutral-400 dark:text-neutral-500 font-mono text-lg px-0.5">:</span>
          <input id="vdot-ss-input" type="number" inputmode="numeric" pattern="[0-9]*" min="0" max="59" placeholder="--" autocomplete="off" aria-label="秒"
            class="vdot-time-input w-11 bg-neutral-200 dark:bg-neutral-800 rounded-xl text-center text-lg font-mono py-2 focus:outline-none focus:ring-2 focus:ring-lime-600 dark:focus:ring-lime-400 text-neutral-900 dark:text-white transition-shadow" data-vdot-unit="ss">
          <span class="text-neutral-400 dark:text-neutral-500 font-mono text-lg px-0.5">.</span>
          <input id="vdot-cs-input" type="number" inputmode="numeric" pattern="[0-9]*" min="0" max="99" placeholder="--" autocomplete="off" aria-label="ミリ秒"
            class="vdot-time-input w-11 bg-neutral-200 dark:bg-neutral-800 rounded-xl text-center text-lg font-mono py-2 focus:outline-none focus:ring-2 focus:ring-lime-600 dark:focus:ring-lime-400 text-neutral-900 dark:text-white transition-shadow" data-vdot-unit="cs">
        </div>
        <div class="flex justify-center gap-0.5 mb-3 text-[10px] text-neutral-400 dark:text-neutral-600 font-mono">
          <span class="w-11 text-center">時</span><span class="w-3"></span>
          <span class="w-11 text-center">分</span><span class="w-3"></span>
          <span class="w-11 text-center">秒</span><span class="w-3"></span>
          <span class="w-11 text-center">ms</span>
        </div>

        <div class="text-center mb-1">
          <div id="vdot-result-value" aria-live="polite"
            class="text-3xl font-black bg-gradient-to-r from-lime-600 to-green-500 dark:from-lime-400 dark:to-green-300 bg-clip-text text-transparent">--</div>
          <p id="vdot-range-warning" class="hidden mt-1 mb-1 px-2.5 py-1.5 rounded-lg text-[10px] leading-relaxed text-amber-700 dark:text-amber-300 bg-amber-500/10 dark:bg-amber-400/10"></p>
          <button id="vdot-help-toggle" type="button" aria-expanded="false"
            class="inline-flex items-center gap-1 -mx-3 px-3 py-3 rounded-lg text-[10px] text-neutral-400 dark:text-neutral-600 active:text-neutral-600 dark:active:text-neutral-300 active:bg-neutral-200/60 dark:active:bg-neutral-700/60">
            VDOTとは？
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3">
              <circle cx="12" cy="12" r="9"></circle>
              <path d="M9.5 9a2.5 2.5 0 0 1 4.9.7c0 1.7-2.4 1.8-2.4 3.3"></path>
              <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none"></circle>
            </svg>
          </button>
          <p id="vdot-help-text" class="hidden text-[10px] text-neutral-500 dark:text-neutral-400 leading-relaxed mt-1 px-2">
            あなたの現在の走力（心肺機能のエンジン性能）を示すスコアです。満点はなく、練習を重ねるほど数値は上がっていきます。
          </p>
        </div>

        <div class="mb-3" aria-live="polite">
          <div id="vdot-level-label" class="text-center text-xs font-bold text-lime-700 dark:text-lime-300 mb-0.5">--</div>
          <div id="vdot-level-desc" class="text-center text-[10px] text-neutral-400 dark:text-neutral-600 mb-1.5 leading-relaxed">距離とタイムを入力すると目安が表示されます</div>
          <div class="h-2 rounded-full bg-neutral-200 dark:bg-neutral-800">
            <div id="vdot-level-fill" class="h-2 rounded-full bg-gradient-to-r from-lime-600 to-green-500 dark:from-lime-400 dark:to-green-300 transition-all" style="width: 0%"></div>
          </div>
          <div class="flex justify-between text-[9px] text-neutral-400 dark:text-neutral-600 mt-1">
            <span>初心者</span>
            <span>エリート</span>
          </div>
        </div>

        <div id="vdot-zone-list" class="space-y-1.5 mb-3"></div>

        <div class="rounded-xl bg-neutral-100/70 dark:bg-neutral-800/70 overflow-hidden">
          <button id="vdot-predict-toggle" type="button" aria-expanded="false"
            class="w-full flex items-center gap-2 px-3.5 py-3.5 text-left">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 w-4 h-4 text-lime-600 dark:text-lime-400">
              <circle cx="12" cy="12" r="9"></circle>
              <polyline points="12 7 12 12 15 15"></polyline>
            </svg>
            <span class="flex-1 text-xs font-semibold text-neutral-800 dark:text-neutral-200">他の距離のポテンシャルタイムを見る</span>
            <svg class="vdot-predict-chevron shrink-0 w-4 h-4 text-neutral-400 dark:text-neutral-600 transition-transform" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
          <div id="vdot-predict-panel" class="hidden px-3 pb-3">
            <p class="text-[10px] text-neutral-500 dark:text-neutral-400 leading-relaxed mb-2">※これは持久力トレーニングを積んだ場合に発揮できる「ポテンシャル」の目安です。今すぐ出せるタイムを保証するものではありません。</p>
            <div id="vdot-predict-list" class="space-y-1"></div>
            <button id="vdot-predict-help-toggle" type="button" aria-expanded="false"
              class="mt-2 -mx-3 px-3 py-3 rounded-lg inline-flex items-center gap-1 text-[10px] text-neutral-400 dark:text-neutral-600 active:text-neutral-600 dark:active:text-neutral-300 active:bg-neutral-200/60 dark:active:bg-neutral-700/60">
              もっと詳しく
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3">
                <circle cx="12" cy="12" r="9"></circle>
                <path d="M9.5 9a2.5 2.5 0 0 1 4.9.7c0 1.7-2.4 1.8-2.4 3.3"></path>
                <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none"></circle>
              </svg>
            </button>
            <p id="vdot-predict-help-text" class="hidden text-[10px] text-neutral-500 dark:text-neutral-400 leading-relaxed mt-1">
              入力した距離から、あなたの現在のエンジン（心肺機能）の強さを計算しています。ポテンシャルタイムに届かない場合は、エンジンの問題ではなく、その距離を走り切るための「脚作り（スタミナ）」が不足しているサインかもしれません。EペースやTペースの練習を活用して、スタミナを育てていきましょう。
            </p>
            <p class="text-[9px] text-neutral-400 dark:text-neutral-600 leading-relaxed mt-2">※有効範囲は1500m〜フルマラソン程度です（短距離・ウルトラマラソンは対象外）</p>
          </div>
        </div>
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
    vdotRangeWarningEl = vdotModalOverlay.querySelector('#vdot-range-warning');
    vdotHelpToggle = vdotModalOverlay.querySelector('#vdot-help-toggle');
    vdotHelpText = vdotModalOverlay.querySelector('#vdot-help-text');
    vdotLevelLabelEl = vdotModalOverlay.querySelector('#vdot-level-label');
    vdotLevelDescEl = vdotModalOverlay.querySelector('#vdot-level-desc');
    vdotLevelFillEl = vdotModalOverlay.querySelector('#vdot-level-fill');
    vdotPredictToggle = vdotModalOverlay.querySelector('#vdot-predict-toggle');
    vdotPredictPanel = vdotModalOverlay.querySelector('#vdot-predict-panel');
    vdotPredictListEl = vdotModalOverlay.querySelector('#vdot-predict-list');
    vdotPredictHelpToggle = vdotModalOverlay.querySelector('#vdot-predict-help-toggle');
    vdotPredictHelpText = vdotModalOverlay.querySelector('#vdot-predict-help-text');

    VDOT_PREDICT_DISTANCES.forEach((d) => {
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between text-xs px-1 py-0.5';
      row.innerHTML = `
        <span class="text-neutral-600 dark:text-neutral-300">${d.label}</span>
        <span class="vdot-predict-time font-mono font-bold text-neutral-900 dark:text-white" data-meters="${d.meters}">--</span>
      `;
      vdotPredictListEl.appendChild(row);
    });

    vdotHelpToggle.addEventListener('click', () => {
      const expanded = vdotHelpToggle.getAttribute('aria-expanded') === 'true';
      vdotHelpToggle.setAttribute('aria-expanded', String(!expanded));
      vdotHelpText.classList.toggle('hidden', expanded);
    });

    vdotPredictToggle.addEventListener('click', () => {
      const expanded = vdotPredictToggle.getAttribute('aria-expanded') === 'true';
      vdotPredictToggle.setAttribute('aria-expanded', String(!expanded));
      vdotPredictPanel.classList.toggle('hidden', expanded);
      vdotPredictToggle.querySelector('.vdot-predict-chevron').classList.toggle('rotate-180', !expanded);
    });

    vdotPredictHelpToggle.addEventListener('click', () => {
      const expanded = vdotPredictHelpToggle.getAttribute('aria-expanded') === 'true';
      vdotPredictHelpToggle.setAttribute('aria-expanded', String(!expanded));
      vdotPredictHelpText.classList.toggle('hidden', expanded);
    });

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
      if (vdotModalOverlay.classList.contains('hidden')) return;
      if (e.key === 'Escape') {
        closeVdotModal();
        return;
      }
      trapFocusKeydown(vdotModalOverlay.querySelector('#vdot-modal-panel'), e);
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
    // 入力欄に自動でフォーカスすると、意図せずカーソルが飛んだりモバイルの
    // キーボードが勝手に開いたりして煩わしいため、閉じるボタンへ留める
    focusModalOnOpen(vdotModalOverlay.querySelector('#vdot-modal-panel'), vdotBtn);
  }

  function closeVdotModal() {
    vdotModalOverlay.classList.add('hidden');
    vdotModalOverlay.classList.remove('flex');
    document.body.classList.remove('modal-open');
    restoreFocusOnClose();
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
    listEl.addEventListener('keydown', onDragHandleKeydown);
    listEl.addEventListener('pointerdown', onSwipePointerDown);
    listEl.addEventListener('click', onSwipeActionClick);
    // 開いたままのカードは、外側のどこかを触った時点で閉じる
    document.addEventListener('pointerdown', (e) => {
      if (!openSwipeCard) return;
      const card = e.target instanceof Element ? e.target.closest('.distance-card') : null;
      if (card !== openSwipeCard) closeSwipe(openSwipeCard);
    });
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

    buildToast();
    buildModal();
    editDistancesBtn.addEventListener('click', openModal);

    buildVdotModal();
    vdotBtn.addEventListener('click', openVdotModal);
  }

  init();
})();
