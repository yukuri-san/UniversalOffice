import { useEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { FontFamily, FontSize, TextStyle } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import TurndownService from 'turndown'
import { asBlob as docxBlob } from 'html-docx-js-typescript'
import { downloadText } from '../../lib/files'
import { notifyOs } from '../../lib/notify'

/**
 * OfficePro（Pro Edition 限定）：ワープロの上位版。
 * 複数文書の管理・自動保存、見出しアウトライン、文字数カウント詳細、.docx/.md/.html/.txt 保存。
 * 文書は localStorage（webx-officepro-docs）に保存する。
 */

interface ProDoc { id: string; title: string; html: string; updatedAt: number }
const LS_KEY = 'webx-officepro-docs'

function loadDocs(): ProDoc[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      const arr = JSON.parse(raw) as ProDoc[]
      if (Array.isArray(arr)) return arr
    }
  } catch { /* ignore */ }
  return [{ id: 'd1', title: '無題の文書', html: '<h1>OfficePro</h1><p>Pro Edition 限定のワープロです。左の一覧で文書を切り替え、見出しを付けると右のアウトラインに並びます。</p><h2>使い方</h2><p>上のボタンで書式を変えられます。文書は自動保存されます。</p>', updatedAt: Date.now() }]
}

function countStats(text: string) {
  const t = text.replace(/\n+$/, '')
  const charsNoSpace = t.replace(/\s/g, '').length
  const charsWithSpace = t.length
  const words = t.trim() === '' ? 0 : t.trim().split(/\s+/).length
  const paragraphs = t === '' ? 0 : t.split(/\n\s*\n|\n/).filter((s) => s.trim() !== '').length
  const lines = t === '' ? 0 : t.split('\n').length
  return { charsNoSpace, charsWithSpace, words, paragraphs, lines, pages: Math.ceil(charsNoSpace / 400) }
}

