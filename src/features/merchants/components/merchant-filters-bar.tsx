'use client'
import { Search, X, Star, Home, Package, Heart, AlertCircle, MapPin } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { MerchantHealth, MerchantStatus } from '@/types'

interface MerchantFiltersBarProps {
  search: string
  onSearchChange: (v: string) => void
  status: MerchantStatus | 'ALL'
  onStatusChange: (v: MerchantStatus | 'ALL') => void
  city: string
  onCityChange: (v: string) => void
 
  health: MerchantHealth | 'ALL'
  onHealthChange: (v: MerchantHealth | 'ALL') => void
  hasLiveOffers: boolean | null
  onHasLiveOffersChange: (v: boolean | null) => void
  hasPendingOffers: boolean | null
  onHasPendingOffersChange: (v: boolean | null) => void
  priorityMin: number | null
  onPriorityMinChange: (v: number | null) => void
  onClearAll: () => void
  cities?: string[]
}

const STATUS_OPTIONS: Array<{ label: string; value: MerchantStatus | 'ALL' }> = [
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Paused', value: 'PAUSED' },
  { label: 'Suspended', value: 'SUSPENDED' },
  { label: 'Pending', value: 'PENDING' },
  { label: 'Rejected', value: 'REJECTED' },
  { label: 'Archived', value: 'ARCHIVED' },
]

const HEALTH_OPTIONS: Array<{ label: string; value: MerchantHealth | 'ALL' }> = [
  { label: 'Healthy', value: 'HEALTHY' },
  { label: 'Warning', value: 'WARNING' },
  { label: 'Critical', value: 'CRITICAL' },
]

export function MerchantFiltersBar({
  search,
  onSearchChange,
  status,
  onStatusChange,
  city,
  onCityChange,
  health,
  onHealthChange,
  hasLiveOffers,
  onHasLiveOffersChange,
  hasPendingOffers,
  onHasPendingOffersChange,
  priorityMin,
  onPriorityMinChange,
  onClearAll,
  cities = [],
}: MerchantFiltersBarProps) {
  const activeFilterCount =
    (status !== 'ALL' ? 1 : 0) +
    (city ? 1 : 0) +
    (health !== 'ALL' ? 1 : 0) +
    (hasLiveOffers !== null ? 1 : 0) +
    (hasPendingOffers !== null ? 1 : 0) +
    (priorityMin !== null ? 1 : 0)

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search merchants, contact, city, email..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-8 pr-8"
            />
            {search && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => onSearchChange('')}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Status */}
          <FilterSelect
            value={status}
            onChange={(v) => onStatusChange(v as MerchantStatus | 'ALL')}
            label="Status"
            options={STATUS_OPTIONS}
          />

          {/* City */}
          {cities.length > 0 ? (
            <FilterSelect
              value={city || 'ALL'}
              onChange={(v) => onCityChange(v === 'ALL' ? '' : v)}
              label="City"
              options={[
                ...cities.map((c) => ({ label: c, value: c })),
              ]}
            />
          ) : (
            <div className="relative">
              <MapPin className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="City..."
                value={city}
                onChange={(e) => onCityChange(e.target.value)}
                className="h-9 w-32 pl-7 text-sm"
              />
            </div>
          )}

          {/* Health */}
          <FilterSelect
            value={health}
            onChange={(v) => onHealthChange(v as MerchantHealth | 'ALL')}
            label="Health"
            options={HEALTH_OPTIONS}
          />

          {/* Priority min */}
          <div className="flex h-9 items-center gap-1 rounded-md border bg-background px-2">
            <span className="text-xs text-muted-foreground">Priority ≥</span>
            <Input
              type="number"
              min={0}
              value={priorityMin ?? ''}
              onChange={(e) => onPriorityMinChange(e.target.value === '' ? null : Number(e.target.value))}
              className="h-7 w-16 border-0 p-0 text-sm focus-visible:ring-0"
              placeholder="0"
            />
          </div>
        </div>

        {/* Clear filters */}
        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" onClick={onClearAll} className="gap-1 text-xs">
            <X className="h-3.5 w-3.5" /> Clear filters ({activeFilterCount})
          </Button>
        )}
      </div>

      {/* Toggle chips */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Quick filters:</span>

        
        <ToggleChip
          active={hasLiveOffers === true}
          onClick={() => onHasLiveOffersChange(hasLiveOffers === true ? null : true)}
          icon={Package}
          label="Has Live Offers"
          activeClass="bg-emerald-100 text-emerald-700 border-emerald-300"
        />
        <ToggleChip
          active={hasPendingOffers === true}
          onClick={() => onHasPendingOffersChange(hasPendingOffers === true ? null : true)}
          icon={AlertCircle}
          label="Has Pending Offers"
          activeClass="bg-violet-100 text-violet-700 border-violet-300"
        />
      </div>
    </div>
  )
}

function FilterSelect({
  value,
  onChange,
  label,
  options,
}: {
  value: string
  onChange: (v: string) => void
  label: string
  options: Array<{ label: string; value: string }>
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-md border border-input bg-background px-3 text-sm text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
    >
      <option value="ALL">All {label}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

function ToggleChip({
  active,
  onClick,
  icon: Icon,
  label,
  activeClass,
}: {
  active: boolean
  onClick: () => void
  icon: any
  label: string
  activeClass: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? activeClass
          : 'border-dashed bg-muted/30 text-muted-foreground hover:bg-muted/50'
      }`}
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  )
}
