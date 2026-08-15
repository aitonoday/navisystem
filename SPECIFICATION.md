# システム詳細仕様書 (SPECIFICATION.md)

## 1. システム要件 & 前提条件
- **対象規模**: 1日あたり約100件の配達先。
- **コスト方針**: 完全無料（OSS・無料API・オープンデータ）で初期構築。
- **配達業務の前提仕様**:
  - 不在や時間外の概念はなく、「当日行くか行かないか」のみを管理。
  - **1件目の選択**: 「配送順通りに開始」 または 「別の配送先を一覧から選択」。
  - **移動中の処理**: 選択した配送先へのルート案内および地点ルート情報（GPS走行軌跡）の記録。
  - **到着時の処理**: 目的地到着時にドライバーが「📍 到着しました（配達完了）」ボタンを押す。
  - **次の選択（ループ）**: 到着後、次のアクションとして「次の順番の配送先へ進む」または「別の配送先を一覧から選ぶ」を選択し、全件完了まで繰り返す。

---

## 2. データ構造仕様

### 2.1 配達CSVデータ (取り込み仕様)
- **文字コード**: UTF-8 / Shift-JIS 自動判別対応。
- **フォーマット**:
  - `配達順` / `順番` / `No`: 巡回順序（自動ソート）
  - `お名前` / `氏名`: 顧客名
  - `ご住所` / `お届け先`: 住所（国土地理院APIで自動ジオコーディング）
  - `指定時間`: 配達時間帯（任意）
  - `備考` / `メモ`: 置き配指定、オートロック暗証番号、進入時の注意点など

---

## 3. 利用外部API / エンジン仕様

| 用途 | API / サービス | エンドポイント / 備考 | コスト |
| :--- | :--- | :--- | :--- |
| **住所ジオコーディング** | 国土地理院 検索API | `https://msearch.gsi.go.jp/address-search/AddressSearch?q={query}` | 無料・登録不要 |
| **動的ルート探索** | OSRM Route API | `https://router.project-osrm.org/route/v1/driving/{lng1},{lat1};{lng2},{lat2}?overview=full&geometries=geojson` | 無料・オープンソース |
| **道路スナップ (Map Matching)** | OSRM Match API | `https://router.project-osrm.org/match/v1/driving/{coords}?overview=full&geometries=geojson` | 無料・オープンソース |
| **フォールバックナビ** | Google Maps 外部起動 | `https://www.google.com/maps/dir/?api=1&destination={lat},{lng}` | 無料 |
