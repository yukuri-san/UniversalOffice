import { useEffect, useState, type CSSProperties } from 'react'
import { ERROR_DIALOG_EVENT, errorDialogStyle, type ErrorDialogRequest } from '../lib/errorDialog'

/* エラーウインドウのホスト（シェル常駐）
 *  lib/errorDialog.ts の showErrorDialog() が飛ばす 'webx-error-dialog' を受け取り、
 *  現在の UI モード／テーマに応じた OS 風デザインで1つずつ（キュー）表示する。
 *  見た目が4種とも大きく異なるため、このコンポーネント内で完結するインラインスタイルで描く。 */

interface Props {
  /** App の resolvedUi（'dxui' | 'mxui-classic' | 'mxui-liquid'） */
  ui: string
  /** 現在のテーマ ID（ThemeId） */
  theme: string
}

const backdrop: CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 400,
  background: 'rgba(0,0,0,.45)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 20, boxSizing: 'border-box',
}

export default function ErrorDialogHost({ ui, theme }: Props) {
  const [queue, setQueue] = useState<ErrorDialogRequest[]>([])

  useEffect(() => {
    const onShow = (e: Event) => {
      const d = (e as CustomEvent<ErrorDialogRequest>).detail
      if (!d || typeof d.title !== 'string' || typeof d.message !== 'string') return
      setQueue((prev) => [...prev, d])
    }
    window.addEventListener(ERROR_DIALOG_EVENT, onShow)
    return () => window.removeEventListener(ERROR_DIALOG_EVENT, onShow)
  }, [])

  const current = queue[0]
  if (!current) return null
  const close = () => setQueue((prev) => prev.slice(1))
  const style = errorDialogStyle(ui, theme)
  const { title, message, detail } = current

  /* ---- MXUI-Classic：Android（Material）のエラーダイアログ風 ---- */
  if (style === 'android') {
    return (
      <div style={backdrop} role="alertdialog" aria-label={title}>
        <div style={{
          width: 'min(340px, 100%)', background: '#fdfbff', color: '#1c1b1f',
          borderRadius: 28, padding: '24px 24px 16px',
          boxShadow: '0 12px 40px rgba(0,0,0,.35)',
          fontFamily: 'Roboto, "Noto Sans JP", sans-serif',
        }}>
          <div style={{ fontSize: 22, marginBottom: 10 }}>⚠️</div>
          <div style={{ fontSize: 20, fontWeight: 500, lineHeight: 1.35, marginBottom: 12 }}>{title}</div>
          <div style={{ fontSize: 14, lineHeight: 1.6, color: '#49454f', whiteSpace: 'pre-wrap' }}>{message}</div>
          {detail && <div style={{ fontSize: 12, lineHeight: 1.5, color: '#79747e', marginTop: 8, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{detail}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
            <button onClick={close} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#6750a4', fontSize: 14, fontWeight: 600, letterSpacing: '.04em',
              padding: '10px 16px', borderRadius: 999,
            }}>OK</button>
          </div>
        </div>
      </div>
    )
  }

  /* ---- MXUI-Liquid：iOS のアラート風 ---- */
  if (style === 'ios') {
    return (
      <div style={{ ...backdrop, background: 'rgba(0,0,0,.35)' }} role="alertdialog" aria-label={title}>
        <div style={{
          width: 270, background: 'rgba(248,248,250,.94)', color: '#000',
          borderRadius: 14, overflow: 'hidden', textAlign: 'center',
          backdropFilter: 'blur(20px) saturate(180%)', WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          boxShadow: '0 12px 40px rgba(0,0,0,.3)',
          fontFamily: '-apple-system, "SF Pro Text", "Hiragino Sans", sans-serif',
        }}>
          <div style={{ padding: '18px 16px 14px' }}>
            <div style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.3, marginBottom: 6 }}>{title}</div>
            <div style={{ fontSize: 13, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{message}</div>
            {detail && <div style={{ fontSize: 11, lineHeight: 1.4, color: '#666', marginTop: 6, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{detail}</div>}
          </div>
          <button onClick={close} style={{
            display: 'block', width: '100%', background: 'none', cursor: 'pointer',
            border: 'none', borderTop: '0.5px solid rgba(60,60,67,.35)',
            color: '#007aff', fontSize: 17, padding: '11px 0 12px',
            fontFamily: 'inherit',
          }}>OK</button>
        </div>
      </div>
    )
  }

  /* ---- DXUI（Macテーマ）：macOS のアラート風 ---- */
  if (style === 'macos') {
    return (
      <div style={backdrop} role="alertdialog" aria-label={title}>
        <div style={{
          width: 'min(400px, 100%)', background: '#f5f5f7', color: '#1d1d1f',
          borderRadius: 10, padding: '18px 20px 14px',
          boxShadow: '0 20px 60px rgba(0,0,0,.4), 0 0 0 0.5px rgba(0,0,0,.2)',
          display: 'flex', gap: 14,
          fontFamily: '-apple-system, "SF Pro Text", "Hiragino Sans", sans-serif',
        }}>
          <div style={{
            flex: '0 0 auto', width: 52, height: 52, borderRadius: 12,
            background: 'linear-gradient(180deg,#ffd60a,#ffb340)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 30, boxShadow: 'inset 0 0 0 0.5px rgba(0,0,0,.15)',
          }}>⚠️</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.4, marginBottom: 4 }}>{title}</div>
            <div style={{ fontSize: 11.5, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{message}</div>
            {detail && <div style={{ fontSize: 10.5, lineHeight: 1.45, color: '#6e6e73', marginTop: 5, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{detail}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <button onClick={close} style={{
                background: 'linear-gradient(180deg,#4a9eff,#0a84ff)', color: '#fff',
                border: 'none', borderRadius: 6, cursor: 'pointer',
                fontSize: 13, padding: '4px 22px',
                boxShadow: '0 0.5px 2px rgba(0,0,0,.25)', fontFamily: 'inherit',
              }}>OK</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  /* ---- DXUI（標準）：Windows のエラーダイアログ風 ---- */
  return (
    <div style={backdrop} role="alertdialog" aria-label={title}>
      <div style={{
        width: 'min(420px, 100%)', background: '#fff', color: '#1b1b1b',
        borderRadius: 8, overflow: 'hidden',
        border: '1px solid rgba(0,0,0,.25)',
        boxShadow: '0 16px 48px rgba(0,0,0,.4)',
        fontFamily: '"Segoe UI", "Yu Gothic UI", "Noto Sans JP", sans-serif',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 6px 4px 14px' }}>
          <span style={{ fontSize: 12.5 }}>{title}</span>
          <button onClick={close} aria-label="閉じる" style={{
            background: 'none', border: 'none', cursor: 'pointer',
            width: 38, height: 28, fontSize: 13, color: '#1b1b1b', lineHeight: 1,
          }}>✕</button>
        </div>
        <div style={{ display: 'flex', gap: 14, padding: '10px 18px 16px' }}>
          <div style={{
            flex: '0 0 auto', width: 34, height: 34, borderRadius: '50%',
            background: '#e81123', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 19, fontWeight: 600, marginTop: 2,
          }}>✕</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{message}</div>
            {detail && <div style={{ fontSize: 11.5, lineHeight: 1.5, color: '#605e5c', marginTop: 6, fontFamily: 'Consolas, monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{detail}</div>}
          </div>
        </div>
        <div style={{ background: '#f0f0f0', padding: '10px 12px', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={close} style={{
            background: '#fdfdfd', color: '#1b1b1b', cursor: 'pointer',
            border: '1px solid #8a8886', borderBottom: '2px solid #0078d4',
            fontSize: 13, padding: '5px 30px', fontFamily: 'inherit',
          }}>OK</button>
        </div>
      </div>
    </div>
  )
}
