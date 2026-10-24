<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useData } from 'vitepress'
import { escapeHtml, highlightCode } from '../playground/highlight'

const props = defineProps<{
  modelValue: string
  path: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  run: []
}>()

const { isDark } = useData()
const input = ref<HTMLTextAreaElement | null>(null)
const highlight = ref<HTMLPreElement | null>(null)
const gutter = ref<HTMLDivElement | null>(null)
const scrollTop = ref(0)
const highlighted = ref('')
const language = computed(() => (props.path.toLowerCase().endsWith('.md') ? 'markdown' : 'gsc'))
const lineCount = computed(() => props.modelValue.split('\n').length)
const rendered = computed(() => highlighted.value || escapeHtml(props.modelValue))

let highlightTimer: ReturnType<typeof setTimeout> | undefined
let renderId = 0

function syncScroll(): void {
  const element = input.value
  if (!element) return

  scrollTop.value = element.scrollTop

  if (highlight.value) {
    highlight.value.scrollTop = element.scrollTop
    highlight.value.scrollLeft = element.scrollLeft
  }

  if (gutter.value) {
    gutter.value.style.transform = `translateY(-${element.scrollTop}px)`
  }
}

async function renderHighlight(): Promise<void> {
  const id = ++renderId
  let html: string
  try {
    html = await highlightCode(props.modelValue, language.value, isDark.value)
  } catch {
    html = escapeHtml(props.modelValue)
  }
  if (id !== renderId) return

  highlighted.value = html
  await nextTick()
  syncScroll()
}

function scheduleHighlight(): void {
  clearTimeout(highlightTimer)
  highlightTimer = setTimeout(() => {
    void renderHighlight()
  }, 40)
}

function setValueAndSelection(next: string, start: number, end = start): void {
  emit('update:modelValue', next)
  void nextTick(() => {
    const element = input.value
    if (!element) return
    element.selectionStart = start
    element.selectionEnd = end
    syncScroll()
    scheduleHighlight()
  })
}

function onInput(event: Event): void {
  const target = event.target as HTMLTextAreaElement
  emit('update:modelValue', target.value)
  scheduleHighlight()
}

function indent(): void {
  const element = input.value
  if (!element) return

  const value = props.modelValue
  const start = element.selectionStart
  const end = element.selectionEnd
  const lineStart = value.lastIndexOf('\n', start - 1) + 1
  const selected = value.slice(start, end)

  if (!selected.includes('\n')) {
    setValueAndSelection(
      value.slice(0, start) + '\t' + value.slice(end),
      start + 1
    )
    return
  }

  const block = value.slice(lineStart, end)
  const lines = block.split('\n')
  const nextBlock = lines.map((line) => `\t${line}`).join('\n')
  const next = value.slice(0, lineStart) + nextBlock + value.slice(end)
  setValueAndSelection(next, start + 1, end + lines.length)
}

function outdent(): void {
  const element = input.value
  if (!element) return

  const value = props.modelValue
  const start = element.selectionStart
  const end = element.selectionEnd
  const lineStart = value.lastIndexOf('\n', start - 1) + 1
  const lineEnd = value.indexOf('\n', end)
  const blockEnd = lineEnd === -1 ? value.length : lineEnd
  const block = value.slice(lineStart, blockEnd)

  let removed = 0
  const nextBlock = block
    .split('\n')
    .map((line) => {
      if (line.startsWith('\t')) {
        removed += 1
        return line.slice(1)
      }
      if (line.startsWith('    ')) {
        removed += 4
        return line.slice(4)
      }
      return line
    })
    .join('\n')

  if (!removed) return

  const next = value.slice(0, lineStart) + nextBlock + value.slice(blockEnd)
  setValueAndSelection(
    next,
    Math.max(lineStart, start - Math.min(1, removed)),
    Math.max(lineStart, end - removed)
  )
}

