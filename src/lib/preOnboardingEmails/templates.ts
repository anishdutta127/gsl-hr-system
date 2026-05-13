/*
 * Inlined template strings - preferred over fs.readFile at runtime because
 * Next 14 serverless functions don't always carry the .md files into the
 * output unless we add them to outputFileTracingIncludes. Inlining sidesteps
 * the whole tracing question. The string content matches the Shruti-supplied
 * reference PDFs verbatim (with British spellings).
 */

import type { PreOnboardingTemplateId } from '.'

export const TEMPLATE_BODIES: Record<PreOnboardingTemplateId, string> = {
  'offer-intimation': `SUBJECT: Offer of Employment – {{positionTitle}}

Dear {{candidateName}},

Congratulations!

We are delighted to offer you a full-time position as {{positionTitle}} at {{location}} with {{companyName}}, effective {{joiningDate}}.

Your Cost to Company (CTC) will be Rs. {{ctcAmount}} LPA (Rupees {{ctcInWords}} only).

To initiate your pre-onboarding formalities, we kindly request you to share scanned copies of the following documents:

1. PAN Card
2. Aadhaar Card
3. Passport-size photograph
4. Cancelled cheque or first page of bank passbook
5. Educational qualifications - SSC to Post Graduation certificates and marksheets
6. New Joinee Form (attached - to be submitted in Excel format only)
7. PF Declaration Form (attached - duly signed)
8. Previous organisation appointment letter and resignation acceptance
9. Previous organisation relieving letter
10. Investment Declaration - Form 12BB (attached - optional)
11. Medical Policy Nomination Form (attached)

Please ensure that each document is named clearly for employee records (for example: {{candidateName}} - PAN).

Should you have any questions or require assistance, feel free to reach out.

We look forward to welcoming you to the team.

Warm regards,
{{recruiterName}}
{{recruiterEmail}}
{{companyName}}
`,
  'offer-followup': `SUBJECT: Follow-Up on Offer Acceptance – {{positionTitle}}

Dear {{candidateName}},

I hope this message finds you well.

We are writing to follow up on our earlier communication dated {{offerIntimationDate}} regarding your selection for the position of {{positionTitle}} at {{companyName}}.

We would appreciate it if you could kindly confirm your acceptance of the offer or let us know if you have any questions or require further clarification. This will help us proceed with the next steps of the onboarding process.

We look forward to hearing from you at your earliest convenience.

Warm regards,
{{recruiterName}}
{{recruiterEmail}}
{{companyName}}
`,
  'appointment-letter': `SUBJECT: Appointment Letter – {{positionTitle}}

Dear {{candidateName}},

Congratulations!

We are pleased to formally appoint you to the position of {{positionTitle}} with {{companyName}}.

We are confident that your skills, experience, and enthusiasm will be a valuable addition to our team.

Please find attached your official appointment letter, which outlines the terms and conditions of your employment. We request you to carefully review the document and return a signed copy of the letter along with your formal acceptance on or before {{appointmentReturnByDate}} for our records.

Upon receipt of the signed appointment letter, we will proceed with the remaining onboarding formalities and share further details regarding your joining process.

We look forward to welcoming you to {{companyName}} and are excited about the contributions you will bring. We wish you every success as you prepare to begin this new chapter with us.

Warm regards,
{{recruiterName}}
{{recruiterEmail}}
{{companyName}}
`,
  'notice-period-checkin': `SUBJECT: Checking in during your notice period – {{positionTitle}}

Dear {{candidateName}},

I hope you are doing well.

Thank you for confirming your acceptance of the offer for the position of {{positionTitle}} at {{companyName}}. We are delighted to have you join us.

We understand that you are currently serving your notice period, and we wanted to take this opportunity to check in with you. Please feel free to reach out if you have any questions, require any clarification, or need support related to the onboarding process during this period.

We will stay in touch as your joining date approaches and share further details in due course. In the meantime, we hope your transition goes smoothly.

Looking forward to working with you soon.

Warm regards,
{{recruiterName}}
{{recruiterEmail}}
{{companyName}}
`,
}
