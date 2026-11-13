/** crypto.randomUUID only exists on https/localhost; this also works over plain http on a LAN. */
export function uid(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  );
}
