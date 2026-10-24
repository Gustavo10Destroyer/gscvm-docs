# Filesystem sandbox

This reference example implements a small `fs` native namespace for scripts
that need to read or write files. It is deliberately conservative: access is
denied by default, every path is relative to one sandbox root, and permissions
are configured per directory or per file.

The example is self-contained and compiles against the public gscvm headers. It
is a policy layer for script-visible file access, not a replacement for an
operating-system sandbox.

## Design

The sandbox uses five permission bits:

| Bit | Allows |
| --- | --- |
| `read` | Read a regular file and inspect its metadata with `fs::stat`. |
| `write` | Modify an existing regular file or append to it. |
| `create` | Create a new file. Creating also requires `write`. |
| `remove` | Delete a regular file. Directories cannot be removed. |
| `list` | Enumerate the entries in a directory. |

`all` combines every bit. Rules are evaluated as follows:

1. Normalize the script path as a relative path. Reject empty paths, absolute
   paths, `..`, and `:` (to avoid Windows drive and alternate-stream syntax).
2. Look for an exact file rule. If none matches, use the longest matching
   directory rule. If no rule matches, deny the operation.
3. Check that the rule grants the required bits. An explicit rule with no
   permissions can be used to deny a file inside an otherwise accessible
   directory.
4. Canonicalize the path against the sandbox root and verify that it is still
   inside the root. This rejects symlink escapes.
5. Enforce read and write size limits before touching the file.

Directory rules are recursive by default. A non-recursive directory rule applies
only to the directory path itself, not to its children. File rules always take
precedence over directory rules, and the longest directory prefix wins when
several directory rules match.

Listing a directory returns only entries for which at least one permission bit
is granted. This keeps a denied file from leaking its name through `fs::list`.

## Implementation

