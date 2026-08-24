# ペース相互換算計算機（Pace Converter）

ランナー向けのペース相互換算Webアプリです。いずれかの距離のタイムを入力すると、
同じペースで走った場合の他の距離のタイムが瞬時に自動計算され、画面上のすべての
入力欄に同期されます。

## 対応距離（初期値）

50m, 200m, 400m, 800m, 1000m, 1500m, 3000m, 5000m, 10000m

左上の編集ボタンから、任意の距離の追加・表示/非表示の切り替えができます（後述）。

## 使い方

1. 好きな距離の `hh : mm : ss . ms` 欄にタイムを入力する
2. 他のすべての距離の欄が自動的に同じペースのタイムへ書き換わる
3. 各欄に2桁入力すると自動で右隣の欄にフォーカスが移動する
4. 空の欄で Backspace を押すと左隣の欄にフォーカスが戻る
5. 「すべてリセット」ボタンで全欄をクリアできる

未入力の欄は `00` として計算されます。

### 距離の追加・非表示

左上の編集アイコンから距離一覧を開けます。

- チェックを外すと、その距離はメイン画面から非表示になります（初期値の距離も含む）
- 下部のフォームから任意の距離（メートル単位）を新規追加できます
- 追加した距離は右側のゴミ箱アイコンから削除できます

設定はブラウザの `localStorage` に保存されるため、サーバーやデータベースは不要です。同じブラウザで再訪問した際に設定が復元されます（別のブラウザ・端末には引き継がれません）。

### ダークモード / ライトモード

右上のアイコンでいつでも切り替えられます。初回はOSの設定（`prefers-color-scheme`）に従い、以降は選択したテーマが `localStorage` に保存されます。

### ホーム画面への追加・共有時のプレビュー

- `manifest.webmanifest` とアイコン一式により、iOS/Androidのホーム画面に追加した際にアプリらしいアイコンで表示されます
- SNSやチャットにURLを貼った際は、OGP画像（`icons/og-image.png`）付きのプレビューが表示されます

## 技術構成

- 静的HTML / CSS / JavaScript（ビルド不要、サーバー・データベース不要）
- スタイリングは [Tailwind CSS](https://tailwindcss.com/)（CDN経由、`darkMode: 'class'` でテーマ切り替えに対応）
- 距離設定・テーマ設定はブラウザの `localStorage` に保存
- 依存パッケージなし

```
pace-calculator/
├── index.html
├── manifest.webmanifest
├── favicon.svg
├── favicon.ico
├── icons/
│   ├── icon-192.png / icon-512.png
│   ├── icon-maskable-192.png / icon-maskable-512.png
│   ├── apple-touch-icon.png
│   └── og-image.png
├── css/
│   └── style.css
├── js/
│   └── app.js
└── README.md
```

## ローカルでの確認

ビルド不要の静的サイトなので、`index.html` をブラウザで直接開くか、簡易サーバーで確認できます。

```bash
python3 -m http.server 8000
```

その後 `http://localhost:8000` を開いてください。

## GitHub Pages での公開

1. このリポジトリを GitHub にプッシュする
2. リポジトリの Settings → Pages を開く
3. Source を「Deploy from a branch」、Branch を `main` / `/(root)` に設定して保存
4. しばらく待つと `https://<ユーザー名>.github.io/<リポジトリ名>/` で公開される
