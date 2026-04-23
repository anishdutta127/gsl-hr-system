/*
 * Loader for config/company.json. Committed file (not queued).
 * Every template and UI chrome string reads from here so single-tenant
 * → multi-tenant migration is a data reshape, not a string grep.
 */

import fs from 'node:fs'
import path from 'node:path'

export interface CompanyConfig {
  name: string
  legalName: string
  tagline: string
  logoPath: string
  gstin: string
  cin: string
  pan: string
  registeredAddress: {
    line1: string
    line2: string
    city: string
    state: string
    pincode: string
    country: string
  }
  signatory: {
    name: string
    title: string
    email: string
    phone: string
  }
  hrContact: {
    name: string
    title: string
    email: string
    whatsapp: string
  }
  website: string
  parentGroup: string
}

let cached: CompanyConfig | null = null

export function loadCompany(): CompanyConfig {
  if (cached) return cached
  const filepath = path.join(process.cwd(), 'config', 'company.json')
  const text = fs.readFileSync(filepath, 'utf-8')
  cached = JSON.parse(text) as CompanyConfig
  return cached
}
