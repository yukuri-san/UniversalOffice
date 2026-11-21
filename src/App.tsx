import { useCallback, useEffect, useRef, useState } from 'react'
import WordProcessor from './components/WordProcessor'
import Spreadsheet from './components/Spreadsheet'
import Notepad from './components/Notepad'
import Calendar from './components/Calendar'
import BrowserPanel from './components/BrowserPanel'
import FilesWindow from './components/FilesWindow'
import Settings, { type ThemeId } from './components/Settings'
import { LangContext, LOCALES, translate, type Lang } from './lib/i18n'
import SetupWizard from './components/SetupWizard'
import YoutubeApp from './components/YoutubeApp'
import TrashWindow from './components/TrashWindow'
import DocsWindow, { type DocKind } from './components/DocsWindow'
import Calculator from './components/Calculator'
import ClockApp from './components/ClockApp'
import Paint from './components/Paint'
import Terminal from './components/Terminal'
import MemoDb from './components/MemoDb'
import AboutWindow from './components/AboutWindow'
import ManualWindow from './components/ManualWindow'
import AppStore from './components/AppStore'
import UpdateInfoWindow from './components/UpdateInfoWindow'
import UnitConverter from './components/UnitConverter'
import { STORE_APPS } from './lib/storeApps'
import { Dice, Janken, NumGuess, Omikuji } from './components/store/Games'
import { PassGen, TextCount, ColorPicker, Morse } from './components/store/ToolsA'
import { DayCalc, Bmi, SplitBill, Currency, Wareki } from './components/store/ToolsB'
import { Pomodoro, Metronome, WhiteNoise, Flashcards } from './components/store/Life'
import { TodoList } from './components/store/TodoList'
import { Kakeibo, HabitTracker, ShoppingList, ReactionTest, SimonGame, Counter, Roulette, CoinFlip, Countdown, AgeCalc } from './components/store/Apps2'
import SysInfo from './components/SysInfo'
import TaskManager from './components/TaskManager'
import ClipboardApp from './components/ClipboardApp'
import { getPin, hashPin } from './lib/pin'
import { resetSettingsOnly } from './lib/reset'
import Tetris from './components/games/Tetris'
import Suika from './components/games/Suika'
import { Game2048, Snake, Breakout } from './components/games/Classics'
import { Minesweeper, Sudoku } from './components/games/Puzzle'
import { Memory, Reversi, Gomoku } from './components/games/Board'
import { Match3, Pong, Flappy, WhackMole } from './components/games/Arcade'
import { Typing, Puzzle15, Hanoi, Blackjack, Slot, Runner } from './components/games/Mini'
import { listEvents, requestPersist, type CalEvent } from './lib/store'
import { APP_VERSION } from './lib/version'
import { compareVersions, fetchLatestVersion } from './lib/updateCheck'
import { fetchStoreCatalog, outdatedFromCatalog, type StoreCatalog } from './lib/storeCheck'
import { notifyOs } from './lib/notify'
import type { AppId } from './components/Backstage'
import { detectPlatform, isMod, modLabel, platformLabel } from './lib/platform'

type WindowApp = AppId | 'browser' | 'files' | 'settings' | 'youtube' | 'trash' | 'calculator' | 'clock' | 'paint' | 'terminal' | 'docs' | 'memodb' | 'about' | 'manual' | 'store' | 'unit' | 'pomodoro' | 'metronome' | 'whitenoise' | 'flashcards' | 'dice' | 'janken' | 'numguess' | 'omikuji' | 'passgen' | 'textcount' | 'colorpicker' | 'morse' | 'daycalc' | 'bmi' | 'splitbill' | 'currency' | 'wareki' | 'tetris' | 'suika' | 'g2048' | 'snake' | 'breakout' | 'minesweeper' | 'sudoku' | 'memory' | 'reversi' | 'gomoku' | 'match3' | 'pong' | 'flappy' | 'mole' | 'typing' | 'puzzle15' | 'hanoi' | 'blackjack' | 'slot' | 'runner' | 'todo' | 'updateinfo' | 'kakeibo' | 'habit' | 'shopping' | 'reaction' | 'simon' | 'counter' | 'roulette' | 'coinflip' | 'countdown' | 'agecalc' | 'sysinfo' | 'taskman' | 'clipboard'

