/** A UNIX socket path longer than sun_path (108 bytes on Linux, 104 on macOS, each with a NUL) fails or truncates
 * at bind time. Check it first so the daemon or sidecar fails loudly, naming the path and its length. */
export const SOCKET_PATH_MAX = process.platform === 'darwin' ? 103 : 107;
export function assertSocketPath(path: string): string {
  const length = Buffer.byteLength(path);
  if (length > SOCKET_PATH_MAX) throw new Error(`UNIX socket path too long (${length} > ${SOCKET_PATH_MAX} bytes): ${path}`);
  return path;
}
