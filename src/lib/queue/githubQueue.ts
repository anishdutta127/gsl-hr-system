/*
 * GitHub-backed persistence for write paths that can't touch Vercel's
 * serverless filesystem (read-only outside /tmp). Appends to
 * src/data/pending_updates.json via the GitHub Contents API so the
 * self-hosted sync runner picks up the queue on its next tick.
 *
 * Inherited verbatim from gsl-mou-system with HR-specific repo default.
 * 409 conflict handling: two concurrent writers both PUT with stale sha,
 * second 409s, we refetch and retry up to 3 times with jittered backoff.
 *
 * Commits tagged `chore(queue):` so vercel.json's ignoreCommand skips
 * rebuilds on queue-only churn. The runner's sync commits (no prefix)
 * trigger the build that surfaces updated data in the app.
 */

import type { PendingUpdate } from '../types'

const DEFAULT_REPO = 'anishdutta127/gsl-hr-system'
const DEFAULT_BRANCH = 'main'

export class QueueNotConfiguredError extends Error {
  constructor() {
    super(
      'GSL_QUEUE_GITHUB_TOKEN is not set. Writes cannot persist without it. ' +
        'Add a fine-grained PAT with Contents:read+write scope in Vercel env and redeploy.',
    )
    this.name = 'QueueNotConfiguredError'
  }
}

export class QueueConflictError extends Error {
  constructor(public readonly path: string, public readonly attempts: number) {
    super(
      `Persistent 409 conflict writing ${path} after ${attempts} attempts. ` +
        `Another writer keeps beating us to the commit; try again in a moment.`,
    )
    this.name = 'QueueConflictError'
  }
}

export class QueueUpstreamError extends Error {
  constructor(
    public readonly path: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`GitHub Contents API ${status} on ${path}: ${body.slice(0, 200)}`)
    this.name = 'QueueUpstreamError'
  }
}

interface GithubContentsGet {
  content: string
  encoding: 'base64'
  sha: string
}

function githubRepo(): string {
  return process.env.GSL_QUEUE_REPO ?? DEFAULT_REPO
}

function githubBranch(): string {
  return process.env.GSL_QUEUE_BRANCH ?? DEFAULT_BRANCH
}

function githubToken(): string {
  const tok = process.env.GSL_QUEUE_GITHUB_TOKEN
  if (!tok) throw new QueueNotConfiguredError()
  return tok
}

function authHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${githubToken()}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'gsl-hr-system-queue',
  }
}

async function getFile(path: string): Promise<{ text: string; sha: string } | null> {
  const url =
    `https://api.github.com/repos/${githubRepo()}/contents/${encodeURIComponent(path)}` +
    `?ref=${encodeURIComponent(githubBranch())}`
  const res = await fetch(url, { headers: authHeaders(), cache: 'no-store' })
  if (res.status === 404) return null
  if (!res.ok) {
    throw new QueueUpstreamError(path, res.status, await res.text())
  }
  const body = (await res.json()) as GithubContentsGet
  const text = Buffer.from(body.content, 'base64').toString('utf-8')
  return { text, sha: body.sha }
}

async function putFile(
  path: string,
  newText: string,
  sha: string | null,
  message: string,
): Promise<{ status: number; body: string }> {
  const url = `https://api.github.com/repos/${githubRepo()}/contents/${encodeURIComponent(path)}`
  const payload: Record<string, string> = {
    message,
    content: Buffer.from(newText, 'utf-8').toString('base64'),
    branch: githubBranch(),
  }
  if (sha) payload.sha = sha
  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return { status: res.status, body: await res.text() }
}

