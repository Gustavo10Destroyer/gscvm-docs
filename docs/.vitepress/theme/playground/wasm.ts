import { withBase } from 'vitepress'
import { isRunnable, withoutExtension, type WorkspaceState } from './workspace'

interface GscvmModule {
  _gscvm_init: () => number
  _gscvm_shutdown: () => void
  _gscvm_last_error: () => number
  _gscvm_free: (pointer: number) => void
  ccall: (name: string, returnType: string, argumentTypes: string[], arguments_: unknown[]) => number
  UTF8ToString: (pointer: number) => string
}

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
        locateFile: (path: string) => withBase(`/playground/${path}`),
        print: (message: string) => console.log(message),
        printErr: (message: string) => console.error(message)
      })
    })()
  }

  return modulePromise
}

function callString(
  module: GscvmModule,
  name: string,
  argumentTypes: string[],
  arguments_: unknown[]
): string | null {
  const pointer = module.ccall(name, 'number', argumentTypes, arguments_)
  if (!pointer) return null

  try {
    return module.UTF8ToString(pointer)
  } finally {
    module._gscvm_free(pointer)
  }
}

function parseJson<T>(value: string | null): T | null {
  if (!value) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function lastError(module: GscvmModule): string {
  const pointer = module._gscvm_last_error()
  return pointer ? module.UTF8ToString(pointer) : 'unknown WebAssembly error'
}

export async function runWorkspace(
  workspace: WorkspaceState,
  path: string
): Promise<RunResult> {
  if (!isRunnable(path)) {
    return { output: '', error: 'Open a .gsc or .csc file to run it.' }
  }

  const module = await getModule()
  if (module._gscvm_init() !== 1) {
    return { output: '', error: lastError(module) }
  }

  let output = ''
  let error: string | undefined
  let result: RunResult['result']

  try {
    module.ccall('gscvm_set_instruction_limit', 'number', ['number'], [2_000_000])

    for (const file of Object.keys(workspace.files).sort()) {
      const added = module.ccall(
        'gscvm_add_source',
        'number',
        ['string', 'string'],
        [file, workspace.files[file] ?? '']
      )
      if (added !== 1) {
        throw new Error(`could not inject ${file}: ${lastError(module)}`)
      }
    }

    const moduleName = withoutExtension(path)
    const loaded = parseJson<{ ok: boolean; error?: string }>(
      callString(module, 'gscvm_load_file', ['string', 'string'], [path, moduleName])
    )
    if (!loaded?.ok) {
      error = loaded?.error ?? 'could not load script'
    } else {
      const dependencies = parseJson<{ ok: boolean; error?: string }>(
        callString(module, 'gscvm_load_dependencies', ['string'], [moduleName])
      )
      if (!dependencies?.ok) {
        error = dependencies?.error ?? 'could not load dependencies'
      } else {
        const call = parseJson<{
          ok: boolean
          error?: string
          result?: RunResult['result']
        }>(callString(module, 'gscvm_call', ['string', 'string'], [moduleName, 'main']))
        if (!call?.ok) {
          error = call?.error ?? 'script failed'
        } else {
          result = call.result
        }
      }
    }
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught)
  } finally {
    output = callString(module, 'gscvm_take_output', [], []) ?? ''
    module._gscvm_shutdown()
  }

  return { output, error, result }
}
