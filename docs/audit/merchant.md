# Audit: Merchant portal

- **Figma:** Perks-and-More-Admin, section node `46:11883` (42 "New" frames, each with dev notes and a "Current (reference)" frame)
- **Code:** `src/app/(dashboard)/merchant/**`, `src/app/api/merchant/**`, `src/features/merchant/**`, `src/components/merchant/**`, `prisma/schema.prisma`
- **Date:** 2026-11-27. Audit only; no code was changed.
- **Method:** the frame text and dev notes were read from Figma metadata, and each tagged change was checked with targeted code searches. Rows marked *(verify)* were not confirmed line by line.

Legend: **OK** the code matches · **ADJUST** exists but differs · **MISSING** not built · **REMOVE** exists in code, the design removes it.

## 1. Overview and onboarding states

| Figma frame | Code file/route | Status | What's different | Needs schema change? | Priority | Effort |
|---|---|---|---|---|---|---|
| 01 Overview (live) | `merchant/page.tsx` → `/merchant` | ADJUST | **NEW 2:** the one-time "Your listing is live! Here are 3 things to do." banner (dismissal stored per user) is missing. **REMOVE 3:** the Banner Bookings quick link / `activeBookings` stat is still loaded and shown. **REMOVE 4:** campaign spend tile, check whether it is still shown *(verify)*. | Yes: somewhere to store the per-user dismissal (column or user-preferences JSON) | Should | S |
| Not live yet (onboarding status) | `merchant/page.tsx` (`OnboardingView`) | ADJUST | The stepper exists, but its steps are "Set up branches (In-store + Online)" → Submit evergreen → Under review → Live. Figma says **Profile done** → Submit evergreen offer → Under review → Live. The Create Offer CTA does not preselect Evergreen *(verify)*. | No | Must | S |
| Not live yet / Under review | same | OK | Under-review copy matches: "Your evergreen offer is under review… once it is approved." | No | — | — |
| Not live yet / Needs changes | same | MISSING | No rejected state with the reason and a **Fix and resubmit** button; the stepper only covers branch, offer and review. | No (`OfferReview.rejectionReason` exists) | Must | S |
| Leaving Perks & More / Removed (read-only) | none | MISSING | No read-only dashboard with "Your listing has been removed… You left Perks & More on DD/MM/YYYY." It should stay read-only for 30 days. | **Yes**: a merchant "left" state and date (e.g. `MerchantStatus.LEFT` or `leftAt DateTime?`) | Must | M |

## 2. Offers

