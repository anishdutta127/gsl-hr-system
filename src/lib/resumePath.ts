/*
 * Resume storage path helpers.
 *
 * Two roots only — the reader does not know about subdirectories:
 *   - data/resumes/             (live uploads, public applications, future imports)
 *   - onedrive-data/seed/resumes/ (immutable legacy 156-resume seed corpus)
 *
 * Subdirectory structure under data/resumes/ is informational. Adding a new
 * subdirectory (e.g. data/resumes/imports/...) needs ZERO reader changes —
 * the reader validates that the resolved real path stays under one of the
 * two roots, nothing else. See assertInsideResumeRoot below.
 *
 * Adding a brand-new top-level root requires:
 *   (a) appending to RESUME_ROOTS
 *   (b) updating outputFileTracingIncludes in next.config.mjs
 */

import fs from 'node:fs'
import path from 'node:path'

const UPLOAD_SUBPATH = 'data/resumes/uploads'
const APPLICATION_SUBPATH = 'data/resumes/applications'

// Repo-relative roots. Order is informational; both are equally trusted.
export const RESUME_ROOTS = ['data/resumes', 'onedrive-data/seed/resumes'] as const

function yyyymm(): { yyyy: string; mm: string } {
  const now = new Date()
  return {
    yyyy: now.getUTCFullYear().toString(),
    mm: String(now.getUTCMonth() + 1).padStart(2, '0'),
  }
}

/** Path for staff-side or candidate-portal self-uploads. */
export function buildResumeRepoPath(candidateId: string, extWithDot: string): string {
  const { yyyy, mm } = yyyymm()
  return `${UPLOAD_SUBPATH}/${yyyy}/${mm}/${candidateId}${extWithDot.toLowerCase()}`
}

/** Path for resumes attached to public /careers applications. */
export function buildApplicationResumePath(candidateId: string, extWithDot: string): string {
  const { yyyy, mm } = yyyymm()
  return `${APPLICATION_SUBPATH}/${yyyy}/${mm}/${candidateId}${extWithDot.toLowerCase()}`
}

export type ResumePathCheck =
  | { ok: true; absolute: string }
  | { ok: false; status: 400 | 403 | 404; message: string }

/**
 * Resolve a candidate.resumeFilePath against the repo root and confirm it
 * lives inside one of RESUME_ROOTS. Defeats `..` traversal, absolute path
 * injection, and symlink escape (via fs.realpathSync).
 *
 * The seed root is itself a symlink on disk; that's fine — both the input
 * path and the roots are realpath'd before comparison, so a request that
 * traverses through the symlink to a file inside the real OneDrive seed
 * folder is allowed, but a symlink that points OUTSIDE the seed folder is
 * rejected.
 */
export function assertInsideResumeRoot(
  resumeFilePath: string,
  cwd: string = process.cwd(),
): ResumePathCheck {
  if (!resumeFilePath || resumeFilePath.includes('\0')) {
    return { ok: false, status: 400, message: 'Resume path is malformed.' }
  }
  // Reject `..` segments before resolution. path.resolve would silently
  // collapse them; we want to fail loudly so a future bug that injects
  // traversal into a stored path can't slip past.
  const normalisedSlashes = resumeFilePath.replace(/\\/g, '/')
  if (normalisedSlashes.split('/').some((seg) => seg === '..')) {
    return { ok: false, status: 403, message: 'Resume path contains traversal segments.' }
  }
  if (path.isAbsolute(resumeFilePath)) {
    return { ok: false, status: 403, message: 'Resume path must be repo-relative.' }
  }

  const absolute = path.resolve(cwd, resumeFilePath)

  if (!fs.existsSync(absolute)) {
    return {
      ok: false,
      status: 404,
      message: 'Resume file not found at expected path. Contact admin.',
    }
  }

  let realFile: string
  try {
    realFile = fs.realpathSync(absolute)
  } catch {
    return {
      ok: false,
      status: 404,
      message: 'Resume file not found at expected path. Contact admin.',
    }
  }

  for (const root of RESUME_ROOTS) {
    const rootAbs = path.resolve(cwd, root)
    let realRoot: string
    try {
      realRoot = fs.realpathSync(rootAbs)
    } catch {
      // Root doesn't exist (e.g. seed symlink missing in some envs). Skip.
      continue
    }
    if (realFile === realRoot || realFile.startsWith(realRoot + path.sep)) {
      return { ok: true, absolute }
    }
  }

  return {
    ok: false,
    status: 403,
    message: 'Resume path is outside the resumes root.',
  }
}
