export interface WorkspaceState {
  files: Record<string, string>
  folders: string[]
  activePath: string
  expanded: string[]
}

export const BOOTSTRAP_PATH = 'bootstrap.js'

const mainSource = `#include helpers\\math;

main()
{
	println( "gscvm playground" );
	println( "add(20, 22) = &&1", add( 20, 22 ) );
	println( "jsadd(20, 22) = &&1", jsadd( 20, 22 ) );

	values = array( 3, 5, 8 );
	println( "sum = &&1", sum( values ) );

	return add( 20, 22 );
}
`

const mathSource = `add( a, b )
{
	return a + b;
}

sum( values )
{
	total = 0;
	foreach ( index, value in values )
		total += value;
	return total;
}
`

const threadsSource = `main()
{
	level.worker_result = 0;
	thread worker();

	wait 0.05;
	level notify( "work", 6, 7 );
	wait 0.05;

	println( "worker result = &&1", level.worker_result );
	return level.worker_result;
}

worker()
{
	level waittill( "work", a, b );
	level.worker_result = a * b;
}
`

const readmeSource = `# gscvm playground

This workspace is stored in your browser with IndexedDB. Reloading the page
keeps your files, folders and open tab.

- Select a \`.gsc\` or \`.csc\` file and press Run (Ctrl/Cmd+Enter).
- Every run creates a fresh WebAssembly VM and injects the virtual workspace.
- \`bootstrap.js\` runs before the focused script on every run. Use it to
  register JavaScript natives and bind host services such as \`level\`.
- The example bootstrap adds \`jsadd\` and \`browser::storage\` (localStorage).
- Native callbacks are synchronous. Prefetch asynchronous data in the bootstrap
  function, then register a native that returns the cached value.
- The terminal is read-only and supports ANSI colors and control sequences.
- \`#include\` paths are resolved from the virtual filesystem.

Try \`scripts/main.gsc\`, \`scripts/threads.gsc\` or edit \`bootstrap.js\`.
`

const bootstrapSource = `async function bootstrap({ vm }) {
	vm.registerNative( 'jsadd', ( ctx, a, b ) => a + b );

	vm.registerNative( 'browser', 'storage', ( ctx, key, value ) => {
		if ( value === undefined || value === null )
			return localStorage.getItem( String( key ) ) ?? undefined;

		localStorage.setItem( String( key ), String( value ) );
		return value;
	} );
}
`

export const DEFAULT_WORKSPACE: WorkspaceState = {
  files: {
    [BOOTSTRAP_PATH]: bootstrapSource,
    'scripts/main.gsc': mainSource,
    'scripts/helpers/math.gsc': mathSource,
    'scripts/threads.gsc': threadsSource,
    'README.md': readmeSource
  },
  folders: ['scripts', 'scripts/helpers'],
  activePath: 'scripts/main.gsc',
  expanded: ['scripts', 'scripts/helpers']
}

export function normalizePath(input: string): string {
  const parts = input.replace(/\\/g, '/').split('/')
  const normalized: string[] = []

  for (const part of parts) {
    if (!part || part === '.') continue
    if (part === '..') return ''
    normalized.push(part)
  }

  return normalized.join('/')
}

export function dirname(path: string): string {
  const index = path.lastIndexOf('/')
  return index === -1 ? '' : path.slice(0, index)
}

export function basename(path: string): string {
  const index = path.lastIndexOf('/')
  return index === -1 ? path : path.slice(index + 1)
}

export function withoutExtension(path: string): string {
  return path.replace(/\.(gsc|csc|gsh|gscc|bin)$/i, '')
}

export function isRunnable(path: string): boolean {
  return /\.(gsc|csc)$/i.test(path)
}

export function isFolder(path: string, folders: string[]): boolean {
  return folders.includes(path)
}

export function ancestorFolders(path: string): string[] {
  const result: string[] = []
  let current = dirname(path)
  while (current) {
    result.unshift(current)
    current = dirname(current)
  }
  return result
}

export function cloneWorkspace(state: WorkspaceState): WorkspaceState {
  return {
    files: { ...state.files },
    folders: [...state.folders],
    activePath: state.activePath,
    expanded: [...state.expanded]
  }
}

export function sanitizeWorkspace(value: unknown): WorkspaceState | null {
  if (!value || typeof value !== 'object') return null

  const candidate = value as Partial<WorkspaceState>
  if (!candidate.files || typeof candidate.files !== 'object' || Array.isArray(candidate.files)) {
    return null
  }

  const files: Record<string, string> = {}
  for (const [path, content] of Object.entries(candidate.files)) {
    const normalized = normalizePath(path)
    if (normalized && typeof content === 'string') files[normalized] = content
  }

  const folders = new Set<string>()
  if (Array.isArray(candidate.folders)) {
    for (const folder of candidate.folders) {
      const normalized = normalizePath(String(folder))
      if (normalized) {
        for (const ancestor of ancestorFolders(normalized)) folders.add(ancestor)
        folders.add(normalized)
      }
    }
  }

  for (const path of Object.keys(files)) {
    for (const ancestor of ancestorFolders(path)) folders.add(ancestor)
  }

  const paths = Object.keys(files).sort()
  const requestedActive =
    typeof candidate.activePath === 'string' ? normalizePath(candidate.activePath) : ''
  const activePath =
    requestedActive && Object.prototype.hasOwnProperty.call(files, requestedActive)
      ? requestedActive
      : paths[0] ?? ''

  const expanded = new Set<string>()
  if (Array.isArray(candidate.expanded)) {
    for (const path of candidate.expanded) {
      const normalized = normalizePath(String(path))
      if (normalized && folders.has(normalized)) expanded.add(normalized)
    }
  }

  for (const folder of ancestorFolders(activePath)) expanded.add(folder)

  return {
    files,
    folders: [...folders].sort(),
    activePath,
    expanded: [...expanded].sort()
  }
}
