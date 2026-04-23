/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // No `output: 'export'`: middleware (auth, magic-link candidate portal)
  // cannot run in pure static export. Pages remain effectively static so cold
  // starts on the Vercel Hobby tier stay near zero.
  experimental: {
    typedRoutes: false,
    // Files under public/ are served as CDN assets but are NOT bundled into
    // the serverless function output by default. Offer / appointment letter
    // generators read .docx templates via fs.readFile — include them here.
    //
    // Critical: this key MUST live under `experimental` in Next 14.2.x.
    // Next 15 moved it to top-level and silently strips it when it's nested;
    // Next 14 silently strips it when it's top-level. We saw production
    // breakage on MOU from this exact regression. Do not move.
    outputFileTracingIncludes: {
      '/api/offer/preview': ['./public/hr-templates/**/*'],
      '/api/appointment/preview': ['./public/hr-templates/**/*'],
    },
  },
}

export default nextConfig