| Figma frame | Code file/route | Status | What's different | Needs schema change? | Priority | Effort |
|---|---|---|---|---|---|---|
| 02 Offers list | `merchant/offers/page.tsx` → `/merchant/offers` | ADJUST | Evergreen "No end date" ✔ and evergreen Revoke hidden ✔. **Still present:** Delete action and bulk delete on drafts (Figma says no delete anywhere). Flash offers still show **Revoke** instead of **End early**. Check the type filter for Regular, and the Channel and Branches columns *(verify)*. | No | Must | M |
| J01 Offer detail | `merchant/offers/[id]/page.tsx` | ADJUST | Has a **Revoke** button (flash) and a **Delete** button (drafts). Still renders a **Max Redemptions** row (l.590). It needs a **Frequency** row ("Once a week per employee") and terms rendered with line breaks. Empty terms, minimum spend and max discount must be hidden. Channel and branches rows *(verify)*. | No | Must | M |
| J02 Revoke dialog → "End this flash offer now?" | `[id]/page.tsx`, `offers/page.tsx`, `api/merchant/offers/[id]/revoke` | ADJUST | API blocks evergreen ✔. The dialog is still titled Revoke. Copy should be "Employees can no longer use it from now. This cannot be undone.", with an optional reason and **End offer / Cancel** buttons. The API sets status `ARCHIVED`; it should set a distinct **Ended early** state shown in History. E3 email *(verify)*. | **Yes**: `OfferStatus.ENDED_EARLY` (or `endedEarlyAt`) | Must | M |
| End flash offer early (new screen) | revoke route | ADJUST | Same as J02. History must show "Ended early on DD/MM/YYYY". | Same as above | Must | S |
| J03 Delete dialog (bulk) | `offers/page.tsx`, `DELETE /api/merchant/offers`, `DELETE /api/merchant/offers/[id]` | REMOVE | Both delete endpoints still exist (drafts only). Figma: "no merchant delete endpoint; refused when called directly". | No | Must | S |
| 02a Create Offer | `features/merchant/offers/components/offer-form.tsx` → `/merchant/offers/create` | ADJUST | ✔ Channel In-store / Online / Both, ✔ All branches or chosen branches, ✔ Frequency, ✔ "Always-on, one per branch", ✔ promo code upper-casing, ✔ https:// added, ✔ Cyprus time and DD/MM/YYYY helper, ✔ Save as draft. **Still wrong:** **Terms & Conditions required** on the client (l.804) and on the server (Figma: optional). "More options" **starts open** because it held required fields (l.352); Figma: collapsed, opened only on error or a saved value. **Max redemptions** is still in the state, validation and payload (l.810, 851); Figma: removed. **Image rule:** accepts SVG and GIF up to 5 MB (l.183–190); Figma: JPG, PNG or WebP, at least 800×450, 16:9, ≤2 MB. Minimum spend and max discount optional *(verify)*. Title ≤60, discount ≥10% or €5 *(verify)*. | No (channel, branches and frequency live in `OfferRedemption.configuration` / `repeatAfterHours`) | Must | M |
| Create Offer / Validation errors | offer-form | ADJUST *(verify)* | "Choose all branches or at least one" ✔ and promo code message ✔. Confirm "At least 10% or €5" is shown. | No | Must | S |
| J04 Replace My Offer | `offers/[id]/replace/page.tsx` → OfferForm | ADJUST | Inherits every Create Offer gap above. Check that the type is locked, the reason is required with at least 10 characters, and a "what changed" summary appears before Submit (NEW 3) *(verify; summary likely missing)*. | No | Must | M |
| J05 History tab | `offers/page.tsx` | ADJUST *(verify)* | Human type and status labels. Needs the Ended early status. | Via ENDED_EARLY | Should | S |
| J07 Flash Offer tab | `offers/page.tsx` | ADJUST *(verify)* | Top note "Flash offers run only while your evergreen offer is live, up to 15 days." | No | Should | S |
| J08 Archived Offers | `offers/archived/page.tsx` | ADJUST | `new Date(s).toLocaleDateString()` has no locale, so dates aren't DD/MM/YYYY, and a bad value gives "Invalid Date". Also needs replaced originals with a "Replaced" step in the timeline. | No | Should | S |
| J18 Offer detail: Expired | `offers/[id]/page.tsx` | ADJUST | Same as J01: no Delete, no Max Redemptions, add a Frequency row, € in the preview, hide empty limits and terms. | No | Must | S |
| Offer rejected (new screen) | `offers/[id]/page.tsx` | ADJUST *(verify)* | The rejection reason is shown. A **Fix and resubmit** button that opens a prefilled form is likely missing. | No | Must | S |
| 02 Duplicate offer | `offers/[id]/duplicate`, `offers/[id]/edit` | Extra | Routes exist that are not in Figma. Confirm they are still wanted. | — | Later | — |

## 3. Branches

| Figma frame | Code file/route | Status | What's different | Needs schema change? | Priority | Effort |
|---|---|---|---|---|---|---|
| 04 Branches list | `merchant/branches/page.tsx` | ADJUST | Type Both ✔. **Missing:** an "Evergreen offer" column (the linked offer or "Pending approval"), an **Upload branches (CSV)** button, and a Deactivate confirmation that lists the offers that will pause. Delete must be blocked when the branch has redemptions ("This branch has redemption history…") *(verify)*. **REMOVE:** the **View (eye)** row action is still there (l.320). | **Yes**: the branch ↔ evergreen link (see schema list) | Must | M |
| J09 Branch detail | `branches/[id]/page.tsx` | ADJUST | Top-right action is still labelled **Close**; Figma says **Delete**. Missing the linked evergreen offer with status and link. Opening hours show only one range per day; Figma wants "MON 09:00-13:00, 14:00-19:00". | Yes (evergreen link; opening-hours JSON shape) | Must | M |
| J10 Add Branch: In-Store | `branches/new/page.tsx` → `components/merchant/branches/BranchForm.tsx` | ADJUST | ✔ Use Current Location (geolocation), ✔ +357 phone, ✔ type Both. **Missing:** the required **evergreen choice** (use an existing evergreen, or create a new one → Pending approval). **Opening hours** is one range per day with a "Closed" checkbox (l.550–580); Figma wants several ranges per day ("+ Add hours"), "Closed all day" and overlap validation. **REMOVE:** the "Storefront Image URL" text input (l.642); Figma wants photo upload: 1–5 files, JPG/PNG/WebP, ≥1200×800, ≤2 MB, reorderable. City dropdown and address suggestions *(verify)*. | Yes (evergreen link, `openingHours` shape, ordered images) | Must | L |
| J11 Add Branch: Online | BranchForm | ADJUST | Website field ✔. Missing the evergreen choice and the multi-range hours editor. | Same | Must | M |
| Bulk branch upload | none | MISSING | No merchant CSV upload. Needs a template, an `evergreen_offer` column (an existing reference or "new"), a preview grouped into Goes live now / Pending approval / Rejected, and Confirm import. | Yes (branch evergreen link and pending state) | Must | L |

