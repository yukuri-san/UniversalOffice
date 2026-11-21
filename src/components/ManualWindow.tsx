import { marked } from 'marked'
import manualText from '../../MANUAL.md?raw'
import { useMemo } from 'react'

export default function ManualWindow() {
  const html = useMemo(() => marked.parse(manualText as string) as string, [])
  return (
    <div className="docs-window">
      <div className="docs-body" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}
