import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  assertInsideResumeRoot,
  buildApplicationResumePath,
  buildResumeRepoPath,
} from '../resumePath'

/*
 * The validator works against the real filesystem (fs.realpathSync etc.),
 * so we stage a fake "repo" in a tmpdir, mirror the two sanctioned roots
 * inside it, and pass it as cwd. This catches the symlink-escape and
 * traversal cases properly without needing to mock fs.
 */

let cwd: string
let outsideFile: string

beforeAll(() => {
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'gsl-resume-test-'))

  // Mirror the two sanctioned roots.
  fs.mkdirSync(path.join(cwd, 'data/resumes/uploads/2026/05'), { recursive: true })
  fs.mkdirSync(path.join(cwd, 'data/resumes/applications/2026/05'), { recursive: true })
  fs.mkdirSync(path.join(cwd, 'data/resumes/imports/batch-1'), { recursive: true })
  fs.mkdirSync(path.join(cwd, 'onedrive-data/seed/resumes/Academics Team'), { recursive: true })

  // Seed sample resumes at each path.
  fs.writeFileSync(path.join(cwd, 'data/resumes/uploads/2026/05/upload.pdf'), 'pdf-bytes')
  fs.writeFileSync(
    path.join(cwd, 'data/resumes/applications/2026/05/application.pdf'),
    'pdf-bytes',
  )
  fs.writeFileSync(
    path.join(cwd, 'data/resumes/imports/batch-1/import.pdf'),
    'pdf-bytes',
  )
  fs.writeFileSync(
    path.join(cwd, 'onedrive-data/seed/resumes/Academics Team/Anusha.pdf'),
    'pdf-bytes',
  )

  // A file outside both roots, used in escape tests.
  outsideFile = path.join(cwd, 'config/secrets.json')
  fs.mkdirSync(path.dirname(outsideFile), { recursive: true })
  fs.writeFileSync(outsideFile, '{"k":"v"}')
})

afterAll(() => {
  fs.rmSync(cwd, { recursive: true, force: true })
})

describe('buildResumeRepoPath / buildApplicationResumePath', () => {
  it('staff/self-upload path lands under data/resumes/uploads', () => {
    const p = buildResumeRepoPath('abc-123', '.pdf')
    expect(p.startsWith('data/resumes/uploads/')).toBe(true)
    expect(p.endsWith('/abc-123.pdf')).toBe(true)
  })

  it('public application path lands under data/resumes/applications', () => {
    const p = buildApplicationResumePath('abc-123', '.PDF')
    expect(p.startsWith('data/resumes/applications/')).toBe(true)
    // Extension is normalised to lowercase for case-insensitive disk lookup.
    expect(p.endsWith('/abc-123.pdf')).toBe(true)
  })
})

describe('assertInsideResumeRoot — accepts paths inside the roots', () => {
  it('serves a resume under data/resumes/uploads', () => {
    const r = assertInsideResumeRoot('data/resumes/uploads/2026/05/upload.pdf', cwd)
    expect(r.ok).toBe(true)
  })

  it('serves a resume under data/resumes/applications', () => {
    const r = assertInsideResumeRoot('data/resumes/applications/2026/05/application.pdf', cwd)
    expect(r.ok).toBe(true)
  })

  it('serves a resume under a NEW data/resumes subdir without code change', () => {
    // This is the structural win: imports/ never existed in the old allow-list.
    const r = assertInsideResumeRoot('data/resumes/imports/batch-1/import.pdf', cwd)
    expect(r.ok).toBe(true)
  })

  it('serves a resume under onedrive-data/seed/resumes', () => {
    const r = assertInsideResumeRoot(
      'onedrive-data/seed/resumes/Academics Team/Anusha.pdf',
      cwd,
    )
    expect(r.ok).toBe(true)
  })
})

describe('assertInsideResumeRoot — rejects unsafe paths', () => {
  it('rejects path traversal with .. segments', () => {
    const r = assertInsideResumeRoot('data/resumes/uploads/../../../config/secrets.json', cwd)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.status).toBe(403)
      expect(r.message).toMatch(/traversal/i)
    }
  })

  it('rejects absolute paths', () => {
    const abs = path.resolve(cwd, 'data/resumes/uploads/2026/05/upload.pdf')
    const r = assertInsideResumeRoot(abs, cwd)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(403)
  })

  it('rejects null bytes', () => {
    const r = assertInsideResumeRoot('data/resumes/uploads/x.pdf\0.txt', cwd)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(400)
  })

  it('rejects a file outside both roots', () => {
    const r = assertInsideResumeRoot('config/secrets.json', cwd)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(403)
  })

  it('returns 404 with the operator-actionable message when file is missing', () => {
    const r = assertInsideResumeRoot(
      'data/resumes/uploads/2026/05/does-not-exist.pdf',
      cwd,
    )
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.status).toBe(404)
      expect(r.message).toBe('Resume file not found at expected path. Contact admin.')
    }
  })

  // Symlink escape: a symlink that lives "inside" data/resumes but points to
  // a file outside both roots. realpath should resolve to the outside target,
  // so the validator must reject. Skipped on Windows where unprivileged
  // symlink creation needs Developer Mode and would flake CI on dev boxes
  // that don't have it.
  const canSymlink = process.platform !== 'win32'
  it.skipIf(!canSymlink)('rejects a symlink that escapes the root', () => {
    const linkPath = path.join(cwd, 'data/resumes/uploads/2026/05/escape.pdf')
    fs.symlinkSync(outsideFile, linkPath)
    const r = assertInsideResumeRoot(
      'data/resumes/uploads/2026/05/escape.pdf',
      cwd,
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(403)
  })
})
