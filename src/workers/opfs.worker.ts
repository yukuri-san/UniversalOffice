/* OPFS 書き込み用 Web Worker。
   一部の環境（Safari など）では OPFS の書き込み用ハンドルがメインスレッドで作れず、
   Worker 内の createSyncAccessHandle が必要になるため、OPFS 操作はここに集約する。 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyHandle = any

const APP_DIR = 'ykr-os' // 内部名はデータ互換のため変更しない

async function dirOf(name: string): Promise<AnyHandle> {
  const root = await navigator.storage.getDirectory()
  const app = await root.getDirectoryHandle(APP_DIR, { create: true })
  if (!name) return app
  return app.getDirectoryHandle(name, { create: true })
}

async function writeJson(dirName: string, fileName: string, text: string): Promise<void> {
  const dir = await dirOf(dirName)
  const fh = await dir.getFileHandle(fileName, { create: true })
  const access = await fh.createSyncAccessHandle()
  try {
    access.truncate(0)
    const bytes = new TextEncoder().encode(text)
    access.write(bytes, { at: 0 })
    access.flush()
  } finally {
    access.close()
  }
}

async function readJson(dirName: string, fileName: string): Promise<string | null> {
  try {
    const dir = await dirOf(dirName)
    const fh = await dir.getFileHandle(fileName)
    const access = await fh.createSyncAccessHandle()
    try {
      const size = access.getSize()
      if (size === 0) return null
      const buffer = new ArrayBuffer(size)
      access.read(buffer, { at: 0 })
      return new TextDecoder().decode(buffer)
    } finally {
      access.close()
    }
  } catch {
    return null
  }
}

async function readAll(dirName: string): Promise<string[]> {
  const out: string[] = []
  try {
    const dir = await dirOf(dirName)
    for await (const handle of dir.values() as AsyncIterable<AnyHandle>) {
      if (handle.kind === 'file' && String(handle.name).endsWith('.json')) {
        const text = await readJson(dirName, String(handle.name))
        if (text) out.push(text)
      }
    }
  } catch { /* ignore */ }
  return out
}

async function removeEntry(dirName: string, fileName: string): Promise<void> {
  try {
    const dir = await dirOf(dirName)
    await dir.removeEntry(fileName)
  } catch { /* ignore */ }
}

interface Req {
  id: number
  op: 'write' | 'read' | 'readAll' | 'delete' | 'probe'
  dir: string
  name?: string
  text?: string
}

// 操作は必ず直列に実行する（書き込み途中のファイルを読みにいく等の競合を防ぐ）
let chain: Promise<void> = Promise.resolve()
self.onmessage = (e: MessageEvent<Req>) => {
  chain = chain.then(() => handleMessage(e.data)).catch(() => { /* ignore */ })
}

async function handleMessage(req: Req): Promise<void> {
  try {
    let result: unknown = null
    switch (req.op) {
      case 'write':
        await writeJson(req.dir, req.name ?? '', req.text ?? '')
        break
      case 'read':
        result = await readJson(req.dir, req.name ?? '')
        break
      case 'readAll':
        result = await readAll(req.dir)
        break
      case 'delete':
        await removeEntry(req.dir, req.name ?? '')
        break
      case 'probe':
        await writeJson('', '__probe__.json', '{"ok":true}')
        result = await readJson('', '__probe__.json')
        await removeEntry('', '__probe__.json')
        if (result !== '{"ok":true}') throw new Error('probe mismatch')
        break
    }
    ;(self as unknown as Worker).postMessage({ id: req.id, ok: true, result })
  } catch (err) {
    ;(self as unknown as Worker).postMessage({ id: req.id, ok: false, error: String(err) })
  }
}
