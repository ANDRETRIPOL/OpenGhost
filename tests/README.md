# Compact, private record and reconnect regression checks

Run `npm test` with Node.js 24 or newer. The checks evaluate the actual renderer and main-process modules in isolated VMs. Storage, Electron IPC, HTTP transports, SDK streams and retry timers are fixtures. Tests never use the application profile, call a live model, launch a routine or execute an agent command.

Coverage includes incremental summaries and retained turns across multiple compacts, model handoff and rollback, record visibility and lifecycle, password encryption with injected I/O failures, and retry behavior before and after response/tool activity across providers. Password checks use the actual PBKDF2/AES-GCM implementation.

ASK permissions are covered by `approval-permissions.cjs`: action-kind matching, exact shell/git requests, browser safety boundaries, per-chat persistence, reset, isolation from other chats and forks, encrypted storage and password rollback. These checks use only in-memory fixtures.

Run `npm run test:approvals-ui` for the Electron integration check of the three-button approval card and the chat-menu reset. It uses the real stylesheet, translations, card, deck, chat dispatch and storage code with fixture data. It tests both themes, four languages, narrow layouts, 200% zoom, keyboard access, reduced motion, persistence failures and reset failures. Screenshots and a JSON report go to a new temporary folder; the application profile is never opened.

Per-chat effort is covered by `chat-effort.cjs`: independent preferences for chats and drafts, unchanged last-picked-model defaults, legacy migration, persistence after restart, first send, model compatibility, request snapshots, quick-window settings rereads, routines, forks, protected mini chats and read-only slider updates. It runs actual modules with in-memory storage.

Run `npm run test:effort-ui` for the isolated Electron check of the real effort control while switching chats, changing models and reopening saved data. Its profile and screenshots also stay in a new temporary folder, not the application's profile.

The file-tool privacy guard protects the application store, including saved copies of record tool calls, with case normalization and physical path resolution. It is a tool-level guard. The application's unrestricted shell still runs as the OS user; absolute isolation from arbitrary shell code requires an OS sandbox and is not provided by a path check.

These fixes keep existing on-disk formats. The preceding checkpoint commit preserves the reconnect changes that were uncommitted before this work. All audit fixes and these tests belong in the single following commit, which can be undone with `git revert <fix-commit>`.
