'use client'

import PhoneInputBase from 'react-phone-number-input'
import flags from 'react-phone-number-input/flags'
import 'react-phone-number-input/style.css'
import type { CountryCode } from 'libphonenumber-js'
import { cn } from '@/utils/cn'
import { DEFAULT_PHONE_COUNTRY, toE164 } from '@/lib/phone'

type PhoneInputProps = {
  value: string | null | undefined
  onChange: (value: string) => void // always E.164 or ''
  defaultCountry?: CountryCode
  placeholder?: string
  disabled?: boolean
  invalid?: boolean
  id?: string
  className?: string
}

export function PhoneInput({
  value,
  onChange,
  defaultCountry = DEFAULT_PHONE_COUNTRY,
  invalid,
  className,
  ...rest
}: PhoneInputProps) {
  return (
    <PhoneInputBase
      international
      countryCallingCodeEditable={false}
      defaultCountry={defaultCountry}
      flags={flags}
      // Old values like "99 123456" are converted so the input can show them
      value={toE164(value ?? '', defaultCountry) ?? undefined}
      onChange={(v) => onChange(v ?? '')}
      className={cn(
        'flex h-10 w-full items-center gap-2 rounded-md border border-input bg-background px-3 text-sm',
        'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
        invalid && 'border-destructive',
        className,
      )}
      numberInputProps={{
        className: 'flex-1 bg-transparent outline-none placeholder:text-muted-foreground',
      }}
      {...rest}
    />
  )
}