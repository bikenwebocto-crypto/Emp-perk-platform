"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Pencil } from "lucide-react";
import { BannerDetails } from "@/features/banners/components/banner-details";
import { EditBannerDialog } from "@/features/banners/components/edit-banner-dialog";
import type { BannerDetail } from "@/features/banners/types/banner";

export default function AdminBannerDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [showEdit, setShowEdit] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin-banner", id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/banners/${id}`);
      const json = await res.json();
      if (!res.ok)
        throw new Error(json.error?.message ?? "Failed to load banner");
      return json.data as BannerDetail;
    },
    enabled: !!id,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Banner Details"
        description="Configuration, campaign schedule and per-slot availability."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/admin/banners">
                <ArrowLeft className="mr-1 h-4 w-4" aria-hidden />
                Back to banners
              </Link>
            </Button>
            <Button onClick={() => setShowEdit(true)} disabled={!data}>
              <Pencil className="mr-1 h-4 w-4" aria-hidden />
              Edit Banner
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-56 w-full" />
            <Skeleton className="h-56 w-full" />
          </div>
          <Skeleton className="h-56 w-full" />
        </div>
      ) : isError || !data ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-6 text-sm">
          {error instanceof Error
            ? error.message
            : "Failed to load this banner."}
          <div className="mt-4">
            <Button variant="outline" asChild>
              <Link href="/admin/banners">Back to banners</Link>
            </Button>
          </div>
        </div>
      ) : (
        <>
          <BannerDetails banner={data} />
          <EditBannerDialog
            banner={data}
            open={showEdit}
            onOpenChange={setShowEdit}
          />
        </>
      )}
    </div>
  );
}
