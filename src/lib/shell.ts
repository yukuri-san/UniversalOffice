import { addFolder, deleteDoc, listDocs, listEvents, listFolders, saveDoc, storageInfo, trashDoc, type LocalDoc } from './store'
import { APP_VERSION } from './version'
import { resetSettingsOnly } from './reset'

/* WebX コマンドライン基盤（ターミナル／回復コンソール共用）
   DOS / Windows CMD 風コマンドで、WebX の保存ファイルをファイルシステムとして操作する。 */

export interface ShellApp { id: string; name: string }
export interface ShellContext {
  apps: ShellApp[]
  openApp: (id: string) => void
  notify: (text: string) => void
  clear: () => void
  exit?: () => void
  setTheme?: (id: string) => void
  action?: (name: string) => void // 'lock' | 'reboot' | 'bios' | 'recovery' など
  recovery?: boolean
}
export interface ShellState { cwd: string }

const stripHtml = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
const fmtDate = (ts: number) => {
  const d = new Date(ts)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const bytes = (s: string) => new TextEncoder().encode(s).length

function tokenize(input: string): string[] {
  const out: string[] = []
  const re = /"([^"]*)"|(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(input)) !== null) out.push(m[1] ?? m[2])
  return out
}

/** 簡易の数式評価（四則演算と括弧のみ） */
export function evalExpr(expr: string): number | null {
  const tokens = expr.replace(/\s+/g, '').match(/(\d+\.?\d*|[()+\-*/%])/g)
  if (!tokens || tokens.join('') !== expr.replace(/\s+/g, '')) return null
  let pos = 0
  const peek = () => tokens[pos]
  const next = () => tokens[pos++]
  function parseExpr(): number {
    let v = parseTerm()
    while (peek() === '+' || peek() === '-') { const op = next(); const r = parseTerm(); v = op === '+' ? v + r : v - r }
    return v
  }
  function parseTerm(): number {
    let v = parseFactor()
    while (peek() === '*' || peek() === '/' || peek() === '%') { const op = next(); const r = parseFactor(); v = op === '*' ? v * r : op === '/' ? v / r : v % r }
    return v
  }
  function parseFactor(): number {
    const tk = next()
    if (tk === '(') { const v = parseExpr(); next(); return v }
    if (tk === '-') return -parseFactor()
    return parseFloat(tk)
  }
  const v = parseExpr()
  return Number.isFinite(v) ? v : null
}

const HELP: [string, string][] = [
  ['help', 'コマンド一覧（help <コマンド> で詳細）'],
  ['dir', 'ファイルとフォルダの一覧'],
  ['cd <フォルダ>', 'フォルダ移動（cd .. で上へ、cd \\ でルートへ）'],
  ['tree', 'フォルダ構成をツリー表示'],
  ['type <ファイル>', 'ファイルの内容を表示'],
  ['echo <文字> [> ファイル]', '表示、またはファイルへ書き込み（>> で追記）'],
  ['copy <元> <先> / move <元> <先>', 'ファイルのコピー／移動'],
  ['ren <旧> <新>', '名前の変更'],
  ['del <ファイル>', 'ファイルをゴミ箱へ'],
  ['mkdir <名前>', 'フォルダ作成'],
  ['apps', 'アプリ一覧'],
  ['open <アプリ>', 'アプリを起動'],
  ['calc <式>', '計算（例：calc (3+4)*2）'],
  ['sysinfo / storage', 'システム情報／保存容量'],
  ['events', '今後の予定'],
  ['notify <文字>', '通知を出す'],
  ['theme <テーマid>', 'テーマ変更'],
  ['lock / reboot / bios / recovery', 'ロック／再起動／BIOS／回復環境'],
  ['date / time / ver / cls / exit', '日付／時刻／バージョン／画面クリア／終了'],
]

async function docsIn(cwd: string): Promise<LocalDoc[]> {
  const docs = await listDocs()
  return docs.filter((d) => (d.folder || '') === cwd && !d.deletedAt)
}
function findDoc(docs: LocalDoc[], name: string): LocalDoc | undefined {
  const n = name.toLowerCase()
  return docs.find((d) => d.name.toLowerCase() === n)
}

