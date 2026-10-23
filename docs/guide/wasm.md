# WebAssembly

The browser target is a separate Emscripten build. It produces a modularized
`gscvm.js` loader and `gscvm.wasm`. It is static-hosting friendly: no backend,
pthreads, COOP/COEP headers or WebAssembly threads are required.

## Build

```sh
source ~/emsdk/emsdk_env.sh
emcmake cmake -S . -B build-wasm -DGSCVM_BUILD_WASM=ON -DCMAKE_BUILD_TYPE=Release
cmake --build build-wasm -j
```

The native CLI and tests are disabled in this configuration. Copy
`build-wasm/gscvm.js` and `build-wasm/gscvm.wasm` next to the playground.

## Initialize

```html
<script src="gscvm.js"></script>
<script>
const Module = await createGscvmModule();
Module._gscvm_init(); // 1 on success, 0 on failure
</script>
```

The C API uses UTF-8 strings and JSON results. Functions that return `char*`
allocate memory owned by the caller; release it with `Module._gscvm_free(ptr)`.
Use `Module.stringToUTF8`/`Module.lengthBytesUTF8` to create input strings and
`Module.UTF8ToString` to read results.

```js
function callJson(name, argTypes, args) {
  const ptr = Module.ccall(name, 'number', argTypes, args);
  if (!ptr) return null;
  const text = Module.UTF8ToString(ptr);
  Module._gscvm_free(ptr);
  return JSON.parse(text);
}

const loaded = callJson('gscvm_load_source', ['string', 'string'], [
  'scripts/main.gsc',
  source
]);
callJson('gscvm_load_dependencies', ['string'], ['main']);
const run = callJson('gscvm_start', ['string', 'string'], ['main', 'main']);
```

## Playground workflow

1. Add source or bytecode with `gscvm_add_source(path, text)` or
   `gscvm_add_file(path, ptr, size)`. Paths use forward slashes.
2. Add virtual search paths with `gscvm_add_search_path(path)`.
   `gscvm_clear_search_paths()` removes them. `gscvm_resolve_path(path)` returns
   the canonical virtual path or null and understands extensionless requests.
3. Load an entry file with `gscvm_load_file(path, name)`, or load bytes directly
   with `gscvm_load_module(name, ptr, size)`. Call
   `gscvm_load_dependencies(name)` before executing scripts that use
   `#include`/`#using`.
4. Execute with `gscvm_call(module, function)` for a complete run, or
   `gscvm_start` plus `gscvm_run_until_idle`/`gscvm_tick`/`gscvm_notify` for
   cooperative control. `gscvm_set_execution_mode(1)` selects fixed-step tick
   mode; `gscvm_set_tick_rate` changes the rate.
5. Read console output with `gscvm_take_output()`.

The default WASM configuration uses virtual time (`real_time = false`). Drive
paced execution from `requestAnimationFrame` with `gscvm_tick(delta)` rather
than enabling wall-clock sleeps in the browser.

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

## C API summary

Lifecycle and configuration:

- `gscvm_init()`, `gscvm_shutdown()`
- `gscvm_set_real_time(enabled)`
- `gscvm_set_tick_rate(hz)`
- `gscvm_set_execution_mode(mode)` (`0` real-time, `1` tick-based)
- `gscvm_set_instruction_limit(limit)`

Files and loading:

- `gscvm_add_search_path(path)`, `gscvm_clear_search_paths()`
- `gscvm_add_file(path, ptr, size)`, `gscvm_add_source(path, text)`
- `gscvm_remove_file(path)`, `gscvm_clear_files()`, `gscvm_list_files()`
- `gscvm_resolve_path(path)`
- `gscvm_load_file(path, name)`, `gscvm_load_source(name, text)`
- `gscvm_load_module(name, ptr, size)`, `gscvm_load_dependencies(module)`

Execution:

- `gscvm_call(module, function)`
- `gscvm_start(module, function)`
- `gscvm_tick(delta)`, `gscvm_run_until_idle()`, `gscvm_run_until_complete()`
- `gscvm_notify(event)` (dispatches to the level object without arguments)

Diagnostics:

- `gscvm_take_output()`, `gscvm_last_error()`, `gscvm_free(ptr)`

`gscvm_start` returns a thread id; `gscvm_notify` currently notifies the level
object only. Use the C++ API when a native needs custom event targets or
arguments.
