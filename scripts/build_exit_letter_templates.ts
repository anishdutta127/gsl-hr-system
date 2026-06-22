/*
 * Build / maintain the exit-letter .docx templates from the in-repo
 * RELIEVING-v1.docx base (which carries the GSL letterhead header/footer).
 *
 *   1. EXPERIENCE-v1.docx - authored fresh by cloning the relieving base and
 *      swapping the body paragraphs. None existed before; the three named
 *      Downloads source files were not present on this machine, so the in-repo
 *      relieving template (real GSL letter copy + letterhead) is the source.
 *   2. NO-DUES-v1.docx     - patched in place to add a {date} placeholder on
 *      the "Date:" line (the five contractual clauses are already boilerplate).
 *
 * Idempotent: re-running rebuilds EXPERIENCE-v1 from the base and re-applies
 * the No Dues patch only if the {date} token is absent.
 *
 * Run: npx tsx scripts/build_exit_letter_templates.ts
 */

import fs from 'node:fs'
import path from 'node:path'
import PizZip from 'pizzip'

const DIR = path.join(process.cwd(), 'public', 'hr-templates')
const BASE = path.join(DIR, 'RELIEVING-v1.docx')
const EXPERIENCE = path.join(DIR, 'EXPERIENCE-v1.docx')
const NO_DUES = path.join(DIR, 'NO-DUES-v1.docx')

const RPR_NORMAL =
  '<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:asciiTheme="minorAscii" w:hAnsiTheme="minorAscii" w:cstheme="minorAscii"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>'
const RPR_BOLD =
  '<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:asciiTheme="minorAscii" w:hAnsiTheme="minorAscii" w:cstheme="minorAscii"/><w:b w:val="1"/><w:bCs w:val="1"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>'

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** One justified paragraph. Empty text = a blank spacer line. */
function para(text: string, bold = false): string {
  const ppr = '<w:pPr><w:jc w:val="both"/></w:pPr>'
  if (text === '') return `<w:p>${ppr}</w:p>`
  const rpr = bold ? RPR_BOLD : RPR_NORMAL
  return `<w:p>${ppr}<w:r>${rpr}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`
}

const EXPERIENCE_BODY: string = [
  para('{issueDate}', true),
  para(''),
  para('TO WHOMSOEVER IT MAY CONCERN', true),
  para(''),
  para('Dear {salutationName},'),
  para(''),
  para(
    'This is to certify that {employeeName} was employed with {employerName} as {designation} from {employmentFrom} to {employmentTo}.',
  ),
  para(''),
  para(
    'During {pronounPossessive} tenure with us, we found {pronounObject} to be sincere, hardworking and professional in {pronounPossessive} conduct. {pronounSubject} discharged {pronounPossessive} responsibilities to our satisfaction.',
  ),
  para(''),
  para('We wish {pronounObject} all the best for {pronounPossessive} future endeavours.'),
  para(''),
  para('Thanking you,'),
  para(''),
  para('Yours faithfully,'),
  para(''),
  para('{signatoryName}', true),
  para('{signatoryTitle}', true),
].join('')

function buildExperience(): void {
  const baseBuf = fs.readFileSync(BASE)
  const zip = new PizZip(baseBuf)
  const xml = zip.file('word/document.xml')!.asText()

  const bodyOpen = xml.indexOf('<w:body>')
  const sectStart = xml.indexOf('<w:sectPr')
  if (bodyOpen === -1 || sectStart === -1) {
    throw new Error('Could not locate <w:body> / <w:sectPr> in the base template.')
  }
  const prefix = xml.slice(0, bodyOpen + '<w:body>'.length)
  const sectAndClose = xml.slice(sectStart) // includes </w:sectPr></w:body></w:document>

  const next = `${prefix}${EXPERIENCE_BODY}${sectAndClose}`
  zip.file('word/document.xml', next)

  // app.xml may carry a stale page count / template title - harmless, leave as is.
  const out = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' })
  fs.writeFileSync(EXPERIENCE, out)
  console.log(`Wrote ${path.relative(process.cwd(), EXPERIENCE)} (${out.length} bytes).`)
}

function patchNoDues(): void {
  const buf = fs.readFileSync(NO_DUES)
  const zip = new PizZip(buf)
  const xml = zip.file('word/document.xml')!.asText()
  if (xml.includes('{date}')) {
    console.log('NO-DUES-v1.docx already has {date}; no change.')
    return
  }
  // Append {date} inside the existing "Date:" run text (keeps formatting).
  const patched = xml.replace(/(<w:t[^>]*>Date:[^<]*)(<\/w:t>)/, (_m, head: string, tail: string) => {
    const sep = head.endsWith(' ') ? '' : ' '
    return `${head}${sep}{date}${tail}`
  })
  if (patched === xml) {
    throw new Error('Could not find the "Date:" run to patch in NO-DUES-v1.docx.')
  }
  zip.file('word/document.xml', patched)
  const out = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' })
  fs.writeFileSync(NO_DUES, out)
  console.log(`Patched ${path.relative(process.cwd(), NO_DUES)} with {date} (${out.length} bytes).`)
}

buildExperience()
patchNoDues()
console.log('Done.')
