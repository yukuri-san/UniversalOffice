import { useCallback, useEffect, useRef, useState } from 'react'
import WordProcessor from './components/WordProcessor'
import Spreadsheet from './components/Spreadsheet'
import Notepad from './components/Notepad'
import Calendar from './components/Calendar'
import BrowserPanel from './components/BrowserPanel'
import FilesWindow from './components/FilesWindow'
import Settings, { type ThemeId } from './components/Settings'
import { LangContext, translate, type Lang } from './lib/i18n'
import YoutubeApp from './components/YoutubeApp'
import TrashWindow from './components/TrashWindow'
import DocsWindow, { type DocKind } from './components/DocsWindow'
import Calculator from './components/Calculator'
import ClockApp from './components/ClockApp'
import Paint from './components/Paint'
import Terminal from './components/Terminal'
import MemoDb from './components/MemoDb'
import AboutWindow from './components/AboutWindow'
import { requestPersist } from './lib/store'
import { APP_VERSION } from './lib/version'
import type { AppId } from './components/Backstage'
import { detectPlatform, isMod, modLabel, platformLabel } from './lib/platform'

type WindowApp = AppId | 'browser' | 'files' | 'settings' | 'youtube' | 'trash' | 'calculator' | 'clock' | 'paint' | 'terminal' | 'docs' | 'memodb' | 'about'

interface Win {
  id: WindowApp
  z: number
  minimized: boolean
  maximized: boolean
  x: number
  y: number
  w: number
  h: number
}

const APP_META: Record<WindowApp, { icon: string; cls: string }> = {
  word: { icon: 'W', cls: 'word' },
  sheet: { icon: 'S', cls: 'sheet' },
  note: { icon: 'メ', cls: 'note' },
  calendar: { icon: 'カ', cls: 'calendar' },
  browser: { icon: 'ブ', cls: 'browser' },
  files: { icon: 'フ', cls: 'files' },
  settings: { icon: '設', cls: 'settings' },
  youtube: { icon: '▶', cls: 'youtube' },
  trash: { icon: '🗑', cls: 'trash' },
  calculator: { icon: '電', cls: 'calculator' },
  clock: { icon: '時', cls: 'clock' },
  paint: { icon: '絵', cls: 'paint' },
  terminal: { icon: '＞', cls: 'terminal' },
  docs: { icon: '文', cls: 'docs' },
  memodb: { icon: 'デ', cls: 'memodb' },
  about: { icon: 'W', cls: 'about' },
}
const APP_ORDER: WindowApp[] = ['word', 'sheet', 'note', 'memodb', 'calendar', 'browser', 'youtube', 'files', 'trash', 'calculator', 'clock', 'paint', 'terminal', 'settings']