function jitterMs(): number {
  return 150 + Math.floor(Math.random() * 100)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function atomicUpdateJson<T>(
  path: string,
  mutate: (current: T) => { next: T; commitMessage: string },
  options: {
    defaultValue: T
    maxRetries?: number
  },
): Promise<{ next: T; commitSha: string }> {
  const max = options.maxRetries ?? 3
  for (let attempt = 1; attempt <= max; attempt++) {
    const existing = await getFile(path)
    const currentText = existing?.text ?? JSON.stringify(options.defaultValue, null, 2)
    let parsed: T
    try {
      parsed = JSON.parse(currentText) as T
    } catch {
      parsed = options.defaultValue
    }
    const { next, commitMessage } = mutate(parsed)
    const newText = JSON.stringify(next, null, 2) + '\n'
    const { status, body } = await putFile(path, newText, existing?.sha ?? null, commitMessage)
    if (status === 200 || status === 201) {
      const parsedBody = JSON.parse(body) as { commit?: { sha?: string } }
      return { next, commitSha: parsedBody.commit?.sha ?? '' }
    }
    if (status === 409 || status === 422) {
      if (attempt < max) {
        await sleep(jitterMs())
        continue
      }
      throw new QueueConflictError(path, attempt)
    }
    throw new QueueUpstreamError(path, status, body)
  }
  throw new QueueConflictError(path, max)
}

const PENDING_UPDATES_PATH = 'src/data/pending_updates.json'

/** Write a binary blob (PDF, DOCX, etc.) to a path in the repo. Used by
 * the resume upload endpoint; the queue runner is not involved because
 * the file lands directly via the Contents API and the deploy follows
 * automatically once a non-`chore(queue):` commit lands. */
export async function putBinaryFile(
  path: string,
  bytes: Buffer,
  commitMessage: string,
): Promise<{ commitSha: string }> {
  const url = `https://api.github.com/repos/${githubRepo()}/contents/${encodeURIComponent(path)}`
  const existing = await getFile(path).catch(() => null)
  const payload: Record<string, string> = {
    message: commitMessage,
    content: bytes.toString('base64'),
    branch: githubBranch(),
  }
  if (existing?.sha) payload.sha = existing.sha
  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (res.status !== 200 && res.status !== 201) {
    throw new QueueUpstreamError(path, res.status, await res.text())
  }
  const parsedBody = (await res.json()) as { commit?: { sha?: string } }
  return { commitSha: parsedBody.commit?.sha ?? '' }
}

/**
 * Best-effort delete of a binary file. Used to clean up orphans when the
 * record-update queue write fails after the file write succeeded. Failures
 * are swallowed (logged) — the orphan is recoverable manually, but a delete
 * exception must not mask the original upload error to the user.
 */
export async function deleteBinaryFile(path: string, reason: string): Promise<void> {
  try {
    const existing = await getFile(path)
    if (!existing) return
    const url = `https://api.github.com/repos/${githubRepo()}/contents/${encodeURIComponent(path)}`
    await fetch(url, {
      method: 'DELETE',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `chore(resumes): cleanup orphan after ${reason}`,
        sha: existing.sha,
        branch: githubBranch(),
      }),
    })
  } catch (err) {
    console.error('[deleteBinaryFile] cleanup failed for', path, err)
  }
}

/**
 * Trigger a workflow_dispatch GitHub Action. Used by the admin "Sync now"
 * button to force the apply-queue workflow to run immediately instead of
 * waiting for the next 5-minute cron tick. Requires the queue PAT to have
 * `actions:write` scope on the repo; if it does not, GitHub returns 403
 * and we surface a clear configuration error rather than retrying.
 */
export async function dispatchWorkflow(workflowFileName: string): Promise<void> {
  const url =
    `https://api.github.com/repos/${githubRepo()}/actions/workflows/` +
    `${encodeURIComponent(workflowFileName)}/dispatches`
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: githubBranch() }),
  })
  if (res.status === 204) return
  const body = await res.text()
  throw new QueueUpstreamError(workflowFileName, res.status, body)
}

export async function appendToQueue(entry: PendingUpdate): Promise<{ commitSha: string }> {
  const { commitSha } = await atomicUpdateJson<PendingUpdate[]>(
    PENDING_UPDATES_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      const next = [...list, entry]
      const label = `${entry.entity}.${entry.operation}`
      return {
        next,
        commitMessage: `chore(queue): append ${label} (${entry.id.slice(0, 8)})`,
      }
    },
    { defaultValue: [] as PendingUpdate[], maxRetries: 3 },
  )
  return { commitSha }
}
