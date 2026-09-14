#!/usr/bin/env node
// アセットの版(?v=N)を index.html と service-worker.js の両方で一括更新・照合する。
//
// この番号がズレると、訪問者のブラウザやService Workerが古いCSS/JSを
// 配り続けて更新が届かない。しかも画面上は何も壊れないので気づきにくい。
// 手で4箇所を書き換えるのをやめ、ここを唯一の操作口にしている。
//
//   node tools/version.mjs         現在の版を表示
//   node tools/version.mjs check   全箇所が一致しているか検証（ズレたら終了コード1）
//   node tools/version.mjs bump    全箇所をまとめて +1
//   node tools/version.mjs set 25  全箇所を指定の値に

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = path.join(ROOT, 'index.html');
const SW = path.join(ROOT, 'service-worker.js');

const QUERY_RE = /(\?v=)(\d+)/g;
const SW_RE = /(const ASSET_VERSION = )(\d+)(;)/;

const read = (file) => fs.readFileSync(file, 'utf8');

// 各ファイルが名乗っている版を、出現箇所ごとに集める
export function collectVersions() {
  const found = [];

  const index = read(INDEX);
  for (const m of index.matchAll(QUERY_RE)) {
    const line = index.slice(0, m.index).split('\n').length;
    found.push({ file: 'index.html', line, version: Number(m[2]) });
  }

  const sw = read(SW);
  const swMatch = sw.match(SW_RE);
  if (!swMatch) throw new Error('service-worker.js に ASSET_VERSION が見つかりません');
  found.push({
    file: 'service-worker.js',
    line: sw.slice(0, swMatch.index).split('\n').length,
    version: Number(swMatch[2]),
  });

  if (found.length < 2) throw new Error('版の記述が見つかりません');
  return found;
}

// ズレていれば、どこがいくつなのかを並べたメッセージを返す（一致していれば null）
export function versionMismatch(found = collectVersions()) {
  const versions = [...new Set(found.map((f) => f.version))];
  if (versions.length === 1) return null;
  const detail = found.map((f) => `  ${f.file}:${f.line} → v${f.version}`).join('\n');
  return `アセットの版がズレています（${versions.map((v) => `v${v}`).join(' / ')}）:\n${detail}\n` +
    '`node tools/version.mjs bump` でまとめて更新してください。';
}

function write(next) {
  fs.writeFileSync(INDEX, read(INDEX).replace(QUERY_RE, `$1${next}`));
  fs.writeFileSync(SW, read(SW).replace(SW_RE, `$1${next}$3`));
}

function main() {
  const [cmd, arg] = process.argv.slice(2);
  const found = collectVersions();
  const current = Math.max(...found.map((f) => f.version));

  if (cmd === 'check' || !cmd) {
    const problem = versionMismatch(found);
    if (problem) {
      console.error(problem);
      process.exit(1);
    }
    console.log(`v${current}（${found.length}箇所すべて一致）`);
    return;
  }

  if (cmd === 'bump' || cmd === 'set') {
    const next = cmd === 'bump' ? current + 1 : Number(arg);
    if (!Number.isInteger(next) || next <= 0) {
      console.error('set には正の整数を渡してください: node tools/version.mjs set 25');
      process.exit(1);
    }
    write(next);
    console.log(`v${current} → v${next}（${found.length}箇所を更新）`);
    return;
  }

  console.error(`不明なコマンド: ${cmd}\n使い方: node tools/version.mjs [check|bump|set <N>]`);
  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
