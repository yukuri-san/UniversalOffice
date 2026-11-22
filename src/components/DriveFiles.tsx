import { useCallback, useEffect, useState } from 'react'
import { driveDelete, driveList, drivePut, lsUsageBytes, type DriveFile, type ExtDriveId } from '../lib/drives'
import { saveDoc } from '../lib/store'
import { downloadText } from '../lib/files'
import { notifyOs } from '../lib/notify'

/**
 * 外部ドライブ（IndexedDB／LocalStorage）のファイル管理UI。Pro Edition のエクスプローラーで使う。
 * テキストファイルの新規作成・編集・削除・ダウンロードと、Cドライブ（メモ帳ドキュメント）へのコピーができる。
 */

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${n} B`
}

export default function DriveFiles({ drive }: { drive: ExtDriveId }) {
  const [files, setFiles] = useState<DriveFile[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [msg, setMsg] = useState('')

  const refresh = useCallback(async () => {
    setFiles(await driveList(drive))
  }, [drive])

  useEffect(() => {
    setSelected(null)
    setName('')
    setContent('')
    setMsg('')
    void refresh()
  }, [refresh])

  const open = (f: DriveFile) => {
    setSelected(f.name)
    setName(f.name)
    setContent(f.content)
    setMsg('')
  }
  const save = async () => {
    const n = name.trim()
    if (!n) { setMsg('ファイル名を入力してください'); return }
    try {
      await drivePut(drive, { name: n, content, updatedAt: Date.now() })
      setSelected(n)
      setMsg(`「${n}」を保存しました`)
      await refresh()
    } catch {
      setMsg(drive === 'ls' ? '保存できませんでした（LocalStorageの容量不足の可能性があります）' : '保存できませんでした')
    }
  }
  const remove = async () => {
    if (!selected) return
    if (!window.confirm(`「${selected}」を削除しますか？`)) return
    await driveDelete(drive, selected)
    setSelected(null)
    setName('')
    setContent('')
    setMsg('削除しました')
    await refresh()
  }
  const copyToC = async () => {
    const n = name.trim()
    if (!n) { setMsg('ファイル名を入力してください'); return }
    await saveDoc({ kind: 'note', name: n, folder: '', content })
    notifyOs(`「${n}」をCドライブ（メモ帳）へコピーしました`)
    setMsg('Cドライブへコピーしました')
  }
  const total = files.reduce((sum, f) => sum + new Blob([f.content]).size, 0)

  return (
    <div className="drivefiles">
      <p className="explorer-note">
        {drive === 'idb'
          ? '外部ドライブ（IndexedDB）：本体とは別の保存領域です。テキストファイルを置けます。'
          : `外部ドライブ（LocalStorage）：小容量の保存領域です（現在 ${formatBytes(lsUsageBytes())} 使用）。大きなファイルは置けません。`}
        ファイル {files.length} 件／合計 {formatBytes(total)}
      </p>
      <div className="drivefiles-body">
        <div className="drivefiles-list">
          <button className="btn accent" onClick={() => { setSelected(null); setName(''); setContent(''); setMsg('') }}>＋ 新規ファイル</button>
          {files.map((f) => (
            <button key={f.name} className={`memodb-item ${selected === f.name ? 'on' : ''}`} onClick={() => open(f)}>
              <span className="memodb-item-title">📄 {f.name}</span>
              <span className="memodb-item-meta">{formatBytes(new Blob([f.content]).size)} ・ {new Date(f.updatedAt).toLocaleString('ja-JP')}</span>
            </button>
          ))}
          {files.length === 0 && <p className="store-note">ファイルがありません</p>}
        </div>
        <div className="drivefiles-edit">
          <input className="ymm-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="ファイル名（例：メモ.txt）" />
          <textarea className="memodb-body" value={content} onChange={(e) => setContent(e.target.value)} placeholder="内容（テキスト）" />
          <div className="explorer-actions">
            <button className="btn accent" onClick={() => void save()}>保存</button>
            {selected && <button className="btn" onClick={() => void remove()}>削除</button>}
            <button className="btn" onClick={() => downloadText(name.trim() || 'file.txt', content, 'text/plain')}>ダウンロード</button>
            <button className="btn" onClick={() => void copyToC()}>💽 Cドライブへコピー</button>
            {msg && <span className="fm-message">{msg}</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
