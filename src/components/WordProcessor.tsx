import { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { FontFamily, FontSize, LineHeight } from '@tiptap/extension-text-style'
import Superscript from '@tiptap/extension-superscript'
import Subscript from '@tiptap/extension-subscript'
import { ParagraphProps, TextStyleWithSpacing } from '../lib/paragraphProps'
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
import Backstage, { type AppId } from './Backstage'
import { useLang } from '../lib/i18n'
import FileManager from './FileManager'
import { listDocs } from '../lib/store'

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

type DocStats = { chars: number; charsWithSpace: number; words: number; lines: number; paragraphs: number; selChars: number }

/** 文書全体と選択範囲の文字数を数える。末尾の改行は数えない */
function computeStats(ed: NonNullable<ReturnType<typeof useEditor>>): DocStats {
  const raw = ed.getText()
  const body = raw.replace(/\n+$/, '')
  const trimmed = body.trim()
  const { from, to } = ed.state.selection
  let selChars = 0
  if (to > from) {
    const sel = ed.state.doc.textBetween(from, to, '\n')
    selChars = sel.replace(/\s/g, '').length
  }
  return {
    chars: body.replace(/\s/g, '').length,
    charsWithSpace: body.replace(/\n/g, '').length,
    words: trimmed ? trimmed.split(/\s+/).length : 0,
    lines: body ? body.split('\n').length : 0,
    paragraphs: ed.getJSON().content?.length ?? 0,
    selChars,
  }
}

export default function WordProcessor({ onSwitch }: { onSwitch: (app: AppId) => void }) {
  const { t } = useLang()
  const [title, setTitle] = useState(() => localStorage.getItem(TITLE_KEY) || '無題の文書')
  const [zoom, setZoom] = useState(100)
  const [stats, setStats] = useState<DocStats>({ chars: 0, charsWithSpace: 0, words: 0, lines: 0, paragraphs: 0, selChars: 0 })
  const [countOpen, setCountOpen] = useState(false)
  const [, setTick] = useState(0)
  const [tab, setTab] = useState<Tab>('format')
  const [homeOpen, setHomeOpen] = useState(false)
  const [paper, setPaper] = useState(PAPERS[0])
  const [landscape, setLandscape] = useState(false)
  const [margin, setMargin] = useState(MARGINS[0])
  const [showRuler, setShowRuler] = useState(true)
  const [docDefaults, setDocDefaults] = useState(() => {
    try {
      const saved = localStorage.getItem('uo-doc-defaults')
      if (saved) return JSON.parse(saved) as { font: string; size: string; lineHeight: string }
    } catch { /* ignore */ }
    return { font: FONTS[0].value, size: '12', lineHeight: '1.8' }
  })
  const [findOpen, setFindOpen] = useState(false)
  const [findText, setFindText] = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [findMsg, setFindMsg] = useState('')
  const [showOutline, setShowOutline] = useState(false)
  const [headings, setHeadings] = useState<{ level: number; text: string; pos: number }[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLInputElement>(null)
  const pageScrollRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)
  const [zoomManual, setZoomManual] = useState(false)
  const [pagePx, setPagePx] = useState({ w: 794, h: 1123 })

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
      TextStyleWithSpacing,
      FontFamily,
      FontSize,
      LineHeight,
      ParagraphProps,
      Superscript,
      Subscript,
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
      setStats(computeStats(ed))
    },
  })

  useEffect(() => {
    if (!editor) return
    const update = () => {
      setTick((t) => t + 1)
      setStats(computeStats(editor))
    }
    editor.on('transaction', update)
    setStats(computeStats(editor))
    return () => {
      editor.off('transaction', update)
    }
  }, [editor])

  useEffect(() => {
    localStorage.setItem(TITLE_KEY, title)
  }, [title])

  useEffect(() => {
    localStorage.setItem('uo-doc-defaults', JSON.stringify(docDefaults))
  }, [docDefaults])

  useEffect(() => {
    if (!editor) return
    const collect = () => {
      const list: { level: number; text: string; pos: number }[] = []
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'heading') {
          list.push({ level: (node.attrs.level as number) ?? 1, text: node.textContent, pos })
        }
      })
      setHeadings(list)
    }
    collect()
    editor.on('transaction', collect)
    return () => {
      editor.off('transaction', collect)
    }
  }, [editor])

  useEffect(() => {
    if (!editor) return
    const pending = localStorage.getItem('uo-pending-open')
    if (!pending) return
    void listDocs().then((docs) => {
      const doc = docs.find((d) => d.id === pending)
      if (doc && doc.kind === 'word') {
        localStorage.removeItem('uo-pending-open')
        editor.commands.setContent(doc.content)
        setTitle(doc.name)
      }
    })
  }, [editor])

  useEffect(() => {
    const el = pageRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setPagePx({ w: el.offsetWidth, h: el.offsetHeight })
    })
    ro.observe(el)
    setPagePx({ w: el.offsetWidth, h: el.offsetHeight })
    return () => ro.disconnect()
  }, [paper, landscape, margin])

  useEffect(() => {
    if (!zoomManual) fitZoom()
    const onResize = () => {
      if (!zoomManual) fitZoom()
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageW, zoomManual])

  // モバイル（狭い画面）では、入力位置（キャレット）がページ表示領域の見える範囲に来るよう自動スクロールする
  useEffect(() => {
    if (!editor) return
    let raf = 0
    const ensureCaretVisible = () => {
      if (window.innerWidth > 820) return
      const sc = pageScrollRef.current
      if (!sc) return
      try {
        const pos = editor.view.coordsAtPos(editor.state.selection.from)
        const rect = sc.getBoundingClientRect()
        const target = rect.top + rect.height * 0.35
        const delta = pos.top - target
        if (Math.abs(delta) > 24) sc.scrollTop += delta
      } catch { /* ignore */ }
    }
    const onSel = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(ensureCaretVisible) }
    editor.on('selectionUpdate', onSel)
    editor.on('focus', onSel)
    return () => { editor.off('selectionUpdate', onSel); editor.off('focus', onSel); cancelAnimationFrame(raf) }
  }, [editor])

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
          { label: t('newDoc'), onClick: newDoc },
          { label: t('openBtn'), hint: '.docx / .md / .html / .txt', onClick: () => fileRef.current?.click() },
          { label: 'Word として保存 (.docx)', onClick: () => void saveDocx() },
          { label: 'Markdown として保存 (.md)', onClick: saveMd },
          { label: 'HTML として保存 (.html)', onClick: saveHtml },
          { label: 'テキストとして保存 (.txt)', onClick: () => downloadText(`${title || 'document'}.txt`, editor.getText()) },
          { label: t('printPdf'), onClick: printDoc },
        ]}
        fileManager={
          <FileManager
            kind="word"
            currentName={title}
            getContent={() => editor.getHTML()}
            onOpen={(doc) => {
              if (doc.kind === 'memo') return
              if (doc.kind !== 'word') {
                localStorage.setItem('uo-pending-open', doc.id)
                onSwitch(doc.kind)
                return
              }
              editor.commands.setContent(doc.content)
              setTitle(doc.name)
            }}
          />
        }
      />

      <div className="titlebar">
        <button className="home-btn" onClick={() => setHomeOpen(true)}>{t('home')}</button>
        <div className="quick-access">
          <button title={t('undo')} onClick={() => chain().undo().run()} disabled={!editor.can().undo()}>↩</button>
          <button title={t('redo')} onClick={() => chain().redo().run()} disabled={!editor.can().redo()}>↪</button>
        </div>
        <input className="title-input" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="文書名" />
        <span className="titlebar-app">{t('word')}</span>
      </div>

      <div className="ribbon">
        <div className="ribbon-tabs">
          <button className={tab === 'format' ? 'rtab active' : 'rtab'} onClick={() => setTab('format')}>{t('tabFormat')}</button>
          <button className={tab === 'insert' ? 'rtab active' : 'rtab'} onClick={() => setTab('insert')}>{t('tabInsert')}</button>
          <button className={tab === 'layout' ? 'rtab active' : 'rtab'} onClick={() => setTab('layout')}>{t('tabLayout')}</button>
          <button className={tab === 'view' ? 'rtab active' : 'rtab'} onClick={() => setTab('view')}>{t('tabView')}</button>
        </div>

        {tab === 'format' && (
          <div className="ribbon-row">
            <div className="rgroup">
              <div className="rgroup-body">
                <select aria-label="スタイル" value={currentStyle()} onChange={(e) => applyStyle(e.target.value)}>
                  <option value="p">{t('bodyText')}</option>
                  <option value="h1">{t('heading')} 1</option>
                  <option value="h2">{t('heading')} 2</option>
                  <option value="h3">{t('heading')} 3</option>
                  <option value="quote">引用</option>
                </select>
              </div>
              <span className="rgroup-label">{t('grpStyle')}</span>
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
                <button className={active('superscript') ? 'on' : ''} onClick={() => chain().toggleSuperscript().run()}>x²</button>
                <button className={active('subscript') ? 'on' : ''} onClick={() => chain().toggleSubscript().run()}>x₂</button>
                <select aria-label="文字間隔" defaultValue="" onChange={(e) => { if (e.target.value) chain().setLetterSpacing(e.target.value).run(); else chain().unsetLetterSpacing().run() }}>
                  <option value="">{t('letterSpacing')}</option>
                  <option value="-0.05em">狭い</option>
                  <option value="0.1em">広い</option>
                  <option value="0.2em">とても広い</option>
                </select>
                <label className="color-pick">A<input type="color" aria-label="文字色" onChange={(e) => chain().setColor(e.target.value).run()} /></label>
                <label className="color-pick">✒<input type="color" aria-label="蛍光ペン" defaultValue="#fff59d" onChange={(e) => chain().toggleHighlight({ color: e.target.value }).run()} /></label>
                <button onClick={() => chain().unsetAllMarks().clearNodes().run()}>{t('clearFormat')}</button>
              </div>
              <span className="rgroup-label">{t('grpFont')}</span>
            </div>
            <div className="rgroup">
              <div className="rgroup-body">
                <button className={alignActive('left') ? 'on' : ''} onClick={() => chain().setTextAlign('left').run()}>{t('alignLeft')}</button>
                <button className={alignActive('center') ? 'on' : ''} onClick={() => chain().setTextAlign('center').run()}>{t('alignCenter')}</button>
                <button className={alignActive('right') ? 'on' : ''} onClick={() => chain().setTextAlign('right').run()}>{t('alignRight')}</button>
                <button className={alignActive('justify') ? 'on' : ''} onClick={() => chain().setTextAlign('justify').run()}>{t('alignJustify')}</button>
                <button className={active('bulletList') ? 'on' : ''} onClick={() => chain().toggleBulletList().run()}>{t('bullets')}</button>
                <button className={active('orderedList') ? 'on' : ''} onClick={() => chain().toggleOrderedList().run()}>{t('numbering')}</button>
                <select aria-label="行間" defaultValue="" onChange={(e) => { if (e.target.value) chain().setLineHeight(e.target.value).run(); else chain().unsetLineHeight().run() }}>
                  <option value="">{t('lineHeight')}</option>
                  <option value="1">1.0</option>
                  <option value="1.15">1.15</option>
                  <option value="1.5">1.5</option>
                  <option value="2">2.0</option>
                </select>
                <select aria-label="段落前の間隔" defaultValue="" onChange={(e) => chain().setSpaceBefore(e.target.value || null).run()}>
                  <option value="">前：なし</option>
                  <option value="6pt">前：6pt</option>
                  <option value="12pt">前：12pt</option>
                </select>
                <select aria-label="段落後の間隔" defaultValue="6pt" onChange={(e) => chain().setSpaceAfter(e.target.value || null).run()}>
                  <option value="">後：なし</option>
                  <option value="6pt">後：6pt</option>
                  <option value="12pt">後：12pt</option>
                  <option value="18pt">後：18pt</option>
                </select>
                <button className={(editor.getAttributes('paragraph').firstLineIndent || editor.getAttributes('heading').firstLineIndent) ? 'on' : ''}
                  onClick={() => {
                    const on = editor.getAttributes('paragraph').firstLineIndent || editor.getAttributes('heading').firstLineIndent
                    chain().setFirstLineIndent(on ? null : '1em').run()
                  }}>{t('firstIndent')}</button>
              </div>
              <span className="rgroup-label">{t('grpPara')}</span>
            </div>
            <div className="rgroup">
              <div className="rgroup-body">
                <button className={findOpen ? 'on' : ''} onClick={() => setFindOpen((v) => !v)}>{t('findReplace')}</button>
              </div>
              <span className="rgroup-label">{t('grpEdit')}</span>
            </div>
          </div>
        )}

        {tab === 'insert' && (
          <div className="ribbon-row">
            <div className="rgroup">
              <div className="rgroup-body">
                <button onClick={() => imageRef.current?.click()}>{t('image')}</button>
                <input ref={imageRef} type="file" accept="image/*" hidden
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void insertImageFile(f); e.target.value = '' }} />
                <button onClick={insertImageUrl}>{t('image')} (URL)</button>
              </div>
              <span className="rgroup-label">{t('image')}</span>
            </div>
            <div className="rgroup">
              <div className="rgroup-body">
                <button onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>{t('tableBtn')} 3×3</button>
                {active('table') && (
                  <>
                    <button onClick={() => chain().addColumnAfter().run()}>{t('addCol')}</button>
                    <button onClick={() => chain().addRowAfter().run()}>{t('addRow')}</button>
                    <button onClick={() => chain().deleteColumn().run()}>{t('delCol')}</button>
                    <button onClick={() => chain().deleteRow().run()}>{t('delRow')}</button>
                    <button onClick={() => chain().deleteTable().run()}>{t('deleteBtn')}</button>
                  </>
                )}
              </div>
              <span className="rgroup-label">{t('grpTable')}</span>
            </div>
            <div className="rgroup">
              <div className="rgroup-body">
                <button onClick={() => chain().setHorizontalRule().run()}>罫線</button>
              </div>
              <span className="rgroup-label">区切り</span>
            </div>
            <div className="rgroup">
              <div className="rgroup-body">
                <button onClick={() => {
                  const prev = editor.getAttributes('link').href as string | undefined
                  const url = window.prompt('リンク先URL', prev ?? 'https://')
                  if (url === null) return
                  if (url === '') { chain().extendMarkRange('link').unsetLink().run(); return }
                  chain().extendMarkRange('link').setLink({ href: url }).run()
                }}>{t('link')}</button>
                <button onClick={() => chain().unsetLink().run()}>{t('unlink')}</button>
              </div>
              <span className="rgroup-label">{t('link')}</span>
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
                  <option value="portrait">{t('portrait')}</option>
                  <option value="landscape">{t('landscape')}</option>
                </select>
                <select aria-label="余白" value={margin.label}
                  onChange={(e) => setMargin(MARGINS.find((m) => m.label === e.target.value) ?? MARGINS[0])}>
                  {MARGINS.map((m) => <option key={m.label} value={m.label}>{m.label}（上下 {m.t}mm）</option>)}
                </select>
              </div>
              <span className="rgroup-label">{t('grpPage')}</span>
            </div>
            <div className="rgroup">
              <div className="rgroup-body">
                <select aria-label="既定フォント" value={docDefaults.font} onChange={(e) => setDocDefaults((d) => ({ ...d, font: e.target.value }))}>
                  {FONTS.map((f) => <option key={f.label} value={f.value}>{f.label}</option>)}
                </select>
                <select aria-label="既定サイズ" value={docDefaults.size} onChange={(e) => setDocDefaults((d) => ({ ...d, size: e.target.value }))}>
                  {SIZES.map((sz) => <option key={sz} value={sz}>{sz}pt</option>)}
                </select>
                <select aria-label="既定の行間" value={docDefaults.lineHeight} onChange={(e) => setDocDefaults((d) => ({ ...d, lineHeight: e.target.value }))}>
                  <option value="1">行間 1.0</option>
                  <option value="1.15">行間 1.15</option>
                  <option value="1.5">行間 1.5</option>
                  <option value="1.8">行間 1.8</option>
                  <option value="2">行間 2.0</option>
                </select>
              </div>
              <span className="rgroup-label">{t('docDefaults')}</span>
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
                <button onClick={() => { setZoomManual(false); fitZoom() }}>{t('fitWidth')}</button>
              </div>
              <span className="rgroup-label">{t('zoom')}</span>
            </div>
            <div className="rgroup">
              <div className="rgroup-body">
                <label className="check"><input type="checkbox" checked={showRuler} onChange={(e) => setShowRuler(e.target.checked)} /> ルーラー</label>
                <label className="check"><input type="checkbox" checked={showOutline} onChange={(e) => setShowOutline(e.target.checked)} /> {t('outline')}</label>
              </div>
              <span className="rgroup-label">{t('grpView')}</span>
            </div>
          </div>
        )}
      </div>

      <input ref={fileRef} type="file" accept=".docx,.md,.markdown,.html,.htm,.txt" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void openFile(f); e.target.value = '' }} />

      {findOpen && (
        <div className="find-panel">
          <input value={findText} onChange={(e) => setFindText(e.target.value)} placeholder={t('findPh')} aria-label={t('findPh')} />
          <button onClick={() => {
            if (!findText) return
            const found = (window as unknown as { find: (t: string) => boolean }).find(findText)
            setFindMsg(found ? '' : '見つかりませんでした')
          }}>次を検索</button>
          <input value={replaceText} onChange={(e) => setReplaceText(e.target.value)} placeholder={t('replacePh')} aria-label={t('replacePh')} />
          <button onClick={() => {
            if (!findText) return
            let count = 0
            type JsonNode = { type?: string; text?: string; content?: JsonNode[]; [key: string]: unknown }
            const walk = (node: JsonNode): JsonNode => {
              if (node.type === 'text' && typeof node.text === 'string') {
                const parts = node.text.split(findText)
                if (parts.length > 1) {
                  count += parts.length - 1
                  return { ...node, text: parts.join(replaceText) }
                }
                return node
              }
              if (node.content) return { ...node, content: node.content.map(walk) }
              return node
            }
            const newJson = walk(editor.getJSON() as JsonNode)
            if (count > 0) editor.commands.setContent(newJson)
            setFindMsg(count > 0 ? `${count} 件置換しました` : '見つかりませんでした')
          }}>{t('replaceAllBtn')}</button>
          {findMsg && <span className="find-msg">{findMsg}</span>}
          <button onClick={() => setFindOpen(false)}>{t('close')}</button>
        </div>
      )}

      <div className="page-scroll" ref={pageScrollRef}>
        <div className="page-flex">
        {showOutline && (
          <aside className="outline">
            <h4>{t('outline')}</h4>
            {headings.length === 0 ? <p className="outline-empty">見出しがありません</p> : headings.map((h, i) => (
              <button key={i} className={`outline-item lv${h.level}`}
                onClick={() => {
                  editor.commands.setTextSelection(h.pos + 1)
                  editor.commands.focus()
                  const dom = editor.view.nodeDOM(h.pos) as HTMLElement | null
                  dom?.scrollIntoView({ block: 'center' })
                }}>{h.text || '（無題の見出し）'}</button>
            ))}
          </aside>
        )}
        <div className="page-main">
        {showRuler && (
          <div className="ruler-scale" style={{ width: pagePx.w * (zoom / 100), height: 20 * (zoom / 100) }}>
            <div className="ruler" style={{ width: `${pageW}mm`, transform: `scale(${zoom / 100})`, transformOrigin: 'top left' }} aria-hidden>
              {Array.from({ length: rulerCm + 1 }, (_, i) => (
                <span key={i} className="ruler-num" style={{ left: `${(i * 10 * 100) / pageW}%` }}>{i}</span>
              ))}
            </div>
          </div>
        )}
        <div className="page-scale" style={{ width: pagePx.w * (zoom / 100), height: pagePx.h * (zoom / 100) }}>
          <div className="page" ref={pageRef}
            onClick={(e) => { if (e.target === e.currentTarget) editor.commands.focus('end') }}
            style={{ width: `${pageW}mm`, minHeight: `${pageH}mm`, padding: `${margin.t}mm ${margin.r}mm ${margin.b}mm ${margin.l}mm`, transform: `scale(${zoom / 100})`, transformOrigin: 'top left', fontFamily: docDefaults.font, fontSize: `${docDefaults.size}pt`, lineHeight: docDefaults.lineHeight }}>
            <EditorContent editor={editor} />
          </div>
        </div>
        </div>
        </div>
      </div>

      <div className="statusbar">
        <span>{stats.paragraphs} {t('paragraphs')}</span>
        <button className="stat-btn" onClick={() => setCountOpen(true)} title={t('wordCount')}>{stats.chars.toLocaleString()} {t('chars')}</button>
        {stats.selChars > 0 && <span>{t('selectedChars')}：{stats.selChars.toLocaleString()}</span>}
        <span>{paper.label}{landscape ? '（横）' : ''} / 余白 {margin.label}</span>
        <span className="zoomctl">
          <input type="range" min={30} max={150} step={5} value={zoom} onChange={(e) => manualZoom(Number(e.target.value))} aria-label="ズーム" />
          {zoom}%
        </span>
      </div>

      {countOpen && (
        <div className="wordcount-overlay" onClick={() => setCountOpen(false)}>
          <div className="wordcount-card" role="dialog" aria-label={t('wordCount')} onClick={(e) => e.stopPropagation()}>
            <h3>{t('wordCount')}</h3>
            <div className="wordcount-row"><span>{t('charsNoSpace')}</span><b>{stats.chars.toLocaleString()}</b></div>
            <div className="wordcount-row"><span>{t('charsWithSpace')}</span><b>{stats.charsWithSpace.toLocaleString()}</b></div>
            <div className="wordcount-row"><span>{t('words')}</span><b>{stats.words.toLocaleString()}</b></div>
            <div className="wordcount-row"><span>{t('paragraphs')}</span><b>{stats.paragraphs.toLocaleString()}</b></div>
            <div className="wordcount-row"><span>{t('lines')}</span><b>{stats.lines.toLocaleString()}</b></div>
            <div className="wordcount-row"><span>{t('selectedChars')}</span><b>{stats.selChars.toLocaleString()}</b></div>
            <div className="wordcount-row"><span>{t('manuscriptPages')}</span><b>{(stats.chars / 400).toFixed(1)}</b></div>
            <button className="btn" onClick={() => setCountOpen(false)}>{t('close')}</button>
          </div>
        </div>
      )}
    </section>
  )
}
