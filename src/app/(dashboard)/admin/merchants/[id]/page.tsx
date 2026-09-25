'use client'
import { use, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Package, Pencil, Trash2, MapPin, BarChart3,
  Image as ImageIcon, Phone, Mail, Globe, Store,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/shared/status-badge'
import { DataTable } from '@/components/shared/data-table'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { StoreMap } from '@/components/shared/store-map'
import { useMerchantById, useMerchantOffers, useDeleteMerchant } from '@/hooks/queries/use-merchants'
import { useAdminMerchantStoreMap } from '@/hooks/queries/use-store-map'
import { showToast } from '@/hooks/use-toast'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { EditOfferModal } from "@/features/merchant/offers/components/edit-offer-modal"
import type { ColumnDef } from '@/types'

type Tab = 'overview' | 'offers' | 'store-map'

const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: 'overview', label: 'Overview', icon: BarChart3 },
  { key: 'offers', label: 'Offers', icon: Package },
  { key: 'store-map', label: 'Store Map', icon: MapPin },
]

export default function MerchantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)

  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [selectedOffer, setSelectedOffer] = useState<any | null>(null)  
  const [confirmDelete, setConfirmDelete] = useState(false)
  const deleteMerchant = useDeleteMerchant()

  const handleDelete = useCallback(() => {
    deleteMerchant.mutate(id, {
      onSuccess: (res: any) => {
        showToast({ type: 'success', title: res.message ?? 'Merchant deleted' })
        router.push('/admin/merchants')
      },
      onError: (err: Error) => showToast({ type: 'error', title: 'Delete failed', description: err.message }),
    })
  }, [id, deleteMerchant, router])

  const {
    data: merchantRes,
    isLoading: merchantLoading,
    error: merchantError,
  } = useMerchantById(id)

  const {
    data: offersRes,
    isLoading: offersLoading,
    error: offersError,
  } = useMerchantOffers(id)

  const { data: storeBranches = [], isLoading: storeLoading } = useAdminMerchantStoreMap(id)

  if (merchantLoading) {
    return (
      <div className="space-y-6 py-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-6 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (merchantError) {
    showToast({ type: 'error', title: 'Failed to load merchant', description: merchantError.message })
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-lg font-medium text-destructive">Failed to load merchant</p>
        <p className="mt-1 text-sm text-muted-foreground">{merchantError.message}</p>
        <Link href="/admin/merchants">
          <Button variant="outline" className="mt-4">Back to Merchants</Button>
        </Link>
      </div>
    )
  }

  const merchant = merchantRes?.data
  if (!merchant) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-lg font-medium text-muted-foreground">Merchant not found</p>
        <Link href="/admin/merchants">
          <Button variant="outline" className="mt-4">Back to Merchants</Button>
        </Link>
      </div>
    )
  }

  const offers = offersRes?.data ?? []
  const cardData = [
    { label: 'Total Offers', value: merchant._count?.offers ?? 0 },
    { label: 'Active Branches', value: merchant._count?.branches ?? 0 },
    { label: 'Redemptions', value: merchant._count?.redemptions ?? 0 },
    { label: 'Rating', value: `${Number(merchant.averageRating ?? 0).toFixed(1)} ★` },
    ...(merchant.liveAt
      ? [{ label: 'Live Since', value: new Date(merchant.liveAt).toLocaleDateString() }]
      : []),
  ]

  // Build a readable address line from whatever fields are present
  const addressParts = [merchant.address, merchant.city, merchant.country].filter(Boolean)
  const fullAddress = addressParts.length ? addressParts.join(', ') : null


