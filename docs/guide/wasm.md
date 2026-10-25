# WebAssembly

The browser target is a separate Emscripten build. It produces a modularized
`gscvm.js` loader and `gscvm.wasm`. It is static-hosting friendly: no backend,
pthreads, COOP/COEP headers or WebAssembly threads are required.

Try the [playground](/playground) for a local, file-based environment that runs
entirely in your browser.

## Build

```sh
source ~/emsdk/emsdk_env.sh
emcmake cmake -S . -B build-wasm -DGSCVM_BUILD_WASM=ON -DCMAKE_BUILD_TYPE=Release
cmake --build build-wasm -j
```

The native CLI and tests are disabled in this configuration. Copy
`build-wasm/gscvm.js` and `build-wasm/gscvm.wasm` next to your application, and
copy the ES module SDK from `sdk/gscvm.mjs` (with `sdk/gscvm.d.ts` for
TypeScript) next to it.

## JavaScript SDK

The SDK wraps the C API, value marshalling, JavaScript natives, host callbacks,
cooperative threads, inspection and debugging. It is an ES module.

### Browser

Load the Emscripten loader as a classic script, then import the SDK:

```html
<script src="gscvm.js"></script>
<script type="module">
import { createVM } from './gscvm.mjs';

const vm = await createVM({
  moduleOptions: {
    locateFile: (file) => `./${file}`
  }
});

vm.registerNative('jsadd', (ctx, a, b) => a + b);
vm.loadSource('main', `
main() {
  println("hello &&1", 42);
  return jsadd(20, 22);
}
`);

const result = vm.call('main', 'main');
console.log(result.toJS());   // 42
console.log(vm.takeOutput()); // "hello 42\n"
vm.close();
</script>
```

### Node.js

The Emscripten loader is CommonJS, while the SDK is ESM:

```js
import { createRequire } from 'node:module';
import { createVM } from './sdk/gscvm.mjs';

const require = createRequire(import.meta.url);
const factory = require('./build-wasm/gscvm.js');

const vm = await createVM({ factory });
```

You can also create the Emscripten module yourself and pass it as `module`.

### Configuration

```js
const vm = await createVM({
  factory,
  config: {
    instance: 'server',
    executionMode: 'tick_based',
    tickRate: 20,
    realTime: false,
    instructionLimit: 2_000_000,
    maxCallDepth: 512,
    maxStackSize: 65_536,
    maxThreads: 256,
    executeDevblocks: false,
    t6Fixup: false,
    searchPaths: ['scripts']
  }
});
```

Configuration can be changed after creation with `setInstance()`,
`setExecutionMode()`, `setTickRate()`, `setInstructionLimit()`,
`setMaxCallDepth()`, `setMaxStackSize()`, `setMaxThreads()` and related setters.

### Files and modules

```js
vm.addSource('scripts/helper.gsc', 'helper_value() { return 77; }');
vm.addSource('scripts/main.gsc', '#include helper; main() { return helper_value(); }');
vm.addSearchPath('scripts');

vm.loadFile('scripts/main.gsc', 'main');
vm.loadDependencies('main');
```

`loadSource(name, text)` compiles source text directly. `addFile()` and
`loadModule()` accept a string, `ArrayBuffer` or typed array. Use
`listFiles()`, `readFile()`, `removeFile()`, `clearFiles()`, `resolvePath()` and
`modules()` for the in-memory file and module lifecycle.

### Calls and threads

`call()` runs the entry thread and every spawned thread to completion. For
cooperative control use explicit scheduling:

```js
const thread = vm.start('main', 'worker');

vm.runUntilIdle();
vm.notify('wake');
vm.runUntilComplete();

console.log(thread.status());
console.log(thread.info());
console.log(thread.result().toJS());
```

`notify(event, ...args)` dispatches to the level object.
`notifyTarget(target, event, ...args)` accepts any GSC or JavaScript value as
the target.

