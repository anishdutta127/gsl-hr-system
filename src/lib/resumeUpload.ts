/*
 * Shared validation for resume uploads. Three entry points (HR-side,
 * candidate self-upload, public /careers apply) used to duplicate the size /
 * extension / filename guards inline; that drift is what made it hard to be
 * sure all three rejected a 6 MB .docx with `..` in the name. One helper,
 * three callers.
 *
 * The path-builder lives in resumePath.ts (kept separate because it's also
 * used by the reader). This file only validates uploads.
 */

import path from 'node:path'

export interface UploadProfile {
  /** Hard upper bound on bytes the route accepts. */
  maxBytes: number
  /** Lowercased dot-prefixed extensions accepted (e.g. ['.pdf', '.docx']). */
  allowedExts: readonly string[]
  /** Operator-friendly fallback shown when ext is wrong. */
  extMessage: string
}

export const HR_UPLOAD_PROFILE: UploadProfile = {
  maxBytes: 10 * 1024 * 1024,
  allowedExts: ['.pdf', '.docx'],
  extMessage: 'Only .pdf or .docx allowed.',
}

export const CANDIDATE_UPLOAD_PROFILE: UploadProfile = {
  maxBytes: 5 * 1024 * 1024,
  allowedExts: ['.pdf'],
  extMessage: 'Please upload a PDF.',
}

export const PUBLIC_APPLY_PROFILE: UploadProfile = {
  maxBytes: 5 * 1024 * 1024,
  allowedExts: ['.pdf'],
  extMessage: 'Resume must be a PDF.',
}

export type UploadCheck =
  | { ok: true; ext: string }
  | { ok: false; status: 400 | 413; message: string }

/** Validate a multipart File against a profile. Returns the lowercased ext on
 * success so callers can pass it to the path-builder without re-deriving. */
export function validateUploadedResume(
  file: unknown,
  profile: UploadProfile,
): UploadCheck {
  if (!(file instanceof File)) {
    return { ok: false, status: 400, message: 'No file provided.' }
  }
  if (file.size === 0) {
    return { ok: false, status: 400, message: 'File is empty.' }
  }
  if (file.size > profile.maxBytes) {
    const mb = Math.round(profile.maxBytes / (1024 * 1024))
    return { ok: false, status: 413, message: `File exceeds ${mb} MB limit.` }
  }
  // The filename is never used for the on-disk path (we generate that from
  // candidate ID + ext) — but a `..` or slash in the original name is a
  // strong "this isn't a real upload" smell. Reject as defence in depth.
  if (file.name.includes('..') || file.name.includes('/') || file.name.includes('\\')) {
    return {
      ok: false,
      status: 400,
      message: 'Filename contains illegal characters.',
    }
  }
  if (file.name.includes('\0')) {
    return {
      ok: false,
      status: 400,
      message: 'Filename contains illegal characters.',
    }
  }
  const ext = path.extname(file.name).toLowerCase()
  if (!profile.allowedExts.includes(ext)) {
    return { ok: false, status: 400, message: profile.extMessage }
  }
  return { ok: true, ext }
}
