/*
 * Resume storage path builder.
 *
 * Live uploads land under data/resumes/uploads/[YYYY]/[MM]/[uuid].pdf.
 * The `data/` root is a real git tree, so the GitHub Contents API can PUT
 * files into it. The `onedrive-data/` symlink (used for the seed import)
 * is mode 120000 in the repo and rejects any sub-path PUT with 409.
 *
 * Year/month subfoldering caps per-directory file count well below the
 * GitHub Contents API listing soft-limit (~1000) at our hiring volumes.
 */

const UPLOAD_ROOT = 'data/resumes/uploads'
const SEED_ROOT = 'onedrive-data/seed/resumes'

export function buildResumeRepoPath(candidateId: string, extWithDot: string): string {
  const now = new Date()
  const yyyy = now.getUTCFullYear().toString()
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  return `${UPLOAD_ROOT}/${yyyy}/${mm}/${candidateId}${extWithDot.toLowerCase()}`
}

export function isAllowedResumePath(p: string): boolean {
  // Normalised: forward slashes only; no `..` segments; under one of the two roots.
  if (p.includes('..')) return false
  const normalised = p.replace(/\\/g, '/')
  return normalised.startsWith(`${UPLOAD_ROOT}/`) || normalised.startsWith(`${SEED_ROOT}/`)
}

export const RESUME_UPLOAD_ROOT = UPLOAD_ROOT
export const RESUME_SEED_ROOT = SEED_ROOT
