// App Store のカタログ。新規アプリはここに登録する（コアには入れない）。
// ユーザーはストアからインストール／アンインストールでき、更新はアプリごとに個別処理する。
// アプリを改良したら、そのアプリの version だけを上げる（WebX 本体のバージョンとは独立）。
export interface StoreAppDef {
  id: string
  icon: string
  cls: string
  name: string
  desc: string
  version: string
}

export const STORE_APPS: StoreAppDef[] = [
  {
    id: 'unit',
    icon: '換',
    cls: 'unit',
    name: '単位変換',
    desc: '長さ・重さ・温度・データ量を相互変換するユーティリティ。',
    version: '1.0.0',
  },
]
