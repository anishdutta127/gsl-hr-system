/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // No `output: 'export'`: middleware (auth, magic-link candidate portal)
  // cannot run in pure static export. Pages remain effectively static so cold
  // starts on the Vercel Hobby tier stay near zero.
  async redirects() {
    return [
      // /home is a convention from several staff members; alias to / so
      // bookmarks and muscle memory both work.
      { source: '/home', destination: '/', permanent: false },
    ]
  },
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
      // MUST stay nested under `experimental` in Next 14.2.x; silently
      // stripped at top-level. Do not move (see CLAUDE.md non-negotiables).
      '/api/letters/[id]/generate': ['./public/hr-templates/**/*'],
      // Resumes live outside public/ so they can't be fetched directly;
      // /api/resumes/[id] streams them after auth check. Total size today
      // is ~40MB, well inside Vercel's 250MB compressed function limit.
      // Two roots: seed/ holds the one-time bulk import (read from the
      // OneDrive symlink locally; bundled by trace in prod). uploads/ is
      // a real git tree where live uploads land — onedrive-data is a
      // symlink in the repo and rejects sub-path writes from the GitHub
      // Contents API with 409.
      '/api/resumes/[candidateId]': [
        './onedrive-data/seed/resumes/**/*',
        './data/resumes/uploads/**/*',
      ],
    },
  },
}

export default nextConfig
