/*
 * Registry of letter templates bundled with the app. One spec per template
 * declares:
 *   id        - stable id used in URLs and audit logs
 *   title     - display name on /letters
 *   filePath  - location under public/hr-templates/
 *   variables - array of { token, label, required, hint } describing what
 *               HR must fill in to generate the letter
 *
 * The generator (src/app/api/letters/[id]/generate/route.ts) loads the
 * template, fills tokens via docxtemplater, and returns a .docx stream.
 *
 * Adding a new template:
 *   1. Drop the editable .docx in public/hr-templates/<ID>-v<n>.docx
 *   2. Append a LetterTemplate entry here
 *   3. Next deploy bundles it into the serverless function automatically
 *      via next.config.mjs experimental.outputFileTracingIncludes
 */

export interface LetterVariable {
  token: string
  label: string
  required: boolean
  hint?: string
  defaultFrom?: 'employee.name' | 'employee.title' | 'employee.email' | 'employee.employeeCode' | 'employee.designation' | 'employee.department' | 'employee.location' | 'employee.dateOfJoining' | 'employee.phone' | 'company.signatoryName' | 'company.signatoryTitle' | 'today'
  multiline?: boolean
}

export interface LetterTemplate {
  id: string
  title: string
  description: string
  filePath: string
  variables: LetterVariable[]
  /** Audience of the letter — used to pre-filter employees on the picker. */
  audience: 'all-employees' | 'interns' | 'exited'
}

const COMMON_SIGNATORY: LetterVariable[] = [
  { token: 'signatoryName', label: 'Signatory name', required: true, defaultFrom: 'company.signatoryName' },
  { token: 'signatoryTitle', label: 'Signatory title', required: true, defaultFrom: 'company.signatoryTitle' },
]