const handleEditOffer = (offer: any) => {
  setSelectedOffer(offer)
  setIsEditModalOpen(true)
}

 const offerColumns: ColumnDef<any>[] = [
  {
    key: 'title',
    header: 'Offer',
    render: (o: any) => (
      <div className="flex flex-col">
        <span className="font-medium">{o.title}</span>  
      </div>
    ),
  },
  {
    key: 'offerType',
    header: 'Type',
    render: (o: any) => (
      <span className="capitalize">
        {o.offerType?.replace(/_/g, ' ')}
      </span>
    ),
  },
  {
    key: 'discountValue',
    header: 'Value',
    render: (o: any) => {
      if (o.offerType === 'PERCENTAGE' || o.discountPercent) {
        return `${o.discountPercent ?? 0}%`
      }

      return `£${Number(o.discountValue ?? 0).toFixed(2)}`
    },
  },
  {
    key: 'status',
    header: 'Status',
    render: (o: any) => <StatusBadge status={o.status} />,
  },
  {
    key: 'currentRedemptions',
    header: 'Redemptions',
    align: 'center',
  },
  {
    key: 'startDate',
    header: 'Start',
    render: (o: any) =>
      new Date(o.startDate).toLocaleDateString(),
  },
  {
    key: 'endDate',
    header: 'End',
    render: (o: any) =>
      new Date(o.endDate).toLocaleDateString(),
  },
  {
  key: "actions",
  header: "Actions",
  align: "center",
  render: (o: any) => (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={(e) => {
        e.stopPropagation()
        handleEditOffer(o)
      }}
    >
      <Pencil className="mr-1 h-4 w-4" />
      Edit
    </Button>
  ),
},
]

  return (
    <div className="space-y-6 py-6">
      <div className="flex items-center justify-between">
        <Link href="/admin/merchants">
          <Button type="button" variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <Link href={`/admin/merchants/${id}/edit`}>
            <Button variant="outline" size="sm"><Pencil className="mr-1 h-4 w-4" />Edit</Button>
          </Link>
          <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="mr-1 h-4 w-4" />Delete
          </Button>
        </div>
      </div>

      {/* ─── Profile header: banner + logo ─── */}
      <Card className="overflow-hidden pt-0">
        <div className="relative h-40 w-full overflow-hidden bg-gradient-to-r from-primary/20 via-primary/10 to-muted sm:h-48">
          {merchant.coverImageUrl ? (
            <img
              src={merchant.coverImageUrl}
              alt="Cover"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <ImageIcon className="h-12 w-12 text-muted-foreground/30" />
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/20 to-transparent" />
        </div>

        {/*
          Only the avatar overlaps the cover now (via its own negative margin).
          The text block below stays in normal flow so it never collides with
          the banner art or gets clipped/illegible over busy cover images.
        */}
        <div className="px-6 pb-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <Avatar className="-mt-10 h-20 w-20 shrink-0 overflow-hidden rounded-full border-[3px] border-background bg-muted shadow-xl sm:-mt-12 sm:h-24 sm:w-24">
              {merchant.logoUrl ? (
                <AvatarImage
                  src={merchant.logoUrl}
                  alt={merchant.businessName}
                  className="h-full w-full object-cover"
                />
              ) : null}
              <AvatarFallback className="text-xl font-bold sm:text-2xl">
                {merchant.businessName?.charAt(0)?.toUpperCase() ?? '?'}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{merchant.businessName}</h1>
                <StatusBadge status={merchant.status} />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {merchant.category?.name ?? 'No category'}
              </p>

              {/* Contact / location details */}
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {merchant.email && (
                  <span className="flex items-center gap-1">
                    <Mail className="h-3.5 w-3.5" />
                    {merchant.email}
                  </span>
                )}
                {merchant.phoneNumber && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" />
                    {merchant.phoneNumber}
                  </span>
                )}
                {fullAddress && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {fullAddress}
                  </span>
                )}
                {merchant.website && (
                  <a
                    href={merchant.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:text-foreground hover:underline"
                  >
                    <Globe className="h-3.5 w-3.5" />
                    {merchant.website.replace(/^https?:\/\//, '')}
                  </a>
                )}
              </div>

              {merchant.adminNote && (
                <p className="mt-1 text-xs text-amber-600">Note: {merchant.adminNote}</p>
              )}
            </div>
          </div>

          {merchant.description && (
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              {merchant.description}
            </p>
          )}
        </div>
      </Card>

      <div className="flex gap-1 rounded-lg border bg-muted/30 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-4">
            {cardData.map((d) => (
              <Card key={d.label}>
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold">{d.value}</p>
                  <p className="text-xs text-muted-foreground">{d.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Branches summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Store className="h-5 w-5" /> Branches ({storeBranches.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {storeLoading ? (
                <div className="space-y-3">
                  {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
                </div>
              ) : storeBranches.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Store className="mb-2 h-8 w-8 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">No branches added yet</p>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {storeBranches.map((branch: any) => (
                    <button
                      key={branch.id}
                      type="button"
                      onClick={() => setActiveTab('store-map')}
                      className="flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
                    >
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {branch.name ?? branch.branchName ?? 'Branch'}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[branch.address, branch.city].filter(Boolean).join(', ') || 'No address on file'}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'offers' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Package className="h-5 w-5" /> Offers ({offers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {offersLoading ? (
              <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : offersError ? (
              <div className="py-8 text-center">
                <p className="text-sm text-destructive">Failed to load offers</p>
                <p className="mt-1 text-xs text-muted-foreground">{offersError.message}</p>
              </div>
            ) : offers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Package className="mb-2 h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">No offers yet</p>
              </div>
            ) : (
              <DataTable
                columns={offerColumns}
                data={offers}
                keyExtractor={(o: any) => o.id}
                emptyMessage="No offers found"
                onRowClick={(o: any) => {
                  setSelectedOffer(o.id)
                  showToast({ type: 'info', title: o.title, description: `Status: ${o.status}` })
                }}
              />
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === 'store-map' && (
        <StoreMap
          branches={storeBranches}
          loading={storeLoading}
          role="admin"
          showSearch
          showFilters={false}
          showDistance={false}
          showCurrentLocation={false}
          showEditLink
        />
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete Merchant"
        message="Are you sure you want to delete this merchant? It will be soft-deleted."
        confirmLabel="Delete"
        loading={deleteMerchant.isPending}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
      <EditOfferModal
        open={isEditModalOpen}
        offer={selectedOffer}
        merchantCategory={merchant.category ?? null}
        onClose={() => {
          setIsEditModalOpen(false)
          setSelectedOffer(null)
        }}
      />
    </div>
  )
}		