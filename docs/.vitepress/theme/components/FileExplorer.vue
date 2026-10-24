<script setup lang="ts">
import { computed } from 'vue'
import { basename, dirname } from '../playground/workspace'

interface TreeNode {
  name: string
  path: string
  type: 'file' | 'folder'
  children?: TreeNode[]
}

interface FlatNode extends TreeNode {
  depth: number
}

const props = defineProps<{
  files: Record<string, string>
  folders: string[]
  activePath: string
  expanded: string[]
}>()

const emit = defineEmits<{
  select: [path: string]
  toggle: [path: string]
  'create-file': []
  'create-folder': []
  delete: [path: string]
}>()

function addAncestors(path: string, target: Set<string>): void {
  let current = dirname(path)
  while (current) {
    target.add(current)
    current = dirname(current)
  }
}

const tree = computed<TreeNode[]>(() => {
  const folderPaths = new Set(props.folders)
  for (const folder of props.folders) addAncestors(folder, folderPaths)
  for (const file of Object.keys(props.files)) addAncestors(file, folderPaths)

  const root: TreeNode[] = []
  const folders = new Map<string, TreeNode>()

  for (const path of [...folderPaths].sort((a, b) => {
    return a.split('/').length - b.split('/').length || a.localeCompare(b)
  })) {
    const node: TreeNode = {
      name: basename(path),
      path,
      type: 'folder',
      children: []
    }
    folders.set(path, node)

    const parent = folders.get(dirname(path))
    if (parent) parent.children?.push(node)
    else root.push(node)
  }

  for (const path of Object.keys(props.files).sort()) {
    const node: TreeNode = {
      name: basename(path),
      path,
      type: 'file'
    }
    const parent = folders.get(dirname(path))
    if (parent) parent.children?.push(node)
    else root.push(node)
  }

  function sortNodes(nodes: TreeNode[]): void {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    for (const node of nodes) {
      if (node.children) sortNodes(node.children)
    }
  }

  sortNodes(root)
  return root
})

const visibleNodes = computed<FlatNode[]>(() => {
  const result: FlatNode[] = []

  function visit(nodes: TreeNode[], depth: number): void {
    for (const node of nodes) {
      result.push({ ...node, depth })
      if (node.type === 'folder' && props.expanded.includes(node.path) && node.children) {
        visit(node.children, depth + 1)
      }
    }
  }

  visit(tree.value, 0)
  return result
})

function isExpanded(path: string): boolean {
  return props.expanded.includes(path)
}

function onNodeClick(node: FlatNode): void {
  if (node.type === 'folder') emit('toggle', node.path)
  else emit('select', node.path)
}
</script>

<template>
  <aside class="gsc-explorer">
    <div class="gsc-explorer-header">
      <span>Explorer</span>
      <div class="gsc-explorer-actions">
        <button
          type="button"
          title="New file"
          aria-label="New file"
          @click="emit('create-file')"
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M3 1.5h6.5L13 5v9.5H3z" fill="none" stroke="currentColor" stroke-linejoin="round" />
            <path d="M9.5 1.5V5H13M8 8v4M6 10h4" fill="none" stroke="currentColor" stroke-linecap="round" />
          </svg>
        </button>
        <button
          type="button"
          title="New folder"
          aria-label="New folder"
          @click="emit('create-folder')"
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M1.5 3.5h4l1.5 2h7.5v8h-13z" fill="none" stroke="currentColor" stroke-linejoin="round" />
            <path d="M8 8v4M6 10h4" fill="none" stroke="currentColor" stroke-linecap="round" />
          </svg>
        </button>
        <button
          type="button"
          title="Delete current file"
          aria-label="Delete current file"
          :disabled="!activePath"
          @click="emit('delete', activePath)"
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M2.5 4.5h11M6 4.5V3h4v1.5M4 4.5l.7 9h6.6l.7-9M6.5 7v4M9.5 7v4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>
    </div>

    <div class="gsc-explorer-tree" role="tree" aria-label="Workspace files">
      <button
        v-for="node in visibleNodes"
        :key="node.path"
        type="button"
        role="treeitem"
        class="gsc-explorer-node"
        :class="{
          'is-folder': node.type === 'folder',
          'is-active': node.type === 'file' && node.path === activePath,
          'is-expanded': node.type === 'folder' && isExpanded(node.path)
        }"
        :style="{ paddingLeft: `${8 + node.depth * 14}px` }"
        :aria-expanded="node.type === 'folder' ? isExpanded(node.path) : undefined"
        :title="node.path"
        @click="onNodeClick(node)"
      >
        <svg
          v-if="node.type === 'folder'"
          class="gsc-chevron"
          viewBox="0 0 16 16"
          width="12"
          height="12"
          aria-hidden="true"
        >
          <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span v-else class="gsc-file-dot" aria-hidden="true" />
        <span class="gsc-node-name">{{ node.name }}</span>
      </button>

      <p v-if="!visibleNodes.length" class="gsc-explorer-empty">
        No files yet.
      </p>
    </div>
  </aside>
</template>

<style scoped>
.gsc-explorer {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  border-right: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
}

.gsc-explorer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 36px;
  padding: 0 6px 0 12px;
  border-bottom: 1px solid var(--vp-c-divider);
  color: var(--vp-c-text-2);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.gsc-explorer-actions {
  display: flex;
  align-items: center;
  gap: 1px;
}

.gsc-explorer-actions button {
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  border-radius: 4px;
  color: var(--vp-c-text-3);
}

.gsc-explorer-actions button:hover:not(:disabled) {
  background: var(--vp-c-default-soft);
  color: var(--vp-c-text-1);
}

.gsc-explorer-actions button:disabled {
  cursor: default;
  opacity: 0.35;
}

.gsc-explorer-tree {
  flex: 1;
  min-height: 0;
  padding: 6px 0 12px;
  overflow: auto;
}

.gsc-explorer-node {
  display: flex;
  align-items: center;
  gap: 5px;
  width: 100%;
  min-height: 26px;
  padding-top: 2px;
  padding-right: 8px;
  padding-bottom: 2px;
  color: var(--vp-c-text-2);
  font-size: 13px;
  line-height: 20px;
  text-align: left;
}

.gsc-explorer-node:hover {
  background: var(--vp-c-default-soft);
  color: var(--vp-c-text-1);
}

.gsc-explorer-node.is-active {
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
}

.gsc-chevron {
  flex: none;
  transition: transform 0.12s ease;
}

.gsc-explorer-node.is-expanded .gsc-chevron {
  transform: rotate(90deg);
}

.gsc-file-dot {
  flex: none;
  width: 5px;
  height: 5px;
  margin: 0 3.5px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.55;
}

.gsc-node-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gsc-explorer-empty {
  padding: 8px 12px;
  color: var(--vp-c-text-3);
  font-size: 12px;
}
</style>
