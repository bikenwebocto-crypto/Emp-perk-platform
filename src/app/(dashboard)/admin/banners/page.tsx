"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { showToast } from "@/hooks/use-toast";
import {
  Plus,
  X,
  Check,
  Ban,
  ToggleLeft,
  ToggleRight,
  Trash2,
  ImageOff,
  Pencil,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ImageUpload, uploadDeferredImage } from "@/components/ui/image-upload";
import type { DeferredFile } from "@/components/shared/ImageUploader";
import { BANNER_IMAGE_OPTIONS } from "@/lib/upload/image";
interface Banner {
  id: string;
  name: string;
  description: string | null;
  position: string;
  displayOrder: number;
  pricePerDay: number;
  minDays: number;
  maxDays: number;
  isActive: boolean;
  expiresAt: string | null;
  daysUntilExpiry: number | null;
  createdAt: string;
  _count: { bookings: number };
}

interface Booking {
  id: string;
  bannerId: string;
  merchantId: string;
  startDate: string;
  endDate: string;
  totalPrice: number;
  status: string;
  paid: boolean;
  slotNumber: number | null;
  rejectedReason: string | null;
  createdAt: string;
  banner: { id: string; name: string; position: string };
  merchant: { id: string; businessName: string };
  content: {
    imageUrl: string;
    altText: string | null;
    redirectUrl: string | null;
  } | null;
}

const POSITION_LABELS: Record<string, string> = {
  TOP: "Top",
  BOTTOM: "Bottom",
};
// Local YYYY-MM-DD (avoids UTC shifting the day)
function toDateInput(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(dateStr: string, n: number) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + n);
  return toDateInput(d);
}
// Returns true if the two date ranges overlap (inclusive)

function statusBadge(s: string) {
  const cls =
    s === "PENDING"
      ? "bg-yellow-100 text-yellow-800"
      : s === "APPROVED"
        ? "bg-green-100 text-green-800"
        : s === "REJECTED"
          ? "bg-red-100 text-red-800"
          : s === "CANCELLED"
            ? "bg-gray-100 text-gray-800"
            : "bg-gray-100 text-gray-800";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {s}
    </span>
  );
}

function derivedBadges(booking: Booking) {
  const now = new Date();
  const end = new Date(booking.endDate);
  const badges: React.ReactNode[] = [];
  if (booking.status === "APPROVED") {
    if (end < now) {
      badges.push(
        <span
          key="expired"
          className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800"
        >
          Expired
        </span>,
      );
      // badges.push(<span key="renewal" className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">Renewal</span>)
    } else {
      badges.push(
        <span
          key="live"
          className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800"
        >
          Live
        </span>,
      );
    }
  }
  return badges;
}