### JavaScript natives

```js
vm.registerNative('math', 'clamp', (ctx, value, low, high) =>
  Math.min(Math.max(value, low), high)
);

vm.registerNative('make_pair', (ctx, left, right) => ({
  left,
  right,
  label: 'pair'
}));
```

The callback receives a `NativeContext` followed by the script arguments.
`ctx.space`, `ctx.name`, `ctx.threadId`, `ctx.self`, `ctx.argumentCount` and
`ctx.arg(index)` describe the call. Use `ctx.error('message')` to raise a
script-visible runtime error. Callbacks must be synchronous.

### Host services

```js
const host = {
  log(level, message) {
    console.log(`[${level}] ${message}`);
  },
  dvar(name) {
    return name === 'scr_xscale' ? 1.5 : undefined;
  },
  level() {
    return { name: 'level', wave: 3 };
  },
  createObject(className) {
    return { class: className };
  }
};

const vm = await createVM({ factory, host });
```

Host objects are bridged through JavaScript so GSC field reads and writes reach
the original object. `Map`, `Set`, arrays and plain objects are supported.
Missing host dvars fall back to the VM's local dvar table, which `setDvar()`
updates.

### Playground bootstrap

The [playground](/playground) runs a user-editable `bootstrap.js` before every
script execution. Each run creates a fresh VM, injects the virtual workspace,
runs the bootstrap, then loads and executes the selected `.gsc`/`.csc` file. The
bootstrap file must define a function named `bootstrap`:

```js
async function bootstrap({ vm, host, gscvm }) {
  // vm: the fresh GscVM
  // host: mutable host services passed to createVM()
  // gscvm: the SDK module namespace
}
```

The function may be asynchronous, which is useful for prefetching data before
registering synchronous natives. Browser globals such as `fetch`,
`localStorage`, `XMLHttpRequest` and `console` are available. Imports and
exports are not supported inside `bootstrap.js`; use the `gscvm` argument to
access SDK helpers. The bootstrap runs after workspace files are added but
before the entry module is loaded.

#### Registering natives

```js
async function bootstrap({ vm }) {
  vm.registerNative('jsadd', (_ctx, a, b) => a + b);

  vm.registerNative('math', 'clamp', (_ctx, value, low, high) =>
    Math.min(Math.max(value, low), high)
  );
}
```

```gsc
main()
{
	println( "jsadd = &&1", jsadd( 20, 22 ) );
	println( "clamp = &&1", math::clamp( 12, 0, 10 ) );
}
```

Native callbacks must be synchronous. If data comes from an asynchronous API,
fetch it in the bootstrap function and return the cached value from the native.

Namespaced natives are called as `space::name`. The T6 compiler records the
space as an include, but `loadDependencies()` recognizes registered native
spaces, so a missing `space.gsc` module is not treated as an error.

Including a native space makes its natives available unqualified. If several
included spaces define the same name, the first include wins; use `space::name`
to select an exact native.

#### Browser APIs and host objects

Use `host` to bind browser state to GSC objects:

```js
async function bootstrap({ host }) {
  host.level = () => ({
    name: 'playground',
    time: Date.now()
  });

  host.dvar = (name) => (name === 'scr_xscale' ? 1.5 : undefined);

  host.createObject = (className) => ({ class: className });
}
```

```gsc
main()
{
	println( "level = &&1", level.name );
	println( "scale = &&1", getdvar( "scr_xscale" ) );
}
```

Host objects are live bridges: reads and writes made from GSC reach the original
JavaScript object. `Map`, `Set`, arrays and plain objects are supported.

#### localStorage

```js
async function bootstrap({ vm }) {
  vm.registerNative('browser', 'storage', (_ctx, key, value) => {
    if (value === undefined || value === null) {
      return localStorage.getItem(String(key)) ?? undefined;
    }

    localStorage.setItem(String(key), String(value));
    return value;
  });
}
```

