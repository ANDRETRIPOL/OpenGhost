# Compact, private record and reconnect regression checks

Run `npm test` with Node.js 24 or newer. The checks evaluate the actual renderer and main-process modules in isolated VMs. Storage, Electron IPC, HTTP transports, SDK streams and retry timers are fixtures. Tests never use the application profile, call a live model, launch a routine or execute an agent command.

Coverage includes incremental summaries and retained turns across multiple compacts, model handoff and rollback, record visibility and lifecycle, password encryption with injected I/O failures, and retry behavior before and after response/tool activity across providers. Password checks use the actual PBKDF2/AES-GCM implementation.

The file-tool privacy guard protects the application store, including saved copies of record tool calls, with case normalization and physical path resolution. It is a tool-level guard. The application's unrestricted shell still runs as the OS user; absolute isolation from arbitrary shell code requires an OS sandbox and is not provided by a path check.

These fixes keep existing on-disk formats. The preceding checkpoint commit preserves the reconnect changes that were uncommitted before this work. All audit fixes and these tests belong in the single following commit, which can be undone with `git revert <fix-commit>`.
