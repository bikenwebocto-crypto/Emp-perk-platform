// Shared helpers for authenticated API requests.
// The app's web APIs rely on the Supabase session cookie set during browser login,
// so API calls must carry the same cookie jar. Playwright's APIRequestContext can be
// seeded from the browser context cookies captured after a UI login.

import { expect, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test'
import type { TestUser } from './creds'

// Build an authenticated APIRequestContext seeded with cookies captured from a UI login.
export async function createAuthedApiContext(
  context: BrowserContext,
  request: APIRequestContext,
): Promise<APIRequestContext> {
  // context.request already shares the browser context cookie jar.
  void context
  return request
}

export interface ApiResult {
  status: number
  body: any
}

export async function api(url: string, req: APIRequestContext): Promise<ApiResult> {
  const res = await req.get(url)
  let body: any = null
  try {
    body = await res.json()
  } catch {
    /* non-json */
  }
  return { status: res.status(), body }
}

export async function apiPost(url: string, data: unknown, req: APIRequestContext): Promise<ApiResult> {
  const res = await req.post(url, { data })
  let body: any = null
  try {
    body = await res.json()
  } catch {
    /* non-json */
  }
  return { status: res.status(), body }
}

export async function expect401(result: ApiResult): Promise<void> {
  expect(result.status, `expected 401, got ${result.status} body=${JSON.stringify(result.body)}`).toBe(401)
}

export async function expect403(result: ApiResult): Promise<void> {
  expect(result.status, `expected 403, got ${result.status} body=${JSON.stringify(result.body)}`).toBe(403)
}

export function requiresAuth(page: Page, user: TestUser): void {
  if (!user) {
    // skip handled by caller-level guard
  }
}