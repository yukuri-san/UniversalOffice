export function downloadText(filename: string, text: string, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function printHtml(title: string, bodyHtml: string) {
  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:sans-serif;line-height:1.7;padding:24px;color:#111}table{border-collapse:collapse}td,th{border:1px solid #999;padding:6px 10px}pre{white-space:pre-wrap}</style>
</head><body>${bodyHtml}</body></html>`)
  win.document.close()
  win.focus()
  win.print()
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
