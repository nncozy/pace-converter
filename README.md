# ペース相互換算計算機（Pace Converter）

ランナー向けのペース相互換算Webアプリです。いずれかの距離のタイムを入力すると、
同じペースで走った場合の他の距離のタイムが瞬時に自動計算され、画面上のすべての
入力欄に同期されます。

## 対応距離

50m, 200m, 400m, 800m, 1000m, 1500m, 3000m, 5000m, 10000m

## 使い方

1. 好きな距離の `hh : mm : ss . ms` 欄にタイムを入力する
2. 他のすべての距離の欄が自動的に同じペースのタイムへ書き換わる
3. 各欄に2桁入力すると自動で右隣の欄にフォーカスが移動する
4. 空の欄で Backspace を押すと左隣の欄にフォーカスが戻る
5. 「すべてリセット」ボタンで全欄をクリアできる

未入力の欄は `00` として計算されます。

## 技術構成

- 静的HTML / CSS / JavaScript（ビルド不要）
- スタイリングは [Tailwind CSS](https://tailwindcss.com/)（CDN経由）
- 依存パッケージなし

```
pace-calculator/
├── index.html
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
