// Tiny, safe markdown for Mona's chat bubbles and briefs (VIS-05, MOB-06):
// **bold**, *italic*, "- " / "* " / "• " bullet lists, blank-line
// paragraphs and single line breaks. Underscores are left alone on purpose
// (identifiers like west_plan must not turn italic). Output is React nodes only; there is
// no HTML parsing and no dangerouslySetInnerHTML, so model text can't inject markup.
import { Fragment, type ReactNode } from 'react'

const INLINE = /(\*\*[^*\n]+?\*\*|\*[^*\s][^*\n]*?\*)/g
const BULLET = /^\s*(?:[-*•])\s+(.*)$/

/** Inline pass: bold and italic spans inside one line. */
export function renderInline(text: string, keyPrefix = 'i'): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let n = 0
  for (const match of text.matchAll(INLINE)) {
    const token = match[0]
    const start = match.index ?? 0
    if (start > last) out.push(text.slice(last, start))
    const key = `${keyPrefix}-${n++}`
    if (token.startsWith('**')) {
      out.push(<strong key={key} className="font-semibold">{token.slice(2, -2)}</strong>)
    } else {
      out.push(<em key={key}>{token.slice(1, -1)}</em>)
    }
    last = start + token.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

type Block = { kind: 'p'; lines: string[] } | { kind: 'ul'; items: string[] }

function toBlocks(text: string): Block[] {
  const blocks: Block[] = []
  for (const rawLine of text.replace(/\r\n?/g, '\n').split('\n')) {
    const bullet = BULLET.exec(rawLine)
    const current = blocks[blocks.length - 1]
    if (bullet) {
      if (current?.kind === 'ul') current.items.push(bullet[1])
      else blocks.push({ kind: 'ul', items: [bullet[1]] })
    } else if (rawLine.trim() === '') {
      if (current && !(current.kind === 'p' && current.lines.length === 0)) blocks.push({ kind: 'p', lines: [] })
    } else if (current?.kind === 'p') {
      current.lines.push(rawLine.trim())
    } else {
      blocks.push({ kind: 'p', lines: [rawLine.trim()] })
    }
  }
  return blocks.filter(b => (b.kind === 'p' ? b.lines.length > 0 : b.items.length > 0))
}

/** Block pass: paragraphs, bullet lists and line breaks as React nodes. */
export function renderMiniMarkdown(text: string | null | undefined): ReactNode {
  if (!text) return null
  const blocks = toBlocks(String(text))
  return blocks.map((block, bi) => {
    if (block.kind === 'ul') {
      return (
        <ul key={`b${bi}`} className="my-1 list-disc space-y-0.5 pl-5">
          {block.items.map((item, ii) => <li key={ii}>{renderInline(item, `b${bi}-${ii}`)}</li>)}
        </ul>
      )
    }
    return (
      <p key={`b${bi}`} className={bi > 0 ? 'mt-2' : undefined}>
        {block.lines.map((line, li) => (
          <Fragment key={li}>
            {li > 0 && <br />}
            {renderInline(line, `b${bi}-${li}`)}
          </Fragment>
        ))}
      </p>
    )
  })
}

export function MiniMarkdown({ text, className }: { text: string | null | undefined; className?: string }) {
  return <div className={className}>{renderMiniMarkdown(text)}</div>
}
