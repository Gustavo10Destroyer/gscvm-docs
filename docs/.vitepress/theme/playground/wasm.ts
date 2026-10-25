import { withBase } from 'vitepress'
import * as gscvm from './sdk/gscvm.mjs'
import { createVM, type GscVM, type GscvmModule, type Host } from './sdk/gscvm.mjs'
import {
  BOOTSTRAP_PATH,
  isRunnable,
  withoutExtension,
  type WorkspaceState
} from './workspace'

interface GscvmFactory {
  (options?: Record<string, unknown>): Promise<GscvmModule>
}

declare global {
  interface Window {
    createGscvmModule?: GscvmFactory
  }
}

export interface RunResult {
  output: string
  error?: string
  result?: {
    type: string
    value: string
  }
}

interface BootstrapContext {
  vm: GscVM
  host: Host
  gscvm: typeof gscvm
}

type BootstrapFunction = (context: BootstrapContext) => unknown

let factoryPromise: Promise<GscvmFactory> | null = null
let modulePromise: Promise<GscvmModule> | null = null

function loadFactory(): Promise<GscvmFactory> {
  if (window.createGscvmModule) {
    return Promise.resolve(window.createGscvmModule)
  }

  if (!factoryPromise) {
    factoryPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = withBase('/playground/gscvm.js')
      script.async = true
      script.onload = () => {
        if (window.createGscvmModule) {
          resolve(window.createGscvmModule)
        } else {
          reject(new Error('gscvm.js loaded without createGscvmModule'))
        }
      }
      script.onerror = () => reject(new Error('could not load playground/gscvm.js'))
      document.head.appendChild(script)
    })
  }

  return factoryPromise
}

async function getModule(): Promise<GscvmModule> {
  if (!modulePromise) {
    modulePromise = (async () => {
      const factory = await loadFactory()
      return factory({
        locateFile: (path: string) => withBase(`/playground/${path}`)
      })
    })()
  }

  return modulePromise
}

function createHostProxy(handlers: Record<string, unknown>): Host {
  return new Proxy(handlers, {
    get(target, property) {
      return target[property as string]
    },
    set(target, property, value) {
      target[property as string] = value
      return true
    },
    has(target, property) {
      return property in target
    },
    deleteProperty(target, property) {
      delete target[property as string]
      return true
    }
  }) as Host
}

function compileBootstrap(source: string): BootstrapFunction | null {
  if (!source.trim()) return null

  const factory = new Function(
    'gscvm',
    `"use strict";\n${source}\n;return typeof bootstrap === "function" ? bootstrap : undefined;`
  ) as (module: typeof gscvm) => unknown

  const bootstrap = factory(gscvm)
  if (bootstrap === undefined) return null
  if (typeof bootstrap !== 'function') {
    throw new Error(`${BOOTSTRAP_PATH} must define a bootstrap function`)
  }

  return bootstrap as BootstrapFunction
}

export async function runWorkspace(
  workspace: WorkspaceState,
  path: string
): Promise<RunResult> {
  if (!isRunnable(path)) {
    return { output: '', error: 'Open a .gsc or .csc file to run it.' }
  }

  const module = await getModule()
  const host = createHostProxy({})
  let vm: GscVM | undefined
  let output = ''
  let error: string | undefined
  let result: RunResult['result']

  try {
    vm = await createVM({
      module,
      host,
      config: {
        instructionLimit: 2_000_000
      }
    })

    for (const file of Object.keys(workspace.files).sort()) {
      if (file === BOOTSTRAP_PATH) continue
      if (!vm.addSource(file, workspace.files[file] ?? '')) {
        throw new Error(`could not inject ${file}: ${vm.lastError()}`)
      }
    }

    const bootstrap = compileBootstrap(workspace.files[BOOTSTRAP_PATH] ?? '')
    if (bootstrap) await bootstrap({ vm, host, gscvm })

    const moduleName = withoutExtension(path)
    vm.loadFile(path, moduleName)
    vm.loadDependencies(moduleName)

    const value = vm.call(moduleName, 'main')
    result = {
      type: value.type,
      value: value.display
    }
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught)
  } finally {
    if (vm) {
      try {
        output = vm.takeOutput()
      } finally {
        vm.close()
      }
    }
  }

  return { output, error, result }
}
