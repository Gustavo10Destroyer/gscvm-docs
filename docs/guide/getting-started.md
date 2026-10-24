# Getting started

gscvm is a C++20 project built with CMake. The native build produces a static
library, a command-line runner, the upstream compiler/disassembler and a Catch2
test binary.

## Requirements

- CMake 3.20 or newer
- A C++20 compiler (GCC 14 needs the upstream compatibility workaround already
  applied by the build)
- Git, for the upstream submodule and its dependencies
- Emscripten, only for the browser target

## Clone and build

From a checkout of the repository:

```sh
git submodule update --init --recursive
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j
```

The upstream `gsc-tool` checkout is a pinned submodule. The build generates a
patched copy of the upstream disassembler for `OP_ProfileStart` without modifying
the submodule. See [Upstream changes](/reference/upstream-changes).

The main outputs are:

| Path | Purpose |
| --- | --- |
| `build/libgscvm.a` | VM library |
| `build/gscvm` | Command-line runner |
| `build/gsc-tool` | Upstream compiler/disassembler for fixtures |
| `build/gscvm-tests` | Catch2 test binary |

## Run a script

```sh
./build/gscvm examples/basics.gsc
./build/gscvm examples/threads.gsc
./build/gscvm examples/include.gsc
```

Source scripts are compiled automatically. The runner calls `main` unless a
different exported function is named:

```sh
./build/gscvm examples/basics.gsc add 3 4
```

Inspect a script without running it:

```sh
./build/gscvm --info examples/basics.gsc
./build/gscvm --list examples/basics.gsc
./build/gscvm --disasm examples/basics.gsc
```

See [Command line](/guide/cli) for all options and exit codes.

## Run the tests

```sh
ctest --test-dir build --output-on-failure
./build/gscvm-tests "[gscvm]"
```

The full CTest suite includes the upstream decompiler/recompiler corpus and can
take several minutes. The `[gscvm]` tag runs only the VM tests.

## Browser build

```sh
source ~/emsdk/emsdk_env.sh
emcmake cmake -S . -B build-wasm -DGSCVM_BUILD_WASM=ON -DCMAKE_BUILD_TYPE=Release
cmake --build build-wasm -j
```

This produces `build-wasm/gscvm.js` and `build-wasm/gscvm.wasm`. See
[WebAssembly](/guide/wasm).

## Next steps

- [Command line](/guide/cli)
- [Examples](/guide/examples)
- [Embedding](/reference/embedding)
- [Extending the VM](/reference/extending-vm)
- [Native functions](/reference/native-functions)
- [Filesystem sandbox](/reference/filesystem)
- [Architecture](/reference/architecture)
- [Engine compatibility](/reference/compatibility)
