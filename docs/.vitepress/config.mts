import { defineConfig } from 'vitepress'
import gscGrammar from './languages/gsc.tmLanguage.json'

export default defineConfig({
  title: 'gscvm',
  description: 'Experimental T6 GSC bytecode virtual machine',
  base: process.env.VITEPRESS_BASE || '/',
  cleanUrls: true,
  lastUpdated: true,
  markdown: {
    languages: [gscGrammar]
  },
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Compatibility', link: '/guide/compatibility' },
      { text: 'Reference', link: '/reference/architecture' },
      { text: 'Examples', link: '/guide/examples' },
      { text: 'Upstream', link: 'https://github.com/xensik/gsc-tool' }
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Guide',
          items: [
            { text: 'Getting started', link: '/guide/getting-started' },
            { text: 'Engine compatibility', link: '/guide/compatibility' },
            { text: 'Command line', link: '/guide/cli' },
            { text: 'Examples', link: '/guide/examples' },
            { text: 'Embedding', link: '/guide/embedding' },
            { text: 'Extensibility', link: '/guide/extensibility' },
            { text: 'Native bindings', link: '/guide/native-bindings' },
            { text: 'WebAssembly', link: '/guide/wasm' }
          ]
        }
      ],
      '/reference/': [
        {
          text: 'Reference',
          items: [
            { text: 'Architecture', link: '/reference/architecture' },
            { text: 'Opcodes', link: '/reference/opcodes' },
            { text: 'Upstream changes', link: '/reference/upstream-changes' },
            { text: 'License and attribution', link: '/license' }
          ]
        }
      ]
    },
    outline: {
      level: [2, 3]
    },
    footer: {
      message: 'Experimental software created entirely by artificial intelligence.',
      copyright: 'GPL-3.0-only. Upstream portions retain their original licenses.'
    },
    docFooter: {
      prev: 'Previous',
      next: 'Next'
    }
  }
})