```cpp
#include <algorithm>
#include <cstdint>
#include <filesystem>
#include <format>
#include <fstream>
#include <limits>
#include <memory>
#include <string>
#include <string_view>
#include <system_error>
#include <vector>

#include "gsc/gscvm.hpp"

using namespace gsc::t6;
namespace fs = std::filesystem;

enum class Access : std::uint8_t
{
    none = 0,
    read = 1 << 0,
    write = 1 << 1,
    create = 1 << 2,
    remove = 1 << 3,
    list = 1 << 4,
    all = (1 << 5) - 1,
};

constexpr auto operator|(Access lhs, Access rhs) -> Access
{
    return static_cast<Access>(static_cast<std::uint8_t>(lhs)
        | static_cast<std::uint8_t>(rhs));
}

constexpr auto operator&(Access lhs, Access rhs) -> Access
{
    return static_cast<Access>(static_cast<std::uint8_t>(lhs)
        & static_cast<std::uint8_t>(rhs));
}

struct Rule
{
    fs::path path;
    bool file{};
    bool recursive{};
    Access access{Access::none};
};

class FileSandbox : public std::enable_shared_from_this<FileSandbox>
{
public:
    explicit FileSandbox(fs::path root, std::size_t max_read = 1U << 20U,
                         std::size_t max_write = 1U << 20U)
        : max_read_(max_read), max_write_(max_write)
    {
        std::error_code ec;
        root_ = fs::canonical(root, ec);
        if (ec || !fs::is_directory(root_, ec))
            throw gsc::Error("fs: sandbox root must be an existing directory");
    }

    void allow_directory(std::string_view path, Access access, bool recursive = true)
    {
        rules_.push_back({ normalize(path), false, recursive, access });
    }

    void allow_file(std::string_view path, Access access)
    {
        rules_.push_back({ normalize(path), true, false, access });
    }

    void register_natives(NativeRegistry& natives)
    {
        auto self = shared_from_this();

        natives.register_function("fs", "read_text", [self](NativeContext& ctx) {
            ctx.set_return_value(Value::string(self->read_text(ctx.get_argument<std::string>(0))));
        });

        natives.register_function("fs", "write_text", [self](NativeContext& ctx) {
            auto const path = ctx.get_argument<std::string>(0);
            auto const text = ctx.get_argument<std::string>(1);
            ctx.set_return_value(Value::integer(self->write_text(path, text, false)));
        });

        natives.register_function("fs", "append_text", [self](NativeContext& ctx) {
            auto const path = ctx.get_argument<std::string>(0);
            auto const text = ctx.get_argument<std::string>(1);
            ctx.set_return_value(Value::integer(self->write_text(path, text, true)));
        });

        natives.register_function("fs", "list", [self](NativeContext& ctx) {
            ctx.set_return_value(Value::array(self->list(ctx.get_argument<std::string>(0))));
        });

        natives.register_function("fs", "stat", [self](NativeContext& ctx) {
            ctx.set_return_value(Value::object(self->stat(ctx.get_argument<std::string>(0))));
        });

        natives.register_function("fs", "remove", [self](NativeContext& ctx) {
            self->remove(ctx.get_argument<std::string>(0));
            ctx.return_undefined();
        });
    }

private:
    auto normalize(std::string_view input) const -> fs::path
    {
        auto text = std::string{ input };
        std::replace(text.begin(), text.end(), '\\', '/');
        if (text.empty() || text.find(':') != std::string::npos)
            fail("invalid path");

        auto const path = fs::path{ text }.lexically_normal();
        if (path.is_absolute() || path.empty() || path == ".")
            fail("invalid path");

        for (auto const& part : path)
        {
            if (part == "..")
                fail("path escapes the sandbox root");
        }
        return path;
    }

    auto resolve(fs::path const& relative) const -> fs::path
    {
        std::error_code ec;
        auto const candidate = fs::weakly_canonical(root_ / relative, ec);
        if (ec)
            fail("cannot resolve path");

        auto const rel = candidate.lexically_relative(root_);
        if (rel.empty())
            fail("path escapes the sandbox root");
        for (auto const& part : rel)
        {
            if (part == "..")
                fail("path escapes the sandbox root");
        }
        return candidate;
    }

    auto granted(fs::path const& relative) const -> Access
    {
        auto result = Access::none;
        std::size_t best = 0;
        bool best_is_file = false;

        for (auto const& rule : rules_)
        {
            bool const matches = rule.file
                ? relative == rule.path
                : relative == rule.path
                    || (rule.recursive && is_descendant(relative, rule.path));
            if (!matches)
                continue;

            auto const score = rule.path.generic_string().size();
            if (rule.file)
            {
                if (!best_is_file || score >= best)
                {
                    result = rule.access;
                    best = score;
                    best_is_file = true;
                }
            }
            else if (!best_is_file && score >= best)
            {
                result = rule.access;
                best = score;
            }
        }
        return result;
    }

    auto require(fs::path const& relative, Access needed) const -> void
    {
        if ((granted(relative) & needed) != needed)
            fail("permission denied");
    }

    auto read_text(std::string_view input) const -> std::string
    {
        auto const relative = normalize(input);
        require(relative, Access::read);
        auto const absolute = resolve(relative);

        std::error_code ec;
        if (!fs::is_regular_file(absolute, ec))
            fail("not a regular file");

        auto const size = fs::file_size(absolute, ec);
        if (ec || size > max_read_)
            fail("file is too large to read");

        std::ifstream file{ absolute, std::ios::binary };
        if (!file)
            fail("cannot open file for reading");

        std::string data(static_cast<std::size_t>(size), '\0');
        file.read(data.data(), static_cast<std::streamsize>(data.size()));
        if (!file && !file.eof())
            fail("read failed");
        data.resize(static_cast<std::size_t>(file.gcount()));
        return data;
    }

    auto write_text(std::string_view input, std::string_view text, bool append) const -> std::int32_t
    {
        auto const relative = normalize(input);
        auto const absolute = resolve(relative);

        std::error_code ec;
        bool const exists = fs::exists(absolute, ec);
        if (ec)
            fail("cannot inspect destination");

        if (append)
        {
            require(relative, Access::write);
            if (!exists || !fs::is_regular_file(absolute, ec))
                fail("append target is not a regular file");
        }
        else if (exists)
        {
            require(relative, Access::write);
            if (!fs::is_regular_file(absolute, ec))
                fail("write target is not a regular file");
        }
        else
        {
            require(relative, Access::create | Access::write);
        }

        if (text.size() > max_write_)
            fail("file is too large to write");
        if (text.size() > static_cast<std::size_t>(std::numeric_limits<std::int32_t>::max()))
            fail("file is too large to report");

        auto mode = std::ios::binary | std::ios::out;
        mode |= append ? std::ios::app : std::ios::trunc;
        std::ofstream file{ absolute, mode };
        if (!file)
            fail("cannot open file for writing");

        file.write(text.data(), static_cast<std::streamsize>(text.size()));
        if (!file)
            fail("write failed");
        return static_cast<std::int32_t>(text.size());
    }

    auto list(std::string_view input) const -> ArrayPtr
    {
        auto const relative = normalize(input);
        require(relative, Access::list);
        auto const absolute = resolve(relative);

        std::error_code ec;
        if (!fs::is_directory(absolute, ec))
            fail("not a directory");

        std::vector<std::string> names;
        for (fs::directory_iterator it{ absolute, ec }, end; !ec && it != end; it.increment(ec))
        {
            auto const child = relative / it->path().filename();
            if (granted(child) == Access::none)
                continue;
            names.push_back(it->path().filename().generic_string());
        }
        if (ec)
            fail("directory listing failed");

        std::sort(names.begin(), names.end());
        auto result = std::make_shared<Array>();
        for (std::size_t i = 0; i < names.size(); ++i)
        {
            result->set(Value::integer(static_cast<std::int32_t>(i)),
                        Value::string(names[i]));
        }
        return result;
    }

    auto stat(std::string_view input) const -> ObjectPtr
    {
        auto const relative = normalize(input);
        require(relative, Access::read);
        auto const absolute = resolve(relative);

        std::error_code ec;
        if (!fs::exists(absolute, ec))
            fail("path does not exist");

        bool const directory = fs::is_directory(absolute, ec);
        bool const regular = fs::is_regular_file(absolute, ec);
        auto const size = regular ? fs::file_size(absolute, ec) : std::uintmax_t{ 0 };
        if (ec)
            fail("cannot inspect path");

        auto const permissions = granted(relative);
        auto result = std::make_shared<ScriptObject>("fs.stat");
        result->set_field("path", Value::string(relative.generic_string()));
        result->set_field("directory", Value::boolean(directory));
        result->set_field("size", Value::integer(static_cast<std::int32_t>(
            std::min<std::uintmax_t>(size, std::numeric_limits<std::int32_t>::max()))));
        result->set_field("readable", Value::boolean((permissions & Access::read) != Access::none));
        result->set_field("writable", Value::boolean((permissions & Access::write) != Access::none));
        result->set_field("listable", Value::boolean((permissions & Access::list) != Access::none));
        return result;
    }

    auto remove(std::string_view input) const -> void
    {
        auto const relative = normalize(input);
        require(relative, Access::remove);
        auto const absolute = resolve(relative);

        std::error_code ec;
        if (!fs::is_regular_file(absolute, ec))
            fail("remove only supports regular files");
        if (!fs::remove(absolute, ec) || ec)
            fail("remove failed");
    }

    static auto is_descendant(fs::path const& candidate, fs::path const& parent) -> bool
    {
        auto const rel = candidate.lexically_relative(parent);
        if (rel.empty())
            return false;
        for (auto const& part : rel)
        {
            if (part == "..")
                return false;
        }
        return true;
    }

    [[noreturn]] static auto fail(std::string_view message) -> void
    {
        throw gsc::Error(std::format("fs: {}", message));
    }

    fs::path root_;
    std::size_t max_read_;
    std::size_t max_write_;
    std::vector<Rule> rules_;
};
```

