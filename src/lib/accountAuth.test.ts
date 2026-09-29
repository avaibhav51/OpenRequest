import { describe, expect, it } from 'vitest'
import { emailOtpOptions, safeAuthError } from './accountAuth'

describe('account auth guardrails', () => {
  it('never creates an account from the sign-in action', () => {
    expect(emailOtpOptions('sign-in', 'https://example.test/OpenRequest/')).toEqual({
      emailRedirectTo: 'https://example.test/OpenRequest/',
      shouldCreateUser: false,
    })
  })

  it('requires an explicit create-account action', () => {
    expect(emailOtpOptions('create-account', 'https://example.test/OpenRequest/').shouldCreateUser).toBe(true)
  })

  it('does not expose raw provider errors', () => {
    expect(safeAuthError('User not found for email alice@example.test')).not.toContain('alice@example.test')
    expect(safeAuthError('rate limit exceeded')).toContain('wait')
  })
})
