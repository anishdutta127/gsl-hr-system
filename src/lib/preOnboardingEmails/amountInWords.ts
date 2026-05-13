/*
 * Convert an integer rupee amount into Indian-English words ("Twelve Lakh
 * Fifty Thousand"). Used by the offer-intimation template's CTC line, which
 * Shruti reads as "Rupees Twelve Lakh Fifty Thousand only" - no fractional
 * paise, no "and 0/100".
 *
 * Handles 0 → 99,99,99,999 (just under a hundred crore). For larger or
 * non-integer amounts we still return a best-effort phrase rather than
 * throwing, because the renderer is called at draft time and failing the
 * whole modal because of a bad CTC would be worse than emitting "Zero".
 */

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
]

const TENS = [
  '',
  '',
  'Twenty',
  'Thirty',
  'Forty',
  'Fifty',
  'Sixty',
  'Seventy',
  'Eighty',
  'Ninety',
]

function twoDigits(n: number): string {
  if (n === 0) return ''
  if (n < 20) return ONES[n] ?? ''
  const tens = Math.floor(n / 10)
  const ones = n % 10
  return ones ? `${TENS[tens]} ${ONES[ones]}` : (TENS[tens] ?? '')
}

function threeDigits(n: number): string {
  if (n === 0) return ''
  const hundreds = Math.floor(n / 100)
  const rest = n % 100
  const head = hundreds ? `${ONES[hundreds]} Hundred` : ''
  const tail = twoDigits(rest)
  if (head && tail) return `${head} ${tail}`
  return head || tail
}

/** "Rupees Twelve Lakh Fifty Thousand only" - without the leading "Rupees"
 * and trailing "only" markers, the caller adds those. */
export function amountToWordsIndian(amount: number): string {
  if (!Number.isFinite(amount)) return 'Zero'
  const rounded = Math.round(amount)
  if (rounded === 0) return 'Zero'
  if (rounded < 0) return `Minus ${amountToWordsIndian(-rounded)}`

  // Split: [crore][lakh][thousand][rest-three-digits]
  const crore = Math.floor(rounded / 1e7)
  const lakh = Math.floor((rounded % 1e7) / 1e5)
  const thousand = Math.floor((rounded % 1e5) / 1e3)
  const rest = rounded % 1e3

  const parts: string[] = []
  if (crore > 0) {
    parts.push(`${twoDigits(crore) || ONES[crore]} Crore`)
  }
  if (lakh > 0) {
    parts.push(`${twoDigits(lakh) || ONES[lakh]} Lakh`)
  }
  if (thousand > 0) {
    parts.push(`${twoDigits(thousand) || ONES[thousand]} Thousand`)
  }
  if (rest > 0) {
    parts.push(threeDigits(rest))
  }
  return parts.join(' ')
}
