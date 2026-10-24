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
      { text: 'Reference', link: '/reference/' },
      { text: 'Examples', link: '/guide/examples' },
      { text: 'Playground', link: '/playground' },
      { text: 'Upstream', link: 'https://github.com/xensik/gsc-tool' }
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Guide',
          items: [
            { text: 'Getting started', link: '/guide/getting-started' },
            { text: 'Command line', link: '/guide/cli' },
            { text: 'Examples', link: '/guide/examples' },
            { text: 'WebAssembly', link: '/guide/wasm' }
          ]
        }
      ],
      '/reference/': [
        {
          text: 'Runtime',
          items: [
            { text: 'Overview', link: '/reference/' },
            { text: 'Architecture', link: '/reference/architecture' },
            { text: 'Embedding', link: '/reference/embedding' },
            { text: 'Extending the VM', link: '/reference/extending-vm' },
            { text: 'Native functions', link: '/reference/native-functions' }
          ]
        },
        {
          text: 'Security patterns',
          items: [
            { text: 'Filesystem sandbox', link: '/reference/filesystem' }
          ]
        },
        {
          text: 'Behaviour and internals',
          items: [
            { text: 'Engine compatibility', link: '/reference/compatibility' },
            { text: 'Opcodes', link: '/reference/opcodes' },
            { text: 'Upstream changes', link: '/reference/upstream-changes' }
          ]
        },
        {
          text: 'Project',
          items: [
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