export default function App() {
  const [windows, setWindows] = useState<Win[]>([])
  const [activeId, setActiveId] = useState<WindowApp | null>(null)
  const [startOpen, setStartOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [platform] = useState(detectPlatform)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)
  const [notes, setNotes] = useState<{ id: number; text: string; time: string }[]>([])
  const [notesOpen, setNotesOpen] = useState(false)
  const [selectedIcon, setSelectedIcon] = useState<WindowApp | null>(null)
  const [uiScaleSetting, setUiScaleSetting] = useState<string>(() => localStorage.getItem('webx-ui-scale') ?? 'auto')
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight })
  useEffect(() => {
    const onWinResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onWinResize)
    return () => window.removeEventListener('resize', onWinResize)
  }, [])
  const uiScale = uiScaleSetting === 'auto'
    ? viewport.h <= 470 || viewport.w <= 560 ? 0.7
      : viewport.h <= 580 ? 0.8
      : viewport.h <= 700 ? 0.9
      : 1
    : Number(uiScaleSetting) / 100
  const [booted, setBooted] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setBooted(true), 1100)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    const onNotify = (e: Event) => {
      const text = (e as CustomEvent<string>).detail
      setNotes((prev) => [{ id: Date.now() + Math.random(), text, time: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) }, ...prev].slice(0, 30))
      showToast(text)
    }
    window.addEventListener('webx-notify', onNotify)
    return () => window.removeEventListener('webx-notify', onNotify)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('ykr-lang') as Lang) || 'ja')
  const [theme, setTheme] = useState<ThemeId>(() => (localStorage.getItem('ykr-theme') as ThemeId) || 'light')
  const t = (key: string) => translate(lang, key)
  const appName = (app: WindowApp) => t(app)

  useEffect(() => {
    localStorage.setItem('ykr-lang', lang)
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : lang
  }, [lang])
  useEffect(() => {
    localStorage.setItem('ykr-theme', theme)
  }, [theme])
  useEffect(() => {
    void requestPersist()
  }, [])
  // ソフトウェアキーボード開閉後にページ領域外が見える問題への対策：
  // visualViewport の高さにアプリの高さを同期し、閉じたときはスクロール位置を戻す
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    let maxH = vv.height
    const onResize = () => {
      maxH = Math.max(maxH, vv.height)
      document.documentElement.style.setProperty('--app-h', `${vv.height}px`)
      if (vv.height >= maxH - 4) {
        window.scrollTo(0, 0)
        document.documentElement.style.setProperty('--app-h', `${vv.height}px`)
      }
    }
    onResize()
    vv.addEventListener('resize', onResize)
    vv.addEventListener('scroll', onResize)
    return () => {
      vv.removeEventListener('resize', onResize)
      vv.removeEventListener('scroll', onResize)
    }
  }, [])
  useEffect(() => {
    const onWallpaper = (e: Event) => {
      const dataUrl = (e as CustomEvent<string>).detail
      setWpCustom(dataUrl)
      setWpUseCustom(true)
    }
    window.addEventListener('webx-wallpaper', onWallpaper)
    return () => window.removeEventListener('webx-wallpaper', onWallpaper)
  }, [])
  const [wpPreset, setWpPreset] = useState(() => localStorage.getItem('webx-wp-preset') || 'aurora')
  const [wpCustom, setWpCustom] = useState<string | null>(() => localStorage.getItem('webx-wp-custom'))
  const [wpUseCustom, setWpUseCustom] = useState(() => localStorage.getItem('webx-wp-use') === 'custom')
  useEffect(() => { localStorage.setItem('webx-wp-preset', wpPreset) }, [wpPreset])
  useEffect(() => { localStorage.setItem('webx-wp-use', wpUseCustom ? 'custom' : 'preset') }, [wpUseCustom])
  useEffect(() => {
    if (wpCustom) localStorage.setItem('webx-wp-custom', wpCustom)
    else localStorage.removeItem('webx-wp-custom')
  }, [wpCustom])
  const toastTimer = useRef<number | null>(null)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 2200)
  }, [])
  const [now, setNow] = useState(new Date())
  const [wide, setWide] = useState(() => window.matchMedia('(min-width: 1024px)').matches)
  const [desktop, setDesktop] = useState({ w: 1200, h: 700 })
  const desktopRef = useRef<HTMLDivElement>(null)
  const zRef = useRef(10)
  const dragRef = useRef<{ id: WindowApp; dx: number; dy: number } | null>(null)

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(t)
  }, [])

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const onChange = () => setWide(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    const el = desktopRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setDesktop({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setDesktop({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  const focusWin = useCallback((id: WindowApp) => {
    zRef.current += 1
    const z = zRef.current
    setActiveId(id)
    setWindows((prev) => prev.map((w) => (w.id === id ? { ...w, z, minimized: false } : w)))
  }, [])

  const openApp = useCallback((app: WindowApp) => {
    setStartOpen(false)
    setWindows((prev) => {
      if (prev.some((w) => w.id === app)) return prev
      const offset = (prev.length % 5) * 34
      const w = Math.min(920, Math.max(560, desktop.w * 0.72))
      const h = Math.min(640, Math.max(420, desktop.h * 0.78))
      zRef.current += 1
      return [
        ...prev,
        {
          id: app,
          z: zRef.current,
          minimized: false,
          maximized: !wide,
          x: Math.max(6, (desktop.w - w) / 2 + offset - 60),
          y: Math.max(6, (desktop.h - h) / 2 + offset - 30),
          w,
          h,
        },
      ]
    })
    zRef.current += 1
    setActiveId(app)
    setWindows((prev) => prev.map((w) => (w.id === app ? { ...w, z: zRef.current, minimized: false } : w)))
  }, [desktop, wide])

  const closeWin = (id: WindowApp) => {
    setWindows((prev) => prev.filter((w) => w.id !== id))
    if (activeId === id) setActiveId(null)
  }

  const toggleMax = (id: WindowApp) => {
    setWindows((prev) => prev.map((w) => (w.id === id ? { ...w, maximized: !w.maximized } : w)))
    focusWin(id)
  }

  const onTitlePointerDown = (e: React.PointerEvent, win: Win) => {
    focusWin(win.id)
    if (win.maximized || !wide) return
    dragRef.current = { id: win.id, dx: e.clientX - win.x, dy: e.clientY - win.y }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onTitlePointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    setWindows((prev) =>
      prev.map((w) =>
        w.id === drag.id
          ? { ...w, x: Math.min(Math.max(e.clientX - drag.dx, -w.w + 120), desktop.w - 80), y: Math.min(Math.max(e.clientY - drag.dy, 0), desktop.h - 40) }
          : w
      )
    )
  }
  const onTitlePointerUp = () => {
    dragRef.current = null
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setStartOpen(false)
        setShortcutsOpen(false)
        return
      }
      if (!isMod(e, platform)) return
      const key = e.key
      if (/^[1-9]$/.test(key)) {
        e.preventDefault()
        openApp(APP_ORDER[Number(key) - 1])
        return
      }
      if (key === 'Tab' || key === '`') {
        e.preventDefault()
        if (windows.length === 0) return
        const sorted = [...windows].sort((a, b) => b.z - a.z)
        const idx = sorted.findIndex((w) => w.id === activeId)
        const delta = e.shiftKey ? -1 : 1
        const target = sorted[(idx + delta + sorted.length) % sorted.length]
        if (target) focusWin(target.id)
        return
      }
      if (key === '/' || key === '?') {
        e.preventDefault()
        setShortcutsOpen((v) => !v)
        return
      }
      if (key.toLowerCase() === 's') {
        e.preventDefault()
        showToast(t('savedToast'))
        return
      }
      if (!activeId) return
      if (key === 'Enter') {
        e.preventDefault()
        toggleMax(activeId)
        return
      }
      switch (key.toLowerCase()) {
        case 'm':
          e.preventDefault()
          if (e.shiftKey) toggleMax(activeId)
          else setWindows((prev) => prev.map((w) => (w.id === activeId ? { ...w, minimized: true } : w)))
          break
        case 'w':
          if (e.shiftKey) {
            e.preventDefault()
            closeWin(activeId)
          }
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windows, activeId, platform, openApp, focusWin])

  const renderContent = (app: WindowApp) => {
    switch (app) {
      case 'word': return <WordProcessor onSwitch={openApp} />
      case 'sheet': return <Spreadsheet onSwitch={openApp} />
      case 'note': return <Notepad onSwitch={openApp} />
      case 'calendar': return <Calendar onSwitch={openApp} />
      case 'browser': return <BrowserPanel />
      case 'files': return <FilesWindow openApp={openApp} />
      case 'settings': return (
        <Settings
          lang={lang} setLang={setLang} theme={theme} setTheme={setTheme}
          wpPreset={wpPreset}
          onSelectPreset={(id) => { setWpPreset(id); setWpUseCustom(false) }}
          hasCustom={!!wpCustom}
          wpUseCustom={wpUseCustom}
          onCustom={(dataUrl) => { setWpCustom(dataUrl); setWpUseCustom(true) }}
          onUseCustom={() => setWpUseCustom(true)}
          onRemoveCustom={() => { setWpCustom(null); setWpUseCustom(false) }}
          openDocs={(doc: DocKind) => {
            localStorage.setItem('webx-docs-initial', doc)
            openApp('docs')
          }}
          openAbout={() => openApp('about')}
          uiScale={uiScaleSetting}
          onUiScale={(value: string) => {
            setUiScaleSetting(value)
            localStorage.setItem('webx-ui-scale', value)
          }}
        />
      )
      case 'youtube': return <YoutubeApp />
      case 'trash': return <TrashWindow />
      case 'calculator': return <Calculator />
      case 'clock': return <ClockApp />
      case 'paint': return <Paint />
      case 'terminal': return <Terminal openApp={openApp} />
      case 'docs': return <DocsWindow />
      case 'memodb': return <MemoDb />
      case 'about': return <AboutWindow openDocs={(doc) => { localStorage.setItem('webx-docs-initial', doc); openApp('docs') }} />
    }
  }

  const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const dateLabel = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}`

  return (
    <LangContext.Provider value={lang}>
    <div className="os-root" data-theme={theme} data-wallpaper={wpUseCustom ? 'custom' : wpPreset} style={{ zoom: uiScale } as React.CSSProperties}>
      <div
        className="os-desktop"
        ref={desktopRef}
        onClick={() => { setStartOpen(false); setCtxMenu(null); setNotesOpen(false) }}
        onContextMenu={(e) => {
          e.preventDefault()
          setCtxMenu({ x: e.clientX, y: e.clientY })
        }}
        style={wpUseCustom && wpCustom ? { backgroundImage: `url(${wpCustom})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
      >
        <div className="desktop-icons">
          {APP_ORDER.map((app) => (
            <button
              key={app}
              className={selectedIcon === app ? 'desktop-icon selected' : 'desktop-icon'}
              onClick={(e) => { e.stopPropagation(); setSelectedIcon(app) }}
              onDoubleClick={(e) => { e.stopPropagation(); openApp(app) }}
            >
              <span className={`app-icon big ${APP_META[app].cls}`}>{APP_META[app].icon}</span>
              <span className="desktop-icon-label">{appName(app)}</span>
            </button>
          ))}
        </div>
        <div className="desktop-widget">
          <span className="widget-clock">{clock}</span>
          <span className="widget-date">{now.getFullYear()}年{now.getMonth() + 1}月{now.getDate()}日（{'日月火水木金土'[now.getDay()]}）</span>
          <span className="widget-brand">WebX</span>
        </div>
        {windows.length === 0 && (
          <div className="desktop-welcome">
            <h1>WebX</h1>
            <p>{t('desktopHint')}</p>
          </div>
        )}
        {windows.map((win) => {
          if (win.minimized) return null
          const meta = APP_META[win.id]
          const full = win.maximized || !wide
          const style: React.CSSProperties = full
            ? { inset: 0, width: '100%', height: '100%', zIndex: win.z }
            : { left: win.x, top: win.y, width: win.w, height: win.h, zIndex: win.z }
          return (
            <section
              key={win.id}
              className={`os-window${activeId === win.id ? ' active' : ''}${full ? ' full' : ''}`}
              style={style}
              onPointerDown={() => focusWin(win.id)}
            >
              <div
                className="os-titlebar"
                onPointerDown={(e) => onTitlePointerDown(e, win)}
                onPointerMove={onTitlePointerMove}
                onPointerUp={onTitlePointerUp}
                onDoubleClick={() => wide && toggleMax(win.id)}
              >
                <span className={`app-icon tiny ${meta.cls}`}>{meta.icon}</span>
                <span className="os-title">{appName(win.id)}</span>
                <div className="os-win-buttons" onPointerDown={(e) => e.stopPropagation()}>
                  <button title="最小化" onClick={() => setWindows((prev) => prev.map((w) => (w.id === win.id ? { ...w, minimized: true } : w)))}>―</button>
                  {wide && <button title={win.maximized ? '元に戻す' : '最大化'} onClick={() => toggleMax(win.id)}>{win.maximized ? '🗗' : '🗖'}</button>}
                  <button title="閉じる" className="close" onClick={() => closeWin(win.id)}>✕</button>
                </div>
              </div>
              <div className="os-window-body">{renderContent(win.id)}</div>
            </section>
          )
        })}
      </div>

      {startOpen && (
        <div className="start-menu">
          <h2>WebX</h2>
          <div className="start-apps">
            {APP_ORDER.map((app) => (
              <button key={app} className="start-app" onClick={() => openApp(app)}>
                <span className={`app-icon ${APP_META[app].cls}`}>{APP_META[app].icon}</span>
                <span>{appName(app)}</span>
              </button>
            ))}
          </div>
          <p className="start-note">
            あなたの環境：{platformLabel(platform)}（{modLabel(platform)} キー対応）<br />
            {t('dataLocal')}
          </p>
          <button className="start-version" onClick={() => { openApp('about'); setStartOpen(false) }}>WebX v{APP_VERSION} — {t('aboutWebX')}</button>
          <button className="start-shortcuts" onClick={() => { setStartOpen(false); setShortcutsOpen(true) }}>
            {t('shortcuts')}（{modLabel(platform)} + /）
          </button>
        </div>
      )}

      {shortcutsOpen && (
        <div className="shortcuts-modal" role="dialog" aria-label="キーボードショートカット">
          <div className="shortcuts-head">
            <h3>{t('shortcuts')}</h3>
            <button onClick={() => setShortcutsOpen(false)}>✕</button>
          </div>
          <p className="shortcuts-platform">
            あなたの環境は <strong>{platformLabel(platform)}</strong> です。
            {platform === 'windows' && ' Mod キーは Ctrl です。Win キーや Alt+Tab は Windows 側の操作になるため、WebX 内では使いません。'}
            {platform === 'mac' && ' Mod キーは ⌘（Command）です。'}
            {platform === 'ipad' && ' Mod キーは ⌘（Command）です。外付けキーボードで使えます。タッチだけでも全機能使えます。'}
            {platform === 'android' && ' Mod キーは Ctrl / ⌘ のどちらでも使えます。'}
            {platform === 'other' && ' Mod キーは Ctrl / ⌘ のどちらでも使えます。'}
          </p>
          <table className="shortcuts-table">
            <tbody>
              <tr><td>{modLabel(platform)} + 1〜9</td><td>{t('scApps')}</td></tr>
              <tr><td>{modLabel(platform)} + Tab</td><td>{t('scNextWin')}</td></tr>
              <tr><td>{modLabel(platform)} + M</td><td>{t('scMin')}</td></tr>
              <tr><td>{modLabel(platform)} + Shift + M / {modLabel(platform)} + Enter</td><td>{t('scMax')}</td></tr>
              <tr><td>{modLabel(platform)} + Shift + W</td><td>{t('scClose')}</td></tr>
              <tr><td>{modLabel(platform)} + S</td><td>{t('scSave')}</td></tr>
              <tr><td>{modLabel(platform)} + /</td><td>{t('scList')}</td></tr>
              <tr><td>Esc</td><td>{t('scEsc')}</td></tr>
            </tbody>
          </table>
          <p className="shortcuts-note">アプリ内でも、ワードプロセッサでは {modLabel(platform)} + B（太字）など、メモ帳では自動保存、カレンダーでは ←/→（前月／次月）と T（今日）が使えます。</p>
        </div>
      )}

      {ctxMenu && (
        <div className="ctx-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }} onClick={(e) => e.stopPropagation()}>
          {APP_ORDER.map((app) => (
            <button key={app} onClick={() => { openApp(app); setCtxMenu(null) }}>
              <span className={`app-icon tiny ${APP_META[app].cls}`}>{APP_META[app].icon}</span>
              {appName(app)}
            </button>
          ))}
          <div className="ctx-sep" />
          <button onClick={() => { setCtxMenu(null); setShortcutsOpen(true) }}>{t('shortcuts')}</button>
        </div>
      )}

      {notesOpen && (
        <div className="notes-panel" onClick={(e) => e.stopPropagation()}>
          <div className="notes-head">
            <h3>{t('notifications')}</h3>
            {notes.length > 0 && <button onClick={() => setNotes([])}>{t('clearAll')}</button>}
          </div>
          {notes.length === 0 ? (
            <p className="notes-empty">{t('noNotifications')}</p>
          ) : (
            <ul>
              {notes.map((n) => (
                <li key={n.id}><span>{n.text}</span><small>{n.time}</small></li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!booted && (
        <div className="os-splash">
          <div className="splash-logo">WebX</div>
          <div className="splash-bar"><span /></div>
          <small className="splash-version">v{APP_VERSION}</small>
        </div>
      )}

      {toast && <div className="os-toast">{toast}</div>}

      <div className="os-taskbar">
        <button className={startOpen ? 'start-btn on' : 'start-btn'} onClick={() => setStartOpen((v) => !v)}>
          {t('start')}
        </button>
        <div className="task-buttons">
          {windows.map((win) => (
            <button
              key={win.id}
              className={`task-btn${activeId === win.id && !win.minimized ? ' active' : ''}`}
              onClick={() => (win.minimized || activeId !== win.id ? focusWin(win.id) : setWindows((prev) => prev.map((w) => (w.id === win.id ? { ...w, minimized: true } : w))))}
            >
              <span className={`app-icon tiny ${APP_META[win.id].cls}`}>{APP_META[win.id].icon}</span>
              {appName(win.id)}
            </button>
          ))}
        </div>
        <button className="task-bell" onClick={(e) => { e.stopPropagation(); setNotesOpen((v) => !v) }}>
          🔔{notes.length > 0 && <span className="bell-badge">{notes.length}</span>}
        </button>
        <div className="task-clock">
          <span>{clock}</span>
          <small>{dateLabel}</small>
        </div>
      </div>
    </div>
    </LangContext.Provider>
  )
}
