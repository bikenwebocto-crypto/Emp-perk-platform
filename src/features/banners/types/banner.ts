import type { BannerAvailability } from '../utils/banner-availability'

/** A banner row as returned by `GET /api/admin/banners[/:id]`. */
export interface BannerRecord {
  id: string
  name: string
  description: string | null
  position: string
  displayOrder: number
  /** Prisma Decimal is serialised as a string over JSON. */
  pricePerDay: number | string
  slotCount: number
  minDays: number
  maxDays: number
  isActive: boolean
  startDate: string | null
  expiresAt: string | null
  createdAt: string
  updatedAt?: string
  /** Derived server-side; never stored. */
  availabilityStatus?: BannerAvailability
  daysUntilStart?: number | null
  daysUntilExpiry?: number | null
  _count?: { bookings: number }
}

export interface BannerSlotBooking {
  id: string
  merchantName: string
  startDate: string
  endDate: string
  status: string
}

export interface BannerSlotOccupancy {
  slotNumber: number
  status: 'AVAILABLE' | 'BOOKED'
  /** Latest endDate across this slot's live bookings. */
  bookedUntil: string | null
  bookings: BannerSlotBooking[]
}

/** `GET /api/admin/banners/:id` payload. */
export interface BannerDetail extends BannerRecord {
  availabilityStatus: BannerAvailability
  daysUntilStart: number | null
  daysUntilExpiry: number | null
  slots: BannerSlotOccupancy[]
}
