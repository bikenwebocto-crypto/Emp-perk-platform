# Merchant portal: UI changes only

- **Figma:** Perks-and-More-Admin, section `46:11883`
- **Scope:** UI changes only: text, labels, buttons, columns, layout, and elements to hide or show. New features, API logic and schema changes are left out; they are in [merchant.md](merchant.md).
- **Date:** 2026-11-27. Audit only; no code was changed.
- Rows marked *(verify)* were not confirmed line by line.

| # | Screen | Code file | UI change needed | Type | Priority | Effort |
|---|---|---|---|---|---|---|
| 1 | Overview (live) | `src/app/(dashboard)/merchant/page.tsx` | Hide the **Banner Bookings** quick link and the active-bookings stat tile. | Hide | Must | S |
| 2 | Overview (live) | same | Hide the **Campaign spend** tile *(verify)*. | Hide | Must | S |
| 3 | Overview (not live) | same (`OnboardingView`) | Rename the stepper steps to **Profile done → Submit evergreen offer → Under review → Live** (today the first step is "Set up branches (In-store + Online)"). | Text | Must | S |
| 4 | Overview (not live) | same | Banner text before submitting: "Your profile is set up. Submit your evergreen offer to go live in the app." (today: "Create your evergreen offer / Configure an always-on offer…"). | Text | Must | S |
| 5 | Offers list | `src/app/(dashboard)/merchant/offers/page.tsx` | Remove the **Delete** (bin) row button and the bulk-delete action and dialog. | Hide | Must | S |
| 6 | Offers list | same | On flash offers, rename the **Revoke** button and tooltip to **End early**. Keep it hidden on evergreen. | Text | Must | S |
| 7 | Offers list | same | Human labels in the Type column (**Flat amount**, **Percentage**); no "Regular" in the Type column, filter or counts *(verify)*. | Text | Should | S |
| 8 | Offers list | same | Add **Channel** (In-store / Online / Both) and **Branches** columns. | Column | Should | S |
| 9 | Offers: Flash tab | same | Add a note at the top: "Flash offers run only while your evergreen offer is live, up to 15 days." | Text | Should | S |
| 10 | Offers: History tab | same | Human labels for type and status (no `UPPER_CASE` values) *(verify)*. | Text | Should | S |
| 11 | Archived offers | `src/app/(dashboard)/merchant/offers/archived/page.tsx` | Show dates as **DD/MM/YYYY**: `toLocaleDateString()` has no locale today and can show "Invalid Date". | Format | Should | S |
| 12 | Offer detail | `src/app/(dashboard)/merchant/offers/[id]/page.tsx` | Remove the **Delete** button. | Hide | Must | S |
| 13 | Offer detail | same | Rename **Revoke** to **End flash offer early** (flash only; nothing on evergreen). | Text | Must | S |
| 14 | Offer detail | same | Remove the **Max Redemptions** row; show a **Frequency** row instead, e.g. "Once a week per employee" or "Unlimited". | Row | Must | S |
| 15 | Offer detail | same | Hide the Terms, Minimum spend and Max discount rows when they are empty: no dash, no placeholder. | Hide | Must | S |
| 16 | Offer detail | same | Render terms with line breaks (no literal `\n`). | Format | Should | S |
| 17 | Offer detail | same | Show **Channel** and **Branches** rows; preview amounts in **€** *(verify)*. | Row | Must | S |
| 18 | Offer detail | same | In-store (virtual card) offers: hide the redemption code *(verify)*. | Hide | Should | S |
| 19 | Offer detail: Expired | same | Same as rows 12, 14 and 15; Min. spend shown as "Min. €70". | Hide/Row | Must | S |
| 20 | End flash offer dialog | offers list + detail | Title: "End this flash offer now?". Body: "Employees can no longer use it from now. This cannot be undone." Reason field optional. Buttons **End offer / Cancel**. Remove "You can delete it afterwards." | Text | Must | S |
| 21 | Create / Replace offer | `src/features/merchant/offers/components/offer-form.tsx` | **Terms & Conditions:** remove the required star; add the hint "e.g. valid Mon to Fri only, excludes chairs". | Label | Must | S |
| 22 | Create / Replace offer | same | **Minimum spend** and **Maximum discount:** remove the required stars. | Label | Must | S |
| 23 | Create / Replace offer | same | **More options:** collapsed by default (today it starts open, l.352); open it only on an error or a saved value. It holds description, minimum spend, max discount and terms. | Layout | Must | S |
| 24 | Create / Replace offer | same | Remove the **Max redemptions** input. | Hide | Must | S |
| 25 | Create / Replace offer | same | Image drop zone: text and accepted types to "At least 800 × 450 px, 16:9, JPG, PNG or WebP, up to 2 MB". Drop SVG and GIF from `accept` (l.183–190). | Text | Must | S |
| 26 | Create / Replace offer | same | Frequency helper: "How often each employee can use this offer." *(verify)* | Text | Must | S |
| 27 | Create offer | same | When an evergreen already exists, disable the Evergreen card with "You already have an evergreen offer. Use Replace to change it." *(verify)* | State | Must | S |
| 28 | Create offer | same | Success toast: "Submitted for review. We will email you when it is approved." (today: "Offer submitted for review"). | Text | Must | S |
| 29 | Create offer: errors | same | Inline messages: "At least 10% or €5", "3 to 13 letters and numbers", "Choose all branches or at least one" *(verify the first)*. | Text | Must | S |
| 30 | Branches list | `src/app/(dashboard)/merchant/branches/page.tsx` | Remove the **View (eye)** row action (l.320); clicking the row opens the detail. | Hide | Must | S |
| 31 | Branches list | same | Deactivate confirmation text: explain that offers scoped only to this branch pause. | Text | Should | S |
| 32 | Branches list / detail | same + `[id]/page.tsx` | Disabled-delete message: "This branch has redemption history and cannot be deleted. Deactivate it instead." | Text | Should | S |
| 33 | Branch detail | `src/app/(dashboard)/merchant/branches/[id]/page.tsx` | Rename the top-right **Close** button to **Delete** (l.235, 473–481). | Text | Must | S |
| 34 | Branch detail | same | Show the branch type as **In-store / Online / Both** (human label). | Text | Should | S |
| 35 | Redemptions | `src/app/(dashboard)/merchant/redemptions/page.tsx` | Remove the **Verify a code** panel (l.246–506) and the **Invalid Code** message (l.188). | Hide | Must | S |
| 36 | Redemptions | same | Status shown as **Confirmed** (not `CONFIRMED`): mostly done, check every badge. | Text | Should | S |
| 37 | Tickets list | `src/app/(dashboard)/merchant/complaints/page.tsx` | Rename the **"File Application Support"** button (l.106) to **New Ticket**. | Text | Must | S |
| 38 | Tickets list | same | Remove the **Employee** column (l.151, 168). | Column | Must | S |
| 39 | Tickets list | same | Move **Date** to be the first column, in DD/MM/YYYY. | Column | Must | S |
| 40 | Tickets list | same + sidebar | Page title **Support**. | Text | Should | S |
| 41 | New ticket | `src/app/(dashboard)/merchant/complaints/new/page.tsx` | Title **New Ticket**. Success text: "Your report has been received. We will look into it within 1 business day." Remove the internal-storage wording from the upload hint. | Text | Must | S |
| 42 | Profile | `src/app/(dashboard)/merchant/profile/page.tsx` | Logo upload accepts JPG, PNG or WebP only (no SVG); hint "At least 400 × 400 px, square, up to 500 KB"; cover "1200 × 400 px landscape" *(verify)*. | Text | Must | S |
| 43 | Profile | same | Pending change: keep the current value shown with "Requested: …" next to it, plus the yellow banner "Your changes are under review. Your current listing stays visible while we review." *(verify banner copy)* | Text | Must | S |
| 44 | Profile | same | Show an inline error under each invalid field *(verify)*. | State | Must | S |
| 45 | Notifications page and bell | `src/components/shared/notification-list.tsx` | Remove the **priority** badges (`PRIORITY_STYLES`). | Hide | Should | S |
| 46 | Analytics | `src/app/(dashboard)/merchant/analytics/page.tsx` | Remove the **Campaign** spend block (l.153, 180); use human labels (In-store, not `IN_STORE`); dates and pickers in DD/MM/YYYY. | Hide/Text | Should | S |
| 47 | Sidebar | `src/components/layout/sidebar.tsx` | Show the **Settings** item again (commented out); rename **Tickets** to **Support**. | Nav | Should | S |
| 48 | Account menu | `src/components/layout/dashboard-shell.tsx` | Add a **Profile** link (and Security once 2FA exists) *(verify)*. | Nav | Should | S |
| 49 | Change password | profile / settings | Show the rules text "At least 8 characters, a letter and a number or symbol" and a show/hide toggle *(verify)*. | Text | Should | S |
| 50 | Store Map | `src/app/(dashboard)/merchant/profile/store-map/page.tsx` | Add an **empty state** (no branches) and an error message "Map could not load, retry". | State | Should | S |

## Totals

| Type | Count |
|---|---|
| Hide / remove element | 14 |
| Text / label / copy | 24 |
| Column / row / layout / format | 9 |
| State (disabled, empty, error) | 4 |
| Nav | 2 |

Some rows have two types, so these counts add up to 53 for the 50 rows.

| Priority | Count |
|---|---|
| Must | 33 |
| Should | 17 |

All 50 rows are effort **S**.

## Left out (not UI-only; see merchant.md)
New screens and flows: bulk branch upload, evergreen choice on Add Branch, evergreen column on Branches, multi-range opening hours, branch photo upload, Leaving Perks & More, the removed read-only dashboard, the "Needs changes" onboarding state, merchant 2FA, the one-time "listing is live" banner, notification click-through navigation, Banners Phase B flag, and the "Ended early" status. Also everything that needs a schema or API change.
