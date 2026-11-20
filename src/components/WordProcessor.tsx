import { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { TextStyle, FontFamily, FontSize } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import Image from '@tiptap/extension-image'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import { marked } from 'marked'
import TurndownService from 'turndown'
import * as mammoth from 'mammoth'
import { asBlob as docxBlob } from 'html-docx-js-typescript'
import { downloadText, escapeHtml } from '../lib/files'
import Backstage from './Backstage'

const STORAGE_KEY = 'universal-office-doc-v2'
const TITLE_KEY = 'universal-office-doc-title'

const SAMPLE_HTML = `<h1>UniversalOffice</h1>
<p>これは Microsoft Word のような操作感を目指したワードプロセッサです。本文をクリックして書き始めてください。</p>
<h2>使い方</h2>
<ul><li>上のリボンの「書式」タブから <strong>太字</strong>・<em>斜体</em>・文字色・見出しなどを選べます</li><li>「挿入」タブで表や画像、「レイアウト」タブで用紙や余白を変えられます</li><li>左上の「ホーム」からアプリの切り替えやファイル操作ができます</li><li>文書は自動でこのブラウザに保存されます</li></ul>
<p>開けるファイル：Word（.docx）、Markdown（.md）、HTML、テキスト。保存は .docx / .md / .html / .txt、PDFは印刷画面からどうぞ。</p>`

const FONTS = [
  { label: '游ゴシック', value: '"Yu Gothic", "游ゴシック", sans-serif' },
  { label: '游明朝', value: '"Yu Mincho", "游明朝", serif' },
  { label: 'メイリオ', value: 'Meiryo, "メイリオ", sans-serif' },
  { label: 'MS Pゴシック', value: '"MS PGothic", "ＭＳ Ｐゴシック", sans-serif' },
  { label: 'MS P明朝', value: '"MS PMincho", "ＭＳ Ｐ明朝", serif' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Times New Roman', value: '"Times New Roman", serif' },
]
const SIZES = ['9', '10', '11', '12', '14', '16', '18', '20', '24', '28', '36', '48']
const PAPERS = [
  { label: 'A4', w: 210, h: 297 },
  { label: 'B5', w: 182, h: 257 },
  { label: 'レター', w: 216, h: 279 },
]
const MARGINS = [
  { label: '標準', t: 25.4, b: 25.4, l: 25.4, r: 25.4 },
  { label: '狭い', t: 12.7, b: 12.7, l: 12.7, r: 12.7 },
  { label: '広い', t: 25.4, b: 25.4, l: 50.8, r: 50.8 },
]

type Tab = 'format' | 'insert' | 'layout' | 'view'

export default function WordProcessor({ onSwitch }: { onSwitch: (app: 'word' | 'sheet') => void }) {
  const [title, setTitle] = useState(() => localStorage.getItem(TITLE_KEY) || '無題の文書')
  const [zoom, setZoom] = useState(100)
  const [stats, setStats] = useState({ chars: 0, paragraphs: 0 })
  const [, setTick] = useState(0)
  const [tab, setTab] = useState<Tab>('format')
  const [homeOpen, setHomeOpen] = useState(false)
  const [paper, setPaper] = useState(PAPERS[0])
  const [landscape, setLandscape] = useState(false)
  const [margin, setMargin] = useState(MARGINS[0])
  const [showRuler, setShowRuler] = useState(true)
  const fileRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLInputElement>(null)
  const pageScrollRef = useRef<HTMLDivElement>(null)
  const [zoomManual, setZoomManual] = useState(false)

  const pageW = landscape ? paper.h : paper.w
  const pageH = landscape ? paper.w : paper.h

  const fitZoom = () => {
    const el = pageScrollRef.current
    if (!el) return
    const pagePx = pageW * 3.7795275591
    const avail = el.clientWidth - 20
    const fit = Math.min(100, Math.floor((avail / pagePx) * 100))
    setZoom(Math.max(30, fit))
  }
  const manualZoom = (z: number) => {
    setZoomManual(true)
    setZoom(z)
  }

  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      FontFamily,
      FontSize,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Image.configure({ inline: false }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: localStorage.getItem(STORAGE_KEY) || SAMPLE_HTML,
    onUpdate: ({ editor: ed }) => {
      localStorage.setItem(STORAGE_KEY, ed.getHTML())
      const text = ed.getText()
      setStats({
        chars: text.replace(/\s/g, '').length,
        paragraphs: ed.getJSON().content?.length ?? 0,
      })
    },
  })

  useEffect(() => {
    if (!editor) return
    const update = () => setTick((t) => t + 1)
    editor.on('transaction', update)
    const text = editor.getText()
    setStats({ chars: text.replace(/\s/g, '').length, paragraphs: editor.getJSON().content?.length ?? 0 })
    return () => {
      editor.off('transaction', update)
    }
  }, [editor])

  useEffect(() => {
    localStorage.setItem(TITLE_KEY, title)
  }, [title])

  useEffect(() => {
    if (!zoomManual) fitZoom()
    const onResize = () => {
      if (!zoomManual) fitZoom()
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageW, zoomManual])

  if (!editor) return null

  const chain = () => editor.chain().focus()
  const active = (name: string, attrs?: Record<string, unknown>) => editor.isActive(name, attrs)
  const alignActive = (align: string) =>
    editor.isActive('paragraph', { textAlign: align }) || editor.isActive('heading', { textAlign: align })

  const currentStyle = (): string => {
    if (active('heading', { level: 1 })) return 'h1'
    if (active('heading', { level: 2 })) return 'h2'
    if (active('heading', { level: 3 })) return 'h3'
    if (active('blockquote')) return 'quote'
    return 'p'
  }

  const applyStyle = (value: string) => {
    const c = chain()
    if (value === 'p') c.setParagraph().run()
    else if (value === 'quote') c.toggleBlockquote().run()
    else c.setHeading({ level: Number(value.slice(1)) as 1 | 2 | 3 }).run()
  }

  const openFile = async (file: File) => {
    const lower = file.name.toLowerCase()
    try {
      if (lower.endsWith('.docx')) {
        const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() })
        editor.commands.setContent(result.value)
      } else if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
        editor.commands.setContent(marked.parse(await file.text()) as string)
      } else if (lower.endsWith('.html') || lower.endsWith('.htm')) {
        editor.commands.setContent(await file.text())
      } else {
        const text = await file.text()
        editor.commands.setContent(text.split(/\n{2,}/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join(''))
      }
      setTitle(file.name.replace(/\.[^.]+$/, ''))
    } catch {
      alert('ファイルを開けませんでした。対応形式は .docx / .md / .html / .txt です。')
    }
  }

  const newDoc = () => {
    if (window.confirm('新規文書にしますか？今の内容は置き換わります。')) {
      editor.commands.setContent('<p></p>')
      setTitle('無題の文書')
    }
  }

  const saveDocx = async () => {
    const blob = (await docxBlob(editor.getHTML())) as Blob
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title || 'document'}.docx`
    a.click()
    URL.revokeObjectURL(url)
  }

  const saveHtml = () => {
    const doc = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body>${editor.getHTML()}</body></html>`
    downloadText(`${title || 'document'}.html`, doc, 'text/html;charset=utf-8')
  }

  const saveMd = () => {
    const md = new TurndownService({ headingStyle: 'atx' }).turndown(editor.getHTML())
    downloadText(`${title || 'document'}.md`, md, 'text/markdown;charset=utf-8')
  }

  const printDoc = () => {
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>@page{size:${pageW}mm ${pageH}mm;margin:${margin.t}mm ${margin.r}mm ${margin.b}mm ${margin.l}mm}body{font-family:"Yu Gothic","游ゴシック",sans-serif;line-height:1.8;color:#111}img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #999;padding:6px 10px}</style>
</head><body>${editor.getHTML()}</body></html>`)
    win.document.close()
    win.focus()
    win.print()
  }

  const insertImageFile = async (file: File) => {
    const reader = new FileReader()
    reader.onload = () => chain().setImage({ src: String(reader.result) }).run()
    reader.readAsDataURL(file)
  }

  const insertImageUrl = () => {
    const url = window.prompt('画像のURLを入力してください')
    if (url) chain().setImage({ src: url }).run()
  }

  const rulerCm = Math.floor(pageW / 10)

  return (
    <section className="word-app">
      <Backstage
        open={homeOpen}
        onClose={() => setHomeOpen(false)}
        current="word"
        onSwitch={onSwitch}
        actions={[
          { label: '新規作成', hint: 'まっさらな文書にする', onClick: newDoc },
          { label: '開く', hint: '.docx / .md / .html / .txt', onClick: () => fileRef.current?.click() },
          { label: 'Word として保存 (.docx)', onClick: () => void saveDocx() },
          { label: 'Markdown として保存 (.md)', onClick: saveMd },
          { label: 'HTML として保存 (.html)', onClick: saveHtml },
          { label: 'テキストとして保存 (.txt)', onClick: () => downloadText(`${title || 'document'}.txt`, editor.getText()) },
          { label: '印刷 / PDF', hint: '印刷画面から PDF として保存', onClick: printDoc },
        ]}
      />

      <div className="titlebar">
        <button className="home-btn" onClick={() => setHomeOpen(true)}>ホーム</button>
        <div className="quick-access">
          <button title="元に戻す" onClick={() => chain().undo().run()} disabled={!editor.can().undo()}>↩</button>
          <button title="やり直し" onClick={() => chain().redo().run()} disabled={!editor.can().redo()}>↪</button>
        </div>
        <input className="title-input" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="文書名" />
        <span className="titlebar-app">ワードプロセッサ</span>
      </div>

      <div className="ribbon">
        <div className="ribbon-tabs">
          <button className={tab === 'format' ? 'rtab active' : 'rtab'} onClick={() => setTab('format')}>書式</button>
          <button className={tab === 'insert' ? 'rtab active' : 'rtab'} onClick={() => setTab('insert')}>挿入</button>
          <button className={tab === 'layout' ? 'rtab active' : 'rtab'} onClick={() => setTab('layout')}>レイアウト</button>
          <button className={tab === 'view' ? 'rtab active' : 'rtab'} onClick={() => setTab('view')}>表示</button>
        </div>

        {tab === 'format' && (
          <div className="ribbon-row">
            <div className="rgroup">
              <div className="rgroup-body">
                <select aria-label="スタイル" value={currentStyle()} onChange={(e) => applyStyle(e.target.value)}>
                  <option value="p">標準</option>
                  <option value="h1">見出し 1</option>
                  <option value="h2">見出し 2</option>
                  <option value="h3">見出し 3</option>
                  <option value="quote">引用</option>
                </select>
              </div>
              <span className="rgroup-label">スタイル</span>
            </div>
            <div className="rgroup">
              <div className="rgroup-body">
                <select aria-label="フォント" onChange={(e) => chain().setFontFamily(e.target.value).run()} defaultValue={FONTS[0].value}>
                  {FONTS.map((f) => <option key={f.label} value={f.value}>{f.label}</option>)}
                </select>
                <select aria-label="サイズ" onChange={(e) => chain().setFontSize(`${e.target.value}pt`).run()} defaultValue="12">
                  {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <button className={active('bold') ? 'on' : ''} onClick={() => chain().toggleBold().run()}><b>B</b></button>
                <button className={active('italic') ? 'on' : ''} onClick={() => chain().toggleItalic().run()}><i>I</i></button>
                <button className={active('underline') ? 'on' : ''} onClick={() => chain().toggleUnderline().run()}><u>U</u></button>
                <button className={active('strike') ? 'on' : ''} onClick={() => chain().toggleStrike().run()}><s>S</s></button>
                <label className="color-pick">A<input type="color" aria-label="文字色" onChange={(e) => chain().setColor(e.target.value).run()} /></label>
                <label className="color-pick">蛍光<input type="color" aria-label="蛍光ペン" defaultValue="#fff59d" onChange={(e) => chain().toggleHighlight({ color: e.target.value }).run()} /></label>
                <button onClick={() => chain().unsetAllMarks().clearNodes().run()}>書式クリア</button>
              </div>
              <span className="rgroup-label">フォント</span>
            </div>
            <div className="rgroup">
              <div className="rgroup-body">
                <button className={alignActive('left') ? 'on' : ''} onClick={() => chain().setTextAlign('left').run()}>左揃え</button>
                <button className={alignActive('center') ? 'on' : ''} onClick={() => chain().setTextAlign('center').run()}>中央</button>
                <button className={alignActive('right') ? 'on' : ''} onClick={() => chain().setTextAlign('right').run()}>右揃え</button>
                <button className={alignActive('justify') ? 'on' : ''} onClick={() => chain().setTextAlign('justify').run()}>両端</button>
                <button className={active('bulletList') ? 'on' : ''} onClick={() => chain().toggleBulletList().run()}>箇条書き</button>
                <button className={active('orderedList') ? 'on' : ''} onClick={() => chain().toggleOrderedList().run()}>番号付き</button>
              </div>
              <span className="rgroup-label">段落</span>
            </div>
          </div>
        )}

        {tab === 'insert' && (
          <div className="ribbon-row">
            <div className="rgroup">
              <div className="rgroup-body">
                <button onClick={() => imageRef.current?.click()}>画像（ファイル）</button>
                <input ref={imageRef} type="file" accept="image/*" hidden
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void insertImageFile(f); e.target.value = '' }} />
                <button onClick={insertImageUrl}>画像（URL）</button>
              </div>
              <span className="rgroup-label">画像</span>
            </div>
            <div className="rgroup">
              <div className="rgroup-body">
                <button onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>表 3×3</button>
                {active('table') && (
                  <>
                    <button onClick={() => chain().addColumnAfter().run()}>列を追加</button>
                    <button onClick={() => chain().addRowAfter().run()}>行を追加</button>
                    <button onClick={() => chain().deleteColumn().run()}>列を削除</button>
                    <button onClick={() => chain().deleteRow().run()}>行を削除</button>
                    <button onClick={() => chain().deleteTable().run()}>表を削除</button>
                  </>
                )}
              </div>
              <span className="rgroup-label">表</span>
            </div>
            <div className="rgroup">
              <div className="rgroup-body">
                <button onClick={() => chain().setHorizontalRule().run()}>罫線</button>
              </div>
              <span className="rgroup-label">区切り</span>
            </div>
          </div>
        )}

        {tab === 'layout' && (
          <div className="ribbon-row">
            <div className="rgroup">
              <div className="rgroup-body">
                <select aria-label="用紙" value={paper.label}
                  onChange={(e) => setPaper(PAPERS.find((p) => p.label === e.target.value) ?? PAPERS[0])}>
                  {PAPERS.map((p) => <option key={p.label} value={p.label}>{p.label}（{p.w}×{p.h}mm）</option>)}
                </select>
                <select aria-label="向き" value={landscape ? 'landscape' : 'portrait'} onChange={(e) => setLandscape(e.target.value === 'landscape')}>
                  <option value="portrait">縦</option>
                  <option value="landscape">横</option>
                </select>
                <select aria-label="余白" value={margin.label}
                  onChange={(e) => setMargin(MARGINS.find((m) => m.label === e.target.value) ?? MARGINS[0])}>
                  {MARGINS.map((m) => <option key={m.label} value={m.label}>{m.label}（上下 {m.t}mm）</option>)}
                </select>
              </div>
              <span className="rgroup-label">ページ設定</span>
            </div>
          </div>
        )}

        {tab === 'view' && (
          <div className="ribbon-row">
            <div className="rgroup">
              <div className="rgroup-body">
                {[50, 75, 100, 125, 150].map((z) => (
                  <button key={z} className={zoom === z ? 'on' : ''} onClick={() => manualZoom(z)}>{z}%</button>
                ))}
                <input type="range" min={30} max={150} step={5} value={zoom} onChange={(e) => manualZoom(Number(e.target.value))} aria-label="ズーム" />
                <button onClick={() => { setZoomManual(false); fitZoom() }}>幅に合わせる</button>
              </div>
              <span className="rgroup-label">ズーム</span>
            </div>
            <div className="rgroup">
              <div className="rgroup-body">
                <label className="check"><input type="checkbox" checked={showRuler} onChange={(e) => setShowRuler(e.target.checked)} /> ルーラー</label>
              </div>
              <span className="rgroup-label">表示</span>
            </div>
          </div>
        )}
      </div>

      <input ref={fileRef} type="file" accept=".docx,.md,.markdown,.html,.htm,.txt" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void openFile(f); e.target.value = '' }} />

      <div className="page-scroll" ref={pageScrollRef}>
        {showRuler && (
          <div className="ruler" style={{ width: `${pageW}mm`, zoom: zoom / 100 } as React.CSSProperties} aria-hidden>
            {Array.from({ length: rulerCm + 1 }, (_, i) => (
              <span key={i} className="ruler-num" style={{ left: `${(i * 10 * 100) / pageW}%` }}>{i}</span>
            ))}
          </div>
        )}
        <div className="page"
          onClick={(e) => { if (e.target === e.currentTarget) editor.commands.focus('end') }}
          style={{ width: `${pageW}mm`, minHeight: `${pageH}mm`, padding: `${margin.t}mm ${margin.r}mm ${margin.b}mm ${margin.l}mm`, zoom: zoom / 100 } as React.CSSProperties}>
          <EditorContent editor={editor} />
        </div>
      </div>

      <div className="statusbar">
        <span>{stats.paragraphs} 段落</span>
        <span>{stats.chars} 文字</span>
        <span>{paper.label}{landscape ? '（横）' : ''} / 余白 {margin.label}</span>
        <span className="zoomctl">
          <input type="range" min={30} max={150} step={5} value={zoom} onChange={(e) => manualZoom(Number(e.target.value))} aria-label="ズーム" />
          {zoom}%
        </span>
      </div>
    </section>
  )
}
