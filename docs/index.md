---
layout: home

hero:
  name: gscvm
  text: T6 GSC bytecode VM
  tagline: A headless C++20 interpreter and cooperative scheduler for Black Ops II GSC.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Architecture
      link: /reference/architecture
    - theme: alt
      text: Upstream gsc-tool
      link: https://github.com/xensik/gsc-tool

features:
  - title: T6 bytecode runtime
    details: Loads source or compiled T6 scripts, reuses the upstream decoder and implements all 125 opcodes with explicit coverage.
  - title: Cooperative scheduling
    details: Threads, waits, events, endon/notify, deadlock diagnostics, instruction budgets and fixed-step or real-time scheduling.
  - title: Headless by design
    details: Game services come from a Host implementation. The VM never invents engine behaviour, and engine entities are not ported.
  - title: Native C++ bindings
    details: Per-VM native registry, typed argument access, custom objects, structured error context and a configurable filesystem sandbox example.
  - title: Browser target
    details: Emscripten build with virtual files, JSON inspection, memory statistics and instruction-level breakpoints.
  - title: Debuggable
    details: Thread, frame, local, global and memory inspection with module/function/instruction breakpoints.
---

## Experimental warning

::: danger Experimental software, created entirely by artificial intelligence
gscvm is not affiliated with, endorsed by, or supported by Activision, Treyarch,
xensik, or the upstream `gsc-tool` maintainers. Expect incomplete engine
compatibility and undocumented edge cases. It is provided without warranty under
the GNU GPLv3. Do not use it where failure or data loss would be unacceptable.
:::

## What gscvm is

gscvm is a standalone VM for **T6 GSC bytecode**. It reuses the T6 reader,
disassembler, compiler and opcode tables from
[`xensik/gsc-tool`](https://github.com/xensik/gsc-tool), and adds the runtime:
an interpreter, typed values, cooperative threads, host services and a native
function API.

It is intentionally headless. Engine-specific behaviour such as dvars, entities,
logging and script loading is supplied by the embedding application.

## Engine scope

gscvm is a bytecode VM, not a replacement for the IW/T6 engine. The engine
runtime, most engine natives and the entity system are not included. In
particular, `spawn()` and engine entities have not been ported, and there are no
current plans to implement them. Use `Host`, the native registry or custom
`Object` subclasses to model application-specific services and objects.

See [Engine compatibility](/reference/compatibility) for the full scope and how to
report a discrepancy.

## Quick start

```sh
git submodule update --init --recursive
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j
./build/gscvm examples/basics.gsc
```

Continue with [Getting started](/guide/getting-started).
