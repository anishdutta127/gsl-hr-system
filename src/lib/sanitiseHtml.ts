/*
 * HTML sanitiser used by the rich text role description and any other surface
 * that lets staff (or, defence-in-depth, candidates) submit HTML that is later
 * rendered with dangerouslySetInnerHTML.
 *
 * Whitelist tracks the TipTap formatting set: bold/italic/underline,
 * highlight (rendered as <mark>), bullet/ordered lists, headings 2-3, links,
 * paragraphs, line breaks. Strips scripts, styles, event handlers, and
 * non-http(s) link schemes (no javascript: URLs).
 *
 * sanitize-html (not isomorphic-dompurify) — pure JS, no jsdom, runs cleanly
 * in Next's "collect page data" step at build time.
 */

import sanitizeHtml from 'sanitize-html'

const BASE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p',
    'br',
    'strong',
    'b',
    'em',
    'i',
    'u',
    'mark',
    'h2',
    'h3',
    'ul',
    'ol',
    'li',
    'a',
    'span',
  ],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  // Force every link to open in a new tab and strip referrer.
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }),
  },
}

export function sanitiseRoleHtml(html: string): string {
  if (!html) return ''
  return sanitizeHtml(html, BASE_OPTIONS)
}

/** Wrap legacy plain-text JDs in a single <p> so the rich editor and the
 * careers page both render them as paragraphs without surprise. */
export function plainTextToHtml(text: string): string {
  if (!text) return ''
  // If the value already looks like HTML (starts with a tag), pass through.
  if (/^\s*</.test(text)) return text
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
  // Preserve double newlines as paragraph breaks; single newlines become <br>.
  const paragraphs = escaped
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('')
  return paragraphs
}
