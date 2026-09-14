// index.html の ?v=N と service-worker.js の ASSET_VERSION がズレていないことを検証する。
//
// ズレても画面は正常に見えるのに、訪問者にだけ古いCSS/JSが配られ続ける。
// リリース前に気づける場所がここしかないので、テストに含めている。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectVersions, versionMismatch } from '../tools/version.mjs';

test('アセットの版が全箇所で一致している', () => {
  const found = collectVersions();
  assert.ok(found.length >= 4, `版の記述が少なすぎます（${found.length}箇所）`);
  assert.equal(versionMismatch(found), null);
});

test('index.html が読み込むJS/CSSはすべて版付きで参照されている', () => {
  const found = collectVersions();
  const inIndex = found.filter((f) => f.file === 'index.html');
  assert.ok(inIndex.length >= 3, 'style.css / calc.js / app.js の3つに ?v=N が要る');
});
