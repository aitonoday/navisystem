# 配達ナビゲーション＆固定ルート管理システム (NaviSystem)

## 1. 概要
1日約100件のルート配送を行うドライバー向けナビゲーション・運行管理システムです。
PCでCSVを取り込んで準備を行い、スマホ（iOS / Android）から運行・ナビゲーション・GPS走行実績の記録を行う構成を想定しています。

## 2. コア機能
- **CSV取り込み＆住所自動ジオコーディング**:
  - Shift-JIS (Excel形式) および UTF-8 に自動対応。
  - 国土地理院の無料API (`msearch.gsi.go.jp/address-search/AddressSearch`) を使用して住所から緯度経度を取得。
- **固定ルート(GeoJSON)と動的ナビのハイブリッド案内**:
  - あらかじめ登録した走行ルート（GeoJSON）が存在する場合は指定ルートを優先表示（青線）。
  - 保存データがない区間は OSRM (Open Source Routing Machine) API による動的ルート計算・案内を実施。
- **GPS走行軌跡トラッキング＆道路スナップ登録**:
  - 運行中のGPS生ログを記録。
  - 終了時に OSRM Match API を用いて道路網に吸着（Map Matching）させ、新たな固定ルートとしてワンタップ保存。
- **配達ステータス管理**:
  - ピンタップおよびリストから「配達完了」ステータスを切り替え可能。

## 3. ディレクトリ構成
```text
D:\navisystem/
├── README.md               # プロジェクト概要・起動方法（本書）
├── SPECIFICATION.md        # 詳細仕様・データ定義・アーキテクチャ
├── TASK_BACKLOG.md         # 今後の開発タスク・機能追加ロードマップ
├── index.html              # プロトタイプ（単一ファイルでブラウザ実行可能）
└── sample_delivery.csv     # 動作確認用テストデータ（Excel Shift-JIS/UTF-8対応）
```

## 4. クイックスタート
1. `index.html` をブラウザ（Google Chrome, Edge, Safari等）で直接開きます。
2. 画面上部の「📂 CSV取込」をクリックし、同梱の `sample_delivery.csv` を選択します。
3. 地図上に配達ピンが表示され、サイドバーに一覧が生成されます。
4. ピンの「案内 (ナビ)」でルート計算、「配達完了」でステータス変更を確認できます。
