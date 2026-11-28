"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingButton } from "@/components/ui/loading-button";
import { ImageUpload, uploadDeferredImage } from "@/components/ui/image-upload";
import type { DeferredFile } from "@/components/shared/ImageUploader";
import { BANNER_IMAGE_OPTIONS } from "@/lib/upload/image";
import { showToast } from "@/hooks/use-toast";

interface BannerOption {
  id: string;
  name: string;
  position: string;
  isActive: boolean;
  expiresAt: string | null;
  availabilityStatus: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  banners: BannerOption[];
}

const EMPTY_FORM = {
  bannerId: "",
  merchantId: "",
  startDate: "",
  endDate: "",
  imageUrl: "",
  altText: "",
  redirectUrl: "",
};

const selectCls =
  "w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Admin-only: place a banner for a merchant. There is no approval step —
 * the banner is live for its date range as soon as it is saved.
 */
export function AddBannerBookingDialog({ open, onOpenChange, banners }: Props) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY_FORM);
  const [pendingFile, setPendingFile] = useState<DeferredFile | null>(null);
  const [merchantQuery, setMerchantQuery] = useState("");
  const [uploading, setUploading] = useState(false);

  const bookable = banners.filter(
    (b) =>
      b.isActive &&
      (b.availabilityStatus === "ACTIVE" || b.availabilityStatus === "SCHEDULED"),
  );
  const selectedBanner =
    bookable.find((b) => b.id === form.bannerId) ?? bookable[0];
  const expiryISO = selectedBanner?.expiresAt?.slice(0, 10);

  const { data: merchantsData, isLoading: merchantsLoading } = useQuery({
    queryKey: ["admin-banner-merchant-picker", merchantQuery],
    queryFn: async () => {
      const params = new URLSearchParams({ status: "ACTIVE", pageSize: "50" });
      if (merchantQuery.trim()) params.set("q", merchantQuery.trim());
      const res = await fetch(`/api/admin/merchants?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Failed to load merchants");
      return json;
    },
    enabled: open,
  });
  const merchants: { id: string; businessName: string }[] = merchantsData?.data ?? [];

  const { data: slotsData } = useQuery({
    queryKey: ["admin-add-booking-slots", selectedBanner?.id, form.startDate, form.endDate],
    queryFn: async () => {
      const params = new URLSearchParams({
        bannerId: selectedBanner!.id,
        startDate: form.startDate,
        endDate: form.endDate,
      });
      const res = await fetch(`/api/admin/banners/slots?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Failed to load slots");
      return json;
    },
    enabled: open && !!selectedBanner && !!form.startDate && !!form.endDate,
  });
  const freeSlots: number[] = slotsData?.data
    ? slotsData.data.slots
        .filter((s: { available: boolean }) => s.available)
        .map((s: { slotNumber: number }) => s.slotNumber)
    : [];

  function reset() {
    setForm(EMPTY_FORM);
    setPendingFile(null);
    setMerchantQuery("");
  }

  const createMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch("/api/admin/banners/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Failed to add banner");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-banner-bookings"] });
      queryClient.invalidateQueries({ queryKey: ["admin-banners"] });
      showToast({ type: "success", title: "Banner added and live" });
      reset();
      onOpenChange(false);
    },
    onError: (e: any) =>
      showToast({ type: "error", title: "Failed", description: e?.message }),
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedBanner) return;
    if (!form.merchantId) {
      showToast({ type: "error", title: "Select a merchant" });
      return;
    }
    if (form.startDate >= form.endDate) {
      showToast({ type: "error", title: "End date must be after start date" });
      return;
    }
    if (!pendingFile && !form.imageUrl) {
      showToast({ type: "error", title: "Banner image is required" });
      return;
    }

    let imageUrl = form.imageUrl;
    if (pendingFile) {
      setUploading(true);
      try {
        imageUrl = (await uploadDeferredImage(pendingFile, BANNER_IMAGE_OPTIONS)) ?? "";
      } catch (err: any) {
        showToast({ type: "error", title: "Image upload failed", description: err?.message });
        return;
      } finally {
        setUploading(false);
      }
      if (!imageUrl) {
        showToast({ type: "error", title: "Image upload failed" });
        return;
      }
    }

    createMutation.mutate({
      bannerId: selectedBanner.id,
      merchantId: form.merchantId,
      startDate: form.startDate,
      endDate: form.endDate,
      imageUrl,
      altText: form.altText || undefined,
      redirectUrl: form.redirectUrl || undefined,
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add Banner</DialogTitle>
          <DialogDescription>
            Place a banner for a merchant. It goes live for the selected dates
            straight away, with no approval step.
          </DialogDescription>
        </DialogHeader>

        {bookable.length === 0 ? (
          <p className="text-sm text-destructive">
            No active banner slot exists. Create one on the Banner Slots tab first.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Position *
                </label>
                <select
                  className={selectCls}
                  value={selectedBanner?.id ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, bannerId: e.target.value }))}
                >
                  {bookable.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.position})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Free Slots
                </label>
                <p className="rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground">
                  {form.startDate && form.endDate
                    ? slotsData?.data
                      ? freeSlots.join(", ") || "None free for these dates"
                      : "Checking…"
                    : "Select dates to check"}
                </p>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Merchant *
              </label>
              <Input
                placeholder="Search active merchants…"
                value={merchantQuery}
                onChange={(e) => setMerchantQuery(e.target.value)}
                className="mb-2"
              />
              <select
                className={selectCls}
                value={form.merchantId}
                onChange={(e) => setForm((f) => ({ ...f, merchantId: e.target.value }))}
                required
              >
                <option value="">
                  {merchantsLoading ? "Loading…" : merchants.length ? "Select merchant" : "No merchants found"}
                </option>
                {merchants.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.businessName}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Start Date *
                </label>
                <Input
                  type="date"
                  value={form.startDate}
                  max={expiryISO}
                  onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  End Date *
                </label>
                <Input
                  type="date"
                  value={form.endDate}
                  min={form.startDate || undefined}
                  max={expiryISO}
                  onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                  required
                />
                {expiryISO && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Must be on or before {new Date(expiryISO).toLocaleDateString()}.
                  </p>
                )}
              </div>
            </div>

            <ImageUpload
              value={form.imageUrl}
              onChange={(url) => setForm((f) => ({ ...f, imageUrl: url }))}
              uploadMode="deferred"
              onDeferredFile={(file) => setPendingFile(file)}
              label="Banner Image *"
            />

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Alt Text
              </label>
              <Input
                value={form.altText}
                onChange={(e) => setForm((f) => ({ ...f, altText: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Redirect URL
              </label>
              <Input
                placeholder="https://… or /employee/offers/…"
                value={form.redirectUrl}
                onChange={(e) => setForm((f) => ({ ...f, redirectUrl: e.target.value }))}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <LoadingButton
                type="submit"
                loading={uploading || createMutation.isPending}
                loadingText="Saving…"
                disabled={!!form.startDate && !!form.endDate && !!slotsData?.data && freeSlots.length === 0}
              >
                Add Banner
              </LoadingButton>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
