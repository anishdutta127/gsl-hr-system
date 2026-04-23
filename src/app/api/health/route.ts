export async function GET() {
  return new Response(
    JSON.stringify({
      status: 'ok',
      service: 'gsl-hr-system',
      ts: new Date().toISOString(),
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}
