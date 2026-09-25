import { describe, expect, it } from 'vitest'
import { httpStatusText, httpStatusTooltip } from './httpStatus'

describe('HTTP status labels', () => {
  it('returns the standard reason phrase for a known status', () => {
    expect(httpStatusTooltip(404)).toBe('404 — Not Found')
  })

  it('prefers the reason phrase supplied by the server', () => {
    expect(httpStatusText(418, 'Custom response')).toBe('Custom response')
  })

  it('handles non-standard status codes', () => {
    expect(httpStatusTooltip(599)).toBe('599 — Unknown Status')
  })
})
