import { getAppUrl } from '@/lib/app-url'
import { SIGN_OFF, button, escapeHtmlContent as e, p, renderLayout } from '@/emails/renderer'

// Merchant emails from spec "04 Email flows". Each returns the subject and the
// full HTML. Supabase sends M-01, M-24, M-25 and M-26a (auth templates); the
// rest are sent from here.

export interface MerchantEmail {
  subject: string
  html: string
}

const AUDIENCE = 'You are receiving this because you have a Perks & More merchant account.'
const TZ = 'Europe/Nicosia'

function url(path: string): string {
  return `${getAppUrl()}${path}`
}

export function cyprusDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' })
}

export function cyprusTime(d: Date): string {
  return d.toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
}

/** First word of the contact name, or "there". */
export function firstName(contactName?: string | null): string {
  return contactName?.trim().split(/\s+/)[0] || 'there'
}

/** ["businessName", "logoUrl"] -> "business name and logo". */
export function plainFieldList(fields: string[]): string {
  const words = fields.map((f) =>
    f.replace(/Url$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().trim(),
  )
  if (words.length <= 1) return words[0] ?? ''
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
}

function build(subject: string, preheader: string, body: string): MerchantEmail {
  return { subject, html: renderLayout(body + SIGN_OFF, { preheader, audienceNote: AUDIENCE }) }
}

const hi = (name: string) => p(`Hi ${e(name)},`)
const b = (s: string) => `<strong>${e(s)}</strong>`

interface Base {
  firstName: string
  businessName: string
}

// M-01 Welcome (single email: login email + one-time 72h set-password link)
export function m01Welcome(d: Base & { loginEmail: string; setPasswordUrl: string }) {
  return build(
    'Welcome to Perks & More',
    'Set your password to get started.',
    hi(d.firstName) +
      p(`Your Perks &amp; More merchant account for ${e(d.businessName)} has been created.`) +
      p(`Your sign-in email is ${b(d.loginEmail)}.`) +
      button('Set your password', d.setPasswordUrl) +
      p('The link can be used once and expires after 72 hours. If it has expired, use "Send me a new link" on the page that opens or contact us.'),
  )
}

// M-04 Set password reminder (48h after M-01; same link)
export function m04SetPasswordReminder(d: Base & { loginEmail: string; setPasswordUrl: string; expiresAt: Date }) {
  return build(
    'Reminder: set your Perks & More password',
    `Your set-up link expires on ${cyprusDate(d.expiresAt)}.`,
    hi(d.firstName) +
      p(`Your Perks &amp; More account for ${e(d.businessName)} is waiting for you. You have not set your password yet.`) +
      p('This is the same link as in your Welcome email. It does not extend the 72 hours.') +
      p(`Your sign-in email is ${e(d.loginEmail)}. Your link expires tomorrow, on ${e(cyprusDate(d.expiresAt))} at ${e(cyprusTime(d.expiresAt))} Cyprus time. If it has expired by the time you open it, use "Send me a new link" on the page that opens.`) +
      button('Set your password', d.setPasswordUrl),
  )
}

// M-05 Submit evergreen reminder (day 3 and day 7)
export function m05SubmitEvergreenReminder(d: Base) {
  return build(
    'One step left to go live on Perks & More',
    `Submit your evergreen offer so employees can find ${d.businessName}.`,
    hi(d.firstName) +
      p(`Your account is set up, but ${e(d.businessName)} is not visible in the Perks &amp; More app yet.`) +
      p('To go live, submit your evergreen offer. This is the always-on offer employees see on your listing. It has no end date. We review it within 2 business days.') +
      button('Submit your evergreen offer', url('/merchant/offers/new?type=evergreen')),
  )
}

// M-06 Offer failed automatic checks
export function m06OfferFailedChecks(d: Base & { offerId: string; offerTitle: string; failedRule: string }) {
  return build(
    `Your offer needs a change: ${d.offerTitle}`,
    `${d.offerTitle} did not pass our checks. Here is what to fix.`,
    hi(d.firstName) +
      p(`We could not send your offer ${b(d.offerTitle)} for review because it does not meet this rule:`) +
      p(e(d.failedRule)) +
      p('Please update the offer and submit it again. Your current live offer, if you have one, stays live.') +
      button('Fix your offer', url(`/merchant/offers/${d.offerId}/edit`)),
  )
}

// M-07 You are live (first evergreen approved)
export function m07YouAreLive(d: Base & { offerId: string; offerTitle: string; liveDate: Date }) {
  return build(
    'You are live on Perks & More',
    `Employees can now find ${d.businessName} and your offer in the app.`,
    hi(d.firstName) +
      p(`Good news. We have approved your evergreen offer ${b(d.offerTitle)} and ${e(d.businessName)} is now live in the Perks &amp; More app from ${e(cyprusDate(d.liveDate))}.`) +
      p('Your evergreen offer has no end date. To change it later, use Replace offer. Your current offer stays live until the new one is approved.') +
      p('You can now also add flash offers of up to 15 days.') +
      button('Open your dashboard', url(`/merchant/offers/${d.offerId}`)),
  )
}

// M-08 Evergreen needs change (rejected)
export function m08EvergreenNeedsChange(d: Base & { offerId: string; offerTitle: string; reason: string }) {
  return build(
    'Your evergreen offer needs a change',
    `We could not approve ${d.offerTitle}. Here is why.`,
    hi(d.firstName) +
      p(`We have reviewed your evergreen offer ${b(d.offerTitle)} and could not approve it yet.`) +
      p(`The reason: ${e(d.reason)}`) +
      p(`Please update the offer and submit it again. ${e(d.businessName)} will appear in the app once your evergreen offer is approved.`) +
      button('Fix and resubmit', url(`/merchant/offers/${d.offerId}`)),
  )
}

// M-09 Flash approved
export function m09FlashApproved(d: Base & { offerId: string; offerTitle: string; start: Date; end: Date }) {
  return build(
    `Flash offer approved: ${d.offerTitle}`,
    `${d.offerTitle} runs from ${cyprusDate(d.start)} to ${cyprusDate(d.end)}.`,
    hi(d.firstName) +
      p(`We have approved your flash offer ${b(d.offerTitle)}.`) +
      p(`It runs from ${e(cyprusDate(d.start))} ${e(cyprusTime(d.start))} to ${e(cyprusDate(d.end))} ${e(cyprusTime(d.end))} Cyprus time. Employees see it next to your evergreen offer while it runs.`) +
      button('View flash offer', url(`/merchant/offers/${d.offerId}`)),
  )
}

// M-10 Flash not approved
export function m10FlashNotApproved(d: Base & { offerId: string; offerTitle: string; reason: string }) {
  return build(
    `Flash offer not approved: ${d.offerTitle}`,
    'Here is why, and how to fix it.',
    hi(d.firstName) +
      p(`We could not approve your flash offer ${b(d.offerTitle)}.`) +
      p(`The reason: ${e(d.reason)}`) +
      p('You can update it and submit it again. Your evergreen offer is not affected.') +
      button('Fix and resubmit', url(`/merchant/offers/${d.offerId}`)),
  )
}

// M-11 Replacement live
export function m11ReplacementLive(d: Base & { newOfferId: string; newOfferTitle: string; oldOfferTitle: string }) {
  return build(
    'Your new offer is now live',
    `${d.newOfferTitle} has replaced ${d.oldOfferTitle}.`,
    hi(d.firstName) +
      p(`We have approved your replacement offer. ${b(d.newOfferTitle)} is now live in the app and has replaced ${b(d.oldOfferTitle)}.`) +
      p('Your previous offer is kept in your Archived offers for your records.') +
      button('View your live offer', url(`/merchant/offers/${d.newOfferId}`)),
  )
}

// M-12 Replacement not approved
export function m12ReplacementNotApproved(d: Base & { newOfferId: string; newOfferTitle: string; oldOfferTitle: string; reason: string }) {
  return build(
    'Your replacement offer was not approved',
    'Your current offer stays live. Here is why.',
    hi(d.firstName) +
      p(`We could not approve your replacement offer ${b(d.newOfferTitle)}.`) +
      p(`The reason: ${e(d.reason)}`) +
      p(`Nothing has changed for employees: ${b(d.oldOfferTitle)} stays live. You can update the replacement and submit it again.`) +
      button('Fix and resubmit', url(`/merchant/offers/${d.newOfferId}`)),
  )
}

// M-13 Offer removed by team
export function m13OfferRemoved(d: Base & { offerId: string; offerTitle: string; reason: string; date: Date; wasEvergreen: boolean }) {
  return build(
    `We have removed your offer: ${d.offerTitle}`,
    `${d.offerTitle} is no longer shown in the app.`,
    hi(d.firstName) +
      p(`We have removed your offer ${b(d.offerTitle)} from the Perks &amp; More app on ${e(cyprusDate(d.date))}.`) +
      p(`The reason: ${e(d.reason)}`) +
      (d.wasEvergreen
        ? p(`Because this was your evergreen offer, ${e(d.businessName)} is hidden from the app for now. Submit a new evergreen offer and your listing returns once we approve it.`) +
          button('Submit a new offer', url('/merchant/offers/new?type=evergreen'))
        : p('Your evergreen offer and listing are not affected.') +
          button('View your offers', url(`/merchant/offers/${d.offerId}`))),
  )
}

// M-14 Still hidden reminder (3 days after M-13)
export function m14StillHidden(d: Base & { hiddenSince: Date }) {
  return build(
    `${d.businessName} is still hidden from the app`,
    'Submit a new evergreen offer to come back.',
    hi(d.firstName) +
      p(`${e(d.businessName)} has been hidden from the Perks &amp; More app since ${e(cyprusDate(d.hiddenSince))} because there is no live evergreen offer.`) +
      p('Submit a new evergreen offer and we will review it within 2 business days.') +
      button('Submit your evergreen offer', url('/merchant/offers/new?type=evergreen')),
  )
}

// M-15 Profile update live
export function m15ProfileUpdateLive(d: Base & { changedFields: string }) {
  return build(
    'Your profile update is live',
    `Your changes to ${d.businessName} are now in the app.`,
    hi(d.firstName) +
      p('Your profile update has been approved and is now live.') +
      p(`What changed: ${e(d.changedFields)}`) +
      button('View your profile', url('/merchant/profile')),
  )
}

// M-16 Profile update not approved
export function m16ProfileUpdateNotApproved(d: Base & { changedFields: string; reason: string }) {
  return build(
    'Your profile update was not approved',
    'Your current profile stays live. Here is why.',
    hi(d.firstName) +
      p(`We could not approve your requested change to ${e(d.changedFields)}.`) +
      p(`The reason: ${e(d.reason)}`) +
      p('Your current profile is still what employees see. You can make a new request from your profile page.') +
      button('Review your profile', url('/merchant/profile')),
  )
}

// M-17 Listing paused
export function m17ListingPaused(d: Base & { date: Date; reason: string }) {
  return build(
    'Your Perks & More listing is paused',
    `${d.businessName} is hidden from the app for now.`,
    hi(d.firstName) +
      p(`We have paused your listing for ${e(d.businessName)} on ${e(cyprusDate(d.date))}. Employees cannot see your business or offers in the app while it is paused.`) +
      p(`The reason: ${e(d.reason)}`) +
      p('You can still sign in to your dashboard. If you have questions or want to resolve this, reply to this email or write to hello@perksandmore.com.') +
      button('Open your dashboard', url('/merchant/overview')),
  )
}

// M-18 Listing live again
export function m18ListingLiveAgain(d: Base & { date: Date }) {
  return build(
    'Your Perks & More listing is live again',
    `${d.businessName} is back in the app.`,
    hi(d.firstName) +
      p(`We have resumed your listing. ${e(d.businessName)} and your offers are visible in the Perks &amp; More app again from ${e(cyprusDate(d.date))}.`) +
      button('View your listing', url('/merchant/overview')),
  )
}

// M-19 Account suspended (no button: sign-in is blocked)
export function m19AccountSuspended(d: Base & { date: Date; reason: string }) {
  return build(
    'Your Perks & More account is suspended',
    'You cannot sign in while your account is suspended.',
    hi(d.firstName) +
      p(`We have suspended the Perks &amp; More account for ${e(d.businessName)} on ${e(cyprusDate(d.date))}. Your listing is hidden from the app and you cannot sign in to your dashboard.`) +
      p(`The reason: ${e(d.reason)}`) +
      p('To discuss this, reply to this email or write to hello@perksandmore.com.'),
  )
}

// M-20 Suspension lifted
export function m20SuspensionLifted(d: Base & { date: Date; hasLiveEvergreen: boolean }) {
  return build(
    'Your Perks & More account is active again',
    'You can sign in and your listing is back in the app.',
    hi(d.firstName) +
      p(`We have lifted the suspension on your account. You can sign in again and ${e(d.businessName)} is visible in the app from ${e(cyprusDate(d.date))}.`) +
      (d.hasLiveEvergreen ? '' : p('Your listing returns once you submit an evergreen offer and we approve it.')) +
      button('Sign in', url('/login')),
  )
}

// M-21 Leave request received (no button)
export function m21LeaveRequestReceived(d: Base & { requestDate: Date; removalDate: Date }) {
  return build(
    'We have received your request to leave Perks & More',
    'Your listing will be removed within 3 working days.',
    hi(d.firstName) +
      p(`We have received your request of ${e(cyprusDate(d.requestDate))} to stop your evergreen offer and leave the Perks &amp; More app.`) +
      p(`We will remove ${e(d.businessName)} from the app within 3 working days, by ${e(cyprusDate(d.removalDate))}. Until then employees can still use your offer.`) +
      p(`If you did not ask for this, or you have changed your mind, reply to this email before ${e(cyprusDate(d.removalDate))}.`),
  )
}

// M-22 Removed from app (30 days read-only)
export function m22RemovedFromApp(d: Base & { date: Date; readOnlyEndDate: Date }) {
  return build(
    `${d.businessName} has been removed from Perks & More`,
    `Your listing was removed at your request on ${cyprusDate(d.date)}.`,
    hi(d.firstName) +
      p(`As you asked, we have removed ${e(d.businessName)} from the Perks &amp; More app on ${e(cyprusDate(d.date))}. Your evergreen offer has ended and employees can no longer see your business.`) +
      p(`You can still sign in and view your dashboard in read-only mode until ${e(cyprusDate(d.readOnlyEndDate))}. After that your account data is deleted. Financial records are kept for 7 years as the law requires.`) +
      p('If you would like to come back later, write to hello@perksandmore.com. You will need to submit a new evergreen offer for approval.') +
      p('Thank you for being part of Perks &amp; More.') +
      button('View your dashboard', url('/merchant/overview'), 'This link stops working when read-only access ends after 30 days.'),
  )
}

// M-23 Account closed (no button)
export function m23AccountClosed(d: Base) {
  return build(
    'Your Perks & More account is closed',
    'Your account data has now been deleted.',
    hi(d.firstName) +
      p(`Your Perks &amp; More account for ${e(d.businessName)} is now closed and your account data has been deleted. Financial records are kept for 7 years as the law requires.`) +
      p('To join again in the future, write to hello@perksandmore.com.'),
  )
}

// M-27 Branch live
export function m27BranchLive(d: Base & { offerTitle: string; branchNames: string; liveDate: Date }) {
  return build(
    `Your new branch is live: ${d.branchNames}`,
    `Employees can now find ${d.branchNames} in the app.`,
    hi(d.firstName) +
      p(`We have approved the evergreen offer ${b(d.offerTitle)} for ${e(d.branchNames)}. These branches are now live in the Perks &amp; More app from ${e(cyprusDate(d.liveDate))}.`) +
      p('Your other branches and offers are not affected.') +
      button('View your branches', url('/merchant/branches')),
  )
}

// M-28 Branch offer needs change
export function m28BranchOfferNeedsChange(d: Base & { offerId: string; offerTitle: string; branchNames: string; reason: string }) {
  return build(
    `Your branch offer needs a change: ${d.branchNames}`,
    `We could not approve ${d.offerTitle}. Here is why.`,
    hi(d.firstName) +
      p(`We could not approve the evergreen offer ${b(d.offerTitle)} for ${e(d.branchNames)} yet.`) +
      p(`The reason: ${e(d.reason)}`) +
      p('Please update the offer and submit it again, or link these branches to one of your existing evergreen offers to make them live straight away. Your other branches are not affected.') +
      button('Fix and resubmit', url(`/merchant/offers/${d.offerId}`)),
  )
}

// M-29 Flash ended early (by the merchant)
export function m29FlashEndedEarly(d: Base & { offerTitle: string; endedAt: Date }) {
  return build(
    `Your flash offer has ended: ${d.offerTitle}`,
    `You ended ${d.offerTitle} early on ${cyprusDate(d.endedAt)}.`,
    hi(d.firstName) +
      p(`As you asked, your flash offer ${b(d.offerTitle)} ended on ${e(cyprusDate(d.endedAt))} at ${e(cyprusTime(d.endedAt))} Cyprus time. Employees can no longer use it.`) +
      p('Your evergreen offer and listing are not affected. You can find the ended offer under History.') +
      p('If you did not do this, reply to this email or write to hello@perksandmore.com.') +
      button('View your offers', url('/merchant/offers?tab=history')),
  )
}
