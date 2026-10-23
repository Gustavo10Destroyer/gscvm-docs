# Examples

The repository's `examples/` directory contains runnable GSC scripts. They avoid engine-specific natives so they work
with the default headless host.

| Script | Demonstrates |
| --- | --- |
| `basics.gsc` | Functions, arguments, return values, arrays, `foreach` and vectors. |
| `threads.gsc` | Cooperative threads, `wait`, `waittill`, `notify` and the `level` object. |
| `include.gsc` | `#include` resolution through `examples/helpers/math.gsc`. |
| `main.gsc` | Reusable coroutine and symbol helpers under `examples/helpers/`. |

```sh
./build/gscvm examples/basics.gsc
./build/gscvm examples/threads.gsc
./build/gscvm examples/include.gsc
./build/gscvm examples/main.gsc
```

## Basics

```text
main()
{
	println( "gscvm basics" );
	println( "add(20, 22) = &&1", add( 20, 22 ) );

	values = array( 3, 5, 8 );
	println( "sum = &&1", sum( values ) );

	point = ( 1, 2, 3 );
	println( "point = &&1", point );

	return add( 20, 22 );
}

add( a, b )
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
```

## Threads and events

```text
main()
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
```

`call()` and `run_until_complete()` advance waits automatically. For
externally driven events, use `start()`, `notify()`, `run_until_idle()` and
`tick()` from an embedding application.

## Includes

`examples/include.gsc`:

```text
#include helpers\math;

main()
{
	println( "triple(14) = &&1", triple( 14 ) );
	return triple( 14 );
}
```

`examples/helpers/math.gsc`:

```text
triple( value )
{
	return value * 3;
}
```

The runner adds the script's directory to its search paths, so the include
resolves without extra flags.
