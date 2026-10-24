# Terminal sidecar

Start separately from artemisd using the pinned runtime: `node ptyd/main.ts --run <absolute-runDir>`. This process owns all PTYs and headless screens. `createTerminals` only connects to it; service close/restart never kills a terminal. Clean SIGTERM/SIGINT stops each owned PTY tree, closes sockets, removes the socket pathname, and releases the kernel lock. Linux process custody uses pid/start-time checks. Other platforms await Stage 3.

The run directory is created mode 0700, the socket and instance lock mode 0600. An exclusive Linux `flock` on `ptyd.lock` prevents concurrent instances before socket binding. `/usr/bin/flock` (util-linux, present on the Stage 1 host) locks an inherited descriptor and exits; ptyd retains that same open-file description. The descriptor is closed on exec, so PTY children do not retain control. SIGKILL releases the kernel lock automatically. On Darwin, atomic `open(2)` with `O_EXLOCK | O_NONBLOCK | O_CLOEXEC` holds the same inode directly in ptyd, without a flock executable; kernel release on SIGKILL is the same.

The lock file remains on disk and is never unlinked: its PID text is diagnostic only. A fresh instance acquires the lock and removes an abandoned socket only after a connection probe returns ECONNREFUSED/ENOENT. A live listener, non-socket pathname, or ambiguous probe failure is refused. No user cleanup is required after SIGKILL. This restarts ptyd, not its lost in-memory terminal screens; terminal continuity is guaranteed across artemisd restarts, not sidecar death. Supervising ptyd and its entire process group remains a Stage 3 responsibility.

The private socket uses four-byte big-endian length + JSON. `PtyClient` implements RPC for create/list/kill/capture/attach/detach/input/resize. User shells use the account login shell with `-l -i`; agent shells use `/bin/bash --noprofile --norc` and an environment built from only PATH, HOME, USER, LOGNAME, LANG, SHELL, TERM, TMPDIR. There is no inherited service context.

Websocket frames keep the fixed tags in `core/types.ts`:

- 01: raw output bytes; advance the resume offset by payload byte length.
- 02: input bytes (requires the controller lease).
- 03: JSON `{intent:'claim'|'update',cols,rows}`. Claim is allowed only when the terminal has no controller. Closing/detaching releases it; update never takes another client's lease.
- 04: JSON restore. Normally `{generation,offset,resumed,cols,rows,text,ansi,cursorX,cursorY}`; replay with a matching generation and a retained byte offset has `resumed:true` and then emits the missing 01 frames. A full snapshot has `resumed:false`. Large snapshots use bounded 04 envelopes `{generation,offset,encoding:'base64-json',index,parts,data}`: concatenate decoded data in index order and JSON-parse the full snapshot. This prevents a 5,000-line screen from bypassing the 256 KiB queue limit. Set the client dimensions, reset its screen, then write `ansi`. `text` is plain capture text.
- 05: JSON `{exitCode,closedAt}`.

Headless screens retain 5,000 lines total, including the viewport. ANSI restores preserve cell colors, styles, wide characters and the visible cursor. Output replay retains the latest 256 KiB; older offsets or generation mismatches get a full screen snapshot. Sidecar attach queues live output while restoring and removes any output already included in that snapshot.

Limits are checked at both boundaries: 8 live sessions, 2 clients per terminal across service connections, 16 KiB per input frame, 256 KiB queued per client, rows 1–500, cols 1–1000, listed 1–100. Refused websocket operations close with 1008 (lease/invalid/authorization) or 1009 (size/queue). Observers cannot resize or write.

The 256 KiB eviction budget never applies to the shared artemisd↔ptyd socket. The service forwards each frame immediately and checks that WebSocket's actual bufferedAmount; a slow client alone closes with 1009 and detaches. PTY output and restore producers await IPC write completion, while per-terminal PTY reads pause/resume at high/low water marks to bound processing memory during service stalls. Ordinary transport congestion does not disconnect the service or lose terminal bytes. Output for other terminals can progress independently. `core/terminals/backpressure.test.ts` proves this with real artemisd/ptyd, a paused observer, a 24 MB burst, and a temporary artemisd scheduling pause.