export const LETTER_TEMPLATES: LetterTemplate[] = [
  {
    id: 'APPOINTMENT-SALES-v1',
    title: 'Appointment Letter (Sales & STEM)',
    description: 'Full appointment letter with salary structure. Use for Sales and STEM hires.',
    filePath: 'public/hr-templates/APPOINTMENT-SALES-v1.docx',
    audience: 'all-employees',
    variables: [
      { token: 'todayLong', label: 'Letter date (long form)', required: true, defaultFrom: 'today', hint: 'e.g., 24th April 2026' },
      { token: 'title', label: 'Title', required: true, defaultFrom: 'employee.title', hint: 'Mr./Ms./Mrs./Dr.' },
      { token: 'name', label: 'Full name', required: true, defaultFrom: 'employee.name' },
      { token: 'firstName', label: 'First name (salutation)', required: true },
      { token: 'email', label: 'Email', required: true, defaultFrom: 'employee.email' },
      { token: 'phone', label: 'Phone', required: true, defaultFrom: 'employee.phone' },
      { token: 'designation', label: 'Designation', required: true, defaultFrom: 'employee.designation' },
      { token: 'department', label: 'Department', required: true, defaultFrom: 'employee.department' },
      { token: 'location', label: 'Location', required: true, defaultFrom: 'employee.location' },
      { token: 'ctcAnnual', label: 'Annual CTC (numeric, Indian comma)', required: true, hint: 'e.g., 4,80,000' },
      { token: 'ctcWords', label: 'Annual CTC in words', required: true, hint: 'e.g., Four Lacs Eighty Thousand' },
      { token: 'joiningDateLong', label: 'Joining date (long form)', required: true },
      { token: 'basicMonthly', label: 'Basic - monthly', required: true },
      { token: 'basicAnnual', label: 'Basic - annual', required: true },
      { token: 'hraMonthly', label: 'HRA - monthly', required: true },
      { token: 'hraAnnual', label: 'HRA - annual', required: true },
      { token: 'grossMonthly', label: 'Gross - monthly', required: true },
      { token: 'grossAnnual', label: 'Gross - annual', required: true },
      { token: 'pfMonthly', label: 'PF - monthly', required: true },
      { token: 'pfAnnual', label: 'PF - annual', required: true },
      { token: 'ptMonthly', label: 'PT - monthly', required: true },
      { token: 'ptAnnual', label: 'PT - annual', required: true },
      { token: 'totalDeductionsMonthly', label: 'Total deductions - monthly', required: true },
      { token: 'totalDeductionsAnnual', label: 'Total deductions - annual', required: true },
      { token: 'netMonthly', label: 'Net - monthly', required: true },
      { token: 'netAnnual', label: 'Net - annual', required: true },
      ...COMMON_SIGNATORY,
    ],
  },
  {
    id: 'EMPLOYMENT-VERIFICATION-v1',
    title: 'Employment Verification Letter',
    description: 'Address verification / employment proof for a current employee.',
    filePath: 'public/hr-templates/EMPLOYMENT-VERIFICATION-v1.docx',
    audience: 'all-employees',
    variables: [
      { token: 'todayLong', label: 'Letter date (long form)', required: true, defaultFrom: 'today' },
      { token: 'title', label: 'Title', required: true, defaultFrom: 'employee.title' },
      { token: 'name', label: 'Full name', required: true, defaultFrom: 'employee.name' },
      { token: 'joiningDateLong', label: 'Joining date (long form)', required: true, defaultFrom: 'employee.dateOfJoining' },
      { token: 'designation', label: 'Designation', required: true, defaultFrom: 'employee.designation' },
      { token: 'department', label: 'Department', required: true, defaultFrom: 'employee.department' },
      { token: 'employeeCode', label: 'Employee code', required: true, defaultFrom: 'employee.employeeCode' },
      { token: 'pronounPossessive', label: 'Pronoun possessive', required: true, hint: 'his / her / their' },
      { token: 'addressLine1', label: 'Address line 1', required: true, multiline: false },
      { token: 'addressLine2', label: 'Address line 2', required: true, multiline: false },
      { token: 'addressLine3', label: 'Address line 3 (city, state, PIN)', required: true, multiline: false },
      { token: 'dobShort', label: 'Date of birth (dd/mm/yyyy)', required: true },
      { token: 'fathersName', label: "Father's name", required: true },
      { token: 'aadhaar', label: 'Aadhaar number', required: true },
      { token: 'pan', label: 'PAN number', required: true },
      ...COMMON_SIGNATORY,
    ],
  },
  {
    id: 'INTERNSHIP-OFFER-v1',
    title: 'Internship Offer Letter',
    description: 'Paid / unpaid internship offer. Fill stipend tokens carefully.',
    filePath: 'public/hr-templates/INTERNSHIP-OFFER-v1.docx',
    audience: 'interns',
    variables: [
      { token: 'todayLong', label: 'Letter date (long form)', required: true, defaultFrom: 'today' },
      { token: 'title', label: 'Title', required: true },
      { token: 'name', label: 'Full name', required: true },
      { token: 'firstName', label: 'First name (salutation)', required: true },
      { token: 'email', label: 'Email', required: true },
      { token: 'startDateLong', label: 'Start date (long form)', required: true },
      { token: 'endDateLong', label: 'End date (long form)', required: true },
      { token: 'reportingManager', label: 'Reporting manager (full)', required: true },
      { token: 'department', label: 'Department', required: true },
      { token: 'stipendAmount', label: 'Monthly stipend (numeric)', required: true, hint: 'e.g., 6,000' },
      { token: 'stipendWords', label: 'Monthly stipend (words)', required: true, hint: 'e.g., Rupees Six Thousand' },
      ...COMMON_SIGNATORY,
    ],
  },
  {
    id: 'INTERNSHIP-COMPLETION-v1',
    title: 'Internship Completion Letter',
    description: 'Issued on successful completion of internship period.',
    filePath: 'public/hr-templates/INTERNSHIP-COMPLETION-v1.docx',
    audience: 'interns',
    variables: [
      { token: 'todayLong', label: 'Letter date (long form)', required: true, defaultFrom: 'today' },
      { token: 'title', label: 'Title', required: true },
      { token: 'name', label: 'Full name', required: true },
      { token: 'email', label: 'Email', required: true },
      { token: 'startDateLong', label: 'Internship start (long form)', required: true },
      { token: 'endDateLong', label: 'Internship end (long form)', required: true },
      { token: 'hoursCompleted', label: 'Hours completed', required: true, hint: 'e.g., 120' },
      { token: 'pronounSubject', label: 'Pronoun subject', required: true, hint: 'He / She / They' },
      ...COMMON_SIGNATORY,
    ],
  },
  {
    id: 'RELIEVING-v1',
    title: 'Relieving Letter',
    description: 'Issued after full-and-final settlement. Audience: exited employees.',
    filePath: 'public/hr-templates/RELIEVING-v1.docx',
    audience: 'exited',
    variables: [
      { token: 'todayLong', label: 'Letter date (long form)', required: true, defaultFrom: 'today' },
      { token: 'name', label: 'Full name', required: true, defaultFrom: 'employee.name' },
      { token: 'designation', label: 'Designation', required: true, defaultFrom: 'employee.designation' },
      { token: 'employeeCode', label: 'Employee code', required: true, defaultFrom: 'employee.employeeCode' },
      { token: 'joiningDateLong', label: 'Date of joining (long form)', required: true, defaultFrom: 'employee.dateOfJoining' },
      { token: 'lastWorkingDayLong', label: 'Last working day (long form)', required: true },
      ...COMMON_SIGNATORY,
    ],
  },
  {
    id: 'NO-DUES-v1',
    title: 'No Dues Letter',
    description: "Acknowledgement of full and final settlement.",
    filePath: 'public/hr-templates/NO-DUES-v1.docx',
    audience: 'exited',
    variables: [
      { token: 'name', label: 'Full name', required: true, defaultFrom: 'employee.name' },
      { token: 'employeeCode', label: 'Employee code', required: true, defaultFrom: 'employee.employeeCode' },
      { token: 'duesAmount', label: 'Settlement amount (numeric)', required: true, hint: 'e.g., 1,04,501' },
      { token: 'duesAmountWords', label: 'Settlement amount (words)', required: true, hint: 'One Lakh Four Thousand Five Hundred and One' },
    ],
  },
]

export function findTemplateById(id: string): LetterTemplate | undefined {
  return LETTER_TEMPLATES.find((t) => t.id === id)
}

export function todayLongEnGB(): string {
  const d = new Date()
  const day = d.getDate()
  const month = d.toLocaleString('en-GB', { month: 'long' })
  const year = d.getFullYear()
  const suffix = day % 10 === 1 && day !== 11 ? 'st' : day % 10 === 2 && day !== 12 ? 'nd' : day % 10 === 3 && day !== 13 ? 'rd' : 'th'
  return `${day}${suffix} ${month} ${year}`
}
