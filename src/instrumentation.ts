export async function register() {
  if (process.env.NEXT_RUNTIME !== 'edge') {
    const { logLicenseExpiryWarning } = await import('./lib/license')
    void logLicenseExpiryWarning()
    setInterval(() => { void logLicenseExpiryWarning() }, 60 * 60 * 1000)
  }
}