interface Win {
  id: WindowApp
  ws: number
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
  updateinfo: { icon: '更', cls: 'updateinfo' },
  manual: { icon: '説', cls: 'manual' },
  store: { icon: '店', cls: 'store' },
  unit: { icon: '換', cls: 'unit' },
  pomodoro: { icon: 'ポ', cls: 'pomodoro' },
  metronome: { icon: '拍', cls: 'metronome' },
  whitenoise: { icon: '音', cls: 'whitenoise' },
  flashcards: { icon: '単', cls: 'flashcards' },
  dice: { icon: '🎲', cls: 'dice' },
  janken: { icon: '✊', cls: 'janken' },
  numguess: { icon: '？', cls: 'numguess' },
  omikuji: { icon: '籤', cls: 'omikuji' },
  passgen: { icon: '鍵', cls: 'passgen' },
  textcount: { icon: '字', cls: 'textcount' },
  colorpicker: { icon: '色', cls: 'colorpicker' },
  morse: { icon: 'モ', cls: 'morse' },
  daycalc: { icon: '日', cls: 'daycalc' },
  bmi: { icon: '体', cls: 'bmi' },
  splitbill: { icon: '勘', cls: 'splitbill' },
  currency: { icon: '¥', cls: 'currency' },
  wareki: { icon: '暦', cls: 'wareki' },
  tetris: { icon: '🧩', cls: 'tetris' },
  suika: { icon: '🍉', cls: 'suika' },
  g2048: { icon: '🔢', cls: 'g2048' },
  snake: { icon: '🐍', cls: 'snake' },
  breakout: { icon: '🧱', cls: 'breakout' },
  minesweeper: { icon: '💣', cls: 'minesweeper' },
  sudoku: { icon: '数', cls: 'sudoku' },
  memory: { icon: '🃏', cls: 'memory' },
  reversi: { icon: '⚫', cls: 'reversi' },
  gomoku: { icon: '五', cls: 'gomoku' },
  match3: { icon: '💎', cls: 'match3' },
  pong: { icon: '🏓', cls: 'pong' },
  flappy: { icon: '🐤', cls: 'flappy' },
  mole: { icon: '🐹', cls: 'mole' },
  typing: { icon: '⌨️', cls: 'typing' },
  puzzle15: { icon: '15', cls: 'puzzle15' },
  hanoi: { icon: '🗼', cls: 'hanoi' },
  blackjack: { icon: '♠', cls: 'blackjack' },
  slot: { icon: '🎰', cls: 'slot' },
  runner: { icon: '🦖', cls: 'runner' },
  todo: { icon: '✓', cls: 'todo' },
  kakeibo: { icon: '家', cls: 'kakeibo' },
  habit: { icon: '継', cls: 'habit' },
  shopping: { icon: '買', cls: 'shopping' },
  reaction: { icon: '⚡', cls: 'reaction' },
  simon: { icon: '🎵', cls: 'simon' },
  counter: { icon: '数', cls: 'counter' },
  roulette: { icon: '🎡', cls: 'roulette' },
  coinflip: { icon: '🪙', cls: 'coinflip' },
  countdown: { icon: '⏳', cls: 'countdown' },
  agecalc: { icon: '🎂', cls: 'agecalc' },
  sysinfo: { icon: '情', cls: 'sysinfo' },
  taskman: { icon: '管', cls: 'taskman' },
  clipboard: { icon: '📋', cls: 'clipboard' },
}
const APP_ORDER: WindowApp[] = ['word', 'sheet', 'note', 'memodb', 'calendar', 'browser', 'youtube', 'files', 'trash', 'clipboard', 'calculator', 'clock', 'paint', 'terminal', 'manual', 'store', 'sysinfo', 'taskman', 'settings']

