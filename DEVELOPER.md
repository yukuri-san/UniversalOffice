# WebX 開発者ガイド（WebX API）

マイApp（開発者アプリで作る HTML アプリ）から WebX のシステム機能を呼び出すための仕様です。
WebX 本体バージョン 1.42.0 以降、API バージョン 1 に対応します。

## 概要

- マイApp はサンドボックス化された iframe の中で実行されます。WebX 本体の DOM やデータへ直接触ることはできません。
- 代わりに、グローバルオブジェクト **`WebX`**（SDK）が自動で読み込まれ、システム関数を呼べます。SDK の読み込みは不要で、HTML を書くだけで使えます。
- すべての関数は **Promise** を返します。`await` で結果を受け取るか、`.then()` を使ってください。
- 呼び出しに失敗した場合（未対応の機能、値が大きすぎる等）は Promise が reject され、`Error` の message に対処のヒントが入ります。
- 応答が 10 秒以内に返らない場合はタイムアウトエラーになります。

## システム関数一覧

### 通知

| 関数 | 戻り値 | 説明 |
|---|---|---|
| `WebX.notify(text)` | `true` | OS の通知センターへ通知を出す。通知をタップすると自分のアプリが開く。text は 300 文字まで |

```js
await WebX.notify('保存が終わりました')
```

### アプリ起動

| 関数 | 戻り値 | 説明 |
|---|---|---|
| `WebX.openApp(id)` | `true` | 指定したアプリを開く。コアアプリの ID（`'calendar'`, `'word'` など）、ストアアプリの ID、マイApp の ID が使える |

```js
await WebX.openApp('calendar')
```

### ストレージ（アプリ専用）

アプリごとに分離された保存領域です。他のアプリのデータには触れません。値は JSON 化できるもの（文字列・数値・配列・オブジェクト等）が保存できます。1 つの値の上限は 200KB です。

| 関数 | 戻り値 | 説明 |
|---|---|---|
| `WebX.storage.get(key, fallback?)` | 保存した値 | 値が無い場合は `fallback`（省略時は `null`） |
| `WebX.storage.set(key, value)` | `true` | 値を保存する |
| `WebX.storage.remove(key)` | `true` | 値を消す |
| `WebX.storage.keys()` | `string[]` | 保存済みキーの一覧 |

```js
const count = await WebX.storage.get('count', 0)
await WebX.storage.set('count', count + 1)
```

### システム情報

| 関数 | 戻り値 | 説明 |
|---|---|---|
| `WebX.system.info()` | オブジェクト | 下記のシステム情報をまとめて返す |
| `WebX.system.theme()` | `string \| null` | 現在のテーマ ID |
| `WebX.system.lang()` | `string \| null` | 現在の言語コード（例：`ja`） |
| `WebX.system.version()` | `string` | WebX 本体のバージョン |

`WebX.system.info()` の戻り値：

```json
{
  "appVersion": "1.50.0",
  "edition": "Standard Edition",
  "apiVersion": 1,
  "theme": "default",
  "lang": "ja",
  "uiMode": "auto",
  "platform": "Linux armv8l",
  "userAgent": "…",
  "screen": { "width": 1080, "height": 2400 }
}
```

テーマに応じて見た目を変える例：

```js
const theme = await WebX.system.theme()
document.body.style.background = theme === 'midnight' ? '#0b1020' : '#ffffff'
```

### クリップボード

| 関数 | 戻り値 | 説明 |
|---|---|---|
| `WebX.clipboard.write(text)` | `true` | テキストをクリップボードへコピーする。ブラウザの許可状況によっては失敗することがある |

## エディションについて

WebX には Lite／Standard／Pro のエディションがあります（設定で切替）。`WebX.system.info()` の戻り値には現在のエディション名が含まれます。Lite Edition ではストアアプリが無効なため、マイApp 以外の追加アプリは動作しません。Pro Edition では初期アプリが限定されますが、マイApp は通常どおり作成・実行できます。

## バージョン情報

- `WebX.apiVersion` で API バージョン（現在は `1`）を確認できます。機能の有無を判定するときに使ってください。

```js
if (WebX.apiVersion >= 1) {
  await WebX.notify('WebX API が使えます')
}
```

## できないこと（制限事項）

- WebX 本体や他のアプリの DOM・データへの直接アクセス
- 他のアプリのストレージの読み書き
- ファイル（エクスプローラー内の文書）へのアクセス ※将来の API で検討中
- サンドボックスの制限により、一部のブラウザ機能（権限が必要なもの）は使えないことがあります

## サンプル

開発者アプリの「システム関数（API）」タブにある「サンプルAppを作成して開く」から、通知・ストレージ・システム情報・アプリ起動を試せるサンプルをすぐ作れます。
