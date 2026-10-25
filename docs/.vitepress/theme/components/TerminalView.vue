<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useData } from 'vitepress'
import '@xterm/xterm/css/xterm.css'
import type { Terminal } from '@xterm/xterm'
import type { FitAddon } from '@xterm/addon-fit'

const { isDark } = useData()
const container = ref<HTMLDivElement | null>(null)
const terminal = ref<Terminal | null>(null)
const fitAddon = ref<FitAddon | null>(null)
let resizeObserver: ResizeObserver | undefined

const darkTheme = {
  background: '#0d1117',
  foreground: '#e6edf3',
  cursor: '#e6edf3',
  selectionBackground: '#264f78',
  black: '#484f58',
  red: '#ff7b72',
  green: '#7ee787',
  yellow: '#d29922',
  blue: '#79c0ff',
  magenta: '#d2a8ff',
  cyan: '#76e3ea',
  white: '#b1bac4',
  brightBlack: '#6e7681',
  brightRed: '#ffa198',
  brightGreen: '#aff5b4',
  brightYellow: '#e3b341',
  brightBlue: '#a5d6ff',
  brightMagenta: '#e2c5ff',
  brightCyan: '#b3f0ff',
  brightWhite: '#ffffff'
}

const lightTheme = {
  background: '#f6f8fa',
  foreground: '#24292f',
  cursor: '#24292f',
  selectionBackground: '#b6d7ff',
  black: '#24292f',
  red: '#cf222e',
  green: '#116329',
  yellow: '#7d4e00',
  blue: '#0550ae',
  magenta: '#8250df',
  cyan: '#0a5b63',
  white: '#6e7781',
  brightBlack: '#57606a',
  brightRed: '#a40e26',
  brightGreen: '#1a7f37',
  brightYellow: '#9a6700',
  brightBlue: '#0969da',
  brightMagenta: '#8250df',
  brightCyan: '#1b7c83',
  brightWhite: '#8c959f'
}

const welcome =
  '\x1b[1;36mgscvm playground\x1b[0m\r\n' +
  '\x1b[90mOpen a .gsc file and press Run. bootstrap.js runs first in a fresh VM.\x1b[0m\r\n\r\n'

function write(data: string): void {
  terminal.value?.write(data.replace(/\r?\n/g, '\r\n'))
}

function clear(): void {
  terminal.value?.clear()
}

function fit(): void {
  fitAddon.value?.fit()
}

onMounted(async () => {
  const [{ Terminal }, { FitAddon }] = await Promise.all([
    import('@xterm/xterm'),
    import('@xterm/addon-fit')
  ])

  const instance = new Terminal({
    convertEol: true,
    cursorBlink: false,
    cursorStyle: 'bar',
    disableStdin: true,
    fontFamily:
      'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
    fontSize: 13,
    lineHeight: 1.2,
    scrollback: 5000,
    theme: isDark.value ? darkTheme : lightTheme
  })

  const addon = new FitAddon()
  instance.loadAddon(addon)
  instance.open(container.value!)
  addon.fit()

  terminal.value = instance
  fitAddon.value = addon

  if (container.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => addon.fit())
    resizeObserver.observe(container.value)
  }

  instance.write(welcome)
})

watch(isDark, (dark) => {
  if (terminal.value) terminal.value.options.theme = dark ? darkTheme : lightTheme
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  terminal.value?.dispose()
  terminal.value = null
  fitAddon.value = null
})

defineExpose({
  write,
  clear,
  fit
})
</script>

<template>
  <div class="gsc-terminal">
    <div ref="container" class="gsc-terminal-container" />
  </div>
</template>

<style scoped>
.gsc-terminal {
  height: 100%;
  min-height: 0;
  padding: 8px 4px 8px 10px;
  overflow: hidden;
  background: #f6f8fa;
}

.dark .gsc-terminal {
  background: #0d1117;
}

.gsc-terminal-container {
  height: 100%;
  min-height: 0;
}

.gsc-terminal-container :deep(.xterm) {
  height: 100%;
}

.gsc-terminal-container :deep(.xterm-viewport) {
  background-color: transparent !important;
  scrollbar-width: thin;
}
</style>
