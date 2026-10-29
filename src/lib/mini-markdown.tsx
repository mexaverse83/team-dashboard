// Tiny, safe markdown for Mona's chat bubbles and briefs (VIS-05, MOB-06):
// **bold**, *italic*, "- " / "* " / "• " bullet lists, blank-line
// paragraphs and single line breaks. Underscores are left alone on purpose
// (identifiers like west_plan must not turn italic). Output is React nodes only; there is
// no HTML parsing and no dangerouslySetInnerHTML, so model text can't inject markup.
import { Fragment, type ReactNode } from 'react'

const INLINE = /(\*\*[^*\n]+?\*\*|\*[^*\s][^*\n]*?\*)/g
const BULLET = /^\s*(?:[-*•])\s+(.*)$/
// Money amounts ($5,569 · −$105k · $1.2M) get data-money so privacy mode blurs them.
const MONEY = /[−-]?\$\s?\d[\d,]*(?:\.\d+)?\s?[kKM]?/g

/** Splits plain text so each money amount is its own blurrable span. */
export function withMoneySpans(text: string, keyPrefix = 'm'): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let n = 0
  for (const match of text.matchAll(MONEY)) {
    const start = match.index ?? 0
    if (start > last) out.push(text.slice(last, start))
    out.push(<span key={`${keyPrefix}-${n++}`} data-money>{match[0]}</span>)
    last = start + match[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out.length ? out : [text]
}

/** Inline pass: bold and italic spans inside one line. */
export function renderInline(text: string, keyPrefix = 'i'): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let n = 0
  for (const match of text.matchAll(INLINE)) {
    const token = match[0]
    const start = match.index ?? 0
    if (start > last) out.push(...withMoneySpans(text.slice(last, start), `${keyPrefix}-t${n}`))
    const key = `${keyPrefix}-${n++}`
    if (token.startsWith('**')) {
      out.push(<strong key={key} className="font-semibold">{withMoneySpans(token.slice(2, -2), key)}</strong>)
    } else {
      out.push(<em key={key}>{withMoneySpans(token.slice(1, -1), key)}</em>)
    }
    last = start + token.length
  }
  if (last < text.length) out.push(...withMoneySpans(text.slice(last), `${keyPrefix}-t${n}`))
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
