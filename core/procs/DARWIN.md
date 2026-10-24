# Darwin process custody and locks

Linux retains its `/proc` identity/tree algorithms and flock implementations.
Darwin uses `/bin/ps -p PID -o pid=,ppid=,lstart=,stat=` for an identity and
`/bin/ps -A -o pid=,ppid=,lstart=,stat=` for descendants. The environment pins
`LC_ALL=C` and `TZ=UTC`; no argv or environment fields are queried. A PID and its
absolute start timestamp form the identity. Apple's lstart exposes seconds,
not Linux's finer start ticks. Reused PIDs with different start times are refused.
Malformed output, ps errors and timeouts fail closed; custody sweep marks
unverifiable writers locked. Observed descendants remain tracked after reparenting.
Apple ps prints state `?` (e.g. `?E`) for a task it cannot read, such as any exiting
process on the host; such rows parse (state unknown, treated as alive) instead of
failing the whole `ps -A` snapshot. That rejection hung `npm test` in the macOS 26
VM on 10/21: custody never saw the tree, so stubborn children were never SIGKILLed.
While stopping, a failed snapshot still signals every remembered identity (verified
per PID with `ps -p`); stop succeeds only on a complete snapshot with none alive.

Darwin writer and ptyd locks use open(2)'s O_EXLOCK | O_NONBLOCK, plus O_NOFOLLOW,
O_CLOEXEC, O_CREAT and O_RDWR. These are kernel advisory locks on an unchanged
inode, not existence-based lockfiles. Closing the descriptor or killing its
holder releases control. No flock executable, compiler or native addon is used.
The writer lock's PID is the daemon itself on Darwin; on Linux it remains the
existing pipe-owned helper. A deliberate disabled-driver marker affects doctor
reporting only; an enabled driver with a failed self-test still makes doctor fail.

Primary references checked 2026-10-21:

- [Apple open(2)](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/man/man2/open.2)
- [Apple flag values](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/sys/fcntl.h)
- [Apple ps lstarted](https://github.com/apple-oss-distributions/adv_cmds/blob/main/ps/print.c)

## Native VM acceptance (PROJECT LEAD runs later)

Use the pinned Node and a disposable short scratch path; no service installation,
credentials or model turns are involved. From the engine checkout:

```sh
mkdir -p .scratch
sh scripts/node-env.sh node core/procs/darwin-selftest.mjs .scratch
```

Expected within one minute: JSON with platform=darwin, identity/tree/writerSigkill/
ptydSigkill/sidecar/pty all pass, and ownedAlive=0. Both lock checks SIGKILL an
actual holder, then acquire the same inode. The sidecar binds a scratch Unix
socket; the PTY runs only a shell printf. Linux runs exercise the same lifecycle
but do not substitute for this pending native Darwin verification.
