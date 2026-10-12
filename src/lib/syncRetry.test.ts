import { expect, it } from 'vitest'
import { syncRetryDelay } from './syncRetry'
it('backs off with bounded jitter and caps retries at five minutes', () => {
  expect(syncRetryDelay(1, 1)).toBe(30000)
  expect(syncRetryDelay(2, 1)).toBe(60000)
  expect(syncRetryDelay(99, 1)).toBe(300000)
  expect(syncRetryDelay(1, 0)).toBe(24000)
})
