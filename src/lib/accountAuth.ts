export type EmailAccountIntent = 'sign-in' | 'create-account'

export const emailOtpOptions = (intent: EmailAccountIntent, emailRedirectTo: string) => ({
  emailRedirectTo,
  shouldCreateUser: intent === 'create-account',
})

export const safeAuthError = (message: string) => {
  const normalized = message.toLowerCase()
  if (normalized.includes('rate') || normalized.includes('too many')) return 'Too many attempts. Please wait before trying again.'
  if (normalized.includes('network') || normalized.includes('fetch')) return 'The authentication service could not be reached.'
  return 'Authentication could not be completed. Check the configuration or try again.'
}