```gsc
main()
{
	browser::storage( "score", 42 );
	return browser::storage( "score" );
}
```

#### Networking

For a non-blocking page, prefetch in the async bootstrap and expose the cached
result through a synchronous native:

```js
async function bootstrap({ vm }) {
  const response = await fetch('https://example.com/data.json');
  if (!response.ok) throw new Error(`request failed: ${response.status}`);
  const data = await response.json();

  vm.registerNative('net', 'cached', () => data);
}
```

If a request must happen during script execution, synchronous `XMLHttpRequest`
is the only option because native callbacks cannot await:

```js
async function bootstrap({ vm }) {
  vm.registerNative('net', 'get', (_ctx, url) => {
    const request = new XMLHttpRequest();
    request.open('GET', String(url), false);
    request.send();
    if (request.status < 200 || request.status >= 300) {
      throw new Error(`request failed: ${request.status}`);
    }
    return request.responseText;
  });
}
```

Synchronous requests block the page and are deprecated; prefer prefetching in
the bootstrap function.

### Values

`GscValue` exposes `type`, `display`, the tagged `raw` wire value and `toJS()`.
Arrays, objects, vectors, functions, threads and cycles are converted
automatically. Special scalar kinds use tagged objects such as
`{ $gsc: 'vector', x, y, z }` and `{ $gsc: 'istring', value }`.

```js
const value = vm.call('main', 'main');
console.log(value.type, value.display, value.toJS());

vm.setGlobal('config', { mode: 'test', values: [1, 2, 3] });
console.log(vm.getGlobal('config').toJS());

const level = vm.object('level');
console.log(vm.objectKeys('level'));
console.log(vm.objectGetField('level', 'wave').toJS());
```

## Playground workflow

The playground uses the SDK to create a fresh VM for every run:

1. Create a VM from the cached Emscripten module with `createVM()`. The host is
   a proxy whose handlers the bootstrap can populate.
2. Inject workspace sources with `addSource(path, text)`. Paths use forward
   slashes. `bootstrap.js` is not injected as a GSC source.
3. Execute `bootstrap.js` with `{ vm, host, gscvm }`. It can register natives,
   change VM configuration, bind host objects or prefetch data.
4. Load the selected entry file with `loadFile(path, name)`, then call
   `loadDependencies(name)` for `#include` support.
5. Execute with `call(module, 'main')` and read console output with
   `takeOutput()`.
6. Close the VM with `close()`. The Emscripten module is reused, but VM state,
   natives, host bindings and output are fresh for each run.

```js
const host = createHostProxy();
const vm = await createVM({
  module,
  host,
  config: { instructionLimit: 2_000_000 }
});

for (const [path, source] of Object.entries(files)) {
  if (path !== 'bootstrap.js') vm.addSource(path, source);
}

await bootstrap({ vm, host, gscvm });

vm.loadFile(entryPath, moduleName);
vm.loadDependencies(moduleName);
const result = vm.call(moduleName, 'main');

console.log(vm.takeOutput());
console.log(result.type, result.display);
vm.close();
```

