'use client'
import { useMemo } from 'react'

interface OfferStrengthIndicatorProps {
  discountValue: number
  offerType: string
  categoryId?: string | null
  minimumSpend?: number
  discountMax?: number
}

const strengthConfig = {
  levels: [
    { label: 'Poor', threshold: 0, color: 'bg-red-500', textColor: 'text-red-700' },
    { label: 'Average', threshold: 25, color: 'bg-yellow-500', textColor: 'text-yellow-700' },
    { label: 'Good', threshold: 50, color: 'bg-blue-500', textColor: 'text-blue-700' },
    { label: 'Excellent', threshold: 75, color: 'bg-green-500', textColor: 'text-green-700' },
  ] as const,
}

const categoryAverages: Record<string, number> = {
  food: 15,
  retail: 20,
  services: 25,
  entertainment: 30,
  health: 20,
  education: 15,
  travel: 25,
  default: 20,
}

export function OfferStrengthIndicator({ discountValue, offerType, categoryId, minimumSpend, discountMax }: OfferStrengthIndicatorProps) {
  const score = useMemo(() => {
    const baseValue = offerType === 'PERCENTAGE' ? discountValue : discountValue * 2
    const maxScore = 100
    return Math.min(Math.round((baseValue / maxScore) * 100), 100)
  }, [discountValue, offerType])

  const categoryAvg: number = (categoryAverages[categoryId ?? 'default'] ?? categoryAverages.default) as number

  const level = useMemo(() => {
    let current = strengthConfig.levels[strengthConfig.levels.length - 1]
    for (const l of strengthConfig.levels) {
      if (score >= l.threshold) current = l
    }
    return current ?? strengthConfig.levels[0]
  }, [score])

  const comparison = useMemo(() => {
    const diff = discountValue - categoryAvg
    if (diff > 0) return `${diff.toFixed(1)}% above category average`
    if (diff < 0) return `${Math.abs(diff).toFixed(1)}% below category average`
    return 'Matches category average'
  }, [discountValue, categoryAvg])

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <h4 className="text-sm font-semibold">Offer Strength Analysis</h4>

      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">Offer Score</span>
            <span className={`text-sm font-bold ${level.textColor}`}>{level.label}</span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${level.color}`}
              style={{ width: `${score}%` }}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 text-center text-xs">
        {strengthConfig.levels.map((l) => (
          <div key={l.label} className={`py-1 rounded ${score >= l.threshold ? l.color + ' text-white' : 'bg-muted text-muted-foreground'}`}>
            {l.label}
          </div>
        ))}
      </div>

      <div className="text-xs text-muted-foreground pt-1 border-t">
        <span>Category avg: €{categoryAvg.toFixed(2)} &middot; </span>
        <span className={discountValue > categoryAvg ? 'text-green-600' : discountValue < categoryAvg ? 'text-red-600' : ''}>
          {comparison}
        </span>
      </div>

      {/* Linked Discount Summary */}
      {minimumSpend && discountMax && (
        <div className="text-xs text-muted-foreground pt-2 border-t space-y-1">
          <div className="flex justify-between">
            <span>Effective discount rate:</span>
            <span className="font-medium text-foreground">
              {((discountMax / minimumSpend) * 100).toFixed(1)}%
            </span>
          </div>
          <div className="flex justify-between">
            <span>Savings per order:</span>
            <span className="font-medium text-foreground">
              up to ${discountMax.toFixed(2)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
