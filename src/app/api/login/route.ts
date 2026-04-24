import { NextResponse } from 'next/server'
import { findUserByEmail } from '@/lib/data'
import { verifyPassword } from '@/lib/crypto/password'
import { issueSessionToken, sessionCookieOptions, SESSION_COOKIE_NAME } from '@/lib/crypto/jwt'

export const runtime = 'nodejs' // bcryptjs requires Node runtime

interface Body {
  email?: unknown
  password?: unknown
}

export async function POST(request: Request) {
  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ message: 'Invalid request.' }, { status: 400 })
  }

  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''

  if (!email || !password) {
    return NextResponse.json({ message: 'Email and password required.' }, { status: 400 })
  }

  const user = findUserByEmail(email)
  if (!user) {
    // Intentionally generic message: don't confirm email existence.
    return NextResponse.json({ message: 'Invalid credentials.' }, { status: 401 })
  }

  const ok = await verifyPassword(password, user.bcryptHash)
  if (!ok) {
    return NextResponse.json({ message: 'Invalid credentials.' }, { status: 401 })
  }

  const token = await issueSessionToken({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  })

  const response = NextResponse.json({ ok: true, user: { email: user.email, name: user.name, role: user.role } })
  response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions())
  return response
}
