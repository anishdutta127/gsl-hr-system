/*
 * Build / maintain the three exit-letter .docx templates from the in-repo
 * letterheaded bases. Each letter's body is authored here from a constant and
 * written back into its OWN .docx so the letterhead survives:
 *
 *   1. RELIEVING-v1.docx   - body rewritten in place. Letterhead + footer live
 *      in word/header1.xml + word/footer1.xml (referenced from <w:sectPr>), so
 *      replacing only the <w:body> paragraphs and keeping the trailing sectPr
 *      preserves the GSL letterhead untouched.
 *   2. EXPERIENCE-v1.docx  - authored by cloning the RELIEVING base (which
 *      carries the letterhead header/footer parts) and swapping in the
 *      experience body. No dedicated GSL experience-letter source exists on the
 *      machine, so it reuses the relieving letterhead.
 *   3. NO-DUES-v1.docx     - body rewritten in place. This letter is a plain
 *      acknowledgement signed BY the employee: it has no header/footer parts
 *      and no inline logo (verified), so a full body rewrite is safe and keeps
 *      its own page setup (sectPr).
 *
 * Merge-tag field names match the finish-prompt spec (employeeName,
 * dateOfJoining, lastWorkingDay, settlementAmountFigures, legalEntityName,
 * brandName, subject/object/possessivePronoun, etc.) and are wired to their
 * defaults in src/lib/letterTemplates.ts. Signatory, legal entity and brand
 * come from config/company.json via that registry - never hardcoded here.
 *
 * Idempotent: each build regenerates the body from its constant, so re-running
 * is a no-op relative to the last run.
 *
 * Run: npx tsx scripts/build_exit_letter_templates.ts
 */

import fs from 'node:fs'
import path from 'node:path'
import PizZip from 'pizzip'

const DIR = path.join(process.cwd(), 'public', 'hr-templates')
const RELIEVING = path.join(DIR, 'RELIEVING-v1.docx')
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

// -------------------------------------------------------------------------
// Relieving letter (issued after full-and-final settlement).
// -------------------------------------------------------------------------
const RELIEVING_BODY: string = [
  para('{issueDate}'),
  para(''),
  para('Employee name: {employeeName}'),
  para('Designation: {designation}'),
  para('Employee code: {employeeCode}'),
  para('DOJ: {dateOfJoining}'),
  para(''),
  para(
    'You are relieved from the services of the business effective {lastWorkingDay}, which was treated as your last working day.',
  ),
  para(''),
  para(
    'We place on record our deep appreciation of your services with the company and thank you for the many contributions you have made during the tenure of your employment with us.',
  ),
  para(''),
  para('We wish you good luck in your future endeavors.'),
  para(''),
  para('Thanking you,'),
  para('Yours faithfully,'),
  para(''),
  para('{signatoryName}', true),
  para('{signatoryTitle}', true),
].join('')

// -------------------------------------------------------------------------
// Experience letter (service certificate).
//
// CONFIRM-WITH-RIDDHI:
//   - Tenure: the source template had a single "from [Date Effective]" blank.
//     Defaulted here to "from {dateOfJoining} to {lastWorkingDay}". Confirm she
//     wants both dates shown.
//   - Pronouns: the source had a stray hardcoded "him" in the last sentence.
//     Normalised to {objectPronoun}. All of he/she, him/her, his/her derive
//     from the employee gender field ({subjectPronoun}/{objectPronoun}/
//     {possessivePronoun}); only object + possessive appear in the final copy.
// -------------------------------------------------------------------------
const EXPERIENCE_BODY: string = [
  para('Date: {issueDate}'),
  para(''),
  para('Dear {salutationName},'),
  para(''),
  para(
    'This is to certify that {employeeName} was employed with {brandName} as a {designation} from {dateOfJoining} to {lastWorkingDay}.',
  ),
  para(''),
  para(
    '{employeeName} demonstrated efficiency at work and was a valuable contributor to the team. We found {objectPronoun} to be sincere, dedicated, and hardworking throughout {possessivePronoun} employment. We wish {objectPronoun} all the best in {possessivePronoun} future endeavors.',
  ),
  para(''),
  para('Thanking you,'),
  para('Yours faithfully'),
  para(''),
  para('{signatoryName}', true),
  para('{signatoryTitle}', true),
].join('')

