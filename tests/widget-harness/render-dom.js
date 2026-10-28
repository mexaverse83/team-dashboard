// Browser-only: turns a mock Scriptable widget tree into flexbox DOM so the
// preview script can screenshot it (spec W §8). Approximates SwiftUI:
// a flexible spacer makes its stack take the full extent of its axis, and
// that demand propagates up through every ancestor stack.

function hasFlexSpacer(node) {
  return (node.children || []).some(c => c.kind === 'spacer' && c.length == null)
}
function wants(node, axis) {
  if (node.kind !== 'stack' && node.kind !== 'widget') return false
  if (node.size && (axis === 'h' ? node.size.width : node.size.height)) return false
  if (node.dir === axis && hasFlexSpacer(node)) return true
  return (node.children || []).some(c => c.kind === 'stack' && wants(c, axis))
}

export function renderWidget(widget, root, { family, dark }) {
  const cssOf = c => (c && c.css ? c.css() : undefined)
  const fontCss = f => `${f.weight} ${f.size}px ${f.mono ? 'ui-monospace, monospace' : f.rounded ? '"SF Pro Rounded", Inter, system-ui, sans-serif' : '-apple-system, "SF Pro Text", Inter, Arial, sans-serif'}`
  const accessory = String(family).startsWith('accessory')

  function build(node, parentDir) {
    const el = document.createElement('div')
    if (node.kind === 'spacer') {
      el.className = 'sp'
      if (node.length == null) el.style.flex = '1 1 0'
      else { el.style.flex = '0 0 auto'; el.style[parentDir === 'v' ? 'height' : 'width'] = node.length + 'px' }
      return el
    }
    if (node.kind === 'text') {
      el.className = 'tx'
      el.textContent = node.text
      el.style.font = fontCss(node.font)
      if (node.font.rounded) el.style.fontFeatureSettings = '"tnum" 1'
      el.style.letterSpacing = node.font.size >= 20 ? '-0.02em' : '0'
      el.style.color = cssOf(node.textColor) || (dark || accessory ? '#fff' : '#000')
      el.style.opacity = node.textOpacity
      el.style.textAlign = node.textAlign
      el.dataset.msf = node.minimumScaleFactor
      el.dataset.base = node.font.size
      el.dataset.size = node.font.size
      if (node.lineLimit === 1) { el.style.whiteSpace = 'pre'; el.style.overflow = 'hidden'; el.style.textOverflow = 'ellipsis' } else if (node.lineLimit > 1) {
        el.style.display = '-webkit-box'
        el.style.webkitBoxOrient = 'vertical'
        el.style.webkitLineClamp = node.lineLimit
        el.style.overflow = 'hidden'
      }
      el.style.minWidth = '0'
      el.style.flexShrink = '1'
      el.style.lineHeight = '1.2'
      if (parentDir === 'v') el.style.maxWidth = '100%'
      return el
    }
    if (node.kind === 'image') {
      const img = document.createElement('img')
      img.src = node.image.src
      const sz = node.imageSize || node.image.size
      img.style.width = sz.width + 'px'
      img.style.height = sz.height + 'px'
      img.style.flex = '0 0 auto'
      if (parentDir === 'v') img.style.alignSelf = node.align === 'center' ? 'center' : node.align === 'right' ? 'flex-end' : 'flex-start'
      return img
    }
    el.className = node.kind
    el.style.display = 'flex'
    el.style.flexDirection = node.dir === 'v' ? 'column' : 'row'
    const [t, l, b, r] = node.pad
    el.style.padding = `${t}px ${r}px ${b}px ${l}px`
    el.style.boxSizing = 'border-box'
    el.style.minWidth = '0'
    if (node.spacing) el.style.gap = node.spacing + 'px'
    el.style.alignItems = node.dir === 'h' ? { top: 'flex-start', center: 'center', bottom: 'flex-end' }[node.align] : 'flex-start'
    if (node.kind === 'widget') el.style.justifyContent = 'center'
    if (node.backgroundColor) el.style.background = cssOf(node.backgroundColor)
    if (node.cornerRadius) el.style.borderRadius = node.cornerRadius + 'px'
    if (node.size) {
      if (node.size.width) { el.style.width = node.size.width + 'px'; el.style.flex = '0 0 auto' }
      if (node.size.height) el.style.height = node.size.height + 'px'
      el.style.overflow = 'hidden'
    }
    if (node.url) { el.dataset.url = node.url; el.classList.add('tap') }
    if (node.kind === 'stack') {
      const growW = wants(node, 'h'), growH = wants(node, 'v')
      if (parentDir === 'v') {
        if (growW) el.style.alignSelf = 'stretch'
        if (growH) el.style.flex = '1 1 0'
      } else {
        if (growW) el.style.flex = '1 1 0'
        else if (!node.size) el.style.flexShrink = '1'
        if (growH) el.style.alignSelf = 'stretch'
      }
    }
    node.children.forEach(ch => el.appendChild(build(ch, node.dir)))
    return el
  }

  const tree = build(widget, 'v')
  tree.style.width = '100%'
  tree.style.height = '100%'
  tree.style.overflow = 'hidden'
  tree.style.borderRadius = getComputedStyle(root).borderRadius
  if (accessory && widget.addAccessoryWidgetBackground) tree.style.background = 'rgba(255,255,255,0.16)'
  if (widget.url) tree.dataset.url = widget.url
  root.appendChild(tree)

  root.querySelectorAll('.tx').forEach(t => {
    const msf = Number(t.dataset.msf), base = Number(t.dataset.base)
    let s = 1
    while (s > msf && (t.scrollWidth > t.clientWidth + 0.5 || t.scrollHeight > t.clientHeight + 0.5)) {
      s -= 0.02
      t.style.fontSize = (base * s) + 'px'
    }
  })

  const box = root.getBoundingClientRect()
  const clipped = [...root.querySelectorAll('.tx,img')].filter(e => {
    const r = e.getBoundingClientRect()
    const out = r.bottom > box.bottom + 0.5 || r.right > box.right + 0.5 || r.top < box.top - 0.5 || r.left < box.left - 0.5
    const overflow = e.classList.contains('tx') && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1)
    return out || overflow
  }).map(e => e.textContent || 'img')
  const sizes = [...root.querySelectorAll('.tx')].map(e => Number(e.dataset.size))
  return {
    clipped,
    taps: [...root.querySelectorAll('[data-url]')].map(e => e.dataset.url),
    refreshAfter: widget.refreshAfterDate ? widget.refreshAfterDate.toISOString() : null,
    minFont: sizes.length ? Math.min(...sizes) : null,
  }
}
