export const syncRetryDelay = (failures: number, random = Math.random()) =>
  Math.round(Math.min(300_000, 30_000 * 2 ** Math.min(Math.max(0, failures - 1), 4)) * (0.8 + random * 0.2))
