# システム詳細仕様書 (SPECIFICATION.md)

## 1. システム要件 & 前提条件
- **対象規模**: 1日あたり約100件の配達先。
- **コスト方針**: 完全無料（OSS・無料API・オープンデータ）で初期構築。
- **動作プラットフォーム**:
  - PC: 管理画面（CSV取り込み、住所変換、固定ルート編集・管理）。
  - スマートフォン (iOS / Android): 配達員向け画面（地図表示、ナビ、ステータス更新、GPS軌跡記録）。

---

## 2. データ構造仕様

### 2.1 配達CSVデータ (取り込み仕様)
- **文字コード**: UTF-8 / Shift-JIS 自動判別対応。
- **フォーマット**:
  - 1列目: 顧客名/宛先名（ヘッダーに「名前」「氏名」「宛先」等を含む列を自動検出）
  - 2列目: 住所（ヘッダーに「住所」「お届け先」等を含む列を自動検出）
  - （任意）3列目以降: ルートコード、時間指定、伝票番号など

### 2.2 固定ルートデータ (GeoJSON LineString)
- **形式**: GeoJSON Feature (LineString)
- **構造例**:
```json
{
  "type": "Feature",
  "properties": {
    "route_id": "ROUTE_A_TO_B",
    "route_name": "A拠点〜Bエリア幹線ルート",
    "distance_meters": 3420.5,
    "duration_seconds": 412.3,
    "is_real_run_based": true,
    "created_at": "2026-08-15T09:00:00.000Z"
  },
  "geometry": {
    "type": "LineString",
    "coordinates": [
      [135.73512, 34.52801],
      [135.73588, 34.52845],
      [135.73692, 34.52910]
    ]
  }
}
```

---

## 3. 利用外部API / エンジン仕様

| 用途 | API / サービス | エンドポイント / 備考 | コスト |
| :--- | :--- | :--- | :--- |
| **住所ジオコーディング** | 国土地理院 検索API | `https://msearch.gsi.go.jp/address-search/AddressSearch?q={query}` | 無料・登録不要 |
| **動的ルート探索** | OSRM Route API | `https://router.project-osrm.org/route/v1/driving/{lng1},{lat1};{lng2},{lat2}?overview=full&geometries=geojson` | 無料・オープンソース |
| **道路スナップ (Map Matching)** | OSRM Match API | `https://router.project-osrm.org/match/v1/driving/{coords}?overview=full&geometries=geojson` | 無料・オープンソース |
| **フォールバックナビ** | Google Maps 外部起動 | `https://www.google.com/maps/dir/?api=1&destination={lat},{lng}` | 無料 |
