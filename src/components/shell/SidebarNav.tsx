'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Briefcase,
  Users,
  FileSignature,
  FileText,
  Building2,
  LayoutDashboard,
  Sparkles,
  ClipboardList,
  Bell,
  MessageSquare,
  LogOut,
  Mail,
  Settings,
  UserCog,
  UserCircle,
  CalendarDays,
  CalendarClock,
  FolderLock,
  UserPlus,
  UserMinus,
  PalmtreeIcon,
  BarChart3,
  ExternalLink,
  Tags,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { StaffRole } from '@/lib/types'

type Accent = 'navy' | 'orange' | 'neutral'

interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  roles: StaffRole[]
  external?: boolean
  /** Phase identifier shown as a "Coming soon" badge. When set, the row is
   * non-interactive and rendered muted. */
  comingSoon?: string
}

interface NavSection {
  title: string
  accent: Accent
  items: NavItem[]
}

const ALL_STAFF: StaffRole[] = ['Admin', 'HR', 'HOD', 'Leadership']
const ADMIN_HR: StaffRole[] = ['Admin', 'HR']
const ADMIN_HR_HOD: StaffRole[] = ['Admin', 'HR', 'HOD']
const ADMIN_HR_LEAD: StaffRole[] = ['Admin', 'HR', 'Leadership']

const SECTIONS: NavSection[] = [
  {
    title: 'Recruitment',
    accent: 'navy',
    items: [
      { label: 'Home', href: '/', icon: LayoutDashboard, roles: ALL_STAFF },
      { label: 'Dashboard', href: '/dashboard', icon: ClipboardList, roles: ADMIN_HR_LEAD },
      { label: 'Alerts', href: '/alerts', icon: Bell, roles: ADMIN_HR_HOD },
      { label: 'Roles', href: '/roles', icon: Briefcase, roles: ALL_STAFF },
      { label: 'Candidates', href: '/candidates', icon: Users, roles: ADMIN_HR_HOD },
      { label: 'Interviews', href: '/interviews', icon: MessageSquare, roles: ADMIN_HR_HOD },
      { label: 'Offers', href: '/offers', icon: FileSignature, roles: ADMIN_HR },
      { label: 'Letters', href: '/letters', icon: FileText, roles: ADMIN_HR },
      { label: 'Emails', href: '/emails', icon: Mail, roles: ADMIN_HR },
      { label: 'Prompts', href: '/prompts', icon: Sparkles, roles: ADMIN_HR_HOD },
      { label: 'Exits', href: '/exits', icon: LogOut, roles: ADMIN_HR },
      { label: 'Careers (public)', href: '/careers', icon: ExternalLink, roles: ADMIN_HR_HOD, external: true },
    ],
  },
  {
    title: 'HR Operations',
    accent: 'orange',
    items: [
      { label: 'Employees', href: '/employees', icon: Building2, roles: ADMIN_HR_LEAD },
      { label: 'Holiday Calendar', href: '/holidays', icon: CalendarDays, roles: ADMIN_HR_LEAD },
      { label: 'Roster', href: '/roster', icon: CalendarClock, roles: ADMIN_HR_LEAD },
      { label: 'Documents', href: '/documents', icon: FolderLock, roles: ADMIN_HR },
      { label: 'Locations and depts', href: '/admin/taxonomy', icon: Tags, roles: ADMIN_HR },
      { label: 'Onboarding', href: '/onboarding', icon: UserPlus, roles: ALL_STAFF },
      { label: 'Offboarding', href: '/offboarding', icon: UserMinus, roles: ALL_STAFF },
      { label: 'Leave', href: '#', icon: PalmtreeIcon, roles: ALL_STAFF, comingSoon: 'Phase 3' },
      { label: 'Reports', href: '#', icon: BarChart3, roles: ALL_STAFF, comingSoon: 'Phase 4' },
    ],
  },
  {
    title: 'Admin',
    accent: 'neutral',
    items: [
      { label: 'Users', href: '/users', icon: UserCog, roles: ['Admin'] },
      { label: 'Settings', href: '/settings', icon: Settings, roles: ['Admin'] },
      { label: 'My account', href: '/account', icon: UserCircle, roles: ALL_STAFF },
    ],
  },
]

/** Visible-to-this-role section. Drops items where role isn't allowed; drops
 * the whole section if every item dropped. */
export function visibleSections(role: StaffRole, sections: NavSection[] = SECTIONS): NavSection[] {
  return sections
    .map((s) => ({ ...s, items: s.items.filter((i) => i.roles.includes(role)) }))
    .filter((s) => s.items.length > 0)
}

const HEADER_CLASS: Record<Accent, string> = {
  navy: 'text-navy',
  orange: 'text-orange-dark',
  neutral: 'text-ink-3',
}

const ACTIVE_CLASS: Record<Accent, string> = {
  navy: 'bg-navy-light text-navy-dark',
  orange: 'bg-orange-light text-orange-dark',
  neutral: 'bg-surface text-ink',
}

const HOVER_CLASS: Record<Accent, string> = {
  navy: 'hover:bg-navy-light/60 hover:text-navy-dark',
  orange: 'hover:bg-orange-light/60 hover:text-orange-dark',
  neutral: 'hover:bg-surface hover:text-ink',
}

export function SidebarNav({ role }: { role: StaffRole }) {
  const pathname = usePathname()
  const sections = visibleSections(role)
  return (
    <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3 py-4">
      {sections.map((section, idx) => (
        <div key={section.title} className={idx > 0 ? 'mt-5 border-t border-line pt-4' : ''}>
          <h2
            className={`px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider ${HEADER_CLASS[section.accent]}`}
          >
            {section.title}
          </h2>
          <ul className="space-y-0.5">
            {section.items.map((item) => (
              <li key={`${section.title}-${item.label}`}>
                {item.comingSoon ? (
                  <ComingSoonRow item={item} />
                ) : (
                  <ActiveRow item={item} pathname={pathname} accent={section.accent} />
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

function ActiveRow({
  item,
  pathname,
  accent,
}: {
  item: NavItem
  pathname: string
  accent: Accent
}) {
  const { label, href, icon: Icon, external } = item
  const active = !external && (pathname === href || (href !== '/' && pathname.startsWith(href)))
  const base = 'flex items-center gap-3 rounded px-3 py-2 text-sm transition-colors'
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      className={
        active
          ? `${base} font-medium ${ACTIVE_CLASS[accent]}`
          : `${base} text-ink-2 ${HOVER_CLASS[accent]}`
      }
    >
      <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
      <span className="flex-1">{label}</span>
      {external && <ExternalLink size={12} aria-hidden="true" className="text-ink-3" />}
    </Link>
  )
}

function ComingSoonRow({ item }: { item: NavItem }) {
  const { label, icon: Icon, comingSoon } = item
  return (
    <div
      className="flex cursor-not-allowed items-center gap-3 rounded px-3 py-2 text-sm text-ink-3"
      title={`Coming in ${comingSoon}`}
      aria-disabled="true"
    >
      <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
      <span className="flex-1">{label}</span>
      <span className="rounded-sm bg-surface px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-ink-3">
        Soon
      </span>
    </div>
  )
}