export default function AdminBannersPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"banners" | "bookings">("banners");
  const [page, setPage] = useState(1);
  const [bookingsPage, setBookingsPage] = useState(1);
  const [bookingsStatus, setBookingsStatus] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    position: "TOP",
    slotCount: "5",
    pricePerDay: "",
    minDays: "7",
    maxDays: "30",
    expiresAt: "",
  });

  const [editBanner, setEditBanner] = useState<Banner | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    displayOrder: "",
    pricePerDay: "",
    minDays: "",
    maxDays: "",
    expiresAt: "",
  });
  const [deleteBooking, setDeleteBooking] = useState<Booking | null>(null);
  const [deleteReason, setDeleteReason] = useState("");

  const [reviewBooking, setReviewBooking] = useState<Booking | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const [editBooking, setEditBooking] = useState<Booking | null>(null);
  const [editBookingForm, setEditBookingForm] = useState({
    position: "TOP",
    startDate: "",
    endDate: "",
    slotNumber: "",
    imageUrl: "",
    altText: "",
    redirectUrl: "",
  });
  const [editBookingPendingFile, setEditBookingPendingFile] =
    useState<DeferredFile | null>(null);

  const { data: bannersData, isLoading: bannersLoading } = useQuery({
    queryKey: ["admin-banners", page],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "20",
      });
      const res = await fetch(`/api/admin/banners?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Failed to load");
      return json;
    },
  });

  const banners = bannersData?.data ?? [];

  const bParams = new URLSearchParams();
  bParams.set("page", String(bookingsPage));
  bParams.set("pageSize", "20");
  if (bookingsStatus) bParams.set("status", bookingsStatus);

  const { data: bookingsData, isLoading: bookingsLoading } = useQuery({
    queryKey: ["admin-banner-bookings", bParams.toString()],
    queryFn: async () => {
      const res = await fetch(`/api/admin/banners/bookings?${bParams}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Failed to load");
      return json;
    },
    enabled: tab === "bookings",
  });

  const createMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch("/api/admin/banners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Failed to create");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-banners"] });
      setShowCreate(false);
      setCreateForm({
        position: "TOP",
        slotCount: "5",
        pricePerDay: "",
        minDays: "7",
        maxDays: "30",
        expiresAt: "",
      });
      showToast({ type: "success", title: "Banner slots created" });
    },
    onError: (e: any) =>
      showToast({ type: "error", title: "Failed", description: e?.message }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...body }: Record<string, unknown>) => {
      const res = await fetch(`/api/admin/banners/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Failed to update");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-banners"] });
      setEditBanner(null);
      showToast({ type: "success", title: "Banner slot updated" });
    },
    onError: (e: any) =>
      showToast({ type: "error", title: "Failed", description: e?.message }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await fetch(`/api/admin/banners/${id}/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Failed to toggle");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-banners"] });
      showToast({ type: "success", title: "Banner status toggled" });
    },
    onError: (e: any) =>
      showToast({ type: "error", title: "Failed", description: e?.message }),
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ id, ...body }: Record<string, unknown>) => {
      const res = await fetch(`/api/admin/banners/bookings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Failed to review");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-banner-bookings"] });
      setReviewBooking(null);
      setRejectReason("");
      showToast({ type: "success", title: "Booking reviewed" });
    },
    onError: (e: any) =>
      showToast({ type: "error", title: "Failed", description: e?.message }),
  });

  const editBookingBanner = banners.find(
    (b: Banner) => b.position === editBookingForm.position && b.isActive,
  );

  const { data: editSlotsData } = useQuery({
    queryKey: [
      "admin-booking-slots",
      editBookingBanner?.id,
      editBookingForm.startDate,
      editBookingForm.endDate,
      editBooking?.id,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        bannerId: editBookingBanner!.id,
        startDate: editBookingForm.startDate,
        endDate: editBookingForm.endDate,
        excludeBookingId: editBooking!.id,
      });
      const res = await fetch(`/api/admin/banners/slots?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Failed to load slots");
      return json;
    },
    enabled:
      !!editBooking &&
      !!editBookingBanner?.id &&
      !!editBookingForm.startDate &&
      !!editBookingForm.endDate,
  });

  const editBookingMutation = useMutation({
    mutationFn: async ({ id, ...body }: Record<string, unknown>) => {
      const res = await fetch(`/api/admin/banners/bookings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "edit", ...body }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Failed to update booking");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-banner-bookings"] });
      setEditBooking(null);
      setEditBookingPendingFile(null);
      showToast({ type: "success", title: "Booking updated" });
    },
    onError: (e: any) =>
      showToast({ type: "error", title: "Failed", description: e?.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await fetch(`/api/admin/banners/bookings/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Failed to delete");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-banner-bookings"] });
      setDeleteBooking(null);
      setDeleteReason("");
      showToast({ type: "success", title: "Booking deleted" });
    },
    onError: (e: any) =>
      showToast({ type: "error", title: "Failed", description: e?.message }),
  });

  const editBannerExpiryISO = editBookingBanner?.expiresAt
  ? editBookingBanner.expiresAt.slice(0, 10)
  : undefined;


  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    createMutation.mutate({
      position: createForm.position,
      slotCount: parseInt(createForm.slotCount) || 1,
      pricePerDay: parseFloat(createForm.pricePerDay),
      minDays: parseInt(createForm.minDays),
      maxDays: parseInt(createForm.maxDays),
      expiresAt: createForm.expiresAt || undefined,
    });
  }

  function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editBanner) return;
    updateMutation.mutate({
      id: editBanner.id,
      name: editForm.name,
      description: editForm.description || undefined,
      displayOrder: parseInt(editForm.displayOrder) || 0,
      pricePerDay: parseFloat(editForm.pricePerDay),
      minDays: parseInt(editForm.minDays),
      maxDays: parseInt(editForm.maxDays),
      expiresAt: editForm.expiresAt || null,
    });
  }

  function openEdit(banner: Banner) {
    setEditBanner(banner);
    setEditForm({
      name: banner.name,
      description: banner.description ?? "",
      displayOrder: String(banner.displayOrder ?? 0),
      pricePerDay: String(banner.pricePerDay),
      minDays: String(banner.minDays),
      maxDays: String(banner.maxDays),
      expiresAt: banner.expiresAt
        ? (new Date(banner.expiresAt).toISOString().split("T")[0] ?? "")
        : "",
    });
  }

  function handleApprove(booking: Booking) {
    reviewMutation.mutate({ id: booking.id, status: "APPROVED" });
  }

  function handleReject() {
    if (!reviewBooking) return;
    reviewMutation.mutate({
      id: reviewBooking.id,
      status: "REJECTED",
      rejectedReason: rejectReason || undefined,
    });
  }
  function handleDelete() {
    if (!deleteBooking || !deleteReason.trim()) return;
    deleteMutation.mutate({
      id: deleteBooking.id,
      reason: deleteReason.trim(),
    });
  }

  function openEditBooking(booking: Booking) {
    setEditBooking(booking);
    setEditBookingPendingFile(null);
    setEditBookingForm({
      position: booking.banner.position,
      startDate: booking.startDate.split("T")[0] ?? "",
      endDate: booking.endDate.split("T")[0] ?? "",
      slotNumber: booking.slotNumber != null ? String(booking.slotNumber) : "",
      imageUrl: booking.content?.imageUrl ?? "",
      altText: booking.content?.altText ?? "",
      redirectUrl: booking.content?.redirectUrl ?? "",
    });
  }

  async function handleEditBooking(e: React.FormEvent) {
    e.preventDefault();
    if (!editBooking || !editBookingBanner) return;

     if (editBookingBanner.expiresAt && editBookingForm.endDate) {
        const bannerExpiry = new Date(editBookingBanner.expiresAt);
        // treat expiry as end-of-day to match typical date-only semantics
        bannerExpiry.setHours(23, 59, 59, 999);
        const newEnd = new Date(`${editBookingForm.endDate}T00:00:00`);
        if (newEnd > bannerExpiry) {
          showToast({
            type: "error",
            title: "End date after banner expiry",
            description: `End date cannot be after ${editBookingBanner.expiresAt
              .toString()
              .slice(0, 10)}`,
          });
          return;
        }
      }

    let imageUrl = editBookingForm.imageUrl;
    if (editBookingPendingFile) {
      try {
        imageUrl =
          (await uploadDeferredImage(editBookingPendingFile, BANNER_IMAGE_OPTIONS)) ??
          "";
      } catch (err: any) {
        showToast({
          type: "error",
          title: "Image upload failed",
          description: err?.message,
        });
        return;
      }
    }

    editBookingMutation.mutate({
      id: editBooking.id,
      bannerId: editBookingBanner.id,
      startDate: editBookingForm.startDate,
      endDate: editBookingForm.endDate,
      imageUrl,
      altText: editBookingForm.altText || undefined,
      redirectUrl: editBookingForm.redirectUrl || undefined,
    });
  }
  const bannersMeta = bannersData?.meta;
  const bookings = bookingsData?.data ?? [];
  const bookingsMeta = bookingsData?.meta;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Banner Management"
        description="Manage banner slots and review booking requests"
      />

      <div className="flex gap-1 border-b">
        <button
          onClick={() => setTab("banners")}
          className={`relative whitespace-nowrap px-4 py-2 text-sm font-medium transition-colors ${
            tab === "banners"
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Banner Slots
        </button>
        <button
          onClick={() => setTab("bookings")}
          className={`relative whitespace-nowrap px-4 py-2 text-sm font-medium transition-colors ${
            tab === "bookings"
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Bookings
        </button>
      </div>

      {tab === "banners" && (
        <>
          <Button onClick={() => setShowCreate((s) => !s)}>
            <Plus className="mr-1 h-4 w-4" />
            {showCreate ? "Cancel" : "Create Banner Slot"}
          </Button>

          {showCreate && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Create Banner Slot</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreate} className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">
                        Position *
                      </label>
                      <select
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        value={createForm.position}
                        onChange={(e) =>
                          setCreateForm((f) => ({
                            ...f,
                            position: e.target.value,
                          }))
                        }
                      >
                        <option value="TOP">Top</option>
                        <option value="BOTTOM">Bottom</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">
                        Number of Slots *
                      </label>
                      <Input
                        type="number"
                        min="1"
                        max="20"
                        value={createForm.slotCount}
                        onChange={(e) =>
                          setCreateForm((f) => ({
                            ...f,
                            slotCount: e.target.value,
                          }))
                        }
                        required
                      />
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        How many bookable slots to create in this position (e.g.
                        5 = merchants can book Slot 1 through Slot 5).
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">
                        Price Per Day (€) *
                      </label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={createForm.pricePerDay}
                        onChange={(e) =>
                          setCreateForm((f) => ({
                            ...f,
                            pricePerDay: e.target.value,
                          }))
                        }
                        required
                      />
                      {createForm.pricePerDay &&
                        (() => {
                          const samePosition = banners.filter(
                            (b: Banner) =>
                              b.position === createForm.position && b.isActive,
                          );
                          if (samePosition.length > 0) {
                            const existingPrice = Number(
                              samePosition[0].pricePerDay,
                            );
                            const enteredPrice = parseFloat(
                              createForm.pricePerDay,
                            );
                            if (enteredPrice !== existingPrice) {
                              return (
                                <p className="mt-1 text-xs text-amber-600">
                                  Warning: Other{" "}
                                  {POSITION_LABELS[createForm.position]} slots
                                  are priced at €{existingPrice.toFixed(2)}/day.
                                  All slots must share the same price.
                                </p>
                              );
                            }
                          }
                          return null;
                        })()}
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">
                        Min Days
                      </label>
                      <Input
                        type="number"
                        min="1"
                        value={createForm.minDays}
                        onChange={(e) =>
                          setCreateForm((f) => ({
                            ...f,
                            minDays: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">
                        Max Days
                      </label>
                      <Input
                        type="number"
                        min="1"
                        value={createForm.maxDays}
                        onChange={(e) =>
                          setCreateForm((f) => ({
                            ...f,
                            maxDays: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      Expires At (optional — blank = no expiry)
                    </label>
                    <Input
                      type="date"
                      value={createForm.expiresAt}
                      onChange={(e) =>
                        setCreateForm((f) => ({
                          ...f,
                          expiresAt: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowCreate(false)}
                    >
                      Cancel
                    </Button>
                    <LoadingButton
                      type="submit"
                      loading={createMutation.isPending}
                      loadingText="Creating…"
                    >
                      Create {createForm.slotCount || 1} Slot
                      {Number(createForm.slotCount) === 1 ? "" : "s"}
                    </LoadingButton>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Banner Slots</CardTitle>
            </CardHeader>
            <CardContent>
              {bannersLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : banners.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No banner slots created yet.
                </p>
              ) : (
                <div className="space-y-6">
                  {(["TOP", "BOTTOM"] as const).map((pos) => {
                    const slots = banners
                      .filter((b: Banner) => b.position === pos)
                      .sort(
                        (a: Banner, b: Banner) =>
                          (a.displayOrder ?? 0) - (b.displayOrder ?? 0),
                      );
                    if (slots.length === 0) return null;
                    return (
                      <div key={pos}>
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {POSITION_LABELS[pos]} Position
                        </h3>
                        <div className="space-y-2">
                          {slots.map((b: Banner) => (
                            <div
                              key={b.id}
                              className="rounded-md border p-3 text-sm"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground w-6 text-center font-mono">
                                    #{b.displayOrder ?? 0}
                                  </span>
                                  <p className="font-medium">{b.name}</p>
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${b.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}
                                  >
                                    {b.isActive ? "Active" : "Inactive"}
                                  </span>
                                  {b.daysUntilExpiry !== null &&
                                    b.daysUntilExpiry <= 7 &&
                                    b.daysUntilExpiry > 0 && (
                                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                                        Expires in {b.daysUntilExpiry}d
                                      </span>
                                    )}
                                  {b.daysUntilExpiry !== null &&
                                    b.daysUntilExpiry <= 0 && (
                                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                                        Expired
                                      </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold">
                                    €{Number(b.pricePerDay).toFixed(2)}/day
                                  </span>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => openEdit(b)}
                                  >
                                    Edit
                                  </Button>
                                  <LoadingButton
                                    size="sm"
                                    variant="outline"
                                    loading={toggleMutation.isPending}
                                    onClick={() =>
                                      toggleMutation.mutate({
                                        id: b.id,
                                        isActive: !b.isActive,
                                      })
                                    }
                                  >
                                    {b.isActive ? (
                                      <ToggleRight className="h-4 w-4 text-green-600" />
                                    ) : (
                                      <ToggleLeft className="h-4 w-4 text-gray-400" />
                                    )}
                                  </LoadingButton>
                                </div>
                              </div>
                              {b.description && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {b.description}
                                </p>
                              )}
                              <p className="mt-1 text-xs text-muted-foreground">
                                {b._count.bookings} bookings · Min {b.minDays}d
                                · Max {b.maxDays}d
                                {b.expiresAt && (
                                  <>
                                    {" "}
                                    · Expires{" "}
                                    {new Date(b.expiresAt).toLocaleDateString()}
                                  </>
                                )}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {bannersMeta && bannersMeta.totalPages > 1 && (
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-xs text-muted-foreground">
                    Page {page} of {bannersMeta.totalPages}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setPage((p) => Math.min(bannersMeta.totalPages, p + 1))
                      }
                      disabled={page >= bannersMeta.totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Dialog
            open={!!editBanner}
            onOpenChange={(open) => !open && setEditBanner(null)}
          >
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>Edit: {editBanner?.name}</DialogTitle>
                <DialogDescription>
                  Update the banner slot details below.
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleEdit} className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Name *
                  </label>
                  <Input
                    value={editForm.name}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, name: e.target.value }))
                    }
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Description
                  </label>
                  <Input
                    value={editForm.description}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, description: e.target.value }))
                    }
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      Price Per Day (€) *
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editForm.pricePerDay}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, pricePerDay: e.target.value }))
                      }
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      Min Days
                    </label>
                    <Input
                      type="number"
                      min="1"
                      value={editForm.minDays}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, minDays: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      Max Days
                    </label>
                    <Input
                      type="number"
                      min="1"
                      value={editForm.maxDays}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, maxDays: e.target.value }))
                      }
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Display Order (slot number — lower = appears first)
                  </label>
                  <Input
                    type="number"
                    value={editForm.displayOrder}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, displayOrder: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Expires At (optional — blank = no expiry)
                  </label>
                  <Input
                    type="date"
                    value={editForm.expiresAt}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, expiresAt: e.target.value }))
                    }
                  />
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditBanner(null)}
                  >
                    Cancel
                  </Button>
                  <LoadingButton
                    type="submit"
                    loading={updateMutation.isPending}
                    loadingText="Saving…"
                  >
                    Save
                  </LoadingButton>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </>
      )}

      {tab === "bookings" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Booking Requests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <select
                className="rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={bookingsStatus}
                onChange={(e) => {
                  setBookingsStatus(e.target.value);
                  setBookingsPage(1);
                }}
              >
                <option value="">All Status</option>
                <option value="PENDING">Pending</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>

            {bookingsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : bookings.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No bookings found.
              </p>
            ) : (
              <div className="space-y-6">
                {(["TOP", "BOTTOM"] as const).map((pos) => {
                  const group = bookings.filter(
                    (b: Booking) => b.banner.position === pos,
                  );
                  if (group.length === 0) return null;

                  // Group by slotNumber (the actual per-slot identifier), not banner.id —
                  // banner.id/name is shared across ALL slots in a position ("BOTTOM Slots"),
                  // so grouping by it would merge unrelated slots together.
                  const bySlot = new Map<string, Booking[]>();
                  for (const b of group) {
                    const key =
                      b.slotNumber != null
                        ? String(b.slotNumber)
                        : "unassigned";
                    const existing = bySlot.get(key);
                    if (existing) existing.push(b);
                    else bySlot.set(key, [b]);
                  }

                  // Sort numerically by slot number, "unassigned" last.
                  const sortedEntries = Array.from(bySlot.entries()).sort(
                    (a, b) => {
                      if (a[0] === "unassigned") return 1;
                      if (b[0] === "unassigned") return -1;
                      return Number(a[0]) - Number(b[0]);
                    },
                  );

                  return (
                    <div key={pos}>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {POSITION_LABELS[pos]} Position
                      </h3>

                      <div className="space-y-5">
                        {sortedEntries.map(([slotKey, slotBookings]) => (
                          <div key={slotKey}>
                            <div className="mb-2 flex items-center gap-2">
                              <span className="text-sm font-medium">
                                {slotKey === "unassigned"
                                  ? "Unassigned Slot"
                                  : `Slot ${slotKey}`}
                              </span>
                              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                                {slotBookings.length} booking
                                {slotBookings.length === 1 ? "" : "s"}
                              </span>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                              {slotBookings.map((b: Booking) => (
                                <div
                                  key={b.id}
                                  className="overflow-hidden rounded-lg border"
                                >
                                  {b.content?.imageUrl ? (
                                    <img
                                      src={b.content.imageUrl}
                                      alt={b.content.altText ?? ""}
                                      className="h-32 w-full cursor-pointer object-cover transition-opacity hover:opacity-80"
                                      onClick={() =>
                                        setPreviewUrl(b.content!.imageUrl)
                                      }
                                    />
                                  ) : (
                                    <div className="flex h-32 w-full items-center justify-center bg-muted">
                                      <ImageOff className="h-6 w-6 text-muted-foreground" />
                                    </div>
                                  )}

                                  <div className="space-y-2 p-3 text-sm">
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        <p className="truncate font-medium">
                                          {b.banner.name}
                                        </p>
                                        <p className="truncate text-xs text-muted-foreground">
                                          {b.merchant.businessName}
                                        </p>
                                      </div>
                                      <span className="shrink-0 font-semibold">
                                        €{Number(b.totalPrice).toFixed(2)}
                                      </span>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-1.5">
                                      {statusBadge(b.status)}
                                      {derivedBadges(b)}
                                    </div>

                                    <p className="text-xs text-muted-foreground">
                                      {new Date(
                                        b.startDate,
                                      ).toLocaleDateString()}{" "}
                                      —{" "}
                                      {new Date(b.endDate).toLocaleDateString()}
                                    </p>

                                    {b.rejectedReason && (
                                      <p className="text-xs text-red-600">
                                        Reason: {b.rejectedReason}
                                      </p>
                                    )}

                                    {b.status === "PENDING" && (
                                      <div className="flex gap-2 pt-1">
                                        <LoadingButton
                                          size="sm"
                                          loading={reviewMutation.isPending}
                                          onClick={() => handleApprove(b)}
                                        >
                                          <Check className="mr-1 h-3 w-3" />{" "}
                                          Approve
                                        </LoadingButton>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="text-destructive border-destructive/50"
                                          onClick={() => {
                                            setReviewBooking(b);
                                            setRejectReason("");
                                          }}
                                        >
                                          <Ban className="mr-1 h-3 w-3" />{" "}
                                          Reject
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => openEditBooking(b)}
                                        >
                                          <Pencil className="mr-1 h-3 w-3" />{" "}
                                          Edit
                                        </Button>
                                      </div>
                                    )}

                                    {b.status === "APPROVED" && (
                                      <div className="flex gap-2 pt-1">
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => openEditBooking(b)}
                                        >
                                          <Pencil className="mr-1 h-3 w-3" />{" "}
                                          Edit
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="text-destructive border-destructive/50"
                                          onClick={() => {
                                            setDeleteBooking(b);
                                            setDeleteReason("");
                                          }}
                                        >
                                          <Trash2 className="mr-1 h-3 w-3" />{" "}
                                          Delete
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {bookingsMeta && bookingsMeta.totalPages > 1 && (
              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="text-xs text-muted-foreground">
                  Page {bookingsPage} of {bookingsMeta.totalPages}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setBookingsPage((p) => Math.max(1, p - 1))}
                    disabled={bookingsPage <= 1}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setBookingsPage((p) =>
                        Math.min(bookingsMeta.totalPages, p + 1),
                      )
                    }
                    disabled={bookingsPage >= bookingsMeta.totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}

            {reviewBooking && (
              <Card className="mt-4 border-destructive/30">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-base">
                    <span>Reject Booking</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setReviewBooking(null)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Rejecting booking for{" "}
                    <strong>{reviewBooking.banner.name}</strong> by{" "}
                    {reviewBooking.merchant.businessName}
                  </p>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      Rejection Reason
                    </label>
                    <textarea
                      rows={3}
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Optional reason for rejection"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setReviewBooking(null)}
                    >
                      Cancel
                    </Button>
                    <LoadingButton
                      variant="destructive"
                      onClick={handleReject}
                      loading={reviewMutation.isPending}
                      loadingText="Rejecting…"
                    >
                      Reject Booking
                    </LoadingButton>
                  </div>
                </CardContent>
              </Card>
            )}

            <Dialog
              open={!!editBooking}
              onOpenChange={(open) => !open && setEditBooking(null)}
            >
              <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
                <DialogHeader>
                  <DialogTitle>
                    Edit Booking: {editBooking?.banner.name} —{" "}
                    {editBooking?.merchant.businessName}
                  </DialogTitle>
                  <DialogDescription>
                    Adjust position, dates, or image. Slot availability is
                    re-checked on save.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleEditBooking} className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">
                          Position *
                        </label>
                        <select
                          className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          value={editBookingForm.position}
                          onChange={(e) =>
                            setEditBookingForm((f) => ({
                              ...f,
                              position: e.target.value,
                            }))
                          }
                        >
                          <option value="TOP">Top</option>
                          <option value="BOTTOM">Bottom</option>
                        </select>
                        {!editBookingBanner && (
                          <p className="mt-1 text-xs text-destructive">
                            No active banner for this position.
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">
                          Available Slots
                        </label>
                        <p className="rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground">
                          {editSlotsData?.data
                            ? editSlotsData.data.slots
                                .filter((s: { available: boolean }) => s.available)
                                .map((s: { slotNumber: number }) => s.slotNumber)
                                .join(", ") || "None free for these dates"
                            : "Select dates to check availability"}
                        </p>
                      </div>
                    </div>
                  <div className="grid gap-3 sm:grid-cols-2">
  <div>
    <label className="mb-1 block text-xs font-medium text-muted-foreground">
      Start Date *
    </label>
    <Input
      type="date"
      value={editBookingForm.startDate}
      max={editBannerExpiryISO}
      onChange={(e) =>
        setEditBookingForm((f) => {
          const startDate = e.target.value;
          // If start pushes end past expiry, clamp end to expiry
          const endDate =
            editBannerExpiryISO && f.endDate > editBannerExpiryISO
              ? editBannerExpiryISO
              : f.endDate;
          return { ...f, startDate, endDate };
        })
      }
      required
    />
  </div>
  <div>
    <label className="mb-1 block text-xs font-medium text-muted-foreground">
      End Date *
    </label>
    <Input
      type="date"
      value={editBookingForm.endDate}
      min={editBookingForm.startDate || undefined}
      max={editBannerExpiryISO}
      onChange={(e) =>
        setEditBookingForm((f) => ({
          ...f,
          endDate: e.target.value,
        }))
      }
      required
    />
    {editBannerExpiryISO && (
      <p className="mt-1 text-[11px] text-muted-foreground">
        Must be on or before{" "}
        {new Date(editBannerExpiryISO).toLocaleDateString()}.
      </p>
    )}
  </div>
</div>
                    <ImageUpload
                      value={editBookingForm.imageUrl}
                      onChange={(url) =>
                        setEditBookingForm((f) => ({ ...f, imageUrl: url }))
                      }
                      uploadMode="deferred"
                      onDeferredFile={(file) => setEditBookingPendingFile(file)}
                      label="Banner Image"
                    />
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">
                        Alt Text
                      </label>
                      <Input
                        value={editBookingForm.altText}
                        onChange={(e) =>
                          setEditBookingForm((f) => ({
                            ...f,
                            altText: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">
                        Redirect URL
                      </label>
                      <Input
                        value={editBookingForm.redirectUrl}
                        onChange={(e) =>
                          setEditBookingForm((f) => ({
                            ...f,
                            redirectUrl: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setEditBooking(null)}
                      >
                        Cancel
                      </Button>
                      <LoadingButton
                        type="submit"
                        loading={editBookingMutation.isPending}
                        loadingText="Saving…"
                        disabled={!editBookingBanner}
                      >
                        Save
                      </LoadingButton>
                    </DialogFooter>
                  </form>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      )}

      {previewUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => setPreviewUrl(null)}
        >
          <div className="relative max-h-[90vh] max-w-[90vw]">
            <img
              src={previewUrl}
              alt=""
              className="max-h-[90vh] max-w-[90vw] rounded object-contain"
            />
            <button
              className="absolute -right-3 -top-3 flex h-8 w-8 items-center justify-center rounded-full bg-background shadow-md"
              onClick={() => setPreviewUrl(null)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <Dialog
        open={!!deleteBooking}
        onOpenChange={(open) => !open && setDeleteBooking(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Banner Booking</DialogTitle>
            <DialogDescription>
              This permanently deletes the booking for{" "}
              <strong>{deleteBooking?.banner.name}</strong> by{" "}
              {deleteBooking?.merchant.businessName}. This cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Reason for deletion *
              </label>
              <textarea
                rows={3}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="Required — recorded in the audit log"
                disabled={deleteMutation.isPending}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteBooking(null)}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <LoadingButton
              variant="destructive"
              onClick={handleDelete}
              loading={deleteMutation.isPending}
              loadingText="Deleting…"
              disabled={!deleteReason.trim()}
            >
              Delete Booking
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