`FileSandbox` inherits `std::enable_shared_from_this`, so it must be owned by a
`std::shared_ptr` before `register_natives()` is called. The native lambdas keep
the sandbox alive for as long as the registry holds them.

## Configuration

The following policy gives scripts read-only access to assets and configuration,
full access to logs, and create/write access to uploads without delete
permission. Two file rules override their parent directories.

```cpp
auto sandbox = std::make_shared<FileSandbox>("sandbox");

sandbox->allow_directory("assets", Access::read | Access::list);
sandbox->allow_directory("config", Access::read | Access::list);
sandbox->allow_file("config/server.cfg", Access::read);
sandbox->allow_file("config/secrets.cfg", Access::none);
sandbox->allow_directory("logs", Access::all);
sandbox->allow_file("logs/audit.log", Access::read);
sandbox->allow_directory("uploads", Access::read | Access::write
    | Access::create | Access::list);

sandbox->register_natives(vm.natives());
```

| Rule | Result |
| --- | --- |
| `assets/**` | Read and list only. Writes, creates and deletes are denied. |
| `config/**` | Read and list only. `secrets.cfg` is hidden and unreadable. |
| `config/server.cfg` | Explicit read-only file rule. |
| `config/secrets.cfg` | Explicit deny rule; overrides the parent directory. |
| `logs/**` | Full access, including append and delete. |
| `logs/audit.log` | Read-only override; append and delete are denied. |
| `uploads/**` | Read, write, create and list; delete is denied. |

