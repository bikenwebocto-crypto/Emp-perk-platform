"use client";

import { useParams } from "next/navigation";
import { CompanyDetailView } from "@/features/companies/components/company-detail/company-detail-view";

export default function CompanyDetailPage() {
  const params = useParams();
  return <CompanyDetailView scope="super_admin" companyId={params.id as string} />;
}
