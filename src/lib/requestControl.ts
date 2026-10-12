export const DEFAULT_TIMEOUT_MS = 30_000
export class RequestStoppedError extends Error {
  constructor(public readonly kind: 'cancelled' | 'timeout', timeoutMs?: number) {
    super(kind === 'timeout' ? `Request timed out after ${(timeoutMs ?? 0) / 1000} ${timeoutMs === 1000 ? 'second' : 'seconds'}. No complete response was received.` : 'Request cancelled.')
    this.name = 'RequestStoppedError'
  }
}
export const checkCancelled = (signal?: AbortSignal) => {
  if (signal?.aborted) throw signal.reason instanceof RequestStoppedError ? signal.reason : new RequestStoppedError('cancelled')
}
export function abortableDelay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  checkCancelled(signal)
  if (milliseconds === 0) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener('abort', onAbort)
    const timer = setTimeout(() => { cleanup(); resolve() }, milliseconds)
    const onAbort = () => {
      clearTimeout(timer); cleanup()
      reject(signal?.reason instanceof RequestStoppedError ? signal.reason : new RequestStoppedError('cancelled'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}