export default function OfficePro() {
  const [docs, setDocs] = useState<ProDoc[]>(loadDocs)
  const [currentId, setCurrentId] = useState<string>(() => loadDocs()[0]?.id ?? 'd1')
  const [showStats, setShowStats] = useState(false)
  const [, setTick] = useState(0)
  const switchingRef = useRef(false)
  const current = docs.find((d) => d.id === currentId) ?? docs[0]

  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      FontFamily,
      FontSize,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content: current?.html ?? '',
    onUpdate: ({ editor }) => {
      if (switchingRef.current) return
      const html = editor.getHTML()
      setDocs((prev) => prev.map((d) => (d.id === currentId ? { ...d, html, updatedAt: Date.now() } : d)))
      setTick((v) => v + 1)
    },
  })

  useEffect(() => { try { localStorage.setItem(LS_KEY, JSON.stringify(docs)) } catch { /* ignore */ } }, [docs])

  useEffect(() => {
    if (!editor || !current) return
    if (editor.getHTML() !== current.html) {
      switchingRef.current = true
      editor.commands.setContent(current.html)
      switchingRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId])

  const outline = useMemo(() => {
    if (!current) return [] as { level: number; text: string }[]
    const doc = new DOMParser().parseFromString(current.html, 'text/html')
    return Array.from(doc.querySelectorAll('h1,h2,h3')).map((h) => ({ level: Number(h.tagName[1]), text: h.textContent ?? '' }))
  }, [current])

  const stats = useMemo(() => countStats(editor?.getText() ?? ''), [editor, docs, currentId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!current || !editor) return <div className="pad">読み込み中…</div>

  const newDoc = () => {
    const d: ProDoc = { id: `d${Date.now()}`, title: '無題の文書', html: '<p></p>', updatedAt: Date.now() }
    setDocs((prev) => [d, ...prev])
    setCurrentId(d.id)
  }
  const deleteDoc = (id: string) => {
    if (!window.confirm('この文書を削除しますか？')) return
    setDocs((prev) => {
      const next = prev.filter((d) => d.id !== id)
      if (id === currentId && next[0]) setCurrentId(next[0].id)
      return next.length > 0 ? next : [{ id: `d${Date.now()}`, title: '無題の文書', html: '<p></p>', updatedAt: Date.now() }]
    })
  }
  const jumpToHeading = (idx: number) => {
    const el = editor.view.dom.querySelectorAll('h1,h2,h3')[idx]
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const exportDocx = async () => {
    const blob = await docxBlob(`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${current.html}</body></html>`)
    const url = URL.createObjectURL(blob as Blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${current.title || 'document'}.docx`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
    notifyOs('Wordファイルを書き出しました')
  }
  const exportMd = () => {
    downloadText(`${current.title || 'document'}.md`, new TurndownService().turndown(current.html), 'text/markdown')
    notifyOs('Markdownを書き出しました')
  }

  return (
    <div className="officepro">
      <div className="officepro-side">
        <button className="btn accent" onClick={newDoc}>＋ 新規文書</button>
        <div className="officepro-doclist">
          {docs.map((d) => (
            <div key={d.id} className={`officepro-doc ${d.id === current.id ? 'on' : ''}`} onClick={() => setCurrentId(d.id)}>
              <span className="officepro-doctitle">{d.title || '無題の文書'}</span>
              <button className="memopro-mini" title="削除" onClick={(e) => { e.stopPropagation(); deleteDoc(d.id) }}>🗑</button>
            </div>
          ))}
        </div>
        <div className="officepro-outline">
          <div className="officepro-outhead">アウトライン</div>
          {outline.length === 0 && <p className="store-note">見出しを付けるとここに並びます</p>}
          {outline.map((o, i) => (
            <button key={i} className="officepro-outitem" style={{ paddingLeft: `${8 + (o.level - 1) * 14}px` }} onClick={() => jumpToHeading(i)}>{o.text}</button>
          ))}
        </div>
      </div>
      <div className="officepro-main">
        <div className="officepro-toolbar">
          <input className="ymm-input officepro-title" value={current.title} onChange={(e) => setDocs((prev) => prev.map((d) => (d.id === current.id ? { ...d, title: e.target.value } : d)))} placeholder="文書タイトル" />
          <button className="btn" onClick={() => editor.chain().focus().toggleBold().run()}><b>B</b></button>
          <button className="btn" onClick={() => editor.chain().focus().toggleItalic().run()}><i>I</i></button>
          <button className="btn" onClick={() => editor.chain().focus().toggleStrike().run()}><s>S</s></button>
          <button className="btn" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>H1</button>
          <button className="btn" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</button>
          <button className="btn" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</button>
          <button className="btn" onClick={() => editor.chain().focus().toggleBulletList().run()}>• リスト</button>
          <button className="btn" onClick={() => editor.chain().focus().toggleOrderedList().run()}>1. リスト</button>
          <button className="btn" onClick={() => editor.chain().focus().setTextAlign('left').run()}>左</button>
          <button className="btn" onClick={() => editor.chain().focus().setTextAlign('center').run()}>中央</button>
          <button className="btn" onClick={() => editor.chain().focus().setTextAlign('right').run()}>右</button>
          <label className="officepro-color">文字色<input type="color" onChange={(e) => editor.chain().focus().setColor(e.target.value).run()} /></label>
          <button className="btn" onClick={() => setShowStats((v) => !v)}>文字数</button>
          <button className="btn" onClick={() => void exportDocx()}>.docx</button>
          <button className="btn" onClick={exportMd}>.md</button>
          <button className="btn" onClick={() => downloadText(`${current.title || 'document'}.html`, current.html, 'text/html')}>.html</button>
          <button className="btn" onClick={() => downloadText(`${current.title || 'document'}.txt`, editor.getText(), 'text/plain')}>.txt</button>
        </div>
        {showStats && (
          <div className="officepro-stats">
            <span>文字数（空白なし）{stats.charsNoSpace}</span>
            <span>文字数（空白込み）{stats.charsWithSpace}</span>
            <span>単語数 {stats.words}</span>
            <span>段落数 {stats.paragraphs}</span>
            <span>行数 {stats.lines}</span>
            <span>原稿用紙 {stats.pages} 枚</span>
          </div>
        )}
        <div className="officepro-page">
          <EditorContent editor={editor} className="officepro-editor" />
        </div>
        <div className="officepro-status">{stats.charsNoSpace} 文字 ・ 自動保存済み</div>
      </div>
    </div>
  )
}