For cooperative scheduling outside the playground, use `start()` with
`tick()`/`runUntilIdle()`/`runUntilComplete()` and `notify()` as described in
[Calls and threads](#calls-and-threads).

## Inspection and debugging

| Function | Result |
| --- | --- |
| `gscvm_threads()` | All threads, including terminal threads. |
| `gscvm_thread_info(id)` | Status, wait state, result/error, frames, locals, varargs and stack. |
| `gscvm_globals()` | `level`, `game`, `world`, `classes` and `anim` as nested value trees. |
| `gscvm_memory_stats()` | Module/function/instruction counts, threads, frames, arrays, objects, values and estimated bytes. |
| `gscvm_memory_blocks(previewBytes)` | Logical memory regions with hex previews. |
| `gscvm_modules()`, `gscvm_disassembly(name)`, `gscvm_module_bytes(name)` | Loaded module metadata, disassembly and bytecode hex. |
| `gscvm_set_breakpoint(module, function, pc)` | Zero-based instruction breakpoint. |
| `gscvm_clear_breakpoints()`, `gscvm_breakpoints()` | Manage breakpoints. |
| `gscvm_debug_state()` | Paused thread, module, function, pc, offset, opcode and breakpoints. |
| `gscvm_step()`, `gscvm_resume()`, `gscvm_pause()` | Instruction stepping, resume and pause request. |

Raw pointers are deliberately not exposed because WebAssembly linear-memory
addresses are not stable after growth.

```js
vm.setDebugEnabled(true);
vm.setBreakpoint('main', 'worker', 0);
const thread = vm.start('main', 'worker');
vm.runUntilIdle();
console.log(vm.debugState());
vm.step();
vm.resume();
```

## C API summary

Lifecycle and configuration:

- `gscvm_init()`, `gscvm_init_ex(configJson)`, `gscvm_shutdown()`
- `gscvm_set_instance(client)`, `gscvm_set_real_time(enabled)`
- `gscvm_set_tick_rate(hz)`
- `gscvm_set_execution_mode(mode)` (`0` real-time, `1` tick-based)
- `gscvm_set_instruction_limit(limit)`, `gscvm_set_max_call_depth(depth)`
- `gscvm_set_max_stack_size(size)`, `gscvm_set_max_threads(count)`
- `gscvm_set_execute_devblocks(enabled)`, `gscvm_set_t6_fixup(enabled)`
- `gscvm_set_debug_enabled(enabled)`

Files and loading:

- `gscvm_add_search_path(path)`, `gscvm_clear_search_paths()`
- `gscvm_add_file(path, ptr, size)`, `gscvm_add_source(path, text)`
- `gscvm_remove_file(path)`, `gscvm_clear_files()`, `gscvm_list_files()`
- `gscvm_read_file(path)`, `gscvm_resolve_path(path)`
- `gscvm_load_file(path, name)`, `gscvm_load_source(name, text)`
- `gscvm_load_module(name, ptr, size)`, `gscvm_load_dependencies(module)`
- `gscvm_has_module(name)`, `gscvm_module_info(name)`, `gscvm_modules()`

Execution:

- `gscvm_call(module, function)`, `gscvm_call_values(module, function, argsJson)`
- `gscvm_start(module, function)`, `gscvm_start_values(...)`
- `gscvm_tick(delta)`, `gscvm_run_until_idle()`, `gscvm_run_until_complete()`
- `gscvm_notify(event)`, `gscvm_notify_values(targetJson, event, argsJson)`
- `gscvm_thread_status(id)`, `gscvm_thread_result_values(id)`, `gscvm_thread_info(id)`

Natives and host services:

- `gscvm_register_js_native(space, name, callbackId)`
- `gscvm_unregister_native(space, name)`, `gscvm_has_native(space, name)`
- `gscvm_set_js_host(hostId)`, `gscvm_set_dvar(name, valueJson)`

State and diagnostics:

- `gscvm_globals()`, `gscvm_get_global(name)`, `gscvm_set_global(name, valueJson)`
- `gscvm_object(kind)`, `gscvm_object_get_field(...)`, `gscvm_object_set_field(...)`
- `gscvm_object_get_index(...)`, `gscvm_object_set_index(...)`, `gscvm_object_keys(kind)`
- `gscvm_inspect_value(valueJson, depth, items)`
- `gscvm_take_output()`, `gscvm_last_error()`, `gscvm_free(ptr)`

The raw C API uses UTF-8 strings and JSON results. Functions that return `char*`
allocate memory owned by the caller; release it with `gscvm_free(ptr)`. Use
`Module.stringToUTF8`/`Module.lengthBytesUTF8` to create input strings and
`Module.UTF8ToString` to read results. For most integrations, prefer the SDK.
