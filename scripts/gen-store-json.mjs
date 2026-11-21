// storeApps.ts から public/store.json を生成する。
// ストア情報（各アプリの最新バージョンと更新内容）は OS 本体の version.json とは
// 別ファイルで配信するためのもの。ストアアプリを追加・更新したら必ず再実行すること。
// 使い方: node scripts/gen-store-json.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = readFileSync(join(root, 'src/lib/storeApps.ts'), 'utf-8')
const verSrc = readFileSync(join(root, 'src/lib/version.ts'), 'utf-8')
const version = verSrc.match(/APP_VERSION\s*=\s*'([^']+)'/)?.[1] ?? '0.0.0'

const arrayStart = src.indexOf('export const STORE_APPS')
const body = src.slice(arrayStart)
const chunks = body.split(/\n\s*\{\s*\n/).slice(1)
const apps = []
for (const chunk of chunks) {
  const id = chunk.match(/id:\s*'([^']+)'/)?.[1]
  const ver = chunk.match(/version:\s*'([^']+)'/)?.[1]
  if (!id || !ver) continue
  const notes = chunk.match(/notes:\s*'([^']*)'/)?.[1]
  const entry = { id, version: ver }
  if (notes) entry.notes = notes
  apps.push(entry)
}
if (apps.length === 0) {
  console.error('STORE_APPS を読み取れませんでした')
  process.exit(1)
}
const out = { version, apps }
writeFileSync(join(root, 'public/store.json'), JSON.stringify(out, null, 2) + '\n')
console.log(`public/store.json を生成しました（WebX v${version} / アプリ ${apps.length} 本）`)