function onKeydown(event: KeyboardEvent): void {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault()
    emit('run')
    return
  }

  if (event.key === 'Tab') {
    event.preventDefault()
    if (event.shiftKey) outdent()
    else indent()
    return
  }

  if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.metaKey) {
    return
  }

  const element = input.value
  if (!element) return

  event.preventDefault()
  const value = props.modelValue
  const start = element.selectionStart
  const end = element.selectionEnd
  const lineStart = value.lastIndexOf('\n', start - 1) + 1
  const line = value.slice(lineStart, start)
  const lineIndent = line.match(/^[\t ]*/)?.[0] ?? ''
  const before = value.slice(0, start).trimEnd()
  let insertion = `\n${lineIndent}`
  if (before.endsWith('{')) insertion += '\t'

  const next = value.slice(0, start) + insertion + value.slice(end)
  setValueAndSelection(next, start + insertion.length)
}

watch(() => props.modelValue, scheduleHighlight)
watch(() => props.path, scheduleHighlight)
watch(isDark, scheduleHighlight)

onMounted(() => {
  void renderHighlight()
})

onBeforeUnmount(() => {
  clearTimeout(highlightTimer)
})

defineExpose({
  focus: () => input.value?.focus(),
  syncScroll
})
</script>

<template>
  <div class="gsc-editor" :class="{ 'is-dark': isDark }">
    <div class="gsc-editor-gutter" aria-hidden="true">
      <div ref="gutter" class="gsc-editor-lines">
        <div
          v-for="line in lineCount"
          :key="line"
          class="gsc-editor-line"
        >
          {{ line }}
        </div>
      </div>
    </div>

    <div class="gsc-editor-scroll">
      <pre
        ref="highlight"
        class="gsc-editor-highlight"
        aria-hidden="true"
      ><code v-html="rendered"></code></pre>
      <textarea
        ref="input"
        class="gsc-editor-input"
        :value="modelValue"
        :aria-label="`Editor for ${path}`"
        autocomplete="off"
        autocapitalize="off"
        autocorrect="off"
        spellcheck="false"
        wrap="off"
        @input="onInput"
        @keydown="onKeydown"
        @scroll="syncScroll"
      />
    </div>
  </div>
</template>

<style scoped>
.gsc-editor {
  --editor-font: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
  --editor-font-size: 13px;
  --editor-line-height: 1.6;
  --editor-padding-y: 14px;
  --editor-padding-x: 16px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--vp-c-bg-alt);
  color: var(--vp-c-text-1);
}

.gsc-editor.is-dark {
  background: #0d1117;
}

.gsc-editor-gutter {
  overflow: hidden;
  border-right: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
  user-select: none;
}

.gsc-editor.is-dark .gsc-editor-gutter {
  border-color: #30363d;
  background: #010409;
}

.gsc-editor-lines {
  padding: var(--editor-padding-y) 10px var(--editor-padding-y) 12px;
  color: var(--vp-c-text-3);
  font-family: var(--editor-font);
  font-size: var(--editor-font-size);
  line-height: var(--editor-line-height);
  text-align: right;
  will-change: transform;
}

.gsc-editor-line {
  line-height: var(--editor-line-height);
}

.gsc-editor-scroll {
  position: relative;
  min-width: 0;
  min-height: 0;
}

.gsc-editor-highlight,
.gsc-editor-input {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  margin: 0;
  border: 0;
  padding: var(--editor-padding-y) var(--editor-padding-x);
  overflow: auto;
  font-family: var(--editor-font);
  font-size: var(--editor-font-size);
  font-variant-ligatures: none;
  line-height: var(--editor-line-height);
  tab-size: 4;
  white-space: pre;
}

.gsc-editor-highlight {
  z-index: 0;
  color: var(--vp-c-text-1);
  pointer-events: none;
  scrollbar-width: none;
}

.gsc-editor-highlight::-webkit-scrollbar {
  display: none;
}

.gsc-editor-highlight code {
  font: inherit;
  white-space: inherit;
}

.gsc-editor-input {
  z-index: 1;
  resize: none;
  outline: none;
  background: transparent;
  color: transparent;
  -webkit-text-fill-color: transparent;
  caret-color: var(--vp-c-text-1);
}

.gsc-editor.is-dark .gsc-editor-input {
  caret-color: #e6edf3;
}

.gsc-editor-input::selection {
  background: rgb(64 120 242 / 35%);
}
</style>
