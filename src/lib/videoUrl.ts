/*
 * Video URL validator. Candidates host their own recordings on Drive,
 * OneDrive, or SharePoint and paste the share link. We do not ingest
 * the video file for storage, bandwidth, and biometric-PII reasons
 * (see CLAUDE.md "Data boundaries").
 */

const ALLOWED_HOSTS = [
  'drive.google.com',
  'docs.google.com',
  '1drv.ms',
  'onedrive.live.com',
  'sharepoint.com',
]

export interface VideoUrlResult {
  valid: boolean
  reason?: string
  host?: string
}

export function validateVideoUrl(raw: string): VideoUrlResult {
  const trimmed = raw.trim()
  if (!trimmed) return { valid: false, reason: 'Paste a link first.' }
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return { valid: false, reason: 'That does not look like a URL. Include https:// at the front.' }
  }
  if (parsed.protocol !== 'https:') {
    return { valid: false, reason: 'Use an https link.' }
  }
  const host = parsed.hostname.toLowerCase()
  const match = ALLOWED_HOSTS.find((h) => host === h || host.endsWith(`.${h}`))
  if (!match) {
    return {
      valid: false,
      reason: 'Only Drive, OneDrive, or SharePoint links accepted.',
    }
  }
  return { valid: true, host: match }
}

export const SUPPORTED_VIDEO_HOSTS = ALLOWED_HOSTS.slice()