export default function App() {
  const [windows, setWindows] = useState<Win[]>(() => {
    // 起動時のウィンドウ復元（設定でオフにできる）
    if (localStorage.getItem('webx-restore-win') === 'off') return []
    try {
      const v = JSON.parse(localStorage.getItem('webx-win-layout') ?? '[]')
      if (!Array.isArray(v)) return []
      return v
        .filter((w) => w && typeof w.id === 'string' && w.id in APP_META)
        .map((w) => ({
          id: w.id as WindowApp,
          ws: Number(w.ws) || 0,
          z: Number(w.z) || 10,
          minimized: !!w.minimized,
          maximized: !!w.maximized,
          x: Number(w.x) || 40,
          y: Number(w.y) || 40,
          w: Number(w.w) || 720,
          h: Number(w.h) || 480,
        }))
    } catch {
      return []
    }
  })
  const [activeId, setActiveId] = useState<WindowApp | null>(null)
  const [startOpen, setStartOpen] = useState(false)
  const [startQuery, setStartQuery] = useState('')
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [platform] = useState(detectPlatform)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)
  const [notes, setNotes] = useState<{ id: number; text: string; time: string; app?: string }[]>([])
  const [notesOpen, setNotesOpen] = useState(false)
  const [selectedIcon, setSelectedIcon] = useState<WindowApp | null>(null)
  const [userName, setUserNameState] = useState(() => localStorage.getItem('webx-user-name') ?? '')
  const [timezone, setTimezoneState] = useState(() => localStorage.getItem('webx-timezone') ?? '')
  const [iconSize, setIconSizeState] = useState(() => localStorage.getItem('webx-icon-size') ?? 'm')
  const [iconClick, setIconClickState] = useState(() => localStorage.getItem('webx-icon-click') ?? 'double')
  const [showSetup, setShowSetup] = useState(() => localStorage.getItem('webx-setup-done') !== '1')
  const [closingIds, setClosingIds] = useState<string[]>([])
  const [minIds, setMinIds] = useState<string[]>([])
  const [maxAnimIds, setMaxAnimIds] = useState<string[]>([])
  const setUserName = (v: string) => { setUserNameState(v); localStorage.setItem('webx-user-name', v) }
  const setTimezone = (v: string) => { setTimezoneState(v); localStorage.setItem('webx-timezone', v) }
  const setIconSize = (v: string) => { setIconSizeState(v); localStorage.setItem('webx-icon-size', v) }
  const setIconClick = (v: string) => { setIconClickState(v); localStorage.setItem('webx-icon-click', v) }
  const [clock24h, setClock24hState] = useState(() => localStorage.getItem('webx-clock-24h') !== '12')
  const [clockSec, setClockSecState] = useState(() => localStorage.getItem('webx-clock-sec') === 'on')
  const [reduceMotion, setReduceMotionState] = useState(() => localStorage.getItem('webx-reduce-motion') === 'on')
  const [restoreWin, setRestoreWinState] = useState(() => localStorage.getItem('webx-restore-win') !== 'off')
  const [widgetAgenda, setWidgetAgendaState] = useState(() => localStorage.getItem('webx-widget-agenda') !== 'off')
  const setClock24h = (v: boolean) => { setClock24hState(v); localStorage.setItem('webx-clock-24h', v ? '24' : '12') }
  const setClockSec = (v: boolean) => { setClockSecState(v); localStorage.setItem('webx-clock-sec', v ? 'on' : 'off') }
  const setReduceMotion = (v: boolean) => { setReduceMotionState(v); localStorage.setItem('webx-reduce-motion', v ? 'on' : 'off') }
  const setRestoreWin = (v: boolean) => { setRestoreWinState(v); localStorage.setItem('webx-restore-win', v ? 'on' : 'off') }
  const setWidgetAgenda = (v: boolean) => { setWidgetAgendaState(v); localStorage.setItem('webx-widget-agenda', v ? 'on' : 'off') }
  const [nightLight, setNightLightState] = useState(() => localStorage.getItem('webx-nightlight') === 'on')
  const [muteNotes, setMuteNotesState] = useState(() => localStorage.getItem('webx-mute-notes') === 'on')
  const [saverOn, setSaverOnState] = useState(() => localStorage.getItem('webx-screensaver') === 'on')
  const [brightness, setBrightnessState] = useState(() => Math.min(60, Math.max(0, Number(localStorage.getItem('webx-brightness')) || 0)))
  const setNightLight = (v: boolean) => { setNightLightState(v); localStorage.setItem('webx-nightlight', v ? 'on' : 'off') }
  const setMuteNotes = (v: boolean) => { setMuteNotesState(v); localStorage.setItem('webx-mute-notes', v ? 'on' : 'off') }
  const setSaverOn = (v: boolean) => { setSaverOnState(v); localStorage.setItem('webx-screensaver', v ? 'on' : 'off') }
  const setBrightness = (v: number) => { setBrightnessState(v); localStorage.setItem('webx-brightness', String(v)) }
  const [ws, setWs] = useState(0)
  const [locked, setLocked] = useState(false)
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState(false)
  const [pinForgot, setPinForgot] = useState(false)
  const [powerMode, setPowerMode] = useState<'sleep' | 'shutdown' | null>(null)
  const [powerMenuOpen, setPowerMenuOpen] = useState(false)
  const [ccOpen, setCcOpen] = useState(false)
  const [saverActive, setSaverActive] = useState(false)
  const windowsRef = useRef<Win[]>([])
  useEffect(() => { windowsRef.current = windows }, [windows])
  // コピーしたテキストをクリップボード履歴に残す
  useEffect(() => {
    const onCopy = () => {
      const text = document.getSelection()?.toString().trim()
      if (!text) return
      try {
        const list: string[] = JSON.parse(localStorage.getItem('webx-clipboard') ?? '[]')
        const next = [text, ...(Array.isArray(list) ? list.filter((x) => x !== text) : [])].slice(0, 30)
        localStorage.setItem('webx-clipboard', JSON.stringify(next))
      } catch { /* ignore */ }
    }
    document.addEventListener('copy', onCopy)
    document.addEventListener('cut', onCopy)
    return () => {
      document.removeEventListener('copy', onCopy)
      document.removeEventListener('cut', onCopy)
    }
  }, [])
  // スクリーンセーバー：3分間操作がなければ表示する
  useEffect(() => {
    if (!saverOn) return
    let timer = 0
    const arm = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setSaverActive(true), 180000)
    }
    const onAct = () => { setSaverActive(false); arm() }
    arm()
    window.addEventListener('pointerdown', onAct)
    window.addEventListener('keydown', onAct)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('pointerdown', onAct)
      window.removeEventListener('keydown', onAct)
    }
  }, [saverOn])
  const tryPin = (digit: string) => {
    const pin = getPin()
    if (!pin) { setLocked(false); return }
    const next = (pinInput + digit).slice(0, pin.len)
    if (next.length < pin.len) { setPinInput(next); setPinError(false); return }
    if (hashPin(next) === pin.hash) {
      setLocked(false); setPinInput(''); setPinError(false)
    } else {
      setPinError(true); setPinInput('')
    }
  }
  // ウィンドウ配置を保存する（次回起動時の復元用）
  useEffect(() => {
    try {
      if (windows.length === 0) localStorage.removeItem('webx-win-layout')
      else localStorage.setItem('webx-win-layout', JSON.stringify(windows))
    } catch { /* ignore */ }
  }, [windows])
  const [todayEvents, setTodayEvents] = useState<CalEvent[]>([])
  useEffect(() => {
    if (!widgetAgenda) return
    const loadAgenda = () => {
      void listEvents().then((evs) => {
        const d = new Date()
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        setTodayEvents(evs.filter((e) => e.date === key))
      }).catch(() => { /* ignore */ })
    }
    loadAgenda()
    const iv = window.setInterval(loadAgenda, 60000)
    return () => window.clearInterval(iv)
  }, [widgetAgenda])
  const [installedApps, setInstalledApps] = useState<string[]>(() => {
    try {
      const v = JSON.parse(localStorage.getItem('webx-installed-apps') ?? '[]')
      return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
    } catch {
      return []
    }
  })
  const [appVersions, setAppVersions] = useState<Record<string, string>>(() => {
    try {
      const v = JSON.parse(localStorage.getItem('webx-app-versions') ?? '{}')
      return v && typeof v === 'object' ? v : {}
    } catch {
      return {}
    }
  })
  const visibleApps: WindowApp[] = [...APP_ORDER, ...STORE_APPS.filter((a) => installedApps.includes(a.id)).map((a) => a.id as WindowApp)]
  // ストア情報は OS の更新とは別に store.json から取得する
  const [storeCatalog, setStoreCatalog] = useState<StoreCatalog | null>(null)
  const updatableCount = outdatedFromCatalog(storeCatalog, installedApps, appVersions).length
  const installApp = (id: string) => {
    const def = STORE_APPS.find((a) => a.id === id)
    if (!def) return
    setInstalledApps((prev) => {
      const next = prev.includes(id) ? prev : [...prev, id]
      localStorage.setItem('webx-installed-apps', JSON.stringify(next))
      return next
    })
    setAppVersions((prev) => {
      const next = { ...prev, [id]: def.version }
      localStorage.setItem('webx-app-versions', JSON.stringify(next))
      return next
    })
  }
  const uninstallApp = (id: string) => {
    setInstalledApps((prev) => {
      const next = prev.filter((x) => x !== id)
      localStorage.setItem('webx-installed-apps', JSON.stringify(next))
      return next
    })
    setWindows((prev) => prev.filter((w) => w.id !== id))
  }
  const [updateTarget, setUpdateTarget] = useState<{ kind: 'webx' } | { kind: 'app'; id: string } | { kind: 'apps' }>({ kind: 'webx' })
  const updateStoreApp = (id: string) => {
    const def = STORE_APPS.find((a) => a.id === id)
    if (!def) return
    setAppVersions((prev) => {
      const next = { ...prev, [id]: def.version }
      localStorage.setItem('webx-app-versions', JSON.stringify(next))
      return next
    })
  }
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
      const detail = (e as CustomEvent<{ text: string; app?: string } | string>).detail
      const text = typeof detail === 'string' ? detail : detail.text
      const app = typeof detail === 'string' ? undefined : detail.app
      setNotes((prev) => [{ id: Date.now() + Math.random(), text, app, time: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) }, ...prev].slice(0, 30))
      if (localStorage.getItem('webx-mute-notes') !== 'on') showToast(text)
    }
    window.addEventListener('webx-notify', onNotify)
    return () => window.removeEventListener('webx-notify', onNotify)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('ykr-lang') as Lang) || 'ja')
  const [theme, setTheme] = useState<ThemeId>(() => (localStorage.getItem('ykr-theme') as ThemeId) || 'light')
  const t = (key: string) => translate(lang, key)
  const appName = (app: WindowApp) => STORE_APPS.find((a) => a.id === app)?.name ?? t(app)

  useEffect(() => {
    localStorage.setItem('ykr-lang', lang)
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : lang
  }, [lang])
  useEffect(() => {
    localStorage.setItem('ykr-theme', theme)
  }, [theme])
  useEffect(() => {
    const ids: ThemeId[] = ['light', 'dark', 'ipados', 'macos', 'win11', 'win7', 'winxp', 'win95', 'cyber', 'sakura', 'ocean', 'sunset', 'forest', 'candy']
    const onThemeSet = (e: Event) => {
      const id = (e as CustomEvent<string>).detail as ThemeId
      if (ids.includes(id)) setTheme(id)
    }
    window.addEventListener('webx-theme-set', onThemeSet)
    return () => window.removeEventListener('webx-theme-set', onThemeSet)
  }, [])
  useEffect(() => {
    void requestPersist()
  }, [])
  // 更新チェック：起動時に加えて、設定した間隔（1〜180分）でも定期チェックし、新しい更新があれば通知する
  useEffect(() => {
    let cancelled = false
    const checkUpdates = async () => {
      // OS 本体（version.json）とストア（store.json）の更新確認は別々に行う
      const [latest, catalog] = await Promise.all([fetchLatestVersion(), fetchStoreCatalog(true)])
      if (cancelled) return
      if (catalog) setStoreCatalog(catalog)
      let signature = ''
      if (latest && compareVersions(latest, APP_VERSION) > 0) signature += `webx:${latest};`
      let outdatedNames: string[] = []
      try {
        const installedNow: string[] = JSON.parse(localStorage.getItem('webx-installed-apps') ?? '[]')
        const versionsNow: Record<string, string> = JSON.parse(localStorage.getItem('webx-app-versions') ?? '{}')
        const outdated = outdatedFromCatalog(catalog, installedNow, versionsNow)
        outdatedNames = outdated.map((a) => `${a.name} v${a.version}`)
        if (outdated.length > 0) signature += outdated.map((a) => `${a.id}:${a.version}`).join(',')
      } catch { /* 保存データが壊れている場合は通知しない */ }
      if (!signature) return
      let last = ''
      try { last = localStorage.getItem('webx-update-notified') ?? '' } catch { /* ignore */ }
      if (signature === last) return
      try { localStorage.setItem('webx-update-notified', signature) } catch { /* ignore */ }
      if (latest && compareVersions(latest, APP_VERSION) > 0) {
        notifyOs(`WebX の新しいバージョン v${latest} があります（ストアで更新できます）`, 'store')
      }
      if (outdatedNames.length > 0) {
        notifyOs(`アプリの更新があります：${outdatedNames.join('、')}（ストアで更新できます）`, 'store')
      }
    }
    const first = window.setTimeout(() => { void checkUpdates() }, 2500)
    let timer = 0
    const arm = () => {
      window.clearInterval(timer)
      let mins = 30
      try { mins = Math.min(180, Math.max(1, Number(localStorage.getItem('webx-update-interval')) || 30)) } catch { /* ignore */ }
      timer = window.setInterval(() => { void checkUpdates() }, mins * 60 * 1000)
    }
    arm()
    const onIntervalChanged = () => arm()
    window.addEventListener('webx-update-interval', onIntervalChanged)
    return () => {
      cancelled = true
      window.clearTimeout(first)
      window.clearInterval(timer)
      window.removeEventListener('webx-update-interval', onIntervalChanged)
    }
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
  // 復元したウィンドウの z を引き継ぐ（初回のみ）
  useEffect(() => {
    zRef.current = Math.max(zRef.current, ...windows.map((w) => w.z))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const dragRef = useRef<{ id: WindowApp; dx: number; dy: number } | null>(null)
  const resizeRef = useRef<{ id: WindowApp; startX: number; startY: number; startW: number; startH: number; edge: 'corner' | 'right' | 'bottom' } | null>(null)

  const onResizePointerDown = (e: React.PointerEvent, win: Win, edge: 'corner' | 'right' | 'bottom') => {
    e.stopPropagation()
    focusWin(win.id)
    resizeRef.current = { id: win.id, startX: e.clientX, startY: e.clientY, startW: win.w, startH: win.h, edge }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onResizePointerMove = (e: React.PointerEvent) => {
    const r = resizeRef.current
    if (!r) return
    setWindows((prev) =>
      prev.map((w) => {
        if (w.id !== r.id) return w
        const nextW = r.edge === 'bottom' ? w.w : Math.min(Math.max(r.startW + (e.clientX - r.startX), 340), Math.max(340, desktop.w - w.x - 4))
        const nextH = r.edge === 'right' ? w.h : Math.min(Math.max(r.startH + (e.clientY - r.startY), 240), Math.max(240, desktop.h - w.y - 4))
        return { ...w, w: nextW, h: nextH }
      })
    )
  }
  const onResizePointerUp = () => {
    resizeRef.current = null
  }

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
    if (STORE_APPS.some((a) => a.id === app) && !installedApps.includes(app)) app = 'store'
    setStartOpen(false)
    // そのアプリを開いたら、宛先がそのアプリの通知は消える
    setNotes((prev) => prev.filter((n) => n.app !== app))
    // 別の仮想デスクトップで開いているアプリなら、そのデスクトップへ移動する
    const existing = windowsRef.current.find((w) => w.id === app)
    if (existing) setWs(existing.ws)
    setWindows((prev) => {
      if (prev.some((w) => w.id === app)) {
        zRef.current += 1
        return prev.map((w) => (w.id === app ? { ...w, z: zRef.current, minimized: false } : w))
      }
      const offset = (prev.length % 5) * 34
      const isGame = STORE_APPS.some((a) => a.id === app && a.category === 'game')
      let w = Math.min(920, Math.max(560, desktop.w * 0.72))
      let h = Math.min(640, Math.max(420, desktop.h * 0.78))
      if (isGame) {
        // ゲームは縦に長いので、初期ウィンドウを大きめにする（はみ出し防止）
        w = Math.min(560, Math.max(400, desktop.w * 0.6))
        h = Math.min(760, Math.max(640, desktop.h * 0.92))
      }
      w = Math.min(w, Math.max(320, desktop.w - 12))
      h = Math.min(h, Math.max(320, desktop.h - 12))
      zRef.current += 1
      return [
        ...prev,
        {
          id: app,
          ws,
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
  }, [desktop, wide, installedApps, ws])

  const closeWin = (id: WindowApp) => {
    if (closingIds.includes(id)) return
    setClosingIds((prev) => [...prev, id])
    window.setTimeout(() => {
      setWindows((prev) => prev.filter((w) => w.id !== id))
      setClosingIds((prev) => prev.filter((c) => c !== id))
      if (activeId === id) setActiveId(null)
    }, 190)
  }

  const minimizeWin = (id: WindowApp) => {
    if (minIds.includes(id)) return
    setMinIds((prev) => [...prev, id])
    window.setTimeout(() => {
      setWindows((prev) => prev.map((w) => (w.id === id ? { ...w, minimized: true } : w)))
      setMinIds((prev) => prev.filter((c) => c !== id))
    }, 190)
  }

  const toggleMax = (id: WindowApp) => {
    setMaxAnimIds((prev) => [...prev, id])
    window.setTimeout(() => setMaxAnimIds((prev) => prev.filter((c) => c !== id)), 240)
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
        openApp(visibleApps[Number(key) - 1])
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
          else minimizeWin(activeId)
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
          onOpenStore={() => openApp('store')}
          uiScale={uiScaleSetting}
          onUiScale={(value: string) => {
            setUiScaleSetting(value)
            localStorage.setItem('webx-ui-scale', value)
          }}
          userName={userName} setUserName={setUserName}
          timezone={timezone} setTimezone={setTimezone}
          iconSize={iconSize} setIconSize={setIconSize}
          iconClick={iconClick} setIconClick={setIconClick}
          onShowSetup={() => setShowSetup(true)}
          clock24h={clock24h} setClock24h={setClock24h}
          clockSec={clockSec} setClockSec={setClockSec}
          reduceMotion={reduceMotion} setReduceMotion={setReduceMotion}
          restoreWin={restoreWin} setRestoreWin={setRestoreWin}
          widgetAgenda={widgetAgenda} setWidgetAgenda={setWidgetAgenda}
          nightLight={nightLight} setNightLight={setNightLight}
          muteNotes={muteNotes} setMuteNotes={setMuteNotes}
          saverOn={saverOn} setSaverOn={setSaverOn}
        />
      )
      case 'youtube': return <YoutubeApp />
      case 'trash': return <TrashWindow />
      case 'clipboard': return <ClipboardApp />
      case 'calculator': return <Calculator />
      case 'clock': return <ClockApp />
      case 'paint': return <Paint />
      case 'terminal': return <Terminal openApp={openApp} onClose={() => closeWin('terminal')} />
      case 'docs': return <DocsWindow />
      case 'memodb': return <MemoDb />
      case 'about': return <AboutWindow openDocs={(doc) => { localStorage.setItem('webx-docs-initial', doc); openApp('docs') }} />
      case 'manual': return <ManualWindow />
      case 'store': return (
        <AppStore
          installed={installedApps}
          versions={appVersions}
          coreApps={APP_ORDER.filter((a) => a !== 'store').map((a) => ({ id: a, name: appName(a), icon: APP_META[a].icon, cls: APP_META[a].cls }))}
          onInstall={installApp}
          onUninstall={uninstallApp}
          onUpdateApp={updateStoreApp}
          onShowUpdate={(target) => { setUpdateTarget(target); openApp('updateinfo') }}
          catalog={storeCatalog}
          onRefreshCatalog={async () => {
            const c = await fetchStoreCatalog(true)
            if (c) setStoreCatalog(c)
            return c
          }}
        />
      )
      case 'updateinfo': return (
        <UpdateInfoWindow target={updateTarget} installed={installedApps} versions={appVersions} onUpdateApp={updateStoreApp} catalog={storeCatalog} />
      )
      case 'unit': return <UnitConverter />
      case 'pomodoro': return <Pomodoro />
      case 'metronome': return <Metronome />
      case 'whitenoise': return <WhiteNoise />
      case 'flashcards': return <Flashcards />
      case 'dice': return <Dice />
      case 'janken': return <Janken />
      case 'numguess': return <NumGuess />
      case 'omikuji': return <Omikuji />
      case 'passgen': return <PassGen />
      case 'textcount': return <TextCount />
      case 'colorpicker': return <ColorPicker />
      case 'morse': return <Morse />
      case 'daycalc': return <DayCalc />
      case 'bmi': return <Bmi />
      case 'splitbill': return <SplitBill />
      case 'currency': return <Currency />
      case 'wareki': return <Wareki />
      case 'tetris': return <Tetris />
      case 'suika': return <Suika />
      case 'g2048': return <Game2048 />
      case 'snake': return <Snake />
      case 'breakout': return <Breakout />
      case 'minesweeper': return <Minesweeper />
      case 'sudoku': return <Sudoku />
      case 'memory': return <Memory />
      case 'reversi': return <Reversi />
      case 'gomoku': return <Gomoku />
      case 'match3': return <Match3 />
      case 'pong': return <Pong />
      case 'flappy': return <Flappy />
      case 'mole': return <WhackMole />
      case 'typing': return <Typing />
      case 'puzzle15': return <Puzzle15 />
      case 'hanoi': return <Hanoi />
      case 'blackjack': return <Blackjack />
      case 'slot': return <Slot />
      case 'runner': return <Runner />
      case 'todo': return <TodoList />
      case 'kakeibo': return <Kakeibo />
      case 'habit': return <HabitTracker />
      case 'shopping': return <ShoppingList />
      case 'reaction': return <ReactionTest />
      case 'simon': return <SimonGame />
      case 'counter': return <Counter />
      case 'roulette': return <Roulette />
      case 'coinflip': return <CoinFlip />
      case 'countdown': return <Countdown />
      case 'agecalc': return <AgeCalc />
      case 'sysinfo': return <SysInfo />
      case 'taskman': return (
        <TaskManager
          windows={windows}
          activeId={activeId}
          nameOf={(id) => appName(id as WindowApp)}
          iconOf={(id) => APP_META[id as WindowApp]}
          onFocus={(id) => focusWin(id as WindowApp)}
          onMinimize={(id) => minimizeWin(id as WindowApp)}
          onClose={(id) => closeWin(id as WindowApp)}
          onCloseAll={() => { windows.forEach((w) => closeWin(w.id)) }}
        />
      )
    }
  }

  const tzOpt = timezone ? { timeZone: timezone } : {}
  const clock = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', ...(clockSec ? { second: '2-digit' } : {}), hour12: !clock24h, ...tzOpt }).format(now)
  const widgetDate = new Intl.DateTimeFormat(LOCALES[lang], { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short', ...tzOpt }).format(now)
  const dateLabel = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}`

  return (
    <LangContext.Provider value={lang}>
    <div className="os-root" data-theme={theme} data-iconsize={iconSize} data-motion={reduceMotion ? 'reduced' : undefined} data-wallpaper={wpUseCustom ? 'custom' : wpPreset} style={{ '--ui-scale': uiScale } as React.CSSProperties}>
      <div
        className="os-desktop"
        ref={desktopRef}
        onClick={() => { setStartOpen(false); setCtxMenu(null); setNotesOpen(false); setCcOpen(false) }}
        onContextMenu={(e) => {
          e.preventDefault()
          setCtxMenu({ x: e.clientX, y: e.clientY })
        }}
        style={wpUseCustom && wpCustom ? { backgroundImage: `url(${wpCustom})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
      >
        <div className="desktop-icons">
          {visibleApps.map((app) => (
            <button
              key={app}
              className={selectedIcon === app ? 'desktop-icon selected' : 'desktop-icon'}
              onClick={(e) => { e.stopPropagation(); setSelectedIcon(app); if (iconClick === 'single') openApp(app) }}
              onDoubleClick={(e) => { e.stopPropagation(); openApp(app) }}
            >
              <span className={`app-icon big ${APP_META[app].cls}`}>{APP_META[app].icon}</span>
              <span className="desktop-icon-label">{appName(app)}</span>
              {app === 'store' && updatableCount > 0 && <span className="icon-badge">{updatableCount}</span>}
            </button>
          ))}
        </div>
        <div className="desktop-widget">
          <span className="widget-clock">{clock}</span>
          <span className="widget-date">{widgetDate}</span>
          <span className="widget-brand">WebX</span>
        </div>
        {widgetAgenda && (
          <div className="desktop-agenda">
            <span className="agenda-title">{t('todayEvents')}</span>
            {todayEvents.length === 0
              ? <span className="agenda-empty">{t('noEventsToday')}</span>
              : todayEvents.slice(0, 4).map((e) => <span key={e.id} className="agenda-item">・{e.title}</span>)}
          </div>
        )}
        {windows.length === 0 && (
          <div className="desktop-welcome">
            <h1>WebX</h1>
            <p>{t('desktopHint')}</p>
          </div>
        )}
        {windows.map((win) => {
          if (win.minimized || win.ws !== ws) return null
          const meta = APP_META[win.id]
          const full = win.maximized || !wide
          const style: React.CSSProperties = full
            ? { inset: 0, width: '100%', height: '100%', zIndex: win.z }
            : { left: win.x, top: win.y, width: win.w, height: win.h, zIndex: win.z }
          return (
            <section
              key={win.id}
              className={`os-window${activeId === win.id ? ' active' : ''}${full ? ' full' : ''}${closingIds.includes(win.id) ? ' closing' : ''}${minIds.includes(win.id) ? ' minimizing' : ''}${maxAnimIds.includes(win.id) ? ' max-anim' : ''}`}
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
                  <button title="最小化" onClick={() => minimizeWin(win.id)}>―</button>
                  {wide && <button title={win.maximized ? '元に戻す' : '最大化'} onClick={() => toggleMax(win.id)}>{win.maximized ? '🗗' : '🗖'}</button>}
                  <button title="閉じる" className="close" onClick={() => closeWin(win.id)}>✕</button>
                </div>
              </div>
              <div className="os-window-body">{renderContent(win.id)}</div>
              {!full && wide && (
                <>
                  <div
                    className="os-resize-edge right"
                    onPointerDown={(e) => onResizePointerDown(e, win, 'right')}
                    onPointerMove={onResizePointerMove}
                    onPointerUp={onResizePointerUp}
                  />
                  <div
                    className="os-resize-edge bottom"
                    onPointerDown={(e) => onResizePointerDown(e, win, 'bottom')}
                    onPointerMove={onResizePointerMove}
                    onPointerUp={onResizePointerUp}
                  />
                  <div
                    className="os-resize-handle"
                    onPointerDown={(e) => onResizePointerDown(e, win, 'corner')}
                    onPointerMove={onResizePointerMove}
                    onPointerUp={onResizePointerUp}
                  />
                </>
              )}
            </section>
          )
        })}
      </div>

      {startOpen && (
        <div className="start-menu">
          <h2>WebX</h2>
          <input
            className="start-search"
            type="search"
            placeholder={t('startSearchPh')}
            value={startQuery}
            onChange={(e) => setStartQuery(e.target.value)}
          />
          <div className="start-apps">
            {visibleApps.filter((app) => !startQuery || appName(app).toLowerCase().includes(startQuery.toLowerCase())).map((app) => (
              <button key={app} className="start-app" onClick={() => openApp(app)}>
                <span className={`app-icon ${APP_META[app].cls}`}>{APP_META[app].icon}</span>
                <span>{appName(app)}</span>
                {app === 'store' && updatableCount > 0 && <span className="icon-badge">{updatableCount}</span>}
              </button>
            ))}
          </div>
          <p className="start-note">
            あなたの環境：{platformLabel(platform)}（{modLabel(platform)} キー対応）<br />
            {t('dataLocal')}
          </p>
          {userName && <div className="start-user">👤 {userName}</div>}
          <button className="start-version" onClick={() => { openApp('about'); setStartOpen(false) }}>WebX v{APP_VERSION} — {t('aboutWebX')}</button>
          <button className="start-shortcuts" onClick={() => { setStartOpen(false); setShortcutsOpen(true) }}>
            {t('shortcuts')}（{modLabel(platform)} + /）
          </button>
          <div className="start-power-row">
            <button className="start-power" onClick={() => setPowerMenuOpen((v) => !v)}>⏻ 電源</button>
            {powerMenuOpen && (
              <div className="power-menu">
                <button onClick={() => { setPowerMode('sleep'); setStartOpen(false); setPowerMenuOpen(false) }}>{t('powerSleep')}</button>
                <button onClick={() => { setLocked(true); setStartOpen(false); setPowerMenuOpen(false) }}>{t('lockNow')}</button>
                <button onClick={() => location.reload()}>{t('powerRestart')}</button>
                <button onClick={() => { setPowerMode('shutdown'); setStartOpen(false); setPowerMenuOpen(false) }}>{t('powerShutdown')}</button>
              </div>
            )}
          </div>
        </div>
      )}

      {ccOpen && (
        <div className="cc-panel" onClick={(e) => e.stopPropagation()}>
          <h3>{t('ccTitle')}</h3>
          <div className="cc-grid">
            <button className={theme === 'dark' ? 'cc-tile on' : 'cc-tile'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>🌙 ダーク切替</button>
            <button className={nightLight ? 'cc-tile on' : 'cc-tile'} onClick={() => setNightLight(!nightLight)}>🌆 夜間モード</button>
            <button className={reduceMotion ? 'cc-tile on' : 'cc-tile'} onClick={() => setReduceMotion(!reduceMotion)}>🎞 アニメーション削減</button>
            <button className={muteNotes ? 'cc-tile on' : 'cc-tile'} onClick={() => setMuteNotes(!muteNotes)}>🔕 通知ミュート</button>
          </div>
          <label className="cc-slider">
            {t('brightnessLabel')}
            <input type="range" min={0} max={60} value={brightness} onChange={(e) => setBrightness(Number(e.target.value))} />
          </label>
          <div className="cc-actions">
            <button className="btn" onClick={() => { setLocked(true); setCcOpen(false) }}>{t('lockNow')}</button>
            <button className="btn" onClick={() => { openApp('settings'); setCcOpen(false) }}>{t('settingsTitle')}</button>
            <button className="btn" onClick={() => { openApp('taskman'); setCcOpen(false) }}>{t('taskman')}</button>
          </div>
        </div>
      )}

      {showSetup && booted && (
        <SetupWizard
          setLang={setLang} theme={theme} setTheme={setTheme}
          wpPreset={wpPreset}
          onSelectPreset={(id) => { setWpPreset(id); setWpUseCustom(false) }}
          userName={userName} setUserName={setUserName}
          timezone={timezone} setTimezone={setTimezone}
          iconSize={iconSize} setIconSize={setIconSize}
          iconClick={iconClick} setIconClick={setIconClick}
          onFinish={() => { localStorage.setItem('webx-setup-done', '1'); setShowSetup(false); notifyOs(t('setupDoneMsg'), 'settings') }}
        />
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
          {visibleApps.map((app) => (
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
                <li
                  key={n.id}
                  className={n.app ? 'note-item clickable' : 'note-item'}
                  onClick={() => {
                    if (!n.app) return
                    setNotes((prev) => prev.filter((x) => x.id !== n.id))
                    setNotesOpen(false)
                    openApp(n.app as WindowApp)
                  }}
                >
                  <span>{n.text}{n.app ? ' ›' : ''}</span><small>{n.time}</small>
                </li>
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

      {nightLight && <div className="nightlight-overlay" />}
      {brightness > 0 && <div className="brightness-overlay" style={{ opacity: brightness / 100 }} />}
      {saverActive && !locked && powerMode === null && (
        <div className="saver-screen">
          <div className="saver-clock">{clock}</div>
          <div className="saver-date">{widgetDate}</div>
          <div className="saver-brand">WebX</div>
        </div>
      )}
      {locked && (
        <div className="lock-screen">
          <div className="lock-clock">{clock}</div>
          <div className="lock-date">{widgetDate}</div>
          {getPin() ? (
            pinForgot ? (
              <div className="lock-recover">
                <h3>PINを忘れた場合</h3>
                <p>
                  PIN自体を復元する方法はありません。その代わり、<strong>設定だけをリセット</strong>してロックを解除できます。
                  テーマや言語などの設定とPINは初期状態に戻りますが、ドキュメント・予定・メモなどのデータは消えません。
                </p>
                <div className="lock-recover-btns">
                  <button
                    className="btn accent"
                    onClick={() => { if (window.confirm('設定をリセットしてロックを解除します。よろしいですか？')) { resetSettingsOnly(); location.reload() } }}
                  >
                    設定をリセットして解除する
                  </button>
                  <button className="btn" onClick={() => setPinForgot(false)}>戻る</button>
                </div>
              </div>
            ) : (
              <>
                <div className="lock-dots">{'●'.repeat(pinInput.length)}{'○'.repeat(Math.max(0, getPin()!.len - pinInput.length))}</div>
                {pinError && <p className="lock-error">PINが違います</p>}
                <div className="lock-pad">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((n) => (
                    <button key={n} onClick={() => tryPin(String(n))}>{n}</button>
                  ))}
                  <button className="lock-pad-sub" onClick={() => { setPinInput(''); setPinError(false) }}>消す</button>
                </div>
                <button className="lock-forgot" onClick={() => setPinForgot(true)}>PINを忘れた場合</button>
              </>
            )
          ) : (
            <button className="btn accent lock-unlock" onClick={() => setLocked(false)}>タップでロック解除</button>
          )}
        </div>
      )}
      {powerMode === 'sleep' && (
        <div className="power-screen" onClick={() => setPowerMode(null)}>
          <p>スリープ中… クリックで復帰</p>
        </div>
      )}
      {powerMode === 'shutdown' && (
        <div className="power-screen">
          <div className="splash-logo">WebX</div>
          <button className="btn accent" onClick={() => location.reload()}>電源を入れる</button>
        </div>
      )}

      <div className="os-taskbar">
        <button className={startOpen ? 'start-btn on' : 'start-btn'} onClick={() => { setStartOpen((v) => !v); setPowerMenuOpen(false) }}>
          {t('start')}
        </button>
        <div className="task-buttons">
          {windows.filter((win) => win.ws === ws).map((win) => (
            <button
              key={win.id}
              className={`task-btn${activeId === win.id && !win.minimized ? ' active' : ''}`}
              onClick={() => (win.minimized || activeId !== win.id ? focusWin(win.id) : minimizeWin(win.id))}
            >
              <span className={`app-icon tiny ${APP_META[win.id].cls}`}>{APP_META[win.id].icon}</span>
              {appName(win.id)}
            </button>
          ))}
        </div>
        <div className="ws-switcher">
          {[0, 1, 2].map((i) => (
            <button key={i} className={ws === i ? 'ws-btn on' : 'ws-btn'} title={`デスクトップ ${i + 1}`} onClick={() => setWs(i)}>{i + 1}</button>
          ))}
        </div>
        <button className="task-bell" onClick={(e) => { e.stopPropagation(); setCcOpen((v) => !v); setNotesOpen(false) }}>
          🎛
        </button>
        <button className="task-bell" onClick={(e) => { e.stopPropagation(); setNotesOpen((v) => !v); setCcOpen(false) }}>
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
