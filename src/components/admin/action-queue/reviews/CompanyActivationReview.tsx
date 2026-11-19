'use client'

import { BillingUnavailable } from '@/components/shared/billing-unavailable'
import { Building2, Users, MapPin, Globe, Mail, CreditCard, Calendar } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/shared/status-badge'
import type { ReviewComponentProps } from './types'

export function CompanyActivationReview({ entity }: ReviewComponentProps) {
  if (!entity) return null

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Building2 className="h-5 w-5" />
            Company Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xl font-semibold">{entity.name}</p>
              {entity.industry && (
                <p className="text-sm text-muted-foreground">{entity.industry}</p>
              )}
            </div>
            <StatusBadge status={entity.status} />
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Primary Email</p>
              <p className="flex items-center gap-1 truncate"><Mail className="h-3 w-3" /> {entity.email ?? 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Phone</p>
              <p>{entity.phone ?? 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Employees</p>
              <p className="flex items-center gap-1">
                <Users className="h-3 w-3" /> {entity._count?.employees ?? entity.employeeCount ?? 0}
              </p>
            </div>
            {entity.approvedDomain && (
              <div>
                <p className="text-xs text-muted-foreground">Approved Domain</p>
                <p>{entity.approvedDomain}</p>
              </div>
            )}
            {entity.taxId && (
              <div>
                <p className="text-xs text-muted-foreground">Tax ID</p>
                <p>{entity.taxId}</p>
              </div>
            )}
            {entity.website && (
              <div>
                <p className="text-xs text-muted-foreground">Website</p>
                <a href={entity.website} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary hover:underline truncate">
                  <Globe className="h-3 w-3" /> {entity.website}
                </a>
              </div>
            )}
            {entity.city && (
              <div>
                <p className="text-xs text-muted-foreground">Location</p>
                <p className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {entity.city}{entity.state ? `, ${entity.state}` : ''}
                </p>
              </div>
            )}
            {entity.createdAt && (
              <div>
                <p className="text-xs text-muted-foreground">Registered</p>
                <p className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {new Date(entity.createdAt).toLocaleDateString()}</p>
              </div>
            )}
          </div>

          {entity.addressLine1 && (
            <div className="rounded-md bg-muted/30 p-3 text-xs text-muted-foreground">
              <p className="font-medium">Address</p>
              <p>{entity.addressLine1}{entity.addressLine2 ? `, ${entity.addressLine2}` : ''}</p>
              <p>{entity.city}{entity.state ? `, ${entity.state}` : ''} {entity.postalCode ?? ''}</p>
            </div>
          )}

          {entity.notes && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Internal Notes</p>
              <p className="rounded-md bg-muted/30 p-2 text-xs text-muted-foreground">{entity.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-4 w-4" /> Billing
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <BillingUnavailable compact />
        </CardContent>
      </Card>
    </div>
  )
}

export const companyActivationEditableFields: { key: string; label: string }[] = []
