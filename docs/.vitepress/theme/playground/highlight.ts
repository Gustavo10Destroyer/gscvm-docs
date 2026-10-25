import type { Highlighter } from 'shiki'
import gscGrammar from '../../languages/gsc.tmLanguage.json'

let highlighterPromise: Promise<Highlighter> | null = null

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      const { createHighlighter } = await import('shiki')
      return createHighlighter({
        themes: ['github-dark', 'github-light'],
        langs: [gscGrammar, 'markdown', 'javascript']
      })
    })()
  }

  return highlighterPromise
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function highlightCode(
  code: string,
  language: string,
  dark: boolean
): Promise<string> {
  const highlighter = await getHighlighter()
  try {
    return highlighter.codeToHtml(code, {
      lang: language,
      theme: dark ? 'github-dark' : 'github-light',
      structure: 'inline'
    })
  } catch {
    return escapeHtml(code)
  }
}
