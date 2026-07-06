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
      //
      // Two roots, traced wholesale: any subdirectory under data/resumes/
      // (uploads/, applications/, future imports/, ...) ships automatically
      // without further config. The reader validates that the resolved real
      // path stays within these two roots — see src/lib/resumePath.ts.
      // onedrive-data/seed/resumes is the immutable legacy 156-resume
      // corpus, read through the OneDrive symlink locally.
      '/api/resumes/[candidateId]': [
        './data/resumes/**/*',
        './onedrive-data/seed/resumes/**/*',
      ],
      // HR documents (Phase 4). Same single-root traversal-guard pattern as
      // resumes; reader at /api/admin/documents/[id]/download streams them
      // after a permission check. Adding a brand-new top-level root requires
      // appending here AND to assertInsideHrDocumentsRoot.
      '/api/admin/documents/[id]/download': ['./data/hr-documents/**/*'],
      // Exit handover uploaded documents (Phase 4 gate 4). Same
      // single-root traversal-guard pattern. See
      // src/lib/exitHandover.ts:assertInsideHandoverRoot.
      '/api/admin/exit-handover/[employeeId]/document/[fileId]': [
        './data/exit-handovers/**/*',
      ],
      // Confidential exit-interview documents. Single-root traversal-guard
      // pattern; the serve route gates on canViewExitInterview (HOD/RM never).
      // See src/lib/offboardingTasks.ts:assertInsideExitInterviewDocsRoot.
      '/api/admin/offboarding/exit-interview/[employeeId]/document/[fileId]': [
        './data/exit-interview-docs/**/*',
      ],
    },
  },
}

export default nextConfig
