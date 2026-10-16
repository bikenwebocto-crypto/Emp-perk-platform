'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Sidebar } from '@/components/layout/sidebar'
import { Navbar } from '@/components/layout/navbar'
import { Toaster } from '@/components/ui/toaster'
import { cn } from '@/utils/cn'
import { useCurrentUser } from '@/hooks/queries/use-current-user'
import { usePushNotifications } from '@/hooks/use-push-notifications'
import type { PublicBranding } from '@/features/admin/settings/login-branding/services/login-branding.service'

const pageTitles: Record<string, string> = {
  '/admin': 'Admin Overview',
  '/admin/action-queue': 'Action Queue',
  '/admin/offers/replacements': 'Replacement Reviews',
  '/admin/merchants': 'Merchants',
  '/admin/categories': 'Categories',
  '/admin/companies': 'Companies',
  '/admin/leads': 'Leads',
  '/admin/employees': 'Employees',
  '/admin/csv-uploads': 'CSV Uploads',
  '/admin/audit-logs': 'Audit Logs',
  '/admin/billing': 'Billing',
  '/admin/settings/login-branding': 'Login Branding',
  '/admin/themes/customize': 'Theme Customizer',
  '/admin/notifications': 'Notifications',
  '/admin/analytics': 'Platform Analytics',
  '/merchant': 'Merchant Overview',
  '/merchant/offers': 'My Offers',
  '/merchant/analytics': 'Analytics',
  '/merchant/branches': 'Branches',
  '/merchant/redemptions': 'Redemptions',
  '/merchant/profile': 'Profile',
  '/merchant/notifications': 'Notifications',
  '/merchant/settings': 'Settings',
  '/company': 'Company Overview',
  '/company/employees': 'Employees',
  '/company/analytics': 'Analytics',
  '/company/billing': 'Billing',
  '/company/notifications': 'Notifications',
  '/company/settings': 'Settings',
  '/employee': 'Employee Home',
  '/employee/offers': 'Available Offers',
  '/employee/saved': 'Saved Offers',
  '/employee/redemptions': 'My Redemptions',
  '/employee/notifications': 'Notifications',
  '/employee/profile': 'My Profile',
  '/employee/settings': 'Settings',
}

interface DashboardShellProps {
  children: React.ReactNode
  branding: PublicBranding | null
}

type DashboardUserType = 'admin' | 'merchant' | 'company_admin' | 'employee'

/** Home section for each session userType. */
const HOME_BY_USER_TYPE: Record<DashboardUserType, string> = {
  admin: '/admin',
  company_admin: '/company',
  employee: '/employee',
  merchant: '/merchant',
}

function isDashboardUserType(value: string | undefined): value is DashboardUserType {
  return !!value && value in HOME_BY_USER_TYPE
}

/** True when `pathname` is inside the dashboard section that belongs to `userType`. */
function isInOwnSection(pathname: string, userType: DashboardUserType): boolean {
  const home = HOME_BY_USER_TYPE[userType]
  return pathname === home || pathname.startsWith(`${home}/`)
}

export function DashboardShell({ children, branding }: DashboardShellProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { data: user, isLoading, isError } = useCurrentUser()
  usePushNotifications({ enabled: Boolean(user) })

  // The layout always follows the session user, never the URL: after a role
  // change (e.g. employee → company admin) the URL can point at a section the
  // user no longer belongs to.
  const userType = isDashboardUserType(user?.userType) ? user.userType : null
  const isWrongSection = !!userType && !isInOwnSection(pathname, userType)

  useEffect(() => {
    if (isError) {
      router.replace(`/login?redirectTo=${encodeURIComponent(pathname)}`)
    } else if (userType && isWrongSection) {
      router.replace(HOME_BY_USER_TYPE[userType])
    }
  }, [isError, userType, isWrongSection, pathname, router])

  // Render nothing role-specific until we know the user and they are in their
  // own section, so the wrong sidebar or page never flashes.
  if (isLoading || isError || !userType || isWrongSection) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading" />
      </div>
    )
  }

  const title = Object.entries(pageTitles).find(([path]) => pathname.startsWith(path))?.[1] ?? 'Dashboard'

  return (
    <div className="flex min-h-screen">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 md:hidden"
          style={{ backgroundColor: `hsl(var(--overlay-bg) / 0.5)` }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className={cn(
        'fixed inset-y-0 left-0 z-40 w-64 shrink-0 -translate-x-full transition-transform md:relative md:translate-x-0',
        sidebarOpen && 'translate-x-0'
      )}>
        <Sidebar
          userType={userType}
          userName={user?.name}
          userEmail={user?.email}
          userRole={user?.role}
          adminRole={user?.adminRole}
          companyName={user?.companyName}
          branding={branding}
          avatarUrl={user?.avatarUrl}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <Navbar
          title={title}
          onMenuClick={() => setSidebarOpen(true)}
          userName={user?.name}
          userEmail={user?.email}
          userRole={user?.adminRole}
        />
        <main className="min-w-0 flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
      <Toaster />
    </div>
  )
}
