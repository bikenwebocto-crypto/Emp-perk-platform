'use client'

import { Facebook, Instagram, Twitter, type LucideIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import type { SocialLinks, SocialLinkPlatform } from '@/lib/social-links'

interface PlatformMeta {
  key: SocialLinkPlatform
  label: string
  placeholder: string
  Icon: LucideIcon
}

const PLATFORMS: PlatformMeta[] = [
  { key: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/yourbrand', Icon: Instagram },
  // { key: 'facebook', label: 'Facebook', placeholder: 'https://facebook.com/yourbrand', Icon: Facebook },
  // { key: 'twitter', label: 'Twitter / X', placeholder: 'https://x.com/yourbrand', Icon: Twitter },
]

interface SocialLinksInputProps {
  value?: SocialLinks | null
  onChange: (platform: SocialLinkPlatform, value: string) => void
  disabled?: boolean
  labelClassName?: string
  inputClassName?: string
}

/**
 * The three optional social link rows sharing one "Social media" section label.
 * Each row is a brand icon followed by a URL input, matching the surrounding
 * form's input height and spacing.
 */
export function SocialLinksInput({
  value,
  onChange,
  disabled,
  labelClassName,
  inputClassName,
}: SocialLinksInputProps) {
  return (
    <div className="space-y-3">
      <label className={labelClassName ?? 'block text-xs font-medium text-muted-foreground'}>
        Social media
      </label>
      {PLATFORMS.map(({ key, label, placeholder, Icon }) => (
        <div key={key} className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-muted/40 text-muted-foreground">
            <Icon className="h-4 w-4" />
          </span>
          <Input
            type="url"
            inputMode="url"
            aria-label={label}
            placeholder={placeholder}
            disabled={disabled}
            value={value?.[key] ?? ''}
            onChange={(e) => onChange(key, e.target.value)}
            className={inputClassName}
          />
        </div>
      ))}
    </div>
  )
}
