"use client";

import { CompanyDetailView } from "@/features/companies/components/company-detail/company-detail-view";

/** The company admin's own Company Detail view; the server scopes it to their company. */
export default function CompanyDetailsPage() {
  return <CompanyDetailView scope="company_admin" />;
}