The sandbox root must already exist. Scripts always see paths relative to it;
the host's absolute path is never exposed.

## Script usage

```gsc
main()
{
    text = fs::read_text( "config/server.cfg" );
    println( "server config: &&1", text );

    fs::write_text( "logs/session.txt", "round started\n" );
    fs::append_text( "logs/session.txt", "player joined\n" );

    files = fs::list( "logs" );
    foreach ( name in files )
        println( "log file: &&1", name );

    info = fs::stat( "logs/session.txt" );
    println( "session log size: &&1", info.size );

    fs::remove( "logs/session.txt" );
}
```

With the policy above, these calls fail:

```gsc
fs::write_text( "config/server.cfg", "changed" ); // read-only file
fs::read_text( "config/secrets.cfg" );            // explicit deny
fs::append_text( "logs/audit.log", "changed" );   // read-only override
fs::remove( "uploads/report.txt" );               // remove not granted
fs::read_text( "../outside.txt" );                // path escape
fs::read_text( "C:/Windows/win.ini" );            // absolute/drive path
```

The failures throw `gsc::Error` with an `fs:` prefix. The VM reports them as
runtime failures with the usual module, function, instruction and thread
context. A host that wants to recover from script-level filesystem errors should
catch them at the call boundary instead of letting them terminate the run.

## Security notes

- This is a script policy layer, not an OS sandbox. A malicious native, a
  compromised host, or another local process is outside its threat model.
- `weakly_canonical` resolves existing symlinks before the containment check, so
  a symlink inside the root cannot point outside it. There is still a
  time-of-check/time-of-use window between the check and the open. For hostile
  local users, use `openat` with `O_NOFOLLOW`, file descriptors and OS sandboxing
  instead of path-based checks.
- Deny by default and grant the smallest set of bits. Prefer read-only
  directories and explicit read-only file overrides.
- `remove` only accepts regular files. There is no recursive directory delete.
- Read and write limits are checked before allocation or writing. The defaults
  are 1 MiB each; adjust them for the application.
- `fs::list` filters entries with no granted permissions, but directory metadata
  can still reveal that a directory exists. Do not treat listing as an
  authorization boundary for names that must remain secret.
- The sandbox is not synchronized. Give each VM its own instance, or serialize
  access if one instance is shared.
- GSC strings are byte strings. The example does not validate UTF-8 or normalize
  line endings; do that in a host-specific wrapper if needed.
