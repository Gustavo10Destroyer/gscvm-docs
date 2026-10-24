<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import CodeEditor from './CodeEditor.vue'
import FileExplorer from './FileExplorer.vue'
import TerminalView from './TerminalView.vue'
import { loadWorkspace, saveWorkspace } from '../playground/db'
import { runWorkspace } from '../playground/wasm'
import {
  ancestorFolders,
  basename,
  cloneWorkspace,
  DEFAULT_WORKSPACE,
  dirname,
  isRunnable,
  normalizePath,
  sanitizeWorkspace,
  type WorkspaceState
} from '../playground/workspace'

const workspace = ref<WorkspaceState>(cloneWorkspace(DEFAULT_WORKSPACE))
const loaded = ref(false)
const isRunning = ref(false)
const explorerOpen = ref(false)
const saveState = ref<'saved' | 'saving' | 'error'>('saved')
const terminal = ref<{
  write: (data: string) => void
  clear: () => void
  fit: () => void
} | null>(null)
const editor = ref<{
  focus: () => void
  syncScroll: () => void
} | null>(null)

let saveTimer: ReturnType<typeof setTimeout> | undefined
let saveSequence = 0

const activeContent = computed(() => workspace.value.files[workspace.value.activePath] ?? '')
const activeRunnable = computed(
  () => !!workspace.value.activePath && isRunnable(workspace.value.activePath)
)
const activeFileName = computed(() => basename(workspace.value.activePath) || 'No file')
const activeDir = computed(() => dirname(workspace.value.activePath))
const fileCount = computed(() => Object.keys(workspace.value.files).length)
const lineCount = computed(() => (activeContent.value ? activeContent.value.split('\n').length : 0))
const saveLabel = computed(() => {
  if (saveState.value === 'saving') return 'Saving...'
  if (saveState.value === 'error') return 'Save failed'
  return 'Saved'
})

async function persist(): Promise<void> {
  const sequence = ++saveSequence
  saveState.value = 'saving'
  try {
    await saveWorkspace(cloneWorkspace(workspace.value))
    if (sequence === saveSequence) saveState.value = 'saved'
  } catch {
    if (sequence === saveSequence) saveState.value = 'error'
  }
}

function scheduleSave(): void {
  if (!loaded.value) return
  saveState.value = 'saving'
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    void persist()
  }, 250)
}

watch(workspace, scheduleSave, { deep: true })

function writeTerminal(data: string): void {
  terminal.value?.write(data)
}

function terminalError(message: string): void {
  writeTerminal(`\n\x1b[31m${message}\x1b[0m\n`)
}

function ensureFolders(path: string): void {
  for (const folder of ancestorFolders(path)) {
    if (!workspace.value.folders.includes(folder)) workspace.value.folders.push(folder)
  }
}

function expandPath(path: string): void {
  for (const folder of ancestorFolders(path)) {
    if (!workspace.value.expanded.includes(folder)) workspace.value.expanded.push(folder)
  }
}

function selectFile(path: string): void {
  if (!Object.prototype.hasOwnProperty.call(workspace.value.files, path)) return
  workspace.value.activePath = path
  expandPath(path)
  if (window.matchMedia('(max-width: 640px)').matches) explorerOpen.value = false
  void nextTick(() => {
    editor.value?.syncScroll()
    editor.value?.focus()
  })
}

function toggleFolder(path: string): void {
  const index = workspace.value.expanded.indexOf(path)
  if (index === -1) workspace.value.expanded.push(path)
  else workspace.value.expanded.splice(index, 1)
}

function updateContent(value: string): void {
  const path = workspace.value.activePath
  if (!path) return
  workspace.value.files[path] = value
}

