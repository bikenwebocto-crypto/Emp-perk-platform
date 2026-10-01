'use client'
import { use, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMerchantOfferById, useDeleteMerchantOffer, useRevokeMerchantOffer } from '@/hooks/queries/use-merchant-offers'
import { StatusBadge } from '@/components/shared/status-badge'
import { OfferStatusTimeline } from '@/components/shared/offer-status-timeline'
import { OfferPreviewSection } from '@/components/merchant/offers/OfferPreviewSection'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { showToast } from '@/hooks/use-toast'
import {
  ArrowLeft,
  Pencil,
  RefreshCw,
  Trash2,
  Download,
  Printer,
  QrCode,
  Ban,
  Calendar,
  Tag,
  Percent,
  DollarSign,
  ShoppingBag,
  Eye,
  Bookmark,
  TrendingUp,
  ImageIcon,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Sparkles,
  Store,
  Link2,
  Hash,
  Type,
  CalendarDays,
  Repeat,
  Star,
  ShieldCheck,
  XCircle,
  Info,
  Gift,
  Activity,
  Receipt,
} from 'lucide-react'

const DELETABLE_STATUSES = ['DRAFT', 'VALIDATION_FAILED', 'REJECTED', 'EXPIRED', 'REPLACED', 'AWAITING_APPROVAL', 'CHANGES_REQUESTED', 'ARCHIVED']
const EDITABLE_STATUSES = ['DRAFT', 'VALIDATION_FAILED', 'CHANGES_REQUESTED', 'AWAITING_APPROVAL']

const statusLabels: Record<string, string> = {
  LIVE: 'Live',
  DRAFT: 'Draft',
  VALIDATION_IN_PROGRESS: 'Validation In Progress',
  AWAITING_APPROVAL: 'Awaiting Approval',
  VALIDATION_FAILED: 'Validation Failed',
  CHANGES_REQUESTED: 'Changes Requested',
  REJECTED: 'Rejected',
  EXPIRED: 'Expired',
  REPLACED: 'Replaced',
  ARCHIVED: 'Archived',
}

const offerTypeConfig: Record<string, { label: string; icon: any; gradient: string; color: string }> = {
  FLAT: { label: 'Flat Discount', icon: DollarSign, gradient: 'from-blue-500 to-indigo-600', color: 'text-blue-600' },
  flat_rate: { label: 'Flat Rate', icon: DollarSign, gradient: 'from-blue-500 to-indigo-600', color: 'text-blue-600' },
  fixed_amount: { label: 'Fixed Amount', icon: DollarSign, gradient: 'from-blue-500 to-indigo-600', color: 'text-blue-600' },
  PERCENTAGE: { label: 'Percentage Off', icon: Percent, gradient: 'from-violet-500 to-purple-600', color: 'text-violet-600' },
  percentage: { label: 'Percentage Off', icon: Percent, gradient: 'from-violet-500 to-purple-600', color: 'text-violet-600' },
  BUY_X_GET_Y: { label: 'Buy X Get Y', icon: Gift, gradient: 'from-pink-500 to-rose-600', color: 'text-pink-600' },
  buy_x_get_y: { label: 'Buy X Get Y', icon: Gift, gradient: 'from-pink-500 to-rose-600', color: 'text-pink-600' },
}

const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function formatDate(date: string | Date) {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
}

