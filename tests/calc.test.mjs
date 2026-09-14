// js/calc.js の数値が、公開されているVDOT換算表の実測値から動いていないことを検証する。
//
// トレーニングペースの提案がズレると利用者の練習そのものに影響が出るのに、
// 画面上は「それらしい数字」が出てしまって気づけない。ここが唯一の歯止め。
//
// 実行: npm test  （または node --test tests/）

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const calc = require('../js/calc.js');

const {
  vo2FromVelocity,
  percentVO2Max,
  velocityFromVO2,
  formatPaceMinSec,
  formatDurationSec,
  formatPaceSecPerKm,
  msToFields,
  vdotFromPerformance,
  predictRaceTimeSec,
  trainingPaceSecPerKm,
  ZONE_PCT,
} = calc;

const zonePace = (vdot, key) => formatPaceSecPerKm(trainingPaceSecPerKm(vdot, ZONE_PCT[key]));
const predict = (vdot, meters) => formatDurationSec(predictRaceTimeSec(vdot, meters));

// ---------- 換算表との一致 ----------

test('VDOT50のトレーニングペースが換算表と一致する', () => {
  assert.equal(zonePace(50, 'E'), `5'07"`);
  assert.equal(zonePace(50, 'M'), `4'25"`);
  assert.equal(zonePace(50, 'T'), `4'15"`);
  assert.equal(zonePace(50, 'I'), `3'54"`);
  assert.equal(zonePace(50, 'R'), `3'41"`);
});

test('VDOT40のトレーニングペースが換算表と一致する', () => {
  assert.equal(zonePace(40, 'E'), `6'07"`);
  assert.equal(zonePace(40, 'M'), `5'17"`);
  assert.equal(zonePace(40, 'T'), `5'06"`);
  assert.equal(zonePace(40, 'I'), `4'40"`);
  assert.equal(zonePace(40, 'R'), `4'25"`);
});

test('VDOT50の予想タイムが換算表と一致する', () => {
  assert.equal(predict(50, 1500), '5:24');
  assert.equal(predict(50, 1609), '5:50');
  assert.equal(predict(50, 3000), '11:33');
  assert.equal(predict(50, 5000), '19:56');
  assert.equal(predict(50, 10000), '41:20');
  assert.equal(predict(50, 21097), '1:31:31');
  assert.equal(predict(50, 42195), '3:10:40');
});

// レベル判定（js/app.js の VDOT_LEVELS）の境界は、この対応関係を前提に置いてある。
// ここがズレると「サブ4が見えてくる」といった表示が実態とずれる。
test('サブ4・サブ3相当のVDOTがレベル判定の境界と対応している', () => {
  assert.ok(Math.abs(vdotFromPerformance(42195, 4 * 3600) - 38) < 0.5, 'サブ4 ≈ VDOT38');
  assert.ok(Math.abs(vdotFromPerformance(42195, 3 * 3600) - 53.5) < 0.5, 'サブ3 ≈ VDOT53〜54');
});

// ---------- 式として崩れていないこと ----------

test('予想タイムから逆算したVDOTが元のVDOTに戻る', () => {
  for (const vdot of [30, 40, 50, 60, 70]) {
    for (const meters of [1500, 5000, 10000, 21097, 42195]) {
      const sec = predictRaceTimeSec(vdot, meters);
      const back = vdotFromPerformance(meters, sec);
      assert.ok(Math.abs(back - vdot) < 0.01, `vdot=${vdot} meters=${meters} → ${back}`);
    }
  }
});

test('VDOTが上がるほど予想タイムは速く、距離が伸びるほど遅くなる', () => {
  for (let vdot = 30; vdot < 70; vdot += 5) {
    assert.ok(predictRaceTimeSec(vdot + 5, 5000) < predictRaceTimeSec(vdot, 5000));
  }
  const distances = [1500, 3000, 5000, 10000, 21097, 42195];
  for (let i = 1; i < distances.length; i++) {
    assert.ok(predictRaceTimeSec(50, distances[i]) > predictRaceTimeSec(50, distances[i - 1]));
  }
});

