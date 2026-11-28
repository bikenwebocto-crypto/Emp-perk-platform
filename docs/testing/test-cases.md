# Test Case Catalog — PerkSystem E2E Suite

Priority legend: **P0** (security/auth/business-blocking) > **P1** (core business) > **P2** (secondary) > **P3** (content/edge).
Layer: API | UI | E2E(flow) | MOBILE(API).
Credentials: `E2E_*` env (see `docs/testing/README.md`). Tests skip when creds absent.

---

## A. Authentication & Session (P0)

| TC | Layer | Priority | Title | Steps (condensed) | Expected |
|----|-------|----------|-------|-------------------|----------|
| TC-A01 | API | P0 | sync-admin valid token returns role+redirect | POST /api/auth/sync-admin, Bearer super-admin token | 200 `{success:true, role:'SUPER_ADMIN', redirectTo:'/admin'}` |
| TC-A02 | API | P0 | sync-admin without token | POST, no auth | 401 `{error:'Unauthorized'}` |
| TC-A03 | API | P0 | sync-admin with garbage token | POST, `Bearer invalid` | 401 |
| TC-A04 | API | P0 | sync-admin disabled account | token for SUSPENDED/PENDING account | 403 code `ACCOUNT_DISABLED` |
| TC-A05 | API | P0 | sync-admin unmapped email | token for account with no role mapping | 403 code `ACCOUNT_NOT_MAPPED` |
| TC-A06 | API | P0 | sync-admin sets branding cookie | after success, check Set-Cookie `branding` | cookie present, maxAge 3600 |
| TC-A07 | API | P0 | session via middleware email header | GET /api/auth/session with `x-middleware-email` | 200 `{authenticated:true, user.email, user.role}` |
| TC-A08 | API | P0 | session via Bearer | GET with valid access token | 200 |
| TC-A09 | API | P0 | session unauthenticated | GET no auth | 401 |
| TC-A10 | API | P0 | me endpoint valid | GET /api/auth/me with session | 200 user payload |
| TC-A11 | API | P0 | me unauthenticated | GET no auth | 401 |
| TC-A12 | API | P0 | logout clears session | POST /api/auth/logout then GET session | session invalid/401 |
| TC-A13 | API | P0 | health public | GET /api/health | 200, non-empty JSON |
| TC-A14 | API/UI | P0 | company admin before activation | sign in while company is PENDING or APPROVED_PENDING_PAYMENT; request company dashboard | login routes to the payment notice; dashboard APIs return 403; only Super Admin can activate after approval |

## B. Role Authorization Matrix (P0)

Base rule: any EMPLOYEE user must be rejected (403/401) from all `/api/admin/*`, `/api/merchant/*`, `/api/company/*`; cross-role analog for each family. Explicitly probe the audited gaps.

| TC | Layer | Priority | Title | Call (employee token) | Expected |
|----|-------|----------|-------|-----------------------|----------|
| TC-R01 | API | P0 | **Admin merchants list is role-open (GAP)** | GET /api/admin/merchants | AS-IS today: 200 list — **BUG**. Must be 403. |
| TC-R02 | API | P0 | Admin approve merchant mutation | POST /api/admin/merchants | Must be 403; as-is: returns admin-only acceptance → **BUG**. |
| TC-R03 | API | P0 | Admin companies list | GET /api/admin/companies | 403 (enforced today) |
| TC-R04 | API | P0 | Admin action-queue | GET /api/admin/action-queue | 403 (verify) |
| TC-R05 | API | P0 | Admin billing summary | GET /api/admin/billing/summary | 403 (verify) |
| TC-R06 | API | P0 | Merchant offers (from employee) | GET /api/merchant/offers | 403 (verify) |
| TC-R07 | API | P0 | Merchant offers create (from employee) | POST /api/merchant/offers | 403 (verify) |
| TC-R08 | API | P0 | Merchant branches POST (from employee) | POST /api/merchant/branches | 403 (verify) |
| TC-R09 | API | P0 | Company employees (from merchant) | GET /api/company/employees | 403 (verify) |
| TC-R10 | API | P0 | Company admin dashboard (from employee) | GET /api/company/dashboard?q=… | 403 (verify) |
| TC-R11 | API | P0 | Merchant admin dashboards (from other merchant) | GET /api/admin/merchants/dashboard/[id] | 403 (verify) |
| TC-R12 | API | P0 | Employee redeem (from merchant) | POST /api/employee/redeem | 403 (verify) |
| TC-R13 | API | P0 | Cross-tenant IDOR: employee offers of another company | GET /api/employee/offers?id=<other> | own-tenant scoped or 403 (verify) |
| TC-R14 | API | P0 | Unauthenticated on protected merchant API | GET /api/merchant/profile, no auth | 401 JSON |

## C. Offer Lifecycle (P0)

| TC | Layer | Priority | Title | Steps | Expected |
|----|-------|----------|-------|-------|----------|
| TC-O01 | E2E | P0 | Merchant creates draft offer | login merchant → /merchant/offers/new → fill (title unique, branch, dates, redemptionLimit) | DRAFT saved; appears in my offers |
| TC-O02 | E2E | P0 | Merchant submits offer → pending | submit | status PENDING; Case-Queue FIRST_OFFER_APPROVAL or OFFER_APPROVAL raised |
| TC-O03 | E2E | P0 | Admin approves offer | login admin → /admin/offers → approve TC-O02 | offer LIVE; admin gets audit/notification echo |
| TC-O04 | API | P0 | Offer appears LIVE for employee | login employee → feed queries include offer slug | present in grouped feed (or uncategorized if no category) |
| TC-O05 | E2E | P0 | Merchant revokes LIVE offer | merchant → offers → revoke | status REVOKED; employee feed excludes it |
| TC-O06 | API | P0 | Employee cannot see non-live offer details | GET offer [id] with revoke status | 404/INACTIVE guard (verify) |
| TC-O07 | API | P0 | Version out-of-band offer not found | GET /api/employee/offers/[uuid-not-found] | 404 |
| TC-O08 | API | P0 | Validation: offer with invalid dates | POST /api/merchant/offers (end<start) | 400 VALIDATION |
| TC-O09 | API | P0 | 500-on-patch guard | POST /api/merchant/offers with missing required fields | 400 not 500 |

## D. Redemption (P0)

| TC | Layer | Priority | Title | Steps | Expected |
|----|-------|----------|-------|-------|----------|
| TC-D01 | E2E | P0 | Employee redeems LIVE offer (top-up) | login emp → open offer → redeem | Redemption created; employee history shows it |
| TC-D02 | API | P0 | Duplicate redemption rejected | → same offer redeem twice | 2nd rejected (limit=1 or ALREADY_REDEEMED) (verify semantics) |
| TC-D03 | API | P0 | Redemption of expired offer | offer endDate < today | rejected/guard (verify) |
| TC-D04 | E2E | P0 | Merchant sees redemption + sets status | login merchant → /merchant/redemptions → set COMPLETED | status persisted; counts update |
| TC-D05 | API | P0 | Mobile redeem via Bearer with valid user | POST /api/mobile/offers/redeem with mobile token | 200/appropriate (needs mobile creds) |
| TC-D06 | API | P0 | Mobile redeem invalid token | no/bad bearer | 401 |

## E. Merchant & Business Entities (P1)

| TC | Layer | Priority | Title | Expected |
|----|-------|----------|-------|----------|
| TC-M01 | E2E | P1 | Merchant adds branch with valid geodata | branch saved; store-map reflects (no hard geo assert) |
| TC-M02 | API | P1 | Branch validation failures | 400 VALIDATION (missing city/coordinates) |
| TC-M03 | E2E | P1 | Merchant profile update saved | name/phone persists on reload |
| TC-M04 | API | P1 | Merchant settings: change password success shape | 200 {success} (no real SMTP assert) |
| TC-M05 | E2E | P1 | PENDING merchant sees onboarding restrictions | dashboard prompts; can’t publish |
| TC-M06 | E2E | P1 | Admin approves merchant (W1 completion) | merchant becomes ACTIVE; action-queue cleared |
| TC-M07 | E2E | P1 | Admin suspends merchant (W9) | next login blocked (ACCOUNT_DISABLED) |

## F. Company Admin (P1)

| TC | Layer | Priority | Title | Expected |
|----|-------|----------|-------|----------|
| TC-C01 | E2E | P1 | Company admin lists employees | grid renders ACTIVE/PENDING counts |
| TC-C02 | E2E | P1 | Company admin imports CSV → preview → confirm | employees created (PENDING/ACTIVE per rows) |
| TC-C03 | API | P1 | Company admin deactivates employee | status INACTIVE persists; employee login blocked |
| TC-C04 | E2E | P1 | Company admin sees its merchants only | no cross-company merchants in list |
| TC-C05 | E2E | P2 | Company billing/invoice download surface | page renders invoice rows (no PDF bytes assert) |

## G. Banners & Notifications (P1/P2)

| TC | Layer | Priority | Title | Expected |
|----|-------|----------|-------|----------|
| TC-B01 | E2E | P1 | Merchant books banner for date range | booking PENDING; admin action raised |
| TC-B02 | E2E | P1 | Admin approves banner | status APPROVED/live |
| TC-B03 | API | P2 | Announcement (admin→all) accepts payload | 200; broadcast acceptance (no push assert) |
| TC-B04 | API | P2 | Device-token registration guards | 401 unauth, validation on bad body |

## H. Mobile (P2)

| TC | Layer | Priority | Title | Expected |
|----|-------|----------|-------|----------|
| TC-MB01 | MOBILE | P2 | Home feed with Bearer session | 200 offers payload |
| TC-MB02 | MOBILE | P2 | Near-stores | 200 scoped payload |
| TC-MB03 | MOBILE | P2 | Offer detail | 200 |
| TC-MB04 | MOBILE | P2 | Redeem happy path (needs seeded offer) | 200/201 redemption |
| TC-MB05 | MOBILE | P2 | Auth failure paths | 401 on bad token; 403 if deleted/invalid account |

## I. UI Navigation (P0)

| TC | Layer | Priority | Title | Expected |
|----|-------|----------|-------|----------|
| TC-U01 | UI | P0 | `/` redirects to `/login` unauth | 302 → /login |
| TC-U02 | UI | P0 | Login page renders form | email+password fields + submit present |
| TC-U03 | UI | P0 | EMPLOYEE blocked from /admin | redirected to /employee |
| TC-U04 | UI | P0 | MERCHANT blocked from /company | redirected /merchant |
| TC-U05 | UI | P0 | COMPANY_ADMIN blocked from /admin | redirected /company |
| TC-U06 | UI | P0 | Unmapped email login shows mapping error | stays on /login with message, no redirect |
| TC-U07 | UI | P0 | SUPER_ADMIN can load /admin/overview | status 200, dashboard shell renders |
| TC-U08 | UI | P0 | Role dashboard shells render for each role | each /:role/overview 200 (P0/P1) |
| TC-U09 | UI | P1 | Admin offers moderation table renders | rows/empty-state present |

## J. Regression & Analytics (P2)

| TC | Layer | Priority | Title | Expected |
|----|-------|----------|-------|----------|
| TC-G01 | API | P2 | Analytics summary endpoints 200 | shape contract (counters present) |
| TC-G02 | API | P2 | Analytics trends time-series 200 | series arrays |
| TC-G03 | API | P2 | Admin billing audit list 200 | rows |
| TC-G04 | UI | P3 | Login-branding content reflects DB branding | public login shows branding (cache aware) |

---

## Coverage summary (by P0/P1 target)

- Auth/session: 13 (A01–A13)
- Authorization matrix + noted gaps: 14 (R01–R14)
- Offer lifecycle: 9 (O01–O09)
- Redemption incl. mobile: 6 (D01–D06)
- Business entities/company: 11 (M, C)
- Banners/notifications: 4 (B)
- Mobile: 5 (MB)
- UI navigation: 9 (U)
- Analytics/cosmetic: 4 (G)

**Total catalog: 75 test cases** — P0: 42, P1: 19, P2: 11, P3: 3.

> Mapping to code: each TC maps to ≥1 `it(...)` in `e2e/api`, `e2e/ui`, `e2e/flows`, or `e2e/mobile` spec files; traceability ID is the first comment line of each test block.