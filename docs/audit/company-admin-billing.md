# Audit — Company Admin / Billing (read-only)

- **Figma:** Perks-and-More-Admin, node `121:9973` ("Company Admin / Billing (read-only) / New / Row")
- **Frames audited:** `121:9728` Billing screen (includes `121:9796` Company Admin sidebar), `121:9957` Dev notes
- **Audit date:** 2026-11-27
- **Implementation follow-up:** 2026-11-28

## Implementation follow-up

- The company-admin Billing route now returns not found in V1; the Billing sidebar item remains hidden.
- Near Stores and Analytics were removed from the company-admin navigation and their page routes now return not found.
- The company-admin navigation and complaint list now use Support, with New Ticket, a day-first Date column, and no Raised By/Priority columns.
- Settings is visible in the company-admin navigation.
- The company Billing API still needs its separate V1 review; Phase B billing UI remains deferred.

## Design intent (from the dev notes)

The whole frame is tagged **REMOVE · later** with the note "Later, when billing is ready. No Billing tab in V1." [CA-04; Req #95; Decision 21 Nov; Phase B]

- **V1:** no Billing item in the sidebar, and **the route returns not found**.
- **Later (Phase B):** a read-only page with these cards:
  - **Your plan:** Plan (Annual), Price "€1.86 per employee per month, billed annually + 19% VAT", Employees, Renews on, and a status pill (Active / Invoice overdue / On hold).
  - **Pay by bank transfer:** "We do not take card payments.", with Account name, IBAN, BIC and Reference.
  - **Invoices** table: Date, Invoice, Period, Amount, Status (Paid).
- Price and status come from configuration. There is no card input.

## Findings

| Figma frame | Code file/route | Status | What's different | Needs schema change? | Priority | Effort |
|---|---|---|---|---|---|---|
| Billing screen, V1 behaviour (`121:9728`) | [src/app/(dashboard)/company/billing/page.tsx](../../src/app/(dashboard)/company/billing/page.tsx) → `/company/billing` | OK | The route returns **not found** in V1, as required by the design. | No | — | — |
| Billing API (V1) | [src/app/api/company/billing/route.ts](../../src/app/api/company/billing/route.ts) → `GET /api/company/billing` | ADJUST | Still returns live billing data. Defaults are wrong against the design: `pricePerEmployee` defaults to 5, cycle to `monthly` and plan to `Trial`; design is €1.86, billed annually. It also exposes `paymentMethodLast4`, but the design has no card payments. Should be 404 in V1, or at least unused. | No | Should | S |
| Sidebar: Billing item (`121:9796`) | [src/components/layout/sidebar.tsx:92](../../src/components/layout/sidebar.tsx#L92) | OK | Billing item is commented out, which matches "no Billing item in the sidebar". | No | — | — |
| Sidebar: Near Stores (tagged REMOVE) | [sidebar.tsx](../../src/components/layout/sidebar.tsx), `/company/near-stores` | OK | Removed from company-admin navigation and route. | No | — | — |
| Sidebar: Analytics (tagged REMOVE) | [sidebar.tsx](../../src/components/layout/sidebar.tsx), `/company/analytics` | OK | Removed from company-admin navigation and route. | No | — | — |
| Sidebar: "Support" label | [sidebar.tsx](../../src/components/layout/sidebar.tsx) | OK | Company-admin navigation and page use **Support**. | No | — | — |
| Sidebar: Settings | [sidebar.tsx](../../src/components/layout/sidebar.tsx), `src/app/(dashboard)/company/settings/` | OK | Settings is visible in the company-admin navigation. | No | — | — |
| Sidebar: profile block | `sidebar.tsx` header | ADJUST (verify) | Figma shows avatar, name, email and a company-name chip ("GLOBAL SOLUTIONS LTD"). Check that the chip is rendered. | No | Later | S |
| Your plan card (Phase B) | none | MISSING (later) | Not built. Existing data: `plan`, `billingCycle`, `pricePerEmployee`, `renewalDate`, `billingStatus`. Employee count is computed. | Default values only | Later | M |
| Status pills Active / Invoice overdue / On hold | `BillingStatus` enum (`ACTIVE`, `INVOICE_OVERDUE`, `ON_HOLD`) | OK (schema) | The enum matches the three statuses. There is no UI yet. | No | Later | S |
| Pay by bank transfer card (Phase B) | none | MISSING (later) | Account name, IBAN, BIC and Reference. The dev notes say these come from configuration (placeholders for now), so env or config is enough. VAT 19% should also come from config. | No (config) | Later | S |
| Invoices table (Phase B) | `src/features/billing/components/billing-history.tsx` (exists, not wired to the company page) | MISSING (later) | Columns Date, Invoice #, Period, Amount, Status (Paid). There is **no Invoice model**: `CompanyBilling` only has `invoiceCount` and `totalPaid`. | **Yes** | Later | L |
| Admin billing pages | `src/app/(dashboard)/admin/billing/**`, `src/app/api/admin/billing/**` | Extra (out of scope) | Super Admin billing exists in code but is not part of this Figma section. Review it in the Admin section audit. | — | — | — |

### Role access
- Figma: Company Admin only, and hidden in V1.
- Code: the page is reachable by URL for Company Admin, and the API is guarded by `getCompanyAdmin()`. This is acceptable once the route returns not found.

## Counts per status

| Status | Count |
|---|---|
| OK | 7 |
| ADJUST | 2 |
| MISSING (Phase B, later) | 3 |
| REMOVE | 0 |
| Extra (out of scope) | 1 |

## Schema changes needed

None are needed for V1.

For Phase B:
1. **New `Invoice` model**: `id`, `companyId` (relation to `Company`), `number` (unique, e.g. `INV-2025-1201`), `issuedAt`, `periodStart`, `periodEnd`, `netAmount`, `vatRate`, `vatAmount`, `totalAmount`, `currency`, `status` (new enum `InvoiceStatus`: `PAID`, `UNPAID`, `OVERDUE`). This needs a migration.
2. **Change the `CompanyBilling` defaults**: `pricePerEmployee` from `5.0` to `1.86` and `billingCycle` from `"monthly"` to `"annual"`. This is a migration. The alternative is to keep the database defaults and move pricing to config, as the dev notes ask.
3. **Optional clean-up** (design says no card payments): `stripeCustomerId`, `stripeSubscriptionId` and `paymentMethodLast4` are unused. They can be dropped later; this needs a migration.
4. Bank details (IBAN, BIC, account name) and VAT 19% go in **config, not the schema**.
