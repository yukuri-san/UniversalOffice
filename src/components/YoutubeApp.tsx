import { useCallback, useRef, useState } from 'react'
import { useLang } from '../lib/i18n'

function extractId(input: string): string | null {
  const trimmed = input.trim()
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed
  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /shorts\/([A-Za-z0-9_-]{11})/,
    /embed\/([A-Za-z0-9_-]{11})/,
    /live\/([A-Za-z0-9_-]{11})/,
  ]
  for (const p of patterns) {
    const m = trimmed.match(p)
    if (m) return m[1]
  }
  return null
}

function extractList(input: string): string | null {
  const m = input.trim().match(/[?&]list=([A-Za-z0-9_-]+)/)
  return m ? m[1] : null
}

type PlayTarget = { type: 'video'; id: string; list?: string } | { type: 'playlist'; list: string }

interface PlaylistVideo {
  id: string
  title: string
}

interface PlaylistFolder {
  listId: string
  name: string
  videos: PlaylistVideo[]
  updatedAt: number
}

const FOLDERS_KEY = 'webx-youtube-playlists'
const TITLES_KEY = 'webx-youtube-titles'

function loadFolders(): PlaylistFolder[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(FOLDERS_KEY) ?? '[]') as PlaylistFolder[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function loadTitles(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(TITLES_KEY) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}

/* YouTube IFrame API を使ってプレイリスト内の動画 ID 一覧を取得する（API キー不要）。
   非表示プレイヤーでプレイリストをキューし、getPlaylist() で ID 配列を読む。 */
let ytApiPromise: Promise<void> | null = null
function loadYtApi(): Promise<void> {
  if (ytApiPromise) return ytApiPromise
  ytApiPromise = new Promise((resolve) => {
    const w = window as unknown as { YT?: unknown; onYouTubeIframeAPIReady?: () => void }
    if (w.YT) {
      resolve()
      return
    }
    w.onYouTubeIframeAPIReady = () => resolve()
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(script)
    window.setTimeout(() => resolve(), 8000) // 読めない環境では諦めて呼び出し側で失敗扱い
  })
  return ytApiPromise
}

async function fetchPlaylistIds(listId: string): Promise<string[]> {
  await loadYtApi()
  const w = window as unknown as {
    YT?: {
      Player: new (el: HTMLElement, opts: Record<string, unknown>) => {
        cuePlaylist: (arg: Record<string, unknown>) => void
        getPlaylist: () => string[] | null
        destroy: () => void
      }
    }
  }
  if (!w.YT) throw new Error('YT API unavailable')
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:8px;height:8px;overflow:hidden'
  const mount = document.createElement('div')
  host.appendChild(mount)
  document.body.appendChild(host)
  return new Promise<string[]>((resolve, reject) => {
    let settled = false
    const cleanup = () => host.remove()
    const timer = window.setTimeout(() => {
      if (!settled) {
        settled = true
        cleanup()
        reject(new Error('timeout'))
      }
    }, 12000)
    const player = new w.YT!.Player(mount, {
      width: '8',
      height: '8',
      playerVars: { listType: 'playlist', list: listId, autoplay: 0, mute: 1 },
      events: {
        onReady: () => {
          try {
            player.cuePlaylist({ listType: 'playlist', list: listId })
          } catch { /* ignore */ }
          const started = Date.now()
          const poll = window.setInterval(() => {
            let ids: string[] | null = null
            try {
              ids = player.getPlaylist()
            } catch { /* ignore */ }
            if (ids && ids.length > 0) {
              window.clearInterval(poll)
              window.clearTimeout(timer)
              if (!settled) {
                settled = true
                try { player.destroy() } catch { /* ignore */ }
                cleanup()
                resolve(ids)
              }
            } else if (Date.now() - started > 9000) {
              window.clearInterval(poll)
              window.clearTimeout(timer)
              if (!settled) {
                settled = true
                try { player.destroy() } catch { /* ignore */ }
                cleanup()
                reject(new Error('empty playlist'))
              }
            }
          }, 500)
        },
        onError: () => {
          window.clearTimeout(timer)
          if (!settled) {
            settled = true
            try { player.destroy() } catch { /* ignore */ }
            cleanup()
            reject(new Error('player error'))
          }
        },
      },
    })
  })
}

async function fetchTitle(id: string, cache: Record<string, string>): Promise<string> {
  if (cache[id]) return cache[id]
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`)
    if (!res.ok) return id
    const data = (await res.json()) as { title?: string }
    const title = data.title || id
    cache[id] = title
    localStorage.setItem(TITLES_KEY, JSON.stringify(cache))
    return title
  } catch {
    return id
  }
}

export default function YoutubeApp() {
  const { t } = useLang()
  const [input, setInput] = useState('')
  const [target, setTarget] = useState<PlayTarget | null>(null)
  const [error, setError] = useState('')
  const [history, setHistory] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('webx-youtube-history') ?? '[]') as string[]
    } catch {
      return []
    }
  })
  const [folders, setFolders] = useState<PlaylistFolder[]>(loadFolders)
  const [openFolder, setOpenFolder] = useState<string | null>(null)
  const [listState, setListState] = useState<'idle' | 'loading' | 'error'>('idle')
  const titlesRef = useRef<Record<string, string>>(loadTitles())

  const saveFolders = useCallback((next: PlaylistFolder[]) => {
    setFolders(next)
    localStorage.setItem(FOLDERS_KEY, JSON.stringify(next))
  }, [])

  const loadPlaylistVideos = useCallback(async (listId: string) => {
    setListState('loading')
    try {
      const ids = await fetchPlaylistIds(listId)
      const cache = titlesRef.current
      const videos: PlaylistVideo[] = ids.slice(0, 200).map((id) => ({ id, title: cache[id] ?? id }))
      setFolders((prev) => {
        const next = prev.map((f) => (f.listId === listId ? { ...f, videos, updatedAt: Date.now() } : f))
        localStorage.setItem(FOLDERS_KEY, JSON.stringify(next))
        return next
      })
      setListState('idle')
      // タイトルを順に取得して差し替える（最大50件まで）
      for (const video of videos.slice(0, 50)) {
        if (video.title !== video.id) continue
        const title = await fetchTitle(video.id, cache)
        if (title === video.id) continue
        setFolders((prev) => {
          const next = prev.map((f) =>
            f.listId === listId
              ? { ...f, videos: f.videos.map((v) => (v.id === video.id ? { ...v, title } : v)) }
              : f,
          )
          localStorage.setItem(FOLDERS_KEY, JSON.stringify(next))
          return next
        })
      }
    } catch {
      setListState('error')
    }
  }, [])

  const play = (raw: string) => {
    const id = extractId(raw)
    const list = extractList(raw)
    if (!id && !list) {
      setError(t('ytInvalid'))
      return
    }
    setError('')
    if (id) {
      setTarget({ type: 'video', id, list: list ?? undefined })
      setHistory((prev) => {
        const next = [id, ...prev.filter((x) => x !== id)].slice(0, 10)
        localStorage.setItem('webx-youtube-history', JSON.stringify(next))
        return next
      })
    }
    if (list) {
      if (!id) setTarget({ type: 'playlist', list })
      setError(t('ytPlaylistOk'))
      const existing = folders.find((f) => f.listId === list)
      if (!existing) {
        saveFolders([{ listId: list, name: `プレイリスト ${list.slice(0, 8)}…`, videos: [], updatedAt: Date.now() }, ...folders])
      }
      setOpenFolder(list)
      if (!existing || existing.videos.length === 0) {
        void loadPlaylistVideos(list)
      }
    }
  }

  const renameFolder = (folder: PlaylistFolder) => {
    const name = window.prompt(t('rename'), folder.name)
    if (!name?.trim()) return
    saveFolders(folders.map((f) => (f.listId === folder.listId ? { ...f, name: name.trim() } : f)))
  }

  const deleteFolder = (folder: PlaylistFolder) => {
    saveFolders(folders.filter((f) => f.listId !== folder.listId))
    if (openFolder === folder.listId) setOpenFolder(null)
  }

  const embedSrc = target
    ? target.type === 'video'
      ? `https://www.youtube-nocookie.com/embed/${target.id}?rel=0${target.list ? `&list=${target.list}` : ''}`
      : `https://www.youtube-nocookie.com/embed/videoseries?list=${target.list}&rel=0`
    : ''

  return (
    <div className="youtube-app">
      <form
        className="browser-bar"
        onSubmit={(e) => {
          e.preventDefault()
          play(input)
        }}
      >
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={t('ytPh')} />
        <button type="submit">{t('ytPlay')}</button>
      </form>
      <p className="browser-note">{t('ytNote')}</p>
      {error && <p className="yt-error">{error}</p>}
      {target ? (
        <div className="yt-player">
          <iframe
            key={embedSrc}
            src={embedSrc}
            title="YouTube"
            sandbox="allow-scripts allow-same-origin allow-presentation"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
      ) : (
        history.length > 0 && (
          <div className="yt-history">
            <h4>{t('ytHistory')}</h4>
            <div className="yt-grid">
              {history.map((id) => (
                <button key={id} onClick={() => setTarget({ type: 'video', id })}>
                  <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt={id} loading="lazy" />
                  <span>{id}</span>
                </button>
              ))}
            </div>
          </div>
        )
      )}
      {target && history.length > 1 && (
        <div className="yt-history">
          <h4>{t('ytHistory')}</h4>
          <div className="yt-grid">
            {history.filter((id) => !(target?.type === 'video' && id === target.id)).map((id) => (
              <button key={id} onClick={() => setTarget({ type: 'video', id })}>
                <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt={id} loading="lazy" />
                <span>{id}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {folders.length > 0 && (
        <div className="yt-folders">
          <h4>📁 プレイリスト</h4>
          <div className="yt-folder-list">
            {folders.map((folder) => (
              <div key={folder.listId} className={openFolder === folder.listId ? 'yt-folder on' : 'yt-folder'}>
                <button className="yt-folder-head" onClick={() => setOpenFolder(openFolder === folder.listId ? null : folder.listId)}>
                  <span>📁 {folder.name}</span>
                  <small>{folder.videos.length} 本</small>
                </button>
                <div className="yt-folder-actions">
                  <button onClick={() => setTarget({ type: 'playlist', list: folder.listId })}>{t('ytPlay')}</button>
                  <button onClick={() => void loadPlaylistVideos(folder.listId)}>{t('refresh')}</button>
                  <button onClick={() => renameFolder(folder)}>{t('rename')}</button>
                  <button onClick={() => deleteFolder(folder)}>{t('deleteBtn')}</button>
                </div>
                {openFolder === folder.listId && (
                  <>
                    {listState === 'loading' && folder.videos.length === 0 && <p className="browser-note">{t('loading')}</p>}
                    {listState === 'error' && folder.videos.length === 0 && (
                      <p className="browser-note">動画一覧を取得できませんでした（再生は上のプレイヤーでできます）</p>
                    )}
                    <div className="yt-grid">
                      {folder.videos.map((video, i) => (
                        <button key={`${video.id}-${i}`} onClick={() => setTarget({ type: 'video', id: video.id, list: folder.listId })}>
                          <img src={`https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`} alt={video.title} loading="lazy" />
                          <span>{video.title}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