## 4. Redemptions

| Figma frame | Code file/route | Status | What's different | Needs schema change? | Priority | Effort |
|---|---|---|---|---|---|---|
| 05 Redemptions | `merchant/redemptions/page.tsx` | REMOVE | The **Verify a code** panel is still present (l.246–506). Figma: no merchant verify step in V1. Status label "Confirmed" ✔. | No | Must | S |
| J12 Invalid code message | `redemptions/page.tsx` l.188 | REMOVE | "Invalid Code" UI belongs to the verify panel. Remove it with the panel, along with `api/merchant/redemptions/redeem` if unused. | No | Must | S |

## 5. Support (Tickets)

| Figma frame | Code file/route | Status | What's different | Needs schema change? | Priority | Effort |
|---|---|---|---|---|---|---|
| 06 Tickets (Complaints) | `merchant/complaints/page.tsx` | ADJUST | Button still reads **"File Application Support"** (l.106); Figma: **New Ticket**. The **Employee** column is still present (l.151); Figma: remove it. **Date** must be the first column, in DD/MM/YYYY. Title "Support" with two lists (complaints about my offers and my support requests). The sidebar label is "Tickets". | No | Must | M |
| J14 Create Support Ticket modal | `complaints/new/page.tsx` | ADJUST | It is a page, not a modal; title must be **New Ticket**. Success copy should be "Your report has been received. We will look into it within 1 business day." Remove the internal storage wording from the upload hint *(verify)*. | No | Must | S |
| Issues page | `merchant/issues/page.tsx` | REMOVE / Extra | Not in Figma and already hidden in the sidebar. The route is still reachable. | No | Later | S |

## 6. Banners (Phase B)

| Figma frame | Code file/route | Status | What's different | Needs schema change? | Priority | Effort |
|---|---|---|---|---|---|---|
| 07 Banners | `merchant/banners/page.tsx` (1,739 lines), `api/merchant/banners/**` | REMOVE | Not in the sidebar ✔, but the **route is reachable** and no Phase B flag was found. Figma says the route returns not found while the flag is off. Phase B: rename it "Banner Ads" with a megaphone icon. | No | Must | S |
| J13 Book a Banner | `api/merchant/banners/book` | REMOVE | Same as above: hide behind the flag. | No | Must | S |

## 7. Profile, settings, security, notifications, map

| Figma frame | Code file/route | Status | What's different | Needs schema change? | Priority | Effort |
|---|---|---|---|---|---|---|
| 08 Profile | `merchant/profile/page.tsx` | ADJUST | ✔ "Contact details" section with "Only Perks & More sees this", ✔ phone validation, ✔ https:// added, ✔ 500 KB logo rule, ✔ "Requested…" with a reason. Check the cover rule (1200×400), that SVG is gone from the logo uploader, and the category list of 14 *(verify)*. **NEW 6:** no Security / 2FA section. Contact email field: there is no `contactEmail` column (the account email may be used) *(verify)*. | Maybe: `contactEmail` on `Merchant` | Must | S |
| Profile change under review | `profile/page.tsx` + `api/merchant/change-requests` | OK *(verify)* | Pending values are shown as "Requested". Check the yellow banner copy and the rejected-with-reason state. | No | Must | S |
| Security (2FA) | none | MISSING | No merchant authenticator set-up; no MFA code under the merchant routes. Recovery should reuse the existing MFA Recovery flow. | Possibly (MFA factor is held in Supabase auth; check whether an enrolment flag is needed) | Should | M |
| J16 Account menu | `components/layout/dashboard-shell.tsx` | ADJUST *(verify)* | Add **Profile** and **Security** links. | No | Should | S |
| J17 Change password | `api/merchant/settings/change-password` | ADJUST *(verify)* | Rules: 8–128 characters with a letter and a number or symbol, a show/hide toggle, matching confirm. Other sessions signed out; E12 email. | No | Should | S |
| 11 Settings | `merchant/settings/page.tsx`; sidebar entry commented out | ADJUST | Only has email-notification toggles. **Missing:** the "Leaving Perks & More" section and the **Email Perks & More** mailto button (subject "Leave Perks & More: [business name]", address from config). The Settings nav item is commented out in `sidebar.tsx`. | No | Must | S |
| Leaving Perks & More | settings | MISSING | As above. Also confirm that no deactivate or pause control exists for the evergreen anywhere. | No | Must | S |
| 10 Notifications | `merchant/notifications/page.tsx` → `components/shared/notification-list.tsx` | ADJUST | **Priority labels shown** (`PRIORITY_STYLES`); Figma: remove. No per-type navigation to the offer, profile or ticket was found. Click must mark the item read, and the bell count must match the Unread tab. Rejection reason text *(verify)*. | No | Must | M |
| J15 Bell dropdown | header bell | ADJUST *(verify)* | Same navigation and mark-read rule. | No | Must | S |
| 09 Store Map | `profile/store-map/page.tsx` → `components/shared/store-map.tsx` | ADJUST | No "Map could not load, retry" error state with the branch list still shown. | No | Should | S |
| 09 Store Map / Empty state | same | MISSING | No empty state when the merchant has no branches. | No | Should | S |
| 03 Analytics | `merchant/analytics/page.tsx` | ADJUST | A **Campaign** spend block is still shown (l.153, 180); Figma: none. Dates use `toLocaleDateString`; Figma wants DD/MM/YYYY date pickers. Human labels *(verify)*. | No | Should | S |

