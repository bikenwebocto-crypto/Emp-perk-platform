'use client'

import {
  Building2,
  Tag,
  MapPin,
  Mail,
  Phone,
  Globe,
  Calendar,
  User,
} from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/shared/status-badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { ReviewComponentProps } from './types'

export function MerchantApplicationReview({ entity }: ReviewComponentProps) {
  if (!entity) return null

  // For FIRST_OFFER_APPROVAL / MERCHANT_OFFER:
  // entity = offer
  // entity.merchant = merchant
  //
  // For a normal merchant application:
  // entity = merchant
  //
  // Support both structures.
  const merchant = entity.merchant ?? entity

  const businessName = merchant.businessName ?? 'Unknown Merchant'
  const logoUrl = merchant.logoUrl ?? null
  const status = merchant.status ?? entity.status

  const contactName = merchant.contactName
  const contactPhone = merchant.contactPhone
  const description = merchant.description
  const email = merchant.email
  const website = merchant.website
  const city = merchant.city
  const state = merchant.state
  const addressLine1 = merchant.addressLine1
  const addressLine2 = merchant.addressLine2
  const postalCode = merchant.postalCode

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Building2 className="h-5 w-5" />
            Merchant Profile
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Merchant Header */}
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              {logoUrl && (
                <AvatarImage
                  src={logoUrl}
                  alt={businessName}
                  className="object-cover"
                />
              )}

              <AvatarFallback className="text-xl">
                {businessName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>

            <div className="space-y-1">
              <p className="text-xl font-semibold">
                {businessName}
              </p>

              <div className="flex items-center gap-2">
                {status && <StatusBadge status={status} />}

                {merchant.onboardingStep && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize">
                    {merchant.onboardingStep.replace(/_/g, ' ')}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Description */}
          {description && (
            <p className="text-sm text-muted-foreground">
              {description}
            </p>
          )}

          {/* Merchant Details */}
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            {contactName && (
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span>{contactName}</span>
              </div>
            )}

            {email && (
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="truncate">{email}</span>
              </div>
            )}

            {contactPhone && (
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span>{contactPhone}</span>
              </div>
            )}

            {website && (
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />

                <a
                  href={website}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-primary hover:underline"
                >
                  {website}
                </a>
              </div>
            )}

            {merchant.category?.name && (
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-muted-foreground" />
                <span>{merchant.category.name}</span>
              </div>
            )}

            {city && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />

                <span>
                  {city}
                  {state ? `, ${state}` : ''}
                </span>
              </div>
            )}

            {merchant.createdAt && (
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />

                <span>
                  Applied{' '}
                  {new Date(
                    merchant.createdAt
                  ).toLocaleDateString()}
                </span>
              </div>
            )}
          </div>

          {/* Address */}
          {addressLine1 && (
            <div className="rounded-md bg-muted/30 p-3 text-xs text-muted-foreground">
              <p className="font-medium">Address</p>

              <p>
                {addressLine1}
                {addressLine2 ? `, ${addressLine2}` : ''}
              </p>

              <p>
                {city}
                {state ? `, ${state}` : ''}{' '}
                {postalCode ?? ''}
              </p>
            </div>
          )}

          {/* Offer Information */}
          {entity.title && (
            <div className="rounded-md border p-3">
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                Offer Under Review
              </p>

              <p className="font-medium">
                {entity.title}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Application Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Application Summary
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">
              Business Name
            </span>

            <span className="text-right font-medium">
              {businessName}
            </span>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">
              Status
            </span>

            {status && <StatusBadge status={status} />}
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">
              Category
            </span>

            <span>
              {merchant.category?.name ?? 'Uncategorized'}
            </span>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">
              Featured
            </span>

            <span>
              {entity.isFeatured ? 'Yes' : 'No'}
            </span>
          </div>

          {entity.rejectionReason && (
            <div className="rounded-md bg-destructive/10 p-2 text-xs">
              <p className="font-medium text-destructive">
                Previous Rejection
              </p>

              <p className="text-muted-foreground">
                {entity.rejectionReason}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export const merchantApplicationEditableFields = [
  { key: 'businessName', label: 'Business Name' },
  { key: 'contactName', label: 'Contact Name' },
  { key: 'contactPhone', label: 'Contact Phone' },
  { key: 'description', label: 'Description' },
  { key: 'email', label: 'Email' },
  { key: 'website', label: 'Website' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'addressLine1', label: 'Address Line 1' },
]

