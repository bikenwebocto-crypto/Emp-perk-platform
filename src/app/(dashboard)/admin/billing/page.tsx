import { BillingUnavailable } from '@/components/shared/billing-unavailable'

// Billing is not part of this model — the page only shows a notice.
export default function Page() {
  return <BillingUnavailable />
}