## Counts per status

| Status | Count |
|---|---|
| OK | 2 |
| ADJUST | 28 |
| MISSING | 6 |
| REMOVE | 5 |
| Extra (in code, not in Figma) | 2 |
| **Total rows** | **43** |

*About 15 ADJUST rows carry a (verify) tag: the direction is clear but they still need a line-by-line check.*

### Top Must items (largest gaps)
1. Evergreen-per-branch model: an evergreen choice on Add Branch, an evergreen column on the list and detail, and bulk CSV upload.
2. Remove merchant **Delete** (UI and both endpoints) and rename **Revoke → End early**, with an Ended early state.
3. Offer form: make **Terms optional**, collapse **More options**, remove **Max redemptions**, and fix the **image rule**.
4. Remove the **Verify Code** panel in Redemptions.
5. Hide **Banners** routes behind a Phase B flag (return not found).
6. Tickets: **New Ticket** wording, drop the **Employee** column, put **Date** first.
7. Branch opening hours: **multiple ranges per day**, plus photo upload instead of URL fields.
8. Settings **Leaving Perks & More** section, the **removed (read-only)** merchant state, and the **Needs changes** onboarding state.
9. Notifications: click-through navigation and no priority labels.

## Schema changes needed

Changes that need a migration:
1. **Branch ↔ evergreen link:** `MerchantBranch.evergreenOfferId String? @db.Uuid` (relation to `MerchantOffer`), plus a pending state. Use a new `BranchStatus.PENDING_APPROVAL`, or derive it from the linked offer's status. An alternative is an `OfferBranch` join table if branch scoping should move out of `OfferRedemption.configuration` JSON.
2. **Ended early:** `OfferStatus.ENDED_EARLY` (and optionally `MerchantOffer.endedAt DateTime?`) so History can show "Ended early on DD/MM/YYYY". Today revoke writes `ARCHIVED`.
3. **Merchant left the app:** `MerchantStatus.LEFT` (or `REMOVED_AT_REQUEST`) plus `Merchant.leftAt DateTime?`, which drives the 30-day read-only dashboard.
4. **Branch storefront photos:** reuse `branchImages String[]` for the ordered list of uploaded photos; no migration if the order of the array is the display order. `storefrontImageUrl` becomes redundant (optional clean-up).
5. **Live banner dismissed:** `Merchant.liveBannerDismissedAt DateTime?`, or a per-user preferences field.
6. *(Optional)* **`Merchant.contactEmail`**, if the internal contact email must differ from the login email.

These need no migration (JSON shape or code only):
- **Opening hours:** `MerchantBranch.openingHours Json` changes shape to `{ MON: { closed: bool, ranges: [{start,end}] }, … }`. It needs a data backfill script for existing single-range rows.
- **Channel, branches and Frequency:** already stored in `OfferRedemption.configuration` and `repeatAfterHours`.
- **`OfferRedemption.maxRedemptions`:** stop writing it; the column can stay for legacy rows.