function formatDateTime(date: string | Date) {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatRelativeTime(date: string | Date) {
  if (!date) return '-'
  const d = new Date(date)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHr = Math.floor(diffMs / 3600000)
  const diffDay = Math.floor(diffMs / 86400000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`
  if (diffDay < 30) return `${diffDay}d ago`
  return d.toLocaleDateString()
}

export default function OfferDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data, isLoading, error } = useMerchantOfferById(id)
  const deleteOffer = useDeleteMerchantOffer()
  const revokeOffer = useRevokeMerchantOffer()
  const router = useRouter()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [revokeOpen, setRevokeOpen] = useState(false)
  const [revokeReason, setRevokeReason] = useState('')

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-48 w-full rounded-xl" />)}
        </div>
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    )
  }

  if (error || !data?.data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <XCircle className="h-7 w-7 text-muted-foreground" />
        </div>
        <p className="mt-4 text-lg font-medium">Offer not found</p>
        <p className="mt-1 text-sm text-muted-foreground">It may have been deleted or you may not have access.</p>
        <Link href="/merchant/offers" className="mt-4">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to offers
          </Button>
        </Link>
      </div>
    )
  }

  const offer = data.data
  const typeConfig = (offerTypeConfig[offer.offerType] ?? offerTypeConfig.FLAT)!
  const TypeIcon = typeConfig.icon
  const pricingConfig = (offer.pricing?.configuration as Record<string, unknown>) ?? {}
  const redemptionConfig = (offer.redemption?.configuration as Record<string, unknown>) ?? {}
  const amount = pricingConfig.amount as number | undefined
  const percent = pricingConfig.percent as number | undefined
  const minimumSpend = pricingConfig.minimumSpend as number | undefined
  const maximumDiscount = pricingConfig.maximumDiscount as number | undefined
  const redemptionCode = redemptionConfig.code as string | undefined
  const redemptionInstructions = redemptionConfig.instructions as string | undefined
  const bookingUrl = redemptionConfig.bookingUrl as string | undefined
  const qrCodeUrl = redemptionConfig.qrCodeUrl as string | undefined
  const discountProgress = offer.capacity?.maxRedemptions
    ? Math.min(100, ((offer.capacity?.redeemedCount ?? 0) / offer.capacity.maxRedemptions) * 100)
    : 0

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Link
        href="/merchant/offers"
        className="group inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
        Back to Offers
      </Link>

      {/* Hero header with gradient + status */}
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-background via-muted/30 to-muted/50 p-6">
        <div className={`absolute -right-16 -top-16 h-48 w-48 rounded-full bg-gradient-to-br ${typeConfig.gradient} opacity-10 blur-3xl`} />
        <div className={`absolute -bottom-12 -left-12 h-32 w-32 rounded-full bg-gradient-to-br ${typeConfig.gradient} opacity-10 blur-2xl`} />

        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            {/* Type + Status badges */}
            <div className="flex flex-wrap items-center gap-2">
              <div className={`flex items-center gap-1.5 rounded-full bg-gradient-to-r ${typeConfig.gradient} px-3 py-1 text-xs font-bold text-white shadow-sm`}>
                <TypeIcon className="h-3.5 w-3.5" />
                {typeConfig.label}
              </div>
              <StatusBadge
                status={offer.status}
                label={
                  offer.status === 'ARCHIVED' && offer.review?.reviewNotes
                    ? 'Revoked'
                    : statusLabels[offer.status]
                }
              />
              {offer.isFeatured && (
                <Badge variant="warning" className="gap-1">
                  <Star className="h-3 w-3" /> Featured
                </Badge>
              )}
              {offer.isExclusive && (
                <Badge variant="pending" className="gap-1">
                  <Sparkles className="h-3 w-3" /> Exclusive
                </Badge>
              )}
              {offer.status === 'LIVE' && (
                <Badge variant="live" className="gap-1">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                  </span>
                  Active
                </Badge>
              )}
            </div>

            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{offer.title}</h1>
              {offer.content?.shortDescription && (
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                  {offer.content.shortDescription}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                Created {formatRelativeTime(offer.createdAt)}
              </span>
              <span className="flex items-center gap-1">
                <RefreshCw className="h-3.5 w-3.5" />
                Updated {formatRelativeTime(offer.updatedAt)}
              </span>
              <span className="flex items-center gap-1">
                <Hash className="h-3.5 w-3.5" />
                <code className="text-[10px]">{offer.id.slice(0, 8)}…</code>
              </span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {EDITABLE_STATUSES.includes(offer.status) && (
              <Link href={`/merchant/offers/${offer.id}/edit`}>
                <Button size="sm" className="gap-1.5">
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
              </Link>
            )}
            {offer.status === 'LIVE' && (
              <>
                <Link href={`/merchant/offers/${offer.id}/replace`}>
                  <Button size="sm" variant="outline" className="gap-1.5">
                    <RefreshCw className="h-4 w-4" /> Replace
                  </Button>
                </Link>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={() => setRevokeOpen(true)}
                >
                  <Ban className="h-4 w-4" /> Revoke
                </Button>
              </>
            )}
            {DELETABLE_STATUSES.includes(offer.status) && (
              <Button
                size="sm"
                variant="destructive"
                className="gap-1.5"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            )}
          </div>
        </div>
      </div>

      

      {/* Quick stats row */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={Eye}
          gradient="from-blue-500 to-cyan-600"
          label="Total Views"
          value={offer.analytics?.viewCount ?? 0}
        />
        <StatTile
          icon={Bookmark}
          gradient="from-violet-500 to-purple-600"
          label="Total Saves"
          value={offer.analytics?.saveCount ?? 0}
        />
        <StatTile
          icon={Receipt}
          gradient="from-emerald-500 to-teal-600"
          label="Redemptions"
          value={offer.capacity?.redeemedCount ?? 0}
          sublabel={
            offer.capacity?.maxRedemptions
              ? `of ${offer.capacity.maxRedemptions} max`
              : 'unlimited'
          }
          progress={discountProgress}
        />
        <StatTile
          icon={Clock}
          gradient="from-amber-500 to-orange-600"
          label="Days Remaining"
          value={(() => {
            const end = new Date(offer.endDate)
            const now = new Date()
            const diff = Math.ceil((end.getTime() - now.getTime()) / 86400000)
            return diff > 0 ? diff : 0
          })()}
          sublabel="until end date"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Status Timeline */}
        <Card className="overflow-hidden border-0 shadow-sm">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-blue-500 via-cyan-500 to-blue-500" />
          <CardHeader className="border-b bg-muted/30 pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-950/40">
                <Activity className="h-4 w-4" />
              </div>
              Status Timeline
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <OfferStatusTimeline
              currentStatus={offer.status}
              createdAt={offer.createdAt}
              submittedAt={offer.submittedAt}
              reviewedAt={offer.reviewedAt}
              liveAt={offer.liveAt}
              adminNote={offer.review?.adminNote}
            />
          </CardContent>
        </Card>

        {/* Approval Info */}
        <Card className="overflow-hidden border-0 shadow-sm">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-500" />
          <CardHeader className="border-b bg-muted/30 pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40">
                <ShieldCheck className="h-4 w-4" />
              </div>
              Approval Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-4 text-sm">
            <ApprovalRow
              icon={Send}
              label="Submitted"
              value={offer.submittedAt ? formatDateTime(offer.submittedAt) : '—'}
            />
            <ApprovalRow
              icon={CheckCircle2}
              label="Reviewed"
              value={offer.reviewedAt ? formatDateTime(offer.reviewedAt) : '—'}
            />
            <ApprovalRow
              icon={Sparkles}
              label="Published"
              value={offer.liveAt ? formatDateTime(offer.liveAt) : '—'}
            />

            {offer.review?.rejectionReason && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/50 dark:bg-red-950/30">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-red-700 dark:text-red-400">
                  <XCircle className="h-3.5 w-3.5" />
                  Rejection Reason
                </div>
                <p className="mt-1 text-sm text-red-700 dark:text-red-300">{offer.review.rejectionReason}</p>
              </div>
            )}
            {offer.review?.adminNote && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900/50 dark:bg-blue-950/30">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 dark:text-blue-400">
                  <Info className="h-3.5 w-3.5" />
                  Admin Note
                </div>
                <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">{offer.review.adminNote}</p>
              </div>
            )}
            {offer.status === 'ARCHIVED' && offer.review?.reviewNotes && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/50 dark:bg-red-950/30">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-red-700 dark:text-red-400">
                  <Ban className="h-3.5 w-3.5" />
                  Revocation Reason
                </div>
                <p className="mt-1 text-sm text-red-700 dark:text-red-300">{offer.review.reviewNotes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Validity + Settings */}
        <Card className="overflow-hidden border-0 shadow-sm">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-violet-500 via-purple-500 to-violet-500" />
          <CardHeader className="border-b bg-muted/30 pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 text-violet-600 dark:bg-violet-950/40">
                <CalendarDays className="h-4 w-4" />
              </div>
              Validity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-4 text-sm">
            <DetailRow icon={Calendar} label="Start Date" value={formatDate(offer.startDate)} />
            <DetailRow icon={Calendar} label="End Date" value={formatDate(offer.endDate)} />
            <div className="rounded-lg bg-muted/40 p-3">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Repeat className="h-3.5 w-3.5" />
                Active Days
              </div>
              <div className="flex flex-wrap gap-1">
                {dayLabels.map((day, i) => {
                  const isActive = Array.isArray(offer.redemption?.daysOfWeek) && offer.redemption.daysOfWeek.includes(i)
                  return (
                    <div
                      key={day}
                      className={`flex h-7 w-10 items-center justify-center rounded-md text-[11px] font-semibold transition-colors ${
                        isActive
                          ? `bg-gradient-to-br ${typeConfig.gradient} text-white shadow-sm`
                          : 'bg-muted text-muted-foreground/50'
                      }`}
                    >
                      {day.slice(0, 1)}
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <FeaturePill
                icon={Star}
                label="Featured"
                active={!!offer.isFeatured}
              />
              <FeaturePill
                icon={Sparkles}
                label="Exclusive"
                active={!!offer.isExclusive}
              />
            </div>
          </CardContent>
        </Card>
      </div>
       <OfferPreviewSection entity={offer} />         
      {/* Main content: Description + Discount */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden border-0 shadow-sm">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-blue-500 to-indigo-600" />
          <CardHeader className="border-b bg-muted/30 pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-950/40">
                <FileText className="h-4 w-4" />
              </div>
              Offer Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-4">
            {offer.content?.shortDescription && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Short Description</p>
                <p className="mt-1 text-sm">{offer.content.shortDescription}</p>
              </div>
            )}
            {offer.content?.description && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{offer.content.description}</p>
              </div>
            )}
            {offer.content?.termsAndConditions && (
              <>
                <Separator />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Terms & Conditions</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{offer.content.termsAndConditions}</p>
                </div>
              </>
            )}
            {!offer.content?.description && !offer.content?.shortDescription && (
              <div className="flex flex-col items-center justify-center py-8 text-center text-sm text-muted-foreground">
                <FileText className="mb-2 h-8 w-8 opacity-40" />
                <p>No content provided</p>
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden border-0 shadow-sm">
          <div className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${typeConfig.gradient}`} />
          <CardHeader className="border-b bg-muted/30 pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className={`flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br ${typeConfig.gradient} text-white`}>
                <TypeIcon className="h-4 w-4" />
              </div>
              Discount Details
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            {/* Highlighted discount hero */}
            <div className={`mb-4 flex items-center justify-between rounded-xl bg-gradient-to-br ${typeConfig.gradient} p-4 text-white shadow-md`}>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-90">Discount</p>
                <p className="mt-1 text-3xl font-black leading-none">
                  {amount != null ? `€${Number(amount).toFixed(2)}` : percent != null ? `${percent}%` : '—'}
                </p>
                <p className="mt-1 text-xs font-medium opacity-90">{typeConfig.label}</p>
              </div>
              <TypeIcon className="h-12 w-12 opacity-30" />
            </div>

            <div className="space-y-2.5 text-sm">
              {amount != null && (
                <DetailRow
                  icon={DollarSign}
                  label="Discount Value"
                  value={`€${Number(amount).toFixed(2)}`}
                />
              )}
              {offer.offerType === 'percentage' && percent != null && (
                <DetailRow
                  icon={Percent}
                  label="Discount Percent"
                  value={`${percent}%`}
                />
              )}
              {minimumSpend != null && Number(minimumSpend) > 0 && (
                <DetailRow
                  icon={ShoppingBag}
                  label="Minimum Spend"
                  value={`€${Number(minimumSpend).toFixed(2)}`}
                />
              )}
              {maximumDiscount != null && Number(maximumDiscount) > 0 && (
                <DetailRow
                  icon={TrendingUp}
                  label="Maximum Discount"
                  value={`€${Number(maximumDiscount).toFixed(2)}`}
                />
              )}
              <Separator />
              <DetailRow
                icon={Type}
                label="Offer Type"
                value={typeConfig.label}
              />
              {offer.capacity?.maxRedemptions != null && (
                <DetailRow
                  icon={Receipt}
                  label="Max Redemptions"
                  value={offer.capacity.maxRedemptions.toString()}
                />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Redemption Settings */}
      {(redemptionCode || redemptionInstructions || bookingUrl) && (
        <Card className="overflow-hidden border-0 shadow-sm">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-amber-500 to-orange-600" />
          <CardHeader className="border-b bg-muted/30 pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-950/40">
                <Tag className="h-4 w-4" />
              </div>
              Redemption Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-4">
            {redemptionCode && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Redemption Code</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <code className="rounded-md border bg-muted px-3 py-1.5 font-mono text-sm font-semibold">
                    {redemptionCode}
                  </code>
                </div>
              </div>
            )}
            {bookingUrl && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Booking URL</p>
                <a
                  href={bookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 break-all text-sm text-primary hover:underline"
                >
                  <Link2 className="h-3.5 w-3.5" />
                  {bookingUrl}
                </a>
              </div>
            )}
            {redemptionInstructions && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Instructions</p>
                <p className="mt-1 whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 text-sm leading-relaxed">
                  {redemptionInstructions}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      
      {/* In-Store QR */}
      {offer.redemption?.redemptionType === 'IN_STORE_QR' && (
        <Card className="overflow-hidden border-0 shadow-sm">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-rose-500 to-pink-600" />
          <CardHeader className="border-b bg-muted/30 pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-100 text-rose-600 dark:bg-rose-950/40">
                <QrCode className="h-4 w-4" />
              </div>
              In-Store QR Code
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            {qrCodeUrl ? (
              <div className="flex flex-col items-center gap-4">
                <div className="relative rounded-2xl border-2 border-dashed border-rose-200 bg-white p-4 shadow-sm dark:border-rose-900/50">
                  <img
                    src={qrCodeUrl}
                    alt="Offer QR Code"
                    className="h-56 w-56 object-contain"
                  />
                </div>
                <p className="text-center text-xs text-muted-foreground">
                  Employees scan this QR to access and redeem the offer in-store.
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  <a
                    href={qrCodeUrl}
                    download={`qr-${offer.title?.replace(/\s+/g, '-').toLowerCase()}.png`}
                  >
                    <Button size="sm" variant="outline" className="gap-1.5">
                      <Download className="h-4 w-4" /> Download PNG
                    </Button>
                  </a>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => {
                      const w = window.open('', '_blank')
                      if (!w) return
                      w.document.write(`
                        <html>
                          <head><title>Print QR - ${offer.title}</title></head>
                          <body style="text-align:center;padding:40px;font-family:sans-serif;">
                            <h2>${offer.title}</h2>
                            <img src="${qrCodeUrl}" style="width:300px;height:300px;object-contain;" />
                            <p style="margin-top:24px;color:#666;">Scan this QR code to redeem your offer.</p>
                            <script>window.onload = function() { window.print(); window.close(); }<\/script>
                          </body>
                        </html>
                      `)
                      w.document.close()
                    }}
                  >
                    <Printer className="h-4 w-4" /> Print QR
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <QrCode className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  QR code will be generated once the offer is submitted or approved.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Images */}
      {Array.isArray(offer.content?.imageUrls) && offer.content.imageUrls.length > 0 && (
        <Card className="overflow-hidden border-0 shadow-sm">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-cyan-500 to-blue-600" />
          <CardHeader className="border-b bg-muted/30 pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-100 text-cyan-600 dark:bg-cyan-950/40">
                <ImageIcon className="h-4 w-4" />
              </div>
              Images
              <Badge variant="secondary" className="ml-1">
                {offer.content.imageUrls.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {offer.content.imageUrls.map((url: string, i: number) => (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative aspect-video overflow-hidden rounded-lg border bg-muted transition-transform hover:-translate-y-0.5 hover:shadow-md"
                >
                  <img
                    src={url}
                    alt={`Offer image ${i + 1}`}
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                  <div className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">
                    {i + 1} / {offer.content.imageUrls.length}
                  </div>
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Validation Results */}
      {offer.review?.validationErrors && typeof offer.review.validationErrors === 'object' && Object.keys(offer.review.validationErrors as object).length > 0 && (
        <Card className="overflow-hidden border-0 shadow-sm">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-red-500 to-rose-600" />
          <CardHeader className="border-b bg-muted/30 pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-100 text-red-600 dark:bg-red-950/40">
                <AlertTriangle className="h-4 w-4" />
              </div>
              Validation Results
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="space-y-2">
              {Object.entries(offer.review.validationErrors as Record<string, string>).map(([field, message]) => (
                <div key={field} className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900/50 dark:bg-red-950/30">
                  <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-600" />
                  <div>
                    <p className="font-semibold text-red-700 dark:text-red-300 capitalize">{field.replace(/([A-Z])/g, ' $1').trim()}</p>
                    <p className="text-xs text-red-600 dark:text-red-400">{message}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Replacement Information */}
      {offer.replacesOfferId && (
        <Card className="overflow-hidden border-0 shadow-sm">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-orange-500 to-amber-600" />
          <CardHeader className="border-b bg-muted/30 pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-100 text-orange-600 dark:bg-orange-950/40">
                <RefreshCw className="h-4 w-4" />
              </div>
              Replacement Information
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 text-sm">
            <p className="text-muted-foreground">This offer was created as a replacement for a previous offer.</p>
            <Link
              href={`/merchant/offers/${offer.replacesOfferId}`}
              className="mt-3 inline-flex items-center gap-1 rounded-lg bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
            >
              <Store className="h-3.5 w-3.5" />
              View original offer
            </Link>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={deleteOpen}
        title="Delete Offer"
        message={`Are you sure you want to delete "${offer.title}"? This will permanently remove the offer.`}
        confirmLabel="Delete"
        loading={deleteOffer.isPending}
        onConfirm={async () => {
          try {
            await deleteOffer.mutateAsync(offer.id)
            showToast({ type: 'success', title: 'Offer deleted' })
            router.push('/merchant/offers')
          } catch (err: any) {
            showToast({ type: 'error', title: 'Failed', description: err.message })
          } finally {
            setDeleteOpen(false)
          }
        }}
        onCancel={() => setDeleteOpen(false)}
      />

      <ConfirmDialog
        open={revokeOpen}
        title="Revoke Offer"
        message={`Are you sure you want to revoke "${offer.title}"? This will deactivate the offer and it will no longer be visible to employees. You can delete it afterwards.`}
        confirmLabel="Revoke"
        loading={revokeOffer.isPending}
        onConfirm={async () => {
          if (!revokeReason.trim()) {
            showToast({ type: 'error', title: 'Required', description: 'Please provide a reason for revocation' })
            return
          }
          try {
            await revokeOffer.mutateAsync({ id: offer.id, reason: revokeReason.trim() })
            showToast({ type: 'success', title: 'Offer revoked' })
            setRevokeOpen(false)
            setRevokeReason('')
          } catch (err: any) {
            showToast({ type: 'error', title: 'Failed', description: err.message })
          }
        }}
        onCancel={() => { setRevokeOpen(false); setRevokeReason('') }}
      >
        <div className="space-y-2">
          <label className="text-sm font-medium">Reason for revocation</label>
          <textarea
            className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="Explain why you are revoking this offer..."
            value={revokeReason}
            onChange={(e) => setRevokeReason(e.target.value)}
          />
        </div>
      </ConfirmDialog>
    </div>
  )
}

function StatTile({
  icon: Icon,
  gradient,
  label,
  value,
  sublabel,
  progress,
}: {
  icon: any
  gradient: string
  label: string
  value: string | number
  sublabel?: string
  progress?: number
}) {
  return (
    <Card className="relative overflow-hidden border-0 shadow-sm">
      <div className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${gradient}`} />
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold tracking-tight tabular-nums">{value.toLocaleString()}</p>
            {sublabel && <p className="text-[10px] text-muted-foreground">{sublabel}</p>}
          </div>
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} text-white shadow-sm`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        {typeof progress === 'number' && progress > 0 && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full bg-gradient-to-r ${gradient} transition-all`}
              style={{ width: `${Math.min(100, progress)}%` }}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function DetailRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
    </div>
  )
}

function ApprovalRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <span className="text-sm font-medium">{value}</span>
    </div>
  )
}

function FeaturePill({ icon: Icon, label, active }: { icon: any; label: string; active: boolean }) {
  return (
    <div
      className={`flex items-center justify-center gap-1.5 rounded-lg border p-2 text-xs font-semibold transition-colors ${
        active
          ? 'border-primary/30 bg-primary/10 text-primary'
          : 'border-dashed bg-muted/30 text-muted-foreground'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </div>
  )
}

function Send({ className }: { className?: string }) {
  return <RefreshCw className={className} />
}
