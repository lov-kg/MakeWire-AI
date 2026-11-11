import { Highlight, themes } from 'prism-react-renderer'
import { cn } from '../lib/utils'

const languageMap: Record<string, string> = {
  arduino: 'cpp',
  'esp-idf': 'cpp',
  micropython: 'python',
  python: 'python',
  'structured-text': 'clike',
  cpp: 'cpp',
  json: 'json',
}

export function CodeBlock({
  code,
  language,
  className,
}: {
  code: string
  language: string
  className?: string
}) {
  const prismLanguage = languageMap[language] ?? 'cpp'
  const lineCount = code.split('\n').length

  return (
    <div className={cn('relative overflow-hidden rounded-xl border border-white/[0.08] bg-ink-950/90', className)}>
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] bg-white/[0.02] px-4 py-2">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-rose-400/70" />
          <span className="h-2 w-2 rounded-full bg-amber-400/70" />
          <span className="h-2 w-2 rounded-full bg-mint-400/70" />
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
          {prismLanguage} · {lineCount} lines
        </span>
      </div>
      <div className="max-h-[34rem] overflow-auto">
        <Highlight theme={themes.vsDark} code={code.trimEnd()} language={prismLanguage}>
          {({ className: highlightClass, style, tokens, getLineProps, getTokenProps }) => (
            <pre
              className={cn(highlightClass, 'min-w-full py-4 font-mono text-[12px] leading-relaxed')}
              style={{ ...style, background: 'transparent', margin: 0 }}
            >
              {tokens.map((line, lineIndex) => (
                <div key={lineIndex} {...getLineProps({ line })} className="table-row">
                  <span
                    aria-hidden="true"
                    className="table-cell select-none border-r border-white/[0.05] px-3 text-right align-top text-[10px] text-slate-600"
                  >
                    {lineIndex + 1}
                  </span>
                  <span className="table-cell whitespace-pre px-4 align-top">
                    {line.map((token, tokenIndex) => (
                      <span key={tokenIndex} {...getTokenProps({ token })} />
                    ))}
                  </span>
                </div>
              ))}
            </pre>
          )}
        </Highlight>
      </div>
    </div>
  )
}