// -------------------------------------------------------------------------
// No Dues / Notice certificate (signed BY the employee; no company signatory).
//
// The five numbered clauses are FIXED legal boilerplate tied to "the
// Agreement". They are authored verbatim here - the British-English lint and
// any auto-rewording MUST NOT touch them ("commercialize", "endeavors" etc.
// stay as written). Straight apostrophes match the source copy.
//
// CONFIRM-WITH-RIDDHI: the source opening line was garbled
// ("I, (Employee Code) - (Employee Code - ___)"); corrected to
// "I, {employeeName} (Employee Code - {employeeCode})". Confirm the wording.
// -------------------------------------------------------------------------
const NO_DUES_BODY: string = [
  para('To,'),
  para('Human Resources Department'),
  para('{legalEntityName}'),
  para(''),
  para('Dear Madam,'),
  para(''),
  para(
    "I, {employeeName} (Employee Code - {employeeCode}), acknowledge and confirm that with the payment of Rs. {settlementAmountFigures} (Indian Rupees {settlementAmountWords} only), all my dues will be fully and finally settled and paid by {legalEntityName} as per the Company's existing policies applicable to me at the time of cessation of my employment.",
  ),
  para(''),
  para('I confirm that I have no claim (monetary or otherwise) against {legalEntityName}.'),
  para(''),
  para(
    'I take this opportunity to reiterate key contractual obligations that remain binding beyond the term of the agreement:',
  ),
  para(''),
  para('1. Confidentiality', true),
  para(
    "As per Clause 7 of the Agreement, I'm required to maintain complete confidentiality of all information shared by the Company during the engagement. This obligation shall continue for a period of two (2) years post-expiry, and any disclosure or use without written consent from the Company will be deemed a breach.",
  ),
  para(''),
  para('2. Intellectual Property Rights', true),
  para(
    'All content, media, strategies, materials, and other work products created during the engagement are the exclusive intellectual property of the Company as per Clause 6. I shall not reproduce, distribute, use, or share any part of these works without prior written approval from the Company.',
  ),
  para(''),
  para('3. Non-Use Without Consent', true),
  para(
    "I'm not permitted to use, modify, or commercialize any deliverables, project outputs, or insights gained from the engagement for my personal, third-party, or commercial use without the express written consent of the Company.",
  ),
  para(''),
  para('4. Return of Company Materials', true),
  para(
    "I'm required to return all files, materials, documents, data (physical or digital), or assets provided during the course of the engagement, if not already submitted.",
  ),
  para(''),
  para('5. Indemnity and Compliance', true),
  para(
    "Any breach of the above clauses will attract appropriate legal recourse as per Clause 9 of the Agreement. I'm also responsible for compliance with any remaining provisions of the Agreement.",
  ),
  para(''),
  para(
    'Acknowledging the above, confirming my understanding and agreement. Attaching a signed copy of the letter.',
  ),
  para(''),
  para('Date: {date}'),
  para('Signature of Employee: ___________________'),
].join('')

/** Replace ONLY the <w:body> paragraphs of a document, keeping everything up
 *  to <w:body> (styles refs) and the trailing <w:sectPr>...</w:document> (which
 *  carries the header/footer references = letterhead). */
function swapBody(xml: string, body: string): string {
  const bodyOpen = xml.indexOf('<w:body>')
  const sectStart = xml.indexOf('<w:sectPr')
  if (bodyOpen === -1 || sectStart === -1) {
    throw new Error('Could not locate <w:body> / <w:sectPr>.')
  }
  const prefix = xml.slice(0, bodyOpen + '<w:body>'.length)
  const sectAndClose = xml.slice(sectStart) // includes </w:sectPr></w:body></w:document>
  return `${prefix}${body}${sectAndClose}`
}

function rewriteInPlace(file: string, body: string, label: string): void {
  const zip = new PizZip(fs.readFileSync(file))
  const xml = zip.file('word/document.xml')!.asText()
  zip.file('word/document.xml', swapBody(xml, body))
  const out = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' })
  fs.writeFileSync(file, out)
  console.log(`${label}: wrote ${path.relative(process.cwd(), file)} (${out.length} bytes).`)
}

function buildExperienceFromRelieving(): void {
  const zip = new PizZip(fs.readFileSync(RELIEVING))
  const xml = zip.file('word/document.xml')!.asText()
  zip.file('word/document.xml', swapBody(xml, EXPERIENCE_BODY))
  const out = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' })
  fs.writeFileSync(EXPERIENCE, out)
  console.log(`Experience: cloned RELIEVING letterhead -> ${path.relative(process.cwd(), EXPERIENCE)} (${out.length} bytes).`)
}

rewriteInPlace(RELIEVING, RELIEVING_BODY, 'Relieving')
buildExperienceFromRelieving()
rewriteInPlace(NO_DUES, NO_DUES_BODY, 'No Dues')
console.log('Done.')