function uniqueFilePath(base: string): string {
  const exists = (path: string) =>
    Object.prototype.hasOwnProperty.call(workspace.value.files, path) ||
    workspace.value.folders.includes(path)
  if (!exists(base)) return base

  const folder = dirname(base)
  const name = basename(base)
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const extension = dot > 0 ? name.slice(dot) : ''

  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${folder ? `${folder}/` : ''}${stem}-${index}${extension}`
    if (!exists(candidate)) return candidate
  }

  return base
}

function createFile(): void {
  const folder = workspace.value.activePath
    ? dirname(workspace.value.activePath)
    : 'scripts'
  const base = folder ? `${folder}/new.gsc` : 'new.gsc'
  const answer = window.prompt('New file path', uniqueFilePath(base))
  if (answer === null) return

  const path = normalizePath(answer)
  if (!path) {
    terminalError('Invalid file path.')
    return
  }
  if (
    Object.prototype.hasOwnProperty.call(workspace.value.files, path) ||
    workspace.value.folders.includes(path)
  ) {
    terminalError(`"${path}" already exists.`)
    return
  }

  ensureFolders(path)
  workspace.value.files[path] = ''
  selectFile(path)
}

function createFolder(): void {
  const folder = workspace.value.activePath
    ? dirname(workspace.value.activePath)
    : 'scripts'
  const base = folder ? `${folder}/new-folder` : 'new-folder'
  const answer = window.prompt('New folder path', base)
  if (answer === null) return

  const path = normalizePath(answer)
  if (!path) {
    terminalError('Invalid folder path.')
    return
  }
  if (
    Object.prototype.hasOwnProperty.call(workspace.value.files, path) ||
    workspace.value.folders.includes(path)
  ) {
    terminalError(`"${path}" already exists.`)
    return
  }

  ensureFolders(path)
  workspace.value.folders.push(path)
  workspace.value.expanded.push(path)
}

function deleteFile(path: string): void {
  if (!path || !Object.prototype.hasOwnProperty.call(workspace.value.files, path)) return
  if (!window.confirm(`Delete ${path}?`)) return

  delete workspace.value.files[path]
  if (workspace.value.activePath === path) {
    workspace.value.activePath = Object.keys(workspace.value.files).sort()[0] ?? ''
  }
}

function clearTerminal(): void {
  terminal.value?.clear()
}

async function run(): Promise<void> {
  if (isRunning.value) return
  if (!activeRunnable.value) {
    terminalError('Open a .gsc or .csc file to run.')
    return
  }

  isRunning.value = true
  const path = workspace.value.activePath
  terminal.value?.clear()
  writeTerminal(`\x1b[90m$ run ${path}\x1b[0m\n\n`)

  try {
    const result = await runWorkspace(cloneWorkspace(workspace.value), path)
    if (result.output) {
      writeTerminal(result.output)
      if (!result.output.endsWith('\n')) writeTerminal('\n')
    }

    if (result.error) {
      writeTerminal(`\x1b[31m${result.error}\x1b[0m\n`)
    } else if (result.result) {
      writeTerminal(`\x1b[32m${result.result.type}: ${result.result.value}\x1b[0m\n`)
    } else {
      writeTerminal('\x1b[90m[finished]\x1b[0m\n')
    }
  } catch (error) {
    writeTerminal(`\x1b[31m${error instanceof Error ? error.message : String(error)}\x1b[0m\n`)
  } finally {
    isRunning.value = false
    await nextTick()
    terminal.value?.fit()
  }
}

onMounted(async () => {
  const stored = await loadWorkspace()
  const sanitized = stored ? sanitizeWorkspace(stored) : null
  workspace.value = sanitized ?? cloneWorkspace(DEFAULT_WORKSPACE)
  loaded.value = true
  await nextTick()
  editor.value?.syncScroll()
})

onBeforeUnmount(() => {
  clearTimeout(saveTimer)
  if (loaded.value) void saveWorkspace(cloneWorkspace(workspace.value))
})
</script>

<template>
  <div class="gsc-playground">
    <header class="gsc-playground-header">
      <div class="gsc-playground-title">
        <button
          type="button"
          class="gsc-explorer-toggle"
          :aria-expanded="explorerOpen"
          aria-label="Toggle file explorer"
          @click="explorerOpen = !explorerOpen"
        >
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.4" />
          </svg>
        </button>
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
          <rect x="2.5" y="3.5" width="15" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.4" />
          <path d="M6 8l2.2 2L6 12M10.5 12h3.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.4" />
        </svg>
        <span>Playground</span>
      </div>

      <div class="gsc-playground-actions">
        <span class="gsc-save-state" :class="`is-${saveState}`">{{ saveLabel }}</span>
        <button
          type="button"
          class="gsc-run"
          :disabled="!activeRunnable || isRunning"
          @click="run"
        >
          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
            <path d="M4 2.5l9 5.5-9 5.5z" fill="currentColor" />
          </svg>
          <span>{{ isRunning ? 'Running...' : 'Run' }}</span>
          <kbd>Ctrl ↵</kbd>
        </button>
      </div>
    </header>

    <div class="gsc-playground-body">
      <div class="gsc-explorer-shell" :class="{ 'is-open': explorerOpen }">
        <FileExplorer
          :files="workspace.files"
          :folders="workspace.folders"
          :active-path="workspace.activePath"
          :expanded="workspace.expanded"
          @select="selectFile"
          @toggle="toggleFolder"
          @create-file="createFile"
          @create-folder="createFolder"
          @delete="deleteFile"
        />
      </div>
      <div
        v-if="explorerOpen"
        class="gsc-explorer-backdrop"
        @click="explorerOpen = false"
      />

      <main class="gsc-playground-main">
        <div class="gsc-tabbar">
          <div v-if="workspace.activePath" class="gsc-tab">
            <span class="gsc-tab-dot" aria-hidden="true" />
            <span class="gsc-tab-name">{{ activeFileName }}</span>
            <span v-if="activeDir" class="gsc-tab-dir">{{ activeDir }}</span>
          </div>
          <span v-else class="gsc-tab-name">No file open</span>
          <span class="gsc-tab-meta">
            {{ fileCount }} {{ fileCount === 1 ? 'file' : 'files' }}
            <template v-if="lineCount"> · {{ lineCount }} lines</template>
          </span>
        </div>

        <div class="gsc-editor-pane">
          <CodeEditor
            v-if="loaded && workspace.activePath"
            ref="editor"
            :model-value="activeContent"
            :path="workspace.activePath"
            @update:model-value="updateContent"
            @run="run"
          />
          <div v-else class="gsc-empty">
            {{ loaded ? 'Create a file to get started.' : 'Loading workspace...' }}
          </div>
        </div>

        <section class="gsc-terminal-pane">
          <div class="gsc-terminal-header">
            <span>Terminal</span>
            <button type="button" @click="clearTerminal">Clear</button>
          </div>
          <div class="gsc-terminal-body">
            <TerminalView ref="terminal" />
          </div>
        </section>
      </main>
    </div>
  </div>
</template>

<style scoped>
.gsc-playground {
  position: relative;
  display: flex;
  flex-direction: column;
  height: calc(100vh - var(--vp-nav-height));
  min-height: 560px;
  overflow: hidden;
  background: var(--vp-c-bg);
}

.gsc-playground-header {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  height: 48px;
  padding: 0 12px 0 16px;
  border-bottom: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
}

.gsc-playground-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--vp-c-text-1);
  font-size: 14px;
  font-weight: 600;
}

.gsc-playground-title svg {
  color: var(--vp-c-brand-1);
}

.gsc-explorer-toggle {
  display: none;
  width: 24px;
  height: 24px;
  margin-left: -4px;
  place-items: center;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--vp-c-text-2);
  cursor: pointer;
}

.gsc-explorer-toggle:hover {
  background: var(--vp-c-default-soft);
  color: var(--vp-c-text-1);
}

.gsc-playground-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.gsc-save-state {
  color: var(--vp-c-text-3);
  font-size: 12px;
}

.gsc-save-state.is-error {
  color: var(--vp-c-danger-1);
}

.gsc-run {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 30px;
  padding: 0 9px 0 10px;
  border: 0;
  border-radius: 6px;
  background: var(--vp-c-brand-1);
  color: #fff;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
}

.gsc-run:hover:not(:disabled) {
  background: var(--vp-c-brand-2);
}

.gsc-run:disabled {
  cursor: default;
  opacity: 0.5;
}

.gsc-run kbd {
  padding: 1px 4px;
  border: 1px solid rgb(255 255 255 / 35%);
  border-radius: 3px;
  color: rgb(255 255 255 / 85%);
  font-family: inherit;
  font-size: 10px;
  font-weight: 500;
}

.gsc-playground-body {
  display: grid;
  flex: 1;
  grid-template-columns: 220px minmax(0, 1fr);
  min-height: 0;
}

.gsc-explorer-shell {
  display: flex;
  min-width: 0;
  min-height: 0;
}

.gsc-explorer-shell :deep(.gsc-explorer) {
  flex: 1;
}

.gsc-explorer-backdrop {
  display: none;
}

.gsc-playground-main {
  display: grid;
  grid-template-rows: 34px minmax(0, 1fr) minmax(160px, 30%);
  min-width: 0;
  min-height: 0;
}

.gsc-tabbar {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 0 12px;
  border-bottom: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
}

.gsc-tab {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  color: var(--vp-c-text-1);
  font-size: 12px;
}

.gsc-tab-dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--vp-c-brand-1);
}

.gsc-tab-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gsc-tab-dir {
  overflow: hidden;
  color: var(--vp-c-text-3);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gsc-tab-meta {
  flex: none;
  margin-left: auto;
  color: var(--vp-c-text-3);
  font-size: 11px;
  white-space: nowrap;
}

.gsc-editor-pane {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.gsc-empty {
  display: grid;
  height: 100%;
  place-items: center;
  color: var(--vp-c-text-3);
  font-size: 13px;
}

.gsc-terminal-pane {
  display: grid;
  grid-template-rows: 30px minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  border-top: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-alt);
}

.gsc-terminal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px 0 12px;
  border-bottom: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-2);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.gsc-terminal-header button {
  padding: 2px 6px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--vp-c-text-3);
  cursor: pointer;
  font-family: inherit;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: normal;
  text-transform: none;
}

.gsc-terminal-header button:hover {
  background: var(--vp-c-default-soft);
  color: var(--vp-c-text-1);
}

.gsc-terminal-body {
  min-height: 0;
  overflow: hidden;
}

@media (max-width: 640px) {
  .gsc-playground {
    height: calc(100vh - var(--vp-nav-height));
    min-height: 480px;
  }

  .gsc-playground-body {
    grid-template-columns: minmax(0, 1fr);
  }

  .gsc-explorer-toggle {
    display: grid;
  }

  .gsc-explorer-shell {
    position: absolute;
    z-index: 30;
    top: 48px;
    bottom: 0;
    left: 0;
    width: min(260px, 82vw);
    visibility: hidden;
    transform: translateX(-100%);
    transition:
      transform 0.18s ease,
      visibility 0.18s ease;
  }

  .gsc-explorer-shell.is-open {
    visibility: visible;
    transform: translateX(0);
    box-shadow: 0 12px 32px rgb(0 0 0 / 18%);
  }

  .gsc-explorer-backdrop {
    position: absolute;
    z-index: 20;
    inset: 48px 0 0;
    display: block;
    background: rgb(0 0 0 / 25%);
  }

  .gsc-playground-actions {
    gap: 8px;
  }

  .gsc-save-state {
    display: none;
  }

  .gsc-run kbd {
    display: none;
  }

  .gsc-tab-dir {
    display: none;
  }
}
</style>
