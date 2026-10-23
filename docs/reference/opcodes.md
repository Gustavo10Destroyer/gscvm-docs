# Opcodes

The T6 opcode table in the upstream source defines 125 opcodes. Every one has an
explicit handler in the VM; nothing falls through to a silent default. This page
records the behavioural choices that are not directly encoded in the bytecode.

The complete per-opcode status table is maintained in `docs/opcodes.md` in the
source distribution.

## Stack and call conventions

- GSC evaluates call arguments right-to-left. The first source argument is on
  top of the stack when an import opcode executes.
- `OP_PreScriptCall` / `OP_VoidCodePos` push a marker. Calls pop their arguments,
  then the marker, then (for methods) the receiver, then the pointer for pointer
  calls.
- Frame locals are stored in declaration order. Bytecode local index `i` maps to
  `locals[size - 1 - i]`, matching the compiler's `variable_access()`.
- `OP_SafeCreateLocalVariables` binds the declared parameter names and appends
  the remaining locals. Extra call arguments are available to a `vararg` local.
- `OP_ClearParams` discards the temporary call/return stack. `OP_SafeDecTop`
  tolerates an empty stack; `OP_DecTop` does not.
- `JumpOnFalseExpr` / `JumpOnTrueExpr` leave the tested value on the stack when
  the branch is taken. Plain `JumpOnFalse` / `JumpOnTrue` consume it.
- `OP_Switch` jumps to its `OP_EndSwitch` table. The loader parses the table once
  and resolves every case/default target; a failed match falls through to the
  instruction after the table.
- `waittill` receives event/object on top of the stack. `notify` pushes a
  `VoidCodePos` marker, arguments (reverse), event and object. Delivered wait
  arguments are pushed in reverse order so the first
  `SafeSetWaittillVariableFieldCached` consumes argument 0.

## Deliberate approximations

These are the places where the shipped engine cannot be observed from the
compiler/decompiler alone. They are deterministic and documented rather than
hidden.

- **Array iteration order** is insertion order. The original engine's arrays are
  hash-ordered.
- **String/equality coercion** compares integer and float numerically and
  compares string/istring/hash by their text. Strict comparisons (`SuperEqual`)
  require matching value types.
- **Angles** use the standard pitch/yaw/roll formulas for
  `AnglesToForward`/`Right`/`Up` and `VectorToAngles`; they are not guaranteed to
  be bit-identical to the engine.
- **`waittillmatch`** matches the event and requires at least the compiled
  argument count. The actual match patterns are not compared.
- **Dvar colours** read the component from the host's vector dvar; alpha is 1.0.
- **`Object` / `ThreadObject`** are best-effort: the former yields `self`, the
  latter the current thread handle. The T6 compiler does not normally emit them.
- **Timing** uses one logical clock. `Wait` takes a duration in seconds and
  supports fractional values; `wait 0` is a frame/tick yield. Real-time mode
  resumes at the exact deadline, while tick-based mode quantizes resumption to
  `1 / tick_rate` boundaries. `RealWait` currently advances the same clock as
  `Wait`; the distinction is host-visible only through `tick()`.
- **Developer blocks** are skipped by default (`execute_devblocks = false`), and
  imports carrying the developer flag evaluate to undefined in that mode.

## Unsupported opcodes

Three T6 table entries are rejected with a descriptive error:

| Opcode | Reason |
| --- | --- |
| `OP_SafeSetVariableFieldCached` | Legacy operand-less store; the T6 compiler never emits it and its stack effect is ambiguous in the available evidence. |
| `OP_EvalLocalVariable` | Reserved name-based local read; not emitted by the T6 compiler. |
| `OP_EvalLocalVariableRef` | Reserved name-based local reference; not emitted by the T6 compiler. |

All other opcodes are implemented or intentionally limited/no-op. Status
meanings in the full table: `implemented` has direct VM semantics; `limited`
works with a documented approximation; `no-op` is intentionally inert;
`unsupported` raises a `RuntimeError`.
