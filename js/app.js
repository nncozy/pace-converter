(() => {
  'use strict';

  const STORAGE_KEYS = {
    distances: 'paceConverter.distances.v1',
    theme: 'paceConverter.theme',
    vdotRace: 'paceConverter.vdotRace.v1',
    introDismissed: 'paceConverter.introDismissed.v1',
    swipeCoachDismissed: 'paceConverter.swipeCoachDismissed.v1',
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
  const addDistanceShortcutBtn = document.getElementById('add-distance-shortcut');
  const paceMinInput = document.getElementById('pace-min-input');
  const paceSecInput = document.getElementById('pace-sec-input');
  const vdotBtn = document.getElementById('vdot-btn');
  const introEl = document.getElementById('intro');
  const introDismissBtn = document.getElementById('intro-dismiss');
  const swipeCoachEl = document.getElementById('swipe-coach');
  const swipeCoachDismissBtn = document.getElementById('swipe-coach-dismiss');
  const paceHeroEl = document.getElementById('pace-hero');
  const paceDerivedEl = document.getElementById('pace-derived');
  const appTitleEl = document.getElementById('app-title');
  const headerPaceBtn = document.getElementById('header-pace');
  const headerPaceValueEl = headerPaceBtn.querySelector('.header-pace-value');
  const viewTitleEl = document.getElementById('view-title');
  const backBtn = document.getElementById('back-btn');
  const helpBtn = document.getElementById('help-btn');
  const mainViewEl = document.getElementById('view-main');
  const helpViewEl = document.getElementById('view-help');

  // 現在の基準ペース（ms/m）。未入力なら null。
  let currentPace = null;
  // いまのペースを決めた入力元。距離(メートル)か、ヒーローのペース欄なら 'pace'。
  // 入力後に9枚のカードが全部同じ顔になり、どれが自分の入力でどれが計算結果か
  // 分からなくなるのを防ぐためだけに持っている。
  let paceSource = null;
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

  // 編集モーダルの「よく使う距離」。初期値がトラック種目に寄っていて、
  // ロードのレース距離(ハーフ・フル・1マイル)を出すには毎回メートル数を
  // 手打ちする必要があった。ワンタップで出し入れできるようにする。
  const PRESET_DISTANCES = [
    { meters: 1609, label: '1マイル' },
    { meters: 2000, label: '2km' },
    { meters: 3000, label: '3km' },
    { meters: 5000, label: '5km' },
    { meters: 10000, label: '10km' },
    { meters: 21097, label: 'ハーフ' },
    { meters: 42195, label: 'フル' },
  ];

  // ---------- 距離ごとに必要な桁だけを出す ----------
  //
  // 全距離に hh/mm/ss/cs の4欄を常設すると、50mの「時」やフルマラソンの「ms」の
  // ように、まず0以外にならない欄がタップ目標の間に挟まって精度と一覧性を落とす。
  // 「時」の常設は5000mから。5000mを1時間超で走る（歩く）ことは実際にあるので、
  // ここを上げすぎると直接入力で59分の壁に当たって詰む。逆に3000m以下では
  // 1時間を超えることがないので、常に0の欄を挟まない。
  const HOUR_FIELD_MIN_METERS = 5000; // これ以上なら「時」を常設する
  const CENTI_FIELD_MAX_METERS = 3000; // これ以下なら「ms」を常設する

  function unitAlwaysVisible(unit, meters) {
    if (unit === 'hh') return meters >= HOUR_FIELD_MIN_METERS;
    if (unit === 'cs') return meters <= CENTI_FIELD_MAX_METERS;
    return true;
  }

  // 常設対象でない欄も、0以外の値が入った時点で必ず出す。値があるのに隠すと
  // 「入力が消えた」ように見えるうえ、合計タイムの読み方まで嘘になる。
  function updateUnitVisibility(meters) {
    const card = listEl.querySelector(`.distance-card[data-distance="${meters}"]`);
    if (!card) return;
    let firstVisibleCell = null;
    UNITS.forEach((unit) => {
      const cell = card.querySelector(`.unit-cell[data-unit="${unit}"]`);
      if (!cell) return;
      const input = cell.querySelector('input');
      const value = parseInt(input.value, 10);
      const show =
        unitAlwaysVisible(unit, meters) ||
        (Number.isFinite(value) && value > 0) ||
        // 入力中の欄を足元から消さない（打ち終わって0のままなら次の更新で畳まれる）
        document.activeElement === input;
      cell.hidden = !show;
      if (show && !firstVisibleCell) firstVisibleCell = cell;
    });
    // 区切り文字は「その欄の手前」に属させてあるので、欄と一緒に畳まれる。
    // 先頭に来た欄の区切りだけは、行頭の ":" が残らないようここで消す。
    card.querySelectorAll('.unit-sep').forEach((sep) => {
      sep.hidden = sep.parentElement === firstVisibleCell;
    });
  }

  function updateAllUnitVisibility() {
    visibleDistances().forEach(({ meters }) => updateUnitVisibility(meters));
  }

  // ---------- 値が書き換わった瞬間を見せる ----------
  //
  // 他の距離の数字は黙って差し替わるだけなので、「1つ入れれば全部が連動する」
  // というこのアプリ唯一の売りが、使っていても体感できていなかった。
  const FLASH_MS = 420; // css の value-flash と合わせる
  const pendingFlash = new Set();
  let flashingNodes = [];
  let flashScheduled = false;
  let flashClearTimer = null;

  function clearFlash() {
    flashingNodes.forEach((n) => n.classList.remove('is-flashing'));
    flashingNodes = [];
  }

  function flashInput(el) {
    if (el === document.activeElement) return;
    pendingFlash.add(el);
    if (flashScheduled) return;
    flashScheduled = true;
    requestAnimationFrame(() => {
      flashScheduled = false;
      // 直前に光らせた欄も含めて一度全部外す。animationend は環境によっては
      // 飛んでこないので、後始末はイベントに頼らずこちらで確実に行う。
      clearFlash();
      if (flashClearTimer !== null) clearTimeout(flashClearTimer);
      // アニメーションを再生し直すためのリフローは、1フレームに1回だけにする
      // （欄ごとに offsetWidth を読むと入力のたびに数十回の強制同期レイアウトになる）
      void listEl.offsetWidth;
      flashingNodes = Array.from(pendingFlash);
      flashingNodes.forEach((n) => n.classList.add('is-flashing'));
      pendingFlash.clear();
      flashClearTimer = setTimeout(() => {
        flashClearTimer = null;
        clearFlash();
      }, FLASH_MS);
    });
  }

  // 「いま自分が打った値はどれか」をカード側に残す
  function updateSourceHighlight() {
    listEl.querySelectorAll('.distance-card').forEach((card) => {
      card.classList.toggle('is-source', Number(card.dataset.distance) === paceSource);
    });
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
          // 描き直した直後は活性要素がbodyなので、編集中だった欄が「値0だから」
          // という理由で畳まれていることがある。畳まれた欄にはフォーカスが入らず
          // 入力途中の数字が見えないまま残るので、先に開いてから focus する。
          const cell = input.closest('.unit-cell');
          if (cell) cell.hidden = false;
          input.focus();
          try {
            input.setSelectionRange(editing.selectionStart, editing.selectionEnd);
          } catch (e) {}
          // 区切り文字の畳み方をいまの表示状態に合わせ直す
          updateUnitVisibility(Number(editing.distance));
        }
      }
    }
  }

  function togglePinDistance(meters) {
    const next = !isPinned(meters);
    setPinned(meters, next);
    // 操作を覚えた人にヒントを出し続けない
    dismissSwipeCoach(true);
    refreshCards();
    showToast(
      next ? `${formatMeters(meters)}をピン留めしました` : `${formatMeters(meters)}のピン留めを解除しました`
    );
  }

  // 非表示は編集モーダルを開かないと戻せないので、取り消せるトーストを必ず出す
  function hideDistance(meters) {
    setVisibility(meters, false);
    dismissSwipeCoach(true);
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
      updateDerivedInfo();
      return;
    }
    // ms/m と s/km は数値として同じ(×1000してから÷1000するだけなので)
    const totalSec = Math.round(currentPace);
    paceMinInput.value = String(Math.floor(totalSec / 60));
    paceSecInput.value = pad2(totalSec % 60);
    updateDerivedInfo();
  }

  function formatPaceMinSec(totalSec) {
    const t = Math.max(0, Math.round(totalSec));
    return `${Math.floor(t / 60)}'${pad2(t % 60)}"`;
  }

  // ペースが決まったときだけ、ランナーが頭の中でやる換算(トラック1周・1マイル・
  // 時速)を先回りして出す。あわせて「消すものが無いのに消すボタンが居座る」のを
  // やめ、クリアはペースがあるときだけ出す。
  function updateDerivedInfo() {
    const hasValue = currentPace !== null;
    const hasPace = hasValue && currentPace > 0;
    resetBtn.hidden = !hasValue;
    paceDerivedEl.hidden = !hasPace;

    if (!hasPace) {
      paceDerivedEl.innerHTML = '';
      headerPaceValueEl.textContent = '';
    } else {
      const perKmSec = currentPace; // s/km == ms/m
      paceDerivedEl.innerHTML = [
        `<span class="derived-chip">400m 1周 <b>${formatPaceMinSec(perKmSec * 0.4)}</b></span>`,
        `<span class="derived-chip">1マイル <b>${formatPaceMinSec(perKmSec * 1.609344)}</b></span>`,
        `<span class="derived-chip">時速 <b>${(3600 / perKmSec).toFixed(1)}</b> km/h</span>`,
      ].join('');
      headerPaceValueEl.textContent = formatPaceMinSec(perKmSec);
      // 一度でも使い方が分かった人に、初回向けの案内を出し続けない
      dismissIntro(true);
    }
    syncHeaderPace();
  }

  // 上部のペース入力欄(分・秒)から currentPace を再計算し、全距離に反映する
  function recalcFromPaceSummary() {
    const min = parseInt(paceMinInput.value, 10) || 0;
    const sec = parseInt(paceSecInput.value, 10) || 0;
    currentPace = min * 60 + sec; // s/km == ms/m
    paceSource = 'pace';
    updateSourceHighlight();
    applyPaceToAllVisible();
    updateDerivedInfo();
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
      header.className = 'flex items-center gap-2 mb-1.5';
      header.innerHTML = `
        <button type="button" class="drag-handle shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-neutral-400 dark:text-neutral-600 touch-none cursor-grab active:cursor-grabbing" aria-label="${meters}mを並び替え（矢印キーの上下でも移動できます）" data-distance="${meters}">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <circle cx="9" cy="6" r="1.6"></circle><circle cx="15" cy="6" r="1.6"></circle>
            <circle cx="9" cy="12" r="1.6"></circle><circle cx="15" cy="12" r="1.6"></circle>
            <circle cx="9" cy="18" r="1.6"></circle><circle cx="15" cy="18" r="1.6"></circle>
          </svg>
        </button>
        <div class="flex-1 min-w-0 flex items-baseline justify-center gap-1.5">
          <span class="font-extrabold text-lime-600 dark:text-lime-400 text-lg">${meters.toLocaleString('ja-JP')}</span>
          <span class="text-xs text-neutral-500 dark:text-neutral-500 font-normal">m</span>
          ${alt ? `<span class="text-[10px] text-neutral-400 dark:text-neutral-600 font-normal">(${alt})</span>` : ''}
          <span class="source-badge shrink-0 rounded-full bg-lime-600 dark:bg-lime-400 px-1.5 py-px text-[9px] font-bold leading-tight text-white dark:text-neutral-950">基準</span>
        </div>
        ${pinned
          ? `<span class="w-7 h-7 shrink-0 flex items-center justify-center text-lime-600 dark:text-lime-400" role="img" aria-label="ピン留め中">${PIN_ICON}</span>`
          : '<span class="w-7 h-7 shrink-0" aria-hidden="true"></span>'}
      `;
      surface.appendChild(header);

      const row = document.createElement('div');
      row.className = 'flex items-start justify-center';

      UNITS.forEach((unit, idx) => {
        // 区切り文字は「その欄の手前」に置き、欄と同じ .unit-cell に入れておく。
        // こうしておくと、桁を畳んだときに区切りも一緒に消えて行が破綻しない。
        const cell = document.createElement('div');
        cell.className = 'unit-cell flex items-start';
        cell.dataset.unit = unit;

        if (idx > 0 && SEPARATOR[UNITS[idx - 1]]) {
          const sep = document.createElement('span');
          sep.className = 'unit-sep text-neutral-400 dark:text-neutral-500 font-mono text-lg px-1 pt-1.5';
          sep.textContent = SEPARATOR[UNITS[idx - 1]];
          cell.appendChild(sep);
        }

        const stack = document.createElement('div');
        stack.className = 'flex flex-col items-center';

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
          'pace-input w-14 bg-neutral-200 dark:bg-neutral-800 rounded-xl text-center text-xl font-mono py-2 ' +
          'focus:outline-none focus:ring-2 focus:ring-lime-600 dark:focus:ring-lime-400 text-neutral-900 dark:text-white transition-shadow';
        input.dataset.distance = String(meters);
        input.dataset.unit = unit;
        stack.appendChild(input);

        const label = document.createElement('span');
        label.className = 'mt-0.5 text-[9px] leading-none text-neutral-400 dark:text-neutral-600 font-mono';
        label.textContent = UNIT_LABEL[unit];
        stack.appendChild(label);

        cell.appendChild(stack);
        row.appendChild(cell);
      });

      surface.appendChild(row);

      frag.appendChild(card);
    });

    listEl.appendChild(frag);
    updateAllUnitVisibility();
    updateSourceHighlight();
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
    const el = getInput(distance, unit);
    if (!el) return;
    const next = pad2(value);
    if (el.value === next) return;
    el.value = next;
    flashInput(el);
  }

  // 桁を畳んでいる関係で、隣の欄が画面に出ていないことがある。
  // フォーカス移動はいま見えている欄だけを辿る。
  function neighborVisibleInput(distance, unit, direction) {
    const inputs = getRowInputs(distance);
    let idx = UNITS.indexOf(unit) + direction;
    while (idx >= 0 && idx < inputs.length) {
      const el = inputs[idx];
      const cell = el && el.closest('.unit-cell');
      if (el && cell && !cell.hidden) return el;
      idx += direction;
    }
    return null;
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
    paceSource = sourceDistance;
    updateSourceHighlight();
    updatePaceSummaryFields();

    visibleDistances().forEach(({ meters }) => {
      if (meters === sourceDistance) return;
      const { hh, mm, ss, cs } = msToFields(pace * meters);
      setFieldValue(meters, 'hh', hh);
      setFieldValue(meters, 'mm', mm);
      setFieldValue(meters, 'ss', ss);
      setFieldValue(meters, 'cs', cs);
    });
    updateAllUnitVisibility();
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
    updateAllUnitVisibility();
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
      const next = neighborVisibleInput(distance, unit, 1);
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
    const prev = neighborVisibleInput(distance, unit, -1);
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
    paceSource = null;
    updateSourceHighlight();
    visibleDistances().forEach(({ meters }) => {
      UNITS.forEach((unit) => {
        getInput(meters, unit).value = '';
      });
    });
    // フォーカスを残したままだとモバイルで数字キーボードが開いたままになるため外す。
    // 桁の畳み直しより先に外す（活性中の欄は畳まれない仕様なので、後だと
    // 空になった「時」や「ms」が1つだけ残って見える）。
    const active = document.activeElement;
    if (active && (active.classList.contains('pace-input') || active.classList.contains('pace-summary-input'))) {
      active.blur();
    }
    updateAllUnitVisibility();
    updatePaceSummaryFields();
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

  let modalOverlay, modalList, modalListFade, presetChipsEl, newDistanceInput, newDistanceError, addDistanceBtn;

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
        <p class="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 mb-1.5">よく使う距離</p>
        <div id="distance-preset-chips" class="flex flex-wrap gap-1.5 mb-3"></div>

        <p class="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 mb-1">すべての距離</p>
        <p class="text-xs text-neutral-500 dark:text-neutral-400 mb-2 leading-relaxed">チェックを外すと一覧から非表示になります。ピンのアイコンを押すと、その距離を一覧の先頭に固定できます。</p>
        <div id="distance-modal-list" class="flex-1 overflow-y-auto space-y-1 -mx-1 px-1"></div>
        <div class="mt-3 pt-3 border-t border-lime-600/10 dark:border-lime-400/10">
          <div class="flex gap-2">
            <input id="new-distance-input" type="number" min="1" max="${MAX_METERS}" step="1" inputmode="numeric"
              placeholder="距離を追加 (m)"
              class="flex-1 min-w-0 bg-neutral-100 dark:bg-neutral-800 rounded-xl px-3 py-2 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-lime-600 dark:focus:ring-lime-400">
            <button id="add-distance-btn" type="button" disabled
              class="px-4 py-2 rounded-xl border border-lime-600/40 dark:border-lime-400/40 text-lime-700 dark:text-lime-300 text-sm font-bold transition shrink-0 disabled:opacity-30 disabled:cursor-not-allowed enabled:active:scale-95 enabled:hover:bg-lime-600/10 dark:enabled:hover:bg-lime-400/10">
              追加
            </button>
          </div>
          <p id="new-distance-error" class="text-xs text-red-500 mt-1 hidden"></p>
        </div>
      </div>
    `;
    document.body.appendChild(modalOverlay);

    modalList = modalOverlay.querySelector('#distance-modal-list');
    presetChipsEl = modalOverlay.querySelector('#distance-preset-chips');
    newDistanceInput = modalOverlay.querySelector('#new-distance-input');
    newDistanceError = modalOverlay.querySelector('#new-distance-error');
    addDistanceBtn = modalOverlay.querySelector('#add-distance-btn');

    presetChipsEl.addEventListener('click', (e) => {
      const chip = e.target.closest('.preset-chip');
      if (chip) togglePresetDistance(Number(chip.dataset.meters));
    });

    // 閉じる操作はすべて履歴を1つ戻す形にそろえる。端末の戻るジェスチャと
    // ✕・背景タップ・Escape が同じ結果になるようにするため。
    modalOverlay.querySelector('#distance-modal-close').addEventListener('click', goBack);
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) goBack();
    });
    document.addEventListener('keydown', (e) => {
      if (modalOverlay.classList.contains('hidden')) return;
      if (e.key === 'Escape') {
        goBack();
        return;
      }
      trapFocusKeydown(modalOverlay.querySelector('#distance-modal-panel'), e);
    });

    addDistanceBtn.addEventListener('click', handleAddDistance);
    newDistanceInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !addDistanceBtn.disabled) {
        e.preventDefault();
        handleAddDistance();
      }
    });
    newDistanceInput.addEventListener('input', () => {
      addDistanceBtn.disabled = newDistanceInput.value.trim() === '';
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
    modalList.addEventListener('scroll', updateModalListFade);
  }

  // 一覧がスクロール可能で、かつ下端まで達していない間だけ下端をフェードさせ、
  // 「まだ下に続きがある」ことを一目で分かるようにする。
  function updateModalListFade() {
    if (!modalListFade) return;
    const hasMoreBelow = modalList.scrollHeight - modalList.scrollTop - modalList.clientHeight > 4;
    modalListFade.classList.toggle('opacity-100', hasMoreBelow);
    modalListFade.classList.toggle('opacity-0', !hasMoreBelow);
  }

  // チップ1つで「追加して表示」「非表示に戻す」まで完結させる。
  // 押した結果が aria-pressed の見た目にそのまま出るので、
  // 追加できたかどうかを下の一覧まで確かめに行かなくてよい。
  function togglePresetDistance(meters) {
    const existing = distances.find((d) => d.meters === meters);
    if (!existing) {
      const result = addCustomDistance(meters);
      if (!result.ok) {
        showToast(result.error);
        return;
      }
    } else {
      setVisibility(meters, !existing.visible);
    }
    onDistancesChanged();
  }

  function renderPresetChips() {
    presetChipsEl.innerHTML = PRESET_DISTANCES.map(({ meters, label }) => {
      const d = distances.find((x) => x.meters === meters);
      const on = !!(d && d.visible);
      return `<button type="button" class="preset-chip" data-meters="${meters}" aria-pressed="${on}">
        <span aria-hidden="true">${on ? '✓' : '＋'}</span>${label}
      </button>`;
    }).join('');
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
    // スクロール可能な間だけ下端をフェードさせ、まだ続きがあることを示す。
    // モーダル内の最後の子要素として sticky 配置することで、外側のflexの
    // 高さ計算に左右されず常に見えている領域の下端に貼り付く。
    modalListFade = document.createElement('div');
    modalListFade.className =
      'pointer-events-none sticky bottom-0 h-8 bg-gradient-to-t from-white dark:from-neutral-900 to-transparent opacity-0 transition-opacity duration-150';
    // space-y-1のmargin-topルールがクラスの-mt-8より詳細度で勝ってしまうため、
    // インラインstyleで確実に上書きする（親のflex高さと無関係に効かせるため）。
    modalListFade.style.marginTop = '-2rem';
    modalList.appendChild(modalListFade);
    updateModalListFade();
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
    addDistanceBtn.disabled = true;
    onDistancesChanged();
    newDistanceInput.focus();
  }

  function onDistancesChanged() {
    renderCards();
    applyPaceToAllVisible();
    renderModalList();
    renderPresetChips();
  }

  // triggerEl は閉じたときにフォーカスを戻す先。ヘッダーの編集ボタンと
  // 一覧末尾のショートカットのどちらから開いたかで戻り先が変わる。
  function openModal(triggerEl) {
    // ルーターから毎回呼ばれるので、開いている間の再描画で入力中の値を飛ばさない
    if (!modalOverlay.classList.contains('hidden')) return;
    renderModalList();
    renderPresetChips();
    modalOverlay.classList.remove('hidden');
    modalOverlay.classList.add('flex');
    document.body.classList.add('modal-open');
    newDistanceInput.value = '';
    newDistanceError.classList.add('hidden');
    addDistanceBtn.disabled = true;
    focusModalOnOpen(modalOverlay.querySelector('#distance-modal-panel'), triggerEl || editDistancesBtn);
    // 開いた直後はまだ非表示だったため高さが取れていない。表示後に測り直す。
    requestAnimationFrame(updateModalListFade);
  }

  function closeModal() {
    if (modalOverlay.classList.contains('hidden')) return;
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

  let trainingViewEl,
    vdotDistanceSelect,
    vdotImportBtn,
    vdotImportLabel,
    vdotCustomWrap,
    vdotCustomInput,
    vdotHhInput,
    vdotMmInput,
    vdotSsInput,
    vdotCsInput,
    vdotResultEl,
    vdotRangeWarningEl,
    vdotLevelLabelEl,
    vdotLevelDescEl,
    vdotLevelFillEl,
    vdotPredictListEl,
    zonesTabBtn,
    predictTabBtn,
    zonesPanelEl,
    predictPanelEl;

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
      trainingViewEl.querySelector(`.vdot-zone-pace[data-zone="${z.key}"]`)
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

  function buildTrainingView() {
    trainingViewEl = document.getElementById('view-training');
    trainingViewEl.innerHTML = `
      <section class="pt-4">
        <h2 class="section-heading">直近のレース結果</h2>

        <button id="vdot-import-btn" type="button" hidden class="btn-secondary w-full mb-2.5">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          <span id="vdot-import-label">メイン画面の入力を取り込む</span>
        </button>

        <label for="vdot-distance-select" class="block text-xs font-semibold text-neutral-500 dark:text-neutral-400 mb-1">距離</label>
        <select id="vdot-distance-select"
          class="w-full bg-neutral-100 dark:bg-neutral-800 rounded-xl px-3 py-2.5 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-lime-600 dark:focus:ring-lime-400 mb-2">
          ${VDOT_PRESET_DISTANCES.map((d) => `<option value="${d.meters}">${d.label}</option>`).join('')}
          <option value="custom">その他（距離を指定）</option>
        </select>
        <div id="vdot-custom-distance-wrap" class="hidden mb-2">
          <input id="vdot-custom-distance-input" type="number" min="1" max="${MAX_METERS}" step="1" inputmode="numeric"
            placeholder="距離 (m)" autocomplete="off" aria-label="距離 (m)"
            class="w-full bg-neutral-100 dark:bg-neutral-800 rounded-xl px-3 py-2.5 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-lime-600 dark:focus:ring-lime-400">
        </div>

        <span class="block text-xs font-semibold text-neutral-500 dark:text-neutral-400 mb-1 mt-2">タイム</span>
        <div class="flex items-center justify-center gap-0.5">
          <input id="vdot-hh-input" type="number" inputmode="numeric" pattern="[0-9]*" min="0" max="99" placeholder="--" autocomplete="off" aria-label="時"
            class="vdot-time-input w-12 bg-neutral-200 dark:bg-neutral-800 rounded-xl text-center text-lg font-mono py-2 focus:outline-none focus:ring-2 focus:ring-lime-600 dark:focus:ring-lime-400 text-neutral-900 dark:text-white transition-shadow" data-vdot-unit="hh">
          <span class="text-neutral-400 dark:text-neutral-500 font-mono text-lg px-0.5">:</span>
          <input id="vdot-mm-input" type="number" inputmode="numeric" pattern="[0-9]*" min="0" max="59" placeholder="--" autocomplete="off" aria-label="分"
            class="vdot-time-input w-12 bg-neutral-200 dark:bg-neutral-800 rounded-xl text-center text-lg font-mono py-2 focus:outline-none focus:ring-2 focus:ring-lime-600 dark:focus:ring-lime-400 text-neutral-900 dark:text-white transition-shadow" data-vdot-unit="mm">
          <span class="text-neutral-400 dark:text-neutral-500 font-mono text-lg px-0.5">:</span>
          <input id="vdot-ss-input" type="number" inputmode="numeric" pattern="[0-9]*" min="0" max="59" placeholder="--" autocomplete="off" aria-label="秒"
            class="vdot-time-input w-12 bg-neutral-200 dark:bg-neutral-800 rounded-xl text-center text-lg font-mono py-2 focus:outline-none focus:ring-2 focus:ring-lime-600 dark:focus:ring-lime-400 text-neutral-900 dark:text-white transition-shadow" data-vdot-unit="ss">
          <span class="text-neutral-400 dark:text-neutral-500 font-mono text-lg px-0.5">.</span>
          <input id="vdot-cs-input" type="number" inputmode="numeric" pattern="[0-9]*" min="0" max="99" placeholder="--" autocomplete="off" aria-label="ミリ秒"
            class="vdot-time-input w-12 bg-neutral-200 dark:bg-neutral-800 rounded-xl text-center text-lg font-mono py-2 focus:outline-none focus:ring-2 focus:ring-lime-600 dark:focus:ring-lime-400 text-neutral-900 dark:text-white transition-shadow" data-vdot-unit="cs">
        </div>
        <div class="flex justify-center gap-0.5 mt-1 text-[10px] text-neutral-400 dark:text-neutral-600 font-mono">
          <span class="w-12 text-center">時</span><span class="w-3"></span>
          <span class="w-12 text-center">分</span><span class="w-3"></span>
          <span class="w-12 text-center">秒</span><span class="w-3"></span>
          <span class="w-12 text-center">ms</span>
        </div>
      </section>

      <!-- 2つのタブの共通の前提になる数値なので、タブの外に置いて切り替えでも消さない -->
      <section class="mt-3 rounded-2xl border border-lime-600/15 dark:border-lime-400/15 bg-white/70 dark:bg-neutral-900/70 px-3.5 py-3">
        <div class="flex items-baseline justify-center gap-2">
          <span class="text-[10px] font-black tracking-widest text-neutral-400 dark:text-neutral-600 uppercase">VDOT</span>
          <span id="vdot-result-value" aria-live="polite"
            class="text-3xl font-black leading-none bg-gradient-to-r from-lime-600 to-green-500 dark:from-lime-400 dark:to-green-300 bg-clip-text text-transparent">--</span>
        </div>
        <p id="vdot-range-warning" class="hidden mt-1.5 px-2.5 py-1.5 rounded-lg text-[10px] leading-relaxed text-amber-700 dark:text-amber-300 bg-amber-500/10 dark:bg-amber-400/10"></p>
        <div class="mt-1.5" aria-live="polite">
          <div id="vdot-level-label" class="text-center text-xs font-bold text-lime-700 dark:text-lime-300">--</div>
          <div id="vdot-level-desc" class="text-center text-[10px] text-neutral-400 dark:text-neutral-600 mb-1.5 leading-relaxed">距離とタイムを入力すると目安が表示されます</div>
          <div class="h-1.5 rounded-full bg-neutral-200 dark:bg-neutral-800">
            <div id="vdot-level-fill" class="h-1.5 rounded-full bg-gradient-to-r from-lime-600 to-green-500 dark:from-lime-400 dark:to-green-300 transition-all" style="width: 0%"></div>
          </div>
          <div class="flex justify-between text-[9px] text-neutral-400 dark:text-neutral-600 mt-1">
            <span>初心者</span>
            <span>エリート</span>
          </div>
        </div>
      </section>

      <!-- 練習ペースとポテンシャルタイムは同じ入力から出る対等な2つの結果。
           縦に直列させると後ろ側が800px下に沈むので、横に並べて1タップで行き来させる。 -->
      <div role="tablist" aria-label="トレーニングペースの表示切り替え" class="seg-tabs sticky top-[3.25rem] z-20 mt-3">
        <button type="button" role="tab" id="tab-zones" aria-controls="panel-zones" aria-selected="true" class="seg-tab">練習ペース</button>
        <button type="button" role="tab" id="tab-predict" aria-controls="panel-predict" aria-selected="false" class="seg-tab">ポテンシャルタイム</button>
      </div>

      <section id="panel-zones" role="tabpanel" aria-labelledby="tab-zones" tabindex="0" class="mt-3 outline-none">
        <p class="text-[10px] text-neutral-400 dark:text-neutral-600 leading-relaxed mb-2">各ペースの名前をタップすると、練習の目安ややり方が見られます。</p>
        <div id="vdot-zone-list" class="space-y-1.5"></div>
      </section>

      <section id="panel-predict" role="tabpanel" aria-labelledby="tab-predict" tabindex="0" hidden class="mt-3 outline-none">
        <p class="text-[10px] text-neutral-500 dark:text-neutral-400 leading-relaxed mb-2">※これは持久力トレーニングを積んだ場合に発揮できる「ポテンシャル」の目安です。今すぐ出せるタイムを保証するものではありません。</p>
        <div id="vdot-predict-list" class="space-y-1"></div>
        <p class="text-[9px] text-neutral-400 dark:text-neutral-600 leading-relaxed mt-2">※有効範囲は1,500m〜フルマラソン程度です（短距離・ウルトラマラソンは対象外）</p>
        <button id="vdot-predict-help-btn" type="button" class="btn-ghost mt-2">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5">
            <circle cx="12" cy="12" r="9"></circle>
            <path d="M9.5 9a2.5 2.5 0 0 1 4.9.7c0 1.7-2.4 1.8-2.4 3.3"></path>
            <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none"></circle>
          </svg>
          ポテンシャルタイムの読み方
        </button>
      </section>
    `;

    vdotDistanceSelect = trainingViewEl.querySelector('#vdot-distance-select');
    vdotImportBtn = trainingViewEl.querySelector('#vdot-import-btn');
    vdotImportLabel = trainingViewEl.querySelector('#vdot-import-label');
    vdotImportBtn.addEventListener('click', importMainInputIntoVdot);
    vdotCustomWrap = trainingViewEl.querySelector('#vdot-custom-distance-wrap');
    vdotCustomInput = trainingViewEl.querySelector('#vdot-custom-distance-input');
    vdotHhInput = trainingViewEl.querySelector('#vdot-hh-input');
    vdotMmInput = trainingViewEl.querySelector('#vdot-mm-input');
    vdotSsInput = trainingViewEl.querySelector('#vdot-ss-input');
    vdotCsInput = trainingViewEl.querySelector('#vdot-cs-input');
    vdotResultEl = trainingViewEl.querySelector('#vdot-result-value');
    vdotRangeWarningEl = trainingViewEl.querySelector('#vdot-range-warning');
    vdotLevelLabelEl = trainingViewEl.querySelector('#vdot-level-label');
    vdotLevelDescEl = trainingViewEl.querySelector('#vdot-level-desc');
    vdotLevelFillEl = trainingViewEl.querySelector('#vdot-level-fill');
    vdotPredictListEl = trainingViewEl.querySelector('#vdot-predict-list');
    zonesTabBtn = trainingViewEl.querySelector('#tab-zones');
    predictTabBtn = trainingViewEl.querySelector('#tab-predict');
    zonesPanelEl = trainingViewEl.querySelector('#panel-zones');
    predictPanelEl = trainingViewEl.querySelector('#panel-predict');

    VDOT_PREDICT_DISTANCES.forEach((d) => {
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between text-xs px-1 py-0.5';
      row.innerHTML = `
        <span class="text-neutral-600 dark:text-neutral-300">${d.label}</span>
        <span class="vdot-predict-time font-mono font-bold text-neutral-900 dark:text-white" data-meters="${d.meters}">--</span>
      `;
      vdotPredictListEl.appendChild(row);
    });



    // 読み方の解説は使い方画面に集約したので、ここからはそこへ送るだけにする
    trainingViewEl.querySelector('#vdot-predict-help-btn').addEventListener('click', (e) => {
      openView('help', e.currentTarget);
    });

    const zoneListEl = trainingViewEl.querySelector('#vdot-zone-list');
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

    zonesTabBtn.addEventListener('click', () => selectTrainingTab('zones'));
    predictTabBtn.addEventListener('click', () => selectTrainingTab('predict'));
    // タブは左右キーでも移動できるのが約束事なので合わせておく
    [zonesTabBtn, predictTabBtn].forEach((btn) => {
      btn.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        selectTrainingTab(e.key === 'ArrowLeft' ? 'zones' : 'predict', true);
      });
    });

    vdotDistanceSelect.addEventListener('change', onVdotDistanceChange);
    vdotCustomInput.addEventListener('input', recalcVdot);
    trainingViewEl.addEventListener('input', onVdotTimeInput);
    trainingViewEl.addEventListener('keydown', onVdotTimeKeydown);
    trainingViewEl.addEventListener('focusout', onVdotTimeFocusOut);
    trainingViewEl.addEventListener('focusin', onVdotTimeFocusIn);
  }

  // メイン画面で「基準」になっている距離とタイム。取り込みボタンの出し分けに使う。
  function mainInputForVdot() {
    if (typeof paceSource !== 'number') return null;
    if (!listEl.querySelector(`.distance-card[data-distance="${paceSource}"]`)) return null;
    const totalMs = distanceToMs(paceSource);
    if (!(totalMs > 0)) return null;
    return { meters: paceSource, totalMs };
  }

  function applyVdotRace(meters, totalMs) {
    const preset = VDOT_PRESET_DISTANCES.find((d) => d.meters === meters);
    if (preset) {
      vdotDistanceSelect.value = String(preset.meters);
      vdotCustomWrap.classList.add('hidden');
      vdotCustomInput.value = '';
    } else {
      vdotDistanceSelect.value = 'custom';
      vdotCustomInput.value = String(meters);
      vdotCustomWrap.classList.remove('hidden');
    }
    const { hh, mm, ss, cs } = msToFields(totalMs);
    setVdotField('hh', hh);
    setVdotField('mm', mm);
    setVdotField('ss', ss);
    setVdotField('cs', cs);
    recalcVdot();
  }

  function importMainInputIntoVdot() {
    const src = mainInputForVdot();
    if (!src) return;
    applyVdotRace(src.meters, src.totalMs);
    showToast(`${formatMeters(src.meters)}の入力を取り込みました`);
  }

  // トレーニングペース画面に入るたびに、保存済みのレース結果と取り込みボタンを整える
  function enterTrainingView() {
    const saved = loadVdotRace();
    if (saved) {
      applyVdotRace(saved.meters, saved.totalMs);
    } else {
      vdotDistanceSelect.value = '5000';
      vdotCustomWrap.classList.add('hidden');
      vdotCustomInput.value = '';
      vdotTimeInputs().forEach((el) => { el.value = ''; });
    }

    // メイン画面に打ち込んだレース結果を、もう一度打ち直させない。
    // 常時同期はしない（レースペースと練習ペースは別物なので、押したときだけ移す）。
    const src = mainInputForVdot();
    vdotImportBtn.hidden = !src;
    if (src) {
      vdotImportLabel.textContent = `メイン画面の ${formatMeters(src.meters)} を取り込む`;
    }

    recalcVdot();
  }

  // 2つのタブは同じ入力から出る対等な結果なので、切り替えても入力とVDOTは残す
  function selectTrainingTab(name, focusTab) {
    const showPredict = name === 'predict';
    zonesTabBtn.setAttribute('aria-selected', String(!showPredict));
    predictTabBtn.setAttribute('aria-selected', String(showPredict));
    zonesTabBtn.tabIndex = showPredict ? -1 : 0;
    predictTabBtn.tabIndex = showPredict ? 0 : -1;
    zonesPanelEl.hidden = showPredict;
    predictPanelEl.hidden = !showPredict;
    if (focusTab) (showPredict ? predictTabBtn : zonesTabBtn).focus();
  }

  // ---------- 初回向けの案内とヘッダー ----------

  function readFlag(key) {
    try {
      return localStorage.getItem(key) === '1';
    } catch (e) {
      return false;
    }
  }

  function writeFlag(key) {
    try {
      localStorage.setItem(key, '1');
    } catch (e) {
      // 保存できなくても、その場での利用は続けられる
    }
  }

  // 説明とバッジは初回訪問者のためのもの。毎日使う人の一等地を恒久的に
  // 占領させない（実際にペースを入れた時点で、説明の役目は終わっている）。
  function dismissIntro(persist) {
    if (introEl.hidden) return;
    introEl.hidden = true;
    if (persist) writeFlag(STORAGE_KEYS.introDismissed);
  }

  function dismissSwipeCoach(persist) {
    if (swipeCoachEl.hidden) return;
    swipeCoachEl.hidden = true;
    if (persist) writeFlag(STORAGE_KEYS.swipeCoachDismissed);
  }

  function initFirstRunHints() {
    introEl.hidden = readFlag(STORAGE_KEYS.introDismissed);
    swipeCoachEl.hidden = readFlag(STORAGE_KEYS.swipeCoachDismissed);
    introDismissBtn.addEventListener('click', () => dismissIntro(true));
    swipeCoachDismissBtn.addEventListener('click', () => dismissSwipeCoach(true));
  }

  // ヒーローのペース欄が画面外へ出たら、ヘッダーのタイトルを基準ペースに差し替える。
  // 距離を増やすほど一覧は長くなるので、下の方を見ている間も「いま何分何秒/kmの
  // 話をしているのか」が消えないようにする。
  let heroOffScreen = false;

  function syncHeaderPace() {
    // サブ画面ではヘッダー中央は画面名の場所なので、ペースは出さない
    const show =
      currentRoute() === 'main' && heroOffScreen && currentPace !== null && currentPace > 0;
    // h1をhiddenで消すと、スクロール中だけページから見出しが無くなり、
    // 見出し送りで移動している人が迷子になる。場所だけ譲って中身は残す。
    appTitleEl.classList.toggle('sr-only', show);
    headerPaceBtn.hidden = !show;
    headerPaceBtn.classList.toggle('flex', show);
  }

  // ---------- 画面遷移（ハッシュルーティング） ----------
  //
  // HTMLファイルは増やさない。増やすと Service Worker のプリキャッシュ対象と
  // ?v=N の同期先が画面の数だけ増えるうえ（README にある通りここが一番の事故元）、
  // テーマ確定のインラインスクリプトも全ファイルに複製することになる。
  // 代わりにハッシュで画面を切り替え、端末の「戻る」とURL共有だけは本物にする。

  const VIEW_TITLES = { training: 'トレーニングペース', help: '使い方' };
  // sticky ヘッダーの高さ。ヒーローが「ヘッダーの下に隠れた」判定に使う
  const HEADER_HEIGHT_PX = 64;
  const KNOWN_ROUTES = ['training', 'help', 'distances'];

  let openedInApp = false; // 直前の履歴が自分のものか（=history.back()で戻れるか）
  let viewReturnFocus = null;
  let mainScrollY = 0;
  let lastBaseView = null;

  function currentRoute() {
    const raw = (location.hash || '').replace(/^#\/?/, '');
    return KNOWN_ROUTES.indexOf(raw) === -1 ? 'main' : raw;
  }

  // triggerEl は戻ってきたときにフォーカスを返す先。タップだと activeElement が
  // body のままの環境があるので、呼び出し側から明示的に渡す。
  function openView(name, triggerEl) {
    viewReturnFocus = triggerEl || document.activeElement;
    openedInApp = true;
    location.hash = name;
  }

  function goBack() {
    if (openedInApp) {
      history.back();
      return;
    }
    // 共有されたURLを直接開いた場合など、戻る先が自分の履歴でないときは
    // 相手の履歴を消費せずにハッシュだけ落とす（replaceStateはhashchangeを出さない）
    history.replaceState(null, '', location.pathname + location.search);
    applyRoute();
  }

  function applyRoute() {
    const route = currentRoute();
    // 距離の編集はメイン画面に重ねるシートなので、下地はメインのまま
    const baseView = route === 'distances' ? 'main' : route;
    const isMain = baseView === 'main';

    if (lastBaseView === 'main' && baseView !== 'main') mainScrollY = window.scrollY;

    mainViewEl.hidden = !isMain;
    trainingViewEl.hidden = baseView !== 'training';
    helpViewEl.hidden = baseView !== 'help';

    // ヘッダーの左と中央だけを画面に合わせて差し替える。テーマ切り替えは動かさない。
    editDistancesBtn.hidden = !isMain;
    backBtn.hidden = isMain;
    appTitleEl.hidden = !isMain;
    viewTitleEl.hidden = isMain;
    if (!isMain) viewTitleEl.textContent = VIEW_TITLES[baseView] || '';

    if (baseView === 'training') enterTrainingView();
    if (route === 'distances') openModal(viewReturnFocus || editDistancesBtn);
    else closeModal();

    if (baseView !== lastBaseView) {
      // 前の画面のスクロール位置のまま次の画面を出すと途中から始まって迷子になる。
      // メインへ戻るときだけは、見ていた場所へ戻す。
      window.scrollTo(0, isMain ? mainScrollY : 0);
      if (isMain) {
        // サブ画面の間はヒーローが非表示なので、監視側は「画面外」のまま止まっている。
        // 監視の次の通知を待つと、戻った直後の1フレームだけヘッダーにペースが出てしまう。
        heroOffScreen = paceHeroEl.getBoundingClientRect().bottom < HEADER_HEIGHT_PX;
        openedInApp = false;
        if (viewReturnFocus && document.contains(viewReturnFocus)) viewReturnFocus.focus();
        viewReturnFocus = null;
      } else {
        backBtn.focus();
      }
      lastBaseView = baseView;
    }

    syncHeaderPace();
  }

  function initHeaderPaceSwap() {
    headerPaceBtn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      paceMinInput.focus();
      paceMinInput.select();
    });
    if (!('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        heroOffScreen = !entries[0].isIntersecting;
        syncHeaderPace();
      },
      // ヘッダーの下に隠れた時点で「画面外」とみなす
      { rootMargin: `-${HEADER_HEIGHT_PX}px 0px 0px 0px`, threshold: 0 }
    );
    observer.observe(paceHeroEl);
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
    initFirstRunHints();
    initHeaderPaceSwap();
    updateDerivedInfo();

    buildToast();
    buildModal();
    editDistancesBtn.addEventListener('click', () => openView('distances', editDistancesBtn));
    addDistanceShortcutBtn.addEventListener('click', () => openView('distances', addDistanceShortcutBtn));

    buildTrainingView();
    vdotBtn.addEventListener('click', () => openView('training', vdotBtn));
    helpBtn.addEventListener('click', () => openView('help', helpBtn));
    backBtn.addEventListener('click', goBack);
    // サブ画面でも Escape は「1つ戻る」。距離編集シート側は自前で拾うので除く。
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!modalOverlay.classList.contains('hidden')) return;
      if (currentRoute() === 'main') return;
      goBack();
    });
    window.addEventListener('hashchange', applyRoute);
    applyRoute();
  }

  init();
})();
