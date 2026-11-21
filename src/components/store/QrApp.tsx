import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import JsBarcode from 'jsbarcode'
import jsQR from 'jsqr'

/* ---------- QR・バーコード（特殊形式対応） ---------- */
type Format = 'qr' | 'CODE128' | 'EAN13' | 'EAN8' | 'UPC' | 'CODE39' | 'ITF14' | 'MSI' | 'pharmacode'
const FORMATS: { id: Format; label: string; hint: string }[] = [
  { id: 'qr', label: 'QRコード', hint: 'テキスト・URL・Wi-Fi・連絡先など' },
  { id: 'CODE128', label: 'CODE128', hint: '英数字・記号全般（物流・在庫）' },
  { id: 'EAN13', label: 'EAN-13（JAN）', hint: '数字13桁（末尾はチェックディジット）' },
  { id: 'EAN8', label: 'EAN-8', hint: '数字8桁' },
  { id: 'UPC', label: 'UPC-A', hint: '数字12桁（北米の商品コード）' },
  { id: 'CODE39', label: 'CODE39', hint: '英大文字・数字・一部記号' },
  { id: 'ITF14', label: 'ITF-14', hint: '数字14桁（段ボール・物流）' },
  { id: 'MSI', label: 'MSI', hint: '数字のみ（在庫管理）' },
  { id: 'pharmacode', label: 'Pharmacode', hint: '3〜131070の整数（医薬品）' },
]
type QrKind = 'text' | 'wifi' | 'vcard' | 'mail' | 'tel' | 'sms'
const esc = (s: string) => s.replace(/([\\;,:"'])/g, '\\$1')

interface Detector { detect: (src: CanvasImageSource) => Promise<{ rawValue: string; format: string }[]> }
function getDetector(): Detector | null {
  const w = window as unknown as { BarcodeDetector?: new (opts: { formats: string[] }) => Detector }
  if (!w.BarcodeDetector) return null
  try {
    return new w.BarcodeDetector({ formats: ['qr_code', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'itf', 'codabar', 'data_matrix', 'aztec', 'pdf417'] })
  } catch { return null }
}

export function QrApp() {
  const [tab, setTab] = useState<'make' | 'read'>('make')
  const [format, setFormat] = useState<Format>('qr')
  const [kind, setKind] = useState<QrKind>('text')
  const [text, setText] = useState('https://yukuri-san.github.io/UniversalOffice/')
  const [ssid, setSsid] = useState('')
  const [pass, setPass] = useState('')
  const [enc, setEnc] = useState('WPA')
  const [vcName, setVcName] = useState('')
  const [vcTel, setVcTel] = useState('')
  const [vcMail, setVcMail] = useState('')
  const [addr, setAddr] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState('')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const payload = (): string => {
    if (format !== 'qr') return text
    switch (kind) {
      case 'wifi': return `WIFI:T:${enc};S:${esc(ssid)};${enc !== 'nopass' ? `P:${esc(pass)};` : ''};`
      case 'vcard': return `BEGIN:VCARD\nVERSION:3.0\nFN:${vcName}\nTEL:${vcTel}\nEMAIL:${vcMail}\nEND:VCARD`
      case 'mail': return `mailto:${addr}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
      case 'tel': return `tel:${text}`
      case 'sms': return `SMSTO:${text}:${body}`
      default: return text
    }
  }
  const data = payload()

  useEffect(() => {
    setError('')
    const value = data
    if (!value) return
    if (format === 'qr') {
      const canvas = canvasRef.current
      if (canvas) {
        QRCode.toCanvas(canvas, value, { width: 280, margin: 2 }).catch(() => setError('QRコードを生成できませんでした（内容が長すぎる可能性があります）'))
      }
    } else {
      const svg = svgRef.current
      if (svg) {
        try {
          JsBarcode(svg, value, { format, displayValue: true, width: 2, height: 90, margin: 10 })
        } catch {
          setError('この形式では使えない内容です（桁数や文字の種類を確認してください）')
        }
      }
    }
  }, [data, format])

  const download = () => {
    const a = document.createElement('a')
    a.download = format === 'qr' ? 'qrcode.png' : 'barcode.png'
    if (format === 'qr') {
      const canvas = canvasRef.current
      if (canvas) { a.href = canvas.toDataURL('image/png'); a.click() }
      return
    }
    const svg = svgRef.current
    if (!svg) return
    const xml = new XMLSerializer().serializeToString(svg)
    const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml' }))
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width || 560
      canvas.height = img.height || 180
      const ctx = canvas.getContext('2d')
      if (ctx) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0) }
      URL.revokeObjectURL(url)
      a.href = canvas.toDataURL('image/png')
      a.click()
    }
    img.src = url
  }

  /* ----- 読み取り ----- */
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<number>(0)
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState<{ value: string; format: string } | null>(null)
  const [readError, setReadError] = useState('')
  const scanCanvasRef = useRef<HTMLCanvasElement>(null)

  const stopScan = () => {
    window.clearInterval(timerRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setScanning(false)
  }
  useEffect(() => stopScan, [])

  const startScan = async () => {
    setReadError('')
    setResult(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = stream
      const video = videoRef.current
      if (!video) return
      video.srcObject = stream
      await video.play()
      setScanning(true)
      const detector = getDetector()
      timerRef.current = window.setInterval(async () => {
        const v = videoRef.current
        if (!v || v.readyState < 2) return
        try {
          if (detector) {
            const codes = await detector.detect(v)
            if (codes.length > 0) { setResult({ value: codes[0].rawValue, format: codes[0].format }); stopScan() }
          } else {
            const canvas = scanCanvasRef.current
            if (!canvas) return
            canvas.width = v.videoWidth
            canvas.height = v.videoHeight
            const ctx = canvas.getContext('2d')
            if (!ctx) return
            ctx.drawImage(v, 0, 0)
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
            const code = jsQR(img.data, img.width, img.height)
            if (code) { setResult({ value: code.data, format: 'qr_code' }); stopScan() }
          }
        } catch { /* keep scanning */ }
      }, 350)
    } catch {
      setReadError('カメラを使えませんでした（許可とHTTPS接続が必要です）')
    }
  }

  const readFile = (file: File | undefined) => {
    if (!file) return
    setReadError('')
    setResult(null)
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = async () => {
      URL.revokeObjectURL(url)
      const canvas = scanCanvasRef.current
      if (!canvas) return
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(img, 0, 0)
      const detector = getDetector()
      try {
        if (detector) {
          const codes = await detector.detect(canvas)
          if (codes.length > 0) { setResult({ value: codes[0].rawValue, format: codes[0].format }); return }
        }
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const code = jsQR(imgData.data, imgData.width, imgData.height)
        if (code) { setResult({ value: code.data, format: 'qr_code' }); return }
        setReadError('コードを読み取れませんでした')
      } catch { setReadError('コードを読み取れませんでした') }
    }
    img.src = url
  }

  return (
    <div className="wxapp">
      <div className="wxapp-tabs">
        <button className={tab === 'make' ? 'chip on' : 'chip'} onClick={() => setTab('make')}>作成</button>
        <button className={tab === 'read' ? 'chip on' : 'chip'} onClick={() => setTab('read')}>読み取り</button>
      </div>

      {tab === 'make' && (
        <>
          <label className="wxapp-label">形式</label>
          <div className="wxapp-chips">
            {FORMATS.map((f) => (
              <button key={f.id} className={format === f.id ? 'chip on' : 'chip'} onClick={() => setFormat(f.id)}>{f.label}</button>
            ))}
          </div>
          <p className="wxapp-note">{FORMATS.find((f) => f.id === format)?.hint}</p>
          {format === 'qr' && (
            <>
              <label className="wxapp-label">QRの種類</label>
              <div className="wxapp-chips">
                {([['text', 'テキスト/URL'], ['wifi', 'Wi-Fi'], ['vcard', '連絡先'], ['mail', 'メール'], ['tel', '電話'], ['sms', 'SMS']] as [QrKind, string][]).map(([k, label]) => (
                  <button key={k} className={kind === k ? 'chip on' : 'chip'} onClick={() => setKind(k)}>{label}</button>
                ))}
              </div>
            </>
          )}
          {format !== 'qr' && (
            <><label className="wxapp-label">内容</label>
              <input type="text" value={text} onChange={(e) => setText(e.target.value)} /></>
          )}
          {format === 'qr' && kind === 'text' && (
            <><label className="wxapp-label">内容</label>
              <input type="text" value={text} onChange={(e) => setText(e.target.value)} /></>
          )}
          {format === 'qr' && kind === 'wifi' && (
            <>
              <label className="wxapp-label">ネットワーク名（SSID）</label>
              <input type="text" value={ssid} onChange={(e) => setSsid(e.target.value)} />
              <label className="wxapp-label">暗号化</label>
              <div className="wxapp-chips">
                {['WPA', 'WEP', 'nopass'].map((e2) => (
                  <button key={e2} className={enc === e2 ? 'chip on' : 'chip'} onClick={() => setEnc(e2)}>{e2 === 'nopass' ? 'なし' : e2}</button>
                ))}
              </div>
              {enc !== 'nopass' && (<><label className="wxapp-label">パスワード</label>
                <input type="text" value={pass} onChange={(e) => setPass(e.target.value)} /></>)}
            </>
          )}
          {format === 'qr' && kind === 'vcard' && (
            <>
              <label className="wxapp-label">名前</label>
              <input type="text" value={vcName} onChange={(e) => setVcName(e.target.value)} />
              <label className="wxapp-label">電話番号</label>
              <input type="text" value={vcTel} onChange={(e) => setVcTel(e.target.value)} />
              <label className="wxapp-label">メール</label>
              <input type="text" value={vcMail} onChange={(e) => setVcMail(e.target.value)} />
            </>
          )}
          {format === 'qr' && kind === 'mail' && (
            <>
              <label className="wxapp-label">宛先</label>
              <input type="text" value={addr} onChange={(e) => setAddr(e.target.value)} />
              <label className="wxapp-label">件名</label>
              <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} />
              <label className="wxapp-label">本文</label>
              <input type="text" value={body} onChange={(e) => setBody(e.target.value)} />
            </>
          )}
          {format === 'qr' && kind === 'tel' && (
            <><label className="wxapp-label">電話番号</label>
              <input type="text" value={text} onChange={(e) => setText(e.target.value)} /></>
          )}
          {format === 'qr' && kind === 'sms' && (
            <>
              <label className="wxapp-label">電話番号</label>
              <input type="text" value={text} onChange={(e) => setText(e.target.value)} />
              <label className="wxapp-label">本文</label>
              <input type="text" value={body} onChange={(e) => setBody(e.target.value)} />
            </>
          )}
          <div className="qr-preview">
            {format === 'qr' ? <canvas ref={canvasRef} /> : <svg ref={svgRef} />}
          </div>
          {error && <p className="wxapp-error">{error}</p>}
          <p className="wxapp-note">埋め込まれる内容：<code className="qr-payload">{data || '（未入力）'}</code></p>
          <button className="btn" onClick={download}>PNGで保存</button>
        </>
      )}

      {tab === 'read' && (
        <>
          <div className="qr-video-wrap">
            <video ref={videoRef} playsInline muted className="qr-video" />
          </div>
          <canvas ref={scanCanvasRef} hidden />
          <div className="wxapp-toolbar">
            {!scanning
              ? <button className="btn primary" onClick={() => void startScan()}>📷 カメラで読み取る</button>
              : <button className="btn" onClick={stopScan}>停止</button>}
            <label className="btn">
              画像から読み取る
              <input type="file" accept="image/*" hidden onChange={(e) => { readFile(e.target.files?.[0]); e.target.value = '' }} />
            </label>
          </div>
          {readError && <p className="wxapp-error">{readError}</p>}
          {result && (
            <div className="qr-result">
              <div className="qr-result-format">形式：{result.format}</div>
              <div className="qr-result-value">{result.value}</div>
              <div className="wxapp-toolbar">
                <button className="btn" onClick={() => { void navigator.clipboard?.writeText(result.value).catch(() => { /* ignore */ }) }}>コピー</button>
                {/^https?:\/\//.test(result.value) && <a className="btn" href={result.value} target="_blank" rel="noreferrer">リンクを開く</a>}
              </div>
            </div>
          )}
          <p className="wxapp-note">対応形式：QR、EAN-13/8、UPC、CODE128/39/93、ITF、Codabar、Data Matrix、Aztec、PDF417（ブラウザの読み取り機能を使う場合）。使えないブラウザではQRのみ読み取れます。画像は端末の外に送信されません。</p>
        </>
      )}
    </div>
  )
}
