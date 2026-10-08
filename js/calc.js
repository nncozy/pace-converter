// ペース・タイム・VDOTの純粋な計算部分だけをここに切り出している。
//
// DOMにもlocalStorageにも触れないので、ブラウザを立ち上げずに Node から
// そのまま呼べる（tests/calc.test.mjs が実際にそうしている）。トレーニング
// ペースの提案を間違えると利用者の練習そのものに影響が出るため、ここの数値は
// 人力の目視確認ではなく自動テストで固定しておきたい、というのが分離の理由。
//
// ブラウザでは window.PaceCalc として読み込まれ、js/app.js が先頭で受け取る。
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PaceCalc = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 各入力欄が取りうる最大値。時が99なのは「時」欄が2桁固定のレイアウトのため。
  const UNIT_MAX = { hh: 99, mm: 59, ss: 59, cs: 99 };

  function pad2(n) {
    return String(Math.max(0, n)).padStart(2, '0');
  }

  // 秒数を 4'30" 形式にする（ペース表示用）
  function formatPaceMinSec(totalSec) {
    const t = Math.max(0, Math.round(totalSec));
    return `${Math.floor(t / 60)}'${pad2(t % 60)}"`;
  }

  // 秒数を m:ss / h:mm:ss 形式にする（タイム表示用）
  function formatDurationSec(sec) {
    const total = Math.max(0, Math.round(sec));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
  }

  // 計算できないときに空欄と同じ見た目を返すのが formatPaceMinSec との違い
  function formatPaceSecPerKm(sec) {
    if (sec === null || !Number.isFinite(sec)) return '--\'--"';
    const total = Math.round(sec);
    return `${Math.floor(total / 60)}'${pad2(total % 60)}"`;
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

  // ---------- VDOT ----------
  //
  // Jack Daniels & Jimmy Gilbert の式（Oxygen Power, 1979）。
  // 係数は公開されているVDOT換算表の実測値と一致することを確認済みで、
  // tests/calc.test.mjs がその一致を継続的に検証している。

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
  // vdotFromPerformance(meters, t)はtについて単調減少なので二分探索で逆算できる。
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

  // 各トレーニングゾーンの%VO2max。ラベルや解説文（js/app.js側）と違って
  // 出る数値を直接決める値なので、テストが届くこちらに置いている。
  // Mだけはここに無い: Danielsの M ペースは「そのVDOTでの予想フルマラソンの
  // レースペース」そのもので、強度はVDOTによって約80〜83%と動く。以前は 0.84 で
  // 固定していたため、VDOT50で4'25"（予想フルは4'31"）と速く出ていた。
  const ZONE_PCT = { E: 0.70, T: 0.88, I: 0.98, R: 1.05 };

  const MARATHON_METERS = 42195;

  // ゾーン（E/M/T/I/R）の目安ペース(秒/km)。Mは予想フルマラソンタイムから出すので、
  // ポテンシャルタイムのフルマラソンと必ず同じペースになる。
  function zonePaceSecPerKm(vdot, key) {
    if (key === 'M') return predictRaceTimeSec(vdot, MARATHON_METERS) / (MARATHON_METERS / 1000);
    return trainingPaceSecPerKm(vdot, ZONE_PCT[key]);
  }

  // ---------- 周回 ----------

  // トラックを lapMeters ごとに区切ったときの通過地点(m)。remainderFirst なら、
  // 半端な距離（5000mを400mで割った余りの200m）を最初に走る。トラックレースの
  // スタート位置と同じで、最後の周をフィニッシュラインで終える形になる
  function lapSplitPoints(distance, lapMeters, remainderFirst) {
    const full = Math.floor(distance / lapMeters);
    const rem = distance - full * lapMeters;
    const points = [];
    if (remainderFirst && rem > 0) {
      points.push(rem);
      for (let k = 1; k <= full; k++) points.push(rem + k * lapMeters);
    } else {
      for (let k = 1; k <= full; k++) points.push(k * lapMeters);
      if (rem > 0) points.push(distance);
    }
    return points;
  }

  return {
    UNIT_MAX,
    pad2,
    formatPaceMinSec,
    formatDurationSec,
    formatPaceSecPerKm,
    msToFields,
    vo2FromVelocity,
    percentVO2Max,
    vdotFromPerformance,
    predictRaceTimeSec,
    velocityFromVO2,
    trainingPaceSecPerKm,
    zonePaceSecPerKm,
    ZONE_PCT,
    lapSplitPoints,
  };
});
