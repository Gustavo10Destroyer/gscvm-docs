# Reference

The guide covers installation, command-line usage and runnable scripts. This
section documents the runtime API, extension points and the behaviour you can
rely on when embedding gscvm in another application.

## Runtime and embedding

- [Architecture](/reference/architecture) explains the loader, interpreter,
  scheduler, value model and engine boundary.
- [Embedding](/reference/embedding) shows how to create a VM, provide a `Host`
  and load or call scripts from C++.
- [Extending the VM](/reference/extending-vm) covers custom objects, host
  services, native registration and script resolution.
- [Native functions](/reference/native-functions) documents the native registry,
  argument access, return values and error handling.

## Security patterns

- [Filesystem sandbox](/reference/filesystem) is a complete native filesystem
  example with default-deny permissions, per-directory and per-file rules,
  path containment checks and size limits.

## Behaviour and internals

- [Engine compatibility](/reference/compatibility) describes what the VM
  implements and what must be supplied by the host.
- [Opcodes](/reference/opcodes) lists the T6 opcode set and known exceptions.
- [Upstream changes](/reference/upstream-changes) records the pinned `gsc-tool`
  revision and local build-time patches.

## Project

- [License and attribution](/license) covers gscvm's GPL-3.0-only licensing and
  the upstream projects it reuses.
