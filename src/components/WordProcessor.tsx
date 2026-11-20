import { useMemo, useRef, useState } from 'react'
import { marked } from 'marked'
import { downloadText, printHtml } from '../lib/files'

const SAMPLE = `# UniversalOffice へようこそ

これは **Markdown** で書けるワードプロセッサです。

## できること

- Markdown の編集とプレビュー
- .md ファイルの読み込み・保存
- PDF 出力（印刷画面から PDF として保存）

> まずはこの文章を書き換えてみてください。
`

export default function WordProcessor() {
  const [text, setText] = useState(SAMPLE)
  const [filename, setFilename] = useState('document.md')
  const fileRef = useRef<HTMLInputElement>(null)

  const html = useMemo(() => marked.parse(text) as string, [text])
  const chars = text.length
  const lines = text.split('\n').length

  const openFile = async (file: File) => {
    setText(await file.text())
    setFilename(file.name)
  }

  return (
    <section>
      <div className="toolbar">
        <button onClick={() => { setText(''); setFilename('document.md') }}>新規</button>
        <button onClick={() => fileRef.current?.click()}>開く (.md / .txt)</button>
        <input
          ref={fileRef}
          type="file"
          accept=".md,.markdown,.txt,text/plain,text/markdown"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void openFile(f)
            e.target.value = ''
          }}
        />
        <button onClick={() => downloadText(filename || 'document.md', text, 'text/markdown;charset=utf-8')}>
          保存 (.md)
        </button>
        <button onClick={() => printHtml(filename.replace(/\.md$/i, ''), html)}>PDF出力（印刷）</button>
        <label className="filename">
          ファイル名
          <input value={filename} onChange={(e) => setFilename(e.target.value)} />
        </label>
        <span className="meta">{lines} 行 / {chars} 文字</span>
      </div>
      <div className="word-grid">
        <textarea
          className="editor"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Markdown で書いてください"
          spellCheck={false}
        />
        <article className="preview" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </section>
  )
}