export async function execCommand(raw: string, state: ShellState, ctx: ShellContext): Promise<{ out: string[]; state: ShellState }> {
  const input = raw.trim()
  if (!input) return { out: [], state }
  const tokens = tokenize(input)
  const cmd = (tokens[0] ?? '').toLowerCase()
  const args = tokens.slice(1)
  const argStr = input.slice(tokens[0].length).trim()
  const done = (out: string[], st: ShellState = state) => ({ out, state: st })

  switch (cmd) {
    case 'help': {
      if (args[0]) {
        const hit = HELP.find(([c]) => c.split(' ')[0] === args[0].toLowerCase())
        return done(hit ? [`${hit[0]} — ${hit[1]}`] : [`'${args[0]}' のヘルプはありません`])
      }
      return done(['WebX コマンド一覧:', ...HELP.map(([c, d]) => `  ${c.padEnd(26)} ${d}`)])
    }
    case 'ver': return done([`WebX [Version ${APP_VERSION}]`, '(c) yukuri-san'])
    case 'cls': ctx.clear(); return done([])
    case 'exit': ctx.exit?.(); return done(['終了します'])
    case 'date': return done([new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })])
    case 'time': return done([new Date().toLocaleTimeString('ja-JP')])
    case 'pwd': return done([`\\${state.cwd}`])
    case 'dir': {
      const folders = state.cwd === '' ? await listFolders() : []
      const docs = await docsIn(state.cwd)
      const lines = [`\\${state.cwd} の一覧`, '']
      folders.forEach((f) => lines.push(`  <DIR>  ${f}`))
      docs.forEach((d) => lines.push(`  ${fmtDate(d.updatedAt)}  ${String(bytes(d.content)).padStart(8)}  ${d.name}`))
      lines.push('', `  ${docs.length} ファイル / ${folders.length} フォルダ`)
      return done(lines)
    }
    case 'tree': {
      const folders = await listFolders()
      const docs = await listDocs()
      const lines = ['\\']
      const root = docs.filter((d) => !d.folder && !d.deletedAt)
      root.forEach((d, i) => lines.push(`${i === root.length - 1 && folders.length === 0 ? '└─' : '├─'} ${d.name}`))
      folders.forEach((f, fi) => {
        lines.push(`${fi === folders.length - 1 ? '└─' : '├─'} ${f}`)
        const inF = docs.filter((d) => d.folder === f && !d.deletedAt)
        inF.forEach((d, i) => lines.push(`${fi === folders.length - 1 ? '   ' : '│  '}${i === inF.length - 1 ? '└─' : '├─'} ${d.name}`))
      })
      return done(lines)
    }
    case 'cd': {
      const target = args[0] ?? ''
      if (target === '' || target === '\\' || target === '/') return done([], { cwd: '' })
      if (target === '..') return done([], { cwd: '' })
      const folders = await listFolders()
      const hit = folders.find((f) => f.toLowerCase() === target.toLowerCase())
      if (!hit) return done([`フォルダ '${target}' が見つかりません`])
      return done([], { cwd: hit })
    }
    case 'type': {
      if (!args[0]) return done(['使い方: type <ファイル>'])
      const docs = await docsIn(state.cwd)
      const doc = findDoc(docs, args.join(' '))
      if (!doc) return done([`ファイル '${args.join(' ')}' が見つかりません`])
      const text = doc.kind === 'word' ? stripHtml(doc.content) : doc.content
      return done(text.split('\n').slice(0, 60))
    }
    case 'echo': {
      const gt = argStr.lastIndexOf('>>')
      const gt1 = argStr.lastIndexOf('>')
      if (gt > 0 || (gt1 > 0 && gt !== gt1 - 1)) {
        const append = gt > 0
        const idx = append ? gt : gt1
        const textPart = argStr.slice(0, idx).trim()
        const fileName = argStr.slice(idx + (append ? 2 : 1)).trim().replace(/^"|"$/g, '')
        if (!fileName) return done(['使い方: echo <文字> > <ファイル>'])
        const docs = await docsIn(state.cwd)
        const existing = findDoc(docs, fileName)
        if (existing) {
          const prev = existing.kind === 'word' ? stripHtml(existing.content) : existing.content
          await saveDoc({ ...existing, content: append ? `${prev}\n${textPart}` : textPart })
        } else {
          await saveDoc({ name: fileName, kind: 'note', folder: state.cwd, content: textPart })
        }
        return done([`${fileName} に書き込みました`])
      }
      return done([argStr])
    }
    case 'mkdir': {
      if (!args[0]) return done(['使い方: mkdir <名前>'])
      await addFolder(args.join(' '))
      return done([`フォルダ '${args.join(' ')}' を作成しました`])
    }
    case 'del': {
      if (!args[0]) return done(['使い方: del <ファイル>'])
      const docs = await docsIn(state.cwd)
      const doc = findDoc(docs, args.join(' '))
      if (!doc) return done([`ファイル '${args.join(' ')}' が見つかりません`])
      await trashDoc(doc.id)
      return done([`${doc.name} をゴミ箱へ移動しました`])
    }
    case 'ren': {
      if (args.length < 2) return done(['使い方: ren <旧名> <新名>'])
      const docs = await docsIn(state.cwd)
      const doc = findDoc(docs, args[0])
      if (!doc) return done([`ファイル '${args[0]}' が見つかりません`])
      await saveDoc({ ...doc, name: args.slice(1).join(' ') })
      return done([`${args[0]} → ${args.slice(1).join(' ')}`])
    }
    case 'copy':
    case 'move': {
      if (args.length < 2) return done([`使い方: ${cmd} <元> <先>`])
      const docs = await docsIn(state.cwd)
      const doc = findDoc(docs, args[0])
      if (!doc) return done([`ファイル '${args[0]}' が見つかりません`])
      const dest = args.slice(1).join(' ')
      await saveDoc({ name: dest, kind: doc.kind, folder: state.cwd, content: doc.content })
      if (cmd === 'move') await deleteDoc(doc.id)
      return done([`${doc.name} を${cmd === 'copy' ? 'コピー' : '移動'}しました → ${dest}`])
    }
    case 'apps': return done(ctx.apps.map((a) => `  ${a.id.padEnd(16)} ${a.name}`))
    case 'open': {
      if (!args[0]) return done(['使い方: open <アプリid>（apps で一覧）'])
      const app = ctx.apps.find((a) => a.id === args[0].toLowerCase())
      if (!app) return done([`アプリ '${args[0]}' が見つかりません`])
      ctx.openApp(app.id)
      return done([`${app.name} を起動しました`])
    }
    case 'calc': {
      const v = evalExpr(argStr)
      return done(v === null ? ['式を解釈できませんでした'] : [`${argStr} = ${v}`])
    }
    case 'sysinfo': {
      const nav = navigator as unknown as { hardwareConcurrency?: number; deviceMemory?: number; userAgent: string }
      return done([
        `WebX v${APP_VERSION}`,
        `CPUコア: ${nav.hardwareConcurrency ?? '不明'} / メモリ目安: ${nav.deviceMemory ? `${nav.deviceMemory} GB` : '不明'}`,
        `画面: ${window.innerWidth}×${window.innerHeight}`,
        `UA: ${nav.userAgent}`,
      ])
    }
    case 'storage': {
      const info = await storageInfo()
      const docs = await listDocs()
      const evs = await listEvents()
      return done([
        `保存方式: ${info.backend}（永続化: ${info.persisted ? '有効' : '未許可'}）`,
        `使用量: ${(info.usage / 1024).toFixed(1)} KB${info.quota ? ` / 上限目安 ${(info.quota / 1024 / 1024).toFixed(0)} MB` : ''}`,
        `ドキュメント: ${docs.length} 件 / 予定: ${evs.length} 件`,
      ])
    }
    case 'events': {
      const evs = (await listEvents()).filter((e) => e.date >= new Date().toISOString().slice(0, 10)).slice(0, 10)
      return done(evs.length ? evs.map((e) => `  ${e.date}  ${e.title}`) : ['今後の予定はありません'])
    }
    case 'notify': {
      if (!argStr) return done(['使い方: notify <文字>'])
      ctx.notify(argStr)
      return done(['通知しました'])
    }
    case 'theme': {
      if (!args[0] || !ctx.setTheme) return done(['使い方: theme <テーマid>（light / dark など）'])
      ctx.setTheme(args[0])
      return done([`テーマを ${args[0]} に変更しました`])
    }
    case 'lock': ctx.action?.('lock'); return done(['ロックします'])
    case 'reboot': ctx.action?.('reboot'); return done(['再起動します'])
    case 'bios': ctx.action?.('bios'); return done(['BIOS で再起動します'])
    case 'recovery': ctx.action?.('recovery'); return done(['回復環境で再起動します'])
    case 'reset-settings': {
      if (!ctx.recovery) return done(['このコマンドは回復環境でのみ使えます'])
      resetSettingsOnly()
      return done(['設定をリセットしました（データは保持）。boot-normal で通常起動してください'])
    }
    case 'clear-cache': {
      try {
        const keys = await caches.keys()
        await Promise.all(keys.map((k) => caches.delete(k)))
        return done([`キャッシュを ${keys.length} 件消去しました`])
      } catch { return done(['キャッシュを消去できませんでした']) }
    }
    case 'boot-normal': {
      if (!ctx.recovery) return done(['このコマンドは回復環境でのみ使えます'])
      ctx.action?.('reboot')
      return done(['通常起動します'])
    }
    default:
      return done([`'${cmd}' はコマンドとして認識されていません。help で一覧を表示します`])
  }
}
