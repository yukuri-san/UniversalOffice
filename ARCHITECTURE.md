# WebX 構成メモ（ARCHITECTURE）

開発者向けの構成メモです。利用者向けの使い方は [MANUAL.md](MANUAL.md) を参照してください。

## 全体像

- TypeScript + React 19 + Vite 6 のシングルページ PWA。GitHub Pages の `docs/` フォルダから配信
- 本体は「OS シェル（src/App.tsx）」＋「標準アプリ」＋「ストアアプリ」で構成され、すべて 1 つのバンドルに含まれる
- バックエンドは持たない。データは端末内のみ

## ディレクトリ

| パス | 役割 |
| --- | --- |
| `src/App.tsx` | OS シェル：デスクトップ、ウィンドウ管理、タスクバー、スタートメニュー、通知、ロック、仮想デスクトップ、DXUI／MXUI、起動フロー（スプラッシュ／BIOS／回復／セットアップ） |
| `src/components/` | 標準アプリと OS 部品（Settings、Calendar、Spreadsheet、Terminal、DeveloperApp、BootScreens など） |
| `src/components/store/` | ストアアプリ（カテゴリ別ファイル） |
| `src/components/games/` | ストアのゲーム |
| `src/lib/store.ts` | 保存層：OPFS（Worker 経由→メインスレッド）／IndexedDB の自動切替、ドキュメント・予定・バックアップ |
| `src/lib/storeApps.ts` | ストアカタログ（id／名前／バージョン／更新内容） |
| `src/lib/storeCheck.ts` | store.json の取得と比較（ストア更新は本体更新と独立） |
| `src/lib/updateCheck.ts` | 本体バージョン比較（英字サフィックス対応）とキャッシュ更新処理 |
| `src/lib/shell.ts` | コマンドライン基盤（仮想ファイルシステム＋DOS／CMD 風＋WebX コマンド）。ターミナルと回復コンソールが共用 |
| `src/lib/customApps.ts` | マイApp の登録簿（localStorage） |
| `src/lib/widgets.ts` | デスクトップウィジェットの定義と設定 |
| `src/lib/i18n.ts` | 8 言語の文言辞書 |
| `src/lib/reset.ts` | 設定キーの一覧と「設定だけリセット」 |
| `src/lib/pin.ts` | ロック画面 PIN のハッシュ |
| `public/store.json` | ストアカタログの配信用コピー（`scripts/gen-store-json.mjs` で生成） |
| `public/version.json` | 本体最新バージョン（更新チェック用） |
| `public/release-notes.json` | 本体更新の内容表示用 |
| `public/sw.js` | Service Worker（キャッシュ名に世代番号） |

## 保存の設計

- ドキュメント（word／sheet／note／memo）と予定は `store.ts` 経由で OPFS 優先、不可なら IndexedDB。OPFS は Web Worker 経由の書き込みを先に試す
- 設定類は localStorage（キーは `webx-*`、テーマ／言語は互換のため `ykr-theme`／`ykr-lang`）。**保存キーや DB 名は互換性のため変更禁止**
- アプリ固有データ（日記・家計簿など）も localStorage／専用 IndexedDB に端末内保存
- バックアップは `exportAll`／`importAll` で JSON 一括入出力

## アプリの種類

- **標準アプリ**：`APP_ORDER`（src/App.tsx）に登録。ウィンドウ種別は `WindowApp` 型、`APP_META` にアイコンと色クラス
- **ストアアプリ**：`STORE_APPS`（src/lib/storeApps.ts）に登録し、インストール済みのものだけ表示。追加・更新したら `node scripts/gen-store-json.mjs` で `public/store.json` を再生成する。バージョンと更新内容（notes）はアプリ個別管理
- **マイApp**：ユーザーが開発者アプリで作る HTML アプリ。登録簿は localStorage、ID は `myapp-*`。サンドボックス iframe（allow-scripts）で実行し、本体データには触れない

## 起動フロー

1. Service Worker がキャッシュから配信
2. スプラッシュ表示（BIOS で時間・高速ブートを設定可能。「DEL」ボタンで BIOS へ）
3. `webx-boot-target`（bios／recovery）や BIOS の既定ブート先があれば該当画面へ
4. 初期セットアップ（`webx-setup-done` と `SETUP_VERSION` で管理。既存ユーザーは許可ステップのみ再実施）
5. ロック画面（PIN 設定時）→ デスクトップ

## 更新の仕組み

- 本体：`version.json` と比較して新しければストアの「WebX 本体」から更新。適用時はキャッシュ全消去＋再読み込み
- ストア：`store.json` と比較。ただし新しいアプリの「コード」は本体バンドルにしか存在しないため、カタログに未収録アプリがある場合はストアにバナーでキャッシュ更新を促す（v1.22.0b 以降）
- バージョン比較は `compareVersions`（`1.22.0ex` のような英字サフィックス対応）

## 開発の流れ

- 変更後は `npm run typecheck` を通し、`npx vite build --outDir docs --emptyOutDir` で配信物を再生成（`docs/.nojekyll` が必要）
- リリース時は package.json／src/lib/version.ts／public/version.json／public/release-notes.json／README のバージョン表記を揃え、`public/sw.js` のキャッシュ世代を +1 する
