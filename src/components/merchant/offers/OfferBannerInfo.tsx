'use client'
import { AlertTriangle, Image } from 'lucide-react'

interface OfferBannerInfoProps {
  imageUrls: string[]
}

const RECOMMENDED_WIDTH = 800
const RECOMMENDED_HEIGHT = 450

function getAspectRatioWarning(url: string): string | null {
  return null
}

export function OfferBannerInfo({ imageUrls }: OfferBannerInfoProps) {
  const primaryUrl = imageUrls.length > 0 ? imageUrls[0] : null

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-muted/50 p-4">
        <h4 className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Image className="h-4 w-4" />
          Banner Guidelines
        </h4>

        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Minimum Size</dt>
            <dd className="font-medium">{RECOMMENDED_WIDTH} &times; {RECOMMENDED_HEIGHT} px</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Aspect Ratio</dt>
            <dd className="font-medium">16 : 9</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Max File Size</dt>
            <dd className="font-medium">2 MB</dd>
          </div>
        </dl>

        <div className="mt-3">
          <p className="mb-1 text-xs text-muted-foreground">Supported Formats</p>
          <div className="flex flex-wrap gap-1">
            {['JPG', 'PNG', 'WEBP'].map((fmt) => (
              <span
                key={fmt}
                className="rounded-md bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
              >
                {fmt}
              </span>
            ))}
          </div>
        </div>
      </div>

      {imageUrls.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/20">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-xs text-amber-800 dark:text-amber-300">
              Use a 16:9 image of at least 800 × 450 px. Other ratios may be cropped in the mobile app.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