test('ゾーンはE→Rの順に速くなる', () => {
  const order = ['E', 'M', 'T', 'I', 'R'];
  for (let i = 1; i < order.length; i++) {
    const slower = trainingPaceSecPerKm(50, ZONE_PCT[order[i - 1]]);
    const faster = trainingPaceSecPerKm(50, ZONE_PCT[order[i]]);
    assert.ok(faster < slower, `${order[i]} は ${order[i - 1]} より速いはず`);
  }
});

// vo2FromVelocity と velocityFromVO2 は互いの逆関数（後者は前者を2次方程式として解いた
// もの）。係数を片方だけ直すと、VDOTは正しいのにトレーニングペースだけが静かにズレる。
test('速度とVO2の変換が互いの逆になっている', () => {
  for (let v = 150; v <= 450; v += 25) { // m/min。ジョグ〜トップスピードの範囲
    const back = velocityFromVO2(vo2FromVelocity(v));
    assert.ok(Math.abs(back - v) < 1e-6, `v=${v} → ${back}`);
  }
});

test('percentVO2Max がレース時間に対して単調減少する', () => {
  // 短いレースほど高い割合で走れる、という関係が式の前提。
  // 10分を切るあたりで1.0を超えるが、これは異常ではなく
  // 「無酸素の寄与でVO2maxを超えて走れる」という元の式の意図どおり。
  let prev = Infinity;
  for (const tMin of [3, 5, 10, 20, 40, 60, 120, 180]) {
    const pct = percentVO2Max(tMin);
    assert.ok(pct < prev, `${tMin}分の割合が前より大きい`);
    assert.ok(pct > 0.8, `${tMin}分 → ${pct}（式の下限は0.8に漸近する）`);
    prev = pct;
  }
  assert.ok(percentVO2Max(3) > 1.0, '3分のレースはVO2maxを超える');
  assert.ok(percentVO2Max(60) < 0.9, '1時間走はVO2maxの9割を切る');
});

// ---------- 表示の変換 ----------

test('msToFields が繰り上がりを正しく扱う', () => {
  assert.deepEqual(msToFields(0), { hh: 0, mm: 0, ss: 0, cs: 0 });
  assert.deepEqual(msToFields(1234), { hh: 0, mm: 0, ss: 1, cs: 23 });
  assert.deepEqual(msToFields(59999), { hh: 0, mm: 1, ss: 0, cs: 0 }, '59.999秒は1分に繰り上がる');
  assert.deepEqual(msToFields(3600000), { hh: 1, mm: 0, ss: 0, cs: 0 });
  assert.deepEqual(msToFields(3661230), { hh: 1, mm: 1, ss: 1, cs: 23 });
});

test('msToFields が負の値と桁あふれを丸める', () => {
  assert.deepEqual(msToFields(-5000), { hh: 0, mm: 0, ss: 0, cs: 0 });
  // 「時」欄は2桁固定なので、それを超えたら表示上の上限に張り付かせる
  assert.deepEqual(msToFields(100 * 3600 * 1000), { hh: 99, mm: 59, ss: 59, cs: 99 });
});

test('ペースとタイムの表示形式', () => {
  assert.equal(formatPaceMinSec(270), `4'30"`);
  assert.equal(formatPaceMinSec(65), `1'05"`);
  assert.equal(formatPaceMinSec(-10), `0'00"`, '負の値でも壊れない');
  assert.equal(formatDurationSec(65), '1:05');
  assert.equal(formatDurationSec(3725), '1:02:05');
  assert.equal(formatPaceSecPerKm(null), `--'--"`, '計算できないときは空欄と同じ見た目');
  assert.equal(formatPaceSecPerKm(NaN), `--'--"`);
});
