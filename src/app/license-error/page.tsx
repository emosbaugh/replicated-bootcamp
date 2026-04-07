export default async function LicenseErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { reason } = await searchParams
  const reasonText = typeof reason === 'string' ? reason : 'License validation failed.'

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-4">
      <pre className="font-mono text-green-400 text-xl">{`⚾  PLAYBALL.EXE  ⚾`}</pre>
      <pre className="font-mono text-red-500 text-lg font-bold">LICENSE ERROR</pre>
      <pre className="font-mono text-red-400 text-sm">{reasonText}</pre>
      <pre className="font-mono text-green-700 text-xs">
        Contact your administrator to renew your license.
      </pre>
    </div>
  )
}
