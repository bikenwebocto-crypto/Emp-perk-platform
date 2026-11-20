"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { TablePagination } from "@/components/shared/table-pagination";
import { ImageUpload, uploadDeferredImage } from "@/components/ui/image-upload";
import type { DeferredFile } from "@/components/shared/ImageUploader";
import { BANNER_IMAGE_OPTIONS } from "@/lib/upload/image";
import { showToast } from "@/hooks/use-toast";
import { Plus, X, Calendar, Search } from "lucide-react";

interface SlotInfo {
  slotNumber: number;
  status: "AVAILABLE" | "PENDING" | "APPROVED";
  bookingId?: string;
  startDate?: string;
  bookedUntil?: string;
  merchantName?: string;
  isOwnBooking?: boolean;
  bookings?: Array<{
    startDate: string;
    endDate: string;
    status: "PENDING" | "APPROVED";
    isOwnBooking?: boolean;
  }>;
}

interface PositionSlots {
  bannerId: string;
  position: string;
  pricePerDay: number;
  minDays: number;
  maxDays: number;
  slotCount: number;
  availableCount: number;
  slots: SlotInfo[];
}

interface Booking {
  id: string;
  bannerId: string;
  startDate: string;
  endDate: string;
  totalPrice: number;
  status: string;
  paid: boolean;
  createdAt: string;
  banner: { id: string; name: string; position: string; pricePerDay: number };
  content: {
    imageUrl: string;
    altText: string | null;
    redirectUrl: string | null;
    urlType: "EXTERNAL" | "OFFER" | null;
  } | null;
}

interface ApiResponse {
  data: Booking[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

interface OfferHit {
  id: string;
  title: string;
  status: string;
  offerType?: string | null;
  startDate: string;
  endDate: string;
}

const STATUS_LABELS: Record<string, { label: string; hint: string }> = {
  PENDING: {
    label: "Awaiting review",
    hint: "Our team is reviewing your banner. You can still edit it.",
  },
  APPROVED: {
    label: "Approved",
    hint: "Your banner has been approved by our team.",
  },
  REJECTED: {
    label: "Rejected",
    hint: "This booking was not approved. You can submit a new booking.",
  },
  CANCELLED: {
    label: "Cancelled",
    hint: "This booking was cancelled and will not be shown.",
  },
};

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
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}
      title={STATUS_LABELS[s]?.hint}
    >
      {STATUS_LABELS[s]?.label ?? s}
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
          title="The booking period has ended and the banner is no longer shown."
          className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800"
        >
          Ended
        </span>,
      );
    } else if (!booking.paid) {
      badges.push(
        <span
          key="not-visible"
          title="Approved, but payment has not been received yet. The banner goes live once payment is confirmed."
          className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
        >
          Not live – awaiting payment
        </span>,
      );
    } else {
      badges.push(
        <span
          key="visible"
          title="Approved and paid. Employees can see this banner during the booked dates."
          className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800"
        >
          Live
        </span>,
      );
    }
  }
  return badges;
}

const POSITION_LABELS: Record<string, string> = {
  TOP: "Top banner",
  BOTTOM: "Bottom banner",
};

const POSITION_HINTS: Record<string, string> = {
  TOP: "Shown at the top of the employee app – the most visible spot.",
  BOTTOM: "Shown lower down the page, below the main content.",
};

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfDay(d: Date): Date {
  const nd = new Date(d);
  nd.setHours(0, 0, 0, 0);
  return nd;
}

function hasOpenWindow(
  slot: SlotInfo,
  minDays: number,
  maxDaysHorizon: number,
  today: Date,
): boolean {
  const bookedRanges = (slot.bookings ?? [])
    .filter((b) => b.status === "APPROVED" || b.status === "PENDING")
    .filter((b) => b.startDate && b.endDate)
    .map((b) => ({
      start: startOfDay(new Date(b.startDate)),
      end: startOfDay(new Date(b.endDate)),
    }));

  const dayInMs = 1000 * 60 * 60 * 24;
  let freeRun = 0;

  for (let i = 0; i <= maxDaysHorizon; i++) {
    const day = new Date(today.getTime() + i * dayInMs);
    const isBooked = bookedRanges.some((r) => day >= r.start && day <= r.end);
    if (isBooked) {
      freeRun = 0;
      continue;
    }
    freeRun++;
    if (freeRun >= minDays) return true;
  }
  return false;
}

function buildCalendarCells(year: number, month: number): Array<Date | null> {
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7; // Monday=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<Date | null> = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  return cells;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function MerchantBannersPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [sort, setSort] = useState("createdAt:desc");
  const [showBook, setShowBook] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pendingBannerFile, setPendingBannerFile] =
    useState<DeferredFile | null>(null);

  const [redirectType, setRedirectType] = useState<"EXTERNAL" | "OFFER">(
    "EXTERNAL",
  );
  const [offerSearch, setOfferSearch] = useState("");
  const [debouncedOfferSearch, setDebouncedOfferSearch] = useState("");
  const [selectedOffer, setSelectedOffer] = useState<OfferHit | null>(null);
  const [showOfferResults, setShowOfferResults] = useState(false);

  const [selectedPosition, setSelectedPosition] = useState("TOP");
  const [selectedSlotNumber, setSelectedSlotNumber] = useState<number | null>(
    null,
  );
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [pickedStart, setPickedStart] = useState<string | null>(null);
  const [pickedEnd, setPickedEnd] = useState<string | null>(null);
  const [form, setForm] = useState({
    bannerId: "",
    startDate: "",
    endDate: "",
    imageUrl: "",
    altText: "",
    redirectUrl: "",
  });

  const [editBooking, setEditBooking] = useState<Booking | null>(null);
  const [editForm, setEditForm] = useState({
    imageUrl: "",
    altText: "",
    redirectUrl: "",
  });
  const [editPendingFile, setEditPendingFile] = useState<DeferredFile | null>(
    null,
  );

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  if (status) params.set("status", status);
  {
    const [sortBy, sortDir] = sort.split(":");
    params.set("sortBy", sortBy ?? "createdAt");
    params.set("sortDir", sortDir ?? "desc");
  }

  const { data, isLoading } = useQuery({
    queryKey: ["merchant-banners", params.toString()],
    queryFn: async () => {
      const res = await fetch(`/api/merchant/banners?${params.toString()}`);
      const json = await res.json();
      if (!res.ok)
        throw new Error(json.error?.message ?? "Failed to load bookings");
      return json as ApiResponse;
    },
  });

  const { data: slotsData, isLoading: slotsLoading } = useQuery({
    queryKey: ["merchant-banner-slots", selectedPosition],
    queryFn: async () => {
      const res = await fetch(
        `/api/merchant/banners/slots?position=${selectedPosition}`,
      );
      const json = await res.json();
      if (!res.ok)
        throw new Error(json.error?.message ?? "Failed to load slots");
      return json as { success: boolean; data: PositionSlots };
    },
    enabled: showBook,
  });

  const positionSlots = slotsData?.data;

  // Positions the admin currently has active (isActive + inside date window).
  const { data: bookablePositionsData } = useQuery({
    queryKey: ["bookable-banner-positions"],
    queryFn: async () => {
      const res = await fetch("/api/banners/positions");
      const json = await res.json();
      if (!res.ok)
        throw new Error(json.error?.message ?? "Failed to load positions");
      return json as { success: boolean; data: { position: string }[] };
    },
    enabled: showBook,
  });
  const bookablePositions = bookablePositionsData
    ? new Set(bookablePositionsData.data.map((p) => p.position))
    : null;

  // If the selected position isn't bookable, switch to one that is.
  useEffect(() => {
    if (!bookablePositions || bookablePositions.has(selectedPosition)) return;
    const first = (["TOP", "BOTTOM"] as const).find((p) =>
      bookablePositions.has(p),
    );
    if (first) {
      setSelectedPosition(first);
      setSelectedSlotNumber(null);
      setPickedStart("");
      setPickedEnd("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookablePositionsData, selectedPosition]);

  useEffect(() => {
    const t = setTimeout(
      () => setDebouncedOfferSearch(offerSearch.trim()),
      300,
    );
    return () => clearTimeout(t);
  }, [offerSearch]);

  const searchActive =
    redirectType === "OFFER" && debouncedOfferSearch.length >= 2;

  const {
    data: offerResultsData,
    isLoading: offerResultsLoading,
    isError: offerResultsError,
  } = useQuery({
    queryKey: ["merchant-offer-search", debouncedOfferSearch],
    queryFn: async () => {
      const res = await fetch(
        `/api/merchant/offers?search=${encodeURIComponent(debouncedOfferSearch)}`,
      );
      const json = await res.json();
      if (!res.ok)
        throw new Error(json.error?.message ?? "Failed to search offers");
      return json as { success: boolean; data: OfferHit[] };
    },
    enabled: searchActive,
  });

  const offerResults = offerResultsData?.data ?? [];

  useEffect(() => {
    if (positionSlots?.bannerId) {
      setForm((f) => ({ ...f, bannerId: positionSlots.bannerId }));
    }
  }, [positionSlots?.bannerId]);

  useEffect(() => {
    setPickedStart(null);
    setPickedEnd(null);
    const now = new Date();
    setCalendarMonth({ year: now.getFullYear(), month: now.getMonth() });
  }, [selectedSlotNumber, selectedPosition]);

  const selectedSlot = selectedSlotNumber
    ? (positionSlots?.slots.find((s) => s.slotNumber === selectedSlotNumber) ??
      null)
    : null;

  const bookedRanges: Array<{ start: Date; end: Date; isOwn: boolean }> = (
    selectedSlot?.bookings ?? []
  )
    .filter((b) => b.startDate && b.endDate)
    .map((b) => ({
      start: startOfDay(new Date(b.startDate)),
      end: startOfDay(new Date(b.endDate)),
      isOwn: !!b.isOwnBooking,
    }));

  const today = startOfDay(new Date());
  const dayInMs = 1000 * 60 * 60 * 24;

  function dateInBookedRanges(d: Date): boolean {
    return bookedRanges.some((r) => d >= r.start && d <= r.end);
  }

  const days =
    pickedStart && pickedEnd
      ? Math.round(
          (new Date(pickedEnd).getTime() - new Date(pickedStart).getTime()) /
            dayInMs,
        )
      : 0;

  const totalPrice =
    positionSlots && days > 0 ? Number(positionSlots.pricePerDay) * days : 0;

  const isRedirectValid =
    redirectType === "EXTERNAL"
      ? form.redirectUrl.trim().length > 0
      : !!selectedOffer?.id;

  function handleDayClick(d: Date) {
    if (!positionSlots || d < today) return;
    if (dateInBookedRanges(d)) return;
    const key = toDateKey(d);
    if (!pickedStart || (pickedStart && pickedEnd)) {
      // start a fresh range
      setPickedStart(key);
      setPickedEnd(null);
      setForm((f) => ({ ...f, startDate: key, endDate: "" }));
      return;
    }
    // pickedStart set, no end yet
    const start = new Date(pickedStart);
    if (d < start) {
      setPickedStart(key);
      setPickedEnd(pickedStart);
      setForm((f) => ({ ...f, startDate: key, endDate: pickedStart }));
      return;
    }
    if (d.getTime() === start.getTime()) return;
    // check range validity: min/max days and no booked day inside
    const rangeDays = Math.round((d.getTime() - start.getTime()) / dayInMs);
    if (rangeDays < (positionSlots.minDays ?? 0)) {
      showToast({
        type: "error",
        title: "Too short",
        description: `Minimum booking period is ${positionSlots.minDays} days.`,
      });
      return;
    }
    if (rangeDays > (positionSlots.maxDays ?? 0)) {
      showToast({
        type: "error",
        title: "Too long",
        description: `Maximum booking period is ${positionSlots.maxDays} days.`,
      });
      return;
    }
    for (let i = 0; i <= rangeDays; i++) {
      const day = new Date(start.getTime() + i * dayInMs);
      if (dateInBookedRanges(day)) {
        showToast({
          type: "error",
          title: "Conflict",
          description:
            "Selected range includes a booked day. Please adjust your dates.",
        });
        return;
      }
    }
    setPickedEnd(key);
    setForm((f) => ({ ...f, endDate: key }));
  }

  function clearPicked() {
    setPickedStart(null);
    setPickedEnd(null);
    setForm((f) => ({ ...f, startDate: "", endDate: "" }));
  }

  const calCells = buildCalendarCells(calendarMonth.year, calendarMonth.month);

  function prevMonth() {
    setCalendarMonth((m) => {
      if (m.month === 0) return { year: m.year - 1, month: 11 };
      return { year: m.year, month: m.month - 1 };
    });
  }

  function nextMonth() {
    setCalendarMonth((m) => {
      if (m.month === 11) return { year: m.year + 1, month: 0 };
      return { year: m.year, month: m.month + 1 };
    });
  }

  const bookMutation = useMutation({
    mutationFn: async (body: FormData) => {
      const response = await fetch("/api/merchant/banners/book", {
        method: "POST",
        body,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error ?? "Failed to submit banner booking");
      }

      return result;
    },

    onSuccess: () => {
      showToast({
        type: "success",
        title: "Booking request sent",
        description:
          "Our team will review your banner. Once it is approved and paid, it goes live on the dates you picked.",
      });

      setPendingBannerFile(null);
      setShowBook(false);

      queryClient.invalidateQueries({ queryKey: ["merchant-banners"] });
      queryClient.invalidateQueries({
        queryKey: ["merchant-banner-slots"],
      });
    },

    onError: (error: Error) => {
      showToast({
        type: "error",
        title: "Booking failed",
        description: error.message,
      });
    },
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, ...body }: Record<string, unknown>) => {
      const res = await fetch(`/api/merchant/banners/bookings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok)
        throw new Error(json.error?.message ?? "Failed to update booking");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["merchant-banners"] });
      setEditBooking(null);
      setEditPendingFile(null);
      showToast({
        type: "success",
        title: "Banner updated",
        description: "Your changes are saved and will be included in the review.",
      });
    },
    onError: (e: any) =>
      showToast({ type: "error", title: "Failed", description: e?.message }),
  });

  function openEdit(b: Booking) {
    setEditBooking(b);
    setEditForm({
      imageUrl: b.content?.imageUrl ?? "",
      altText: b.content?.altText ?? "",
      redirectUrl: b.content?.redirectUrl ?? "",
    });
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editBooking) return;
    let imageUrl = editForm.imageUrl;
    if (editPendingFile) {
      try {
        imageUrl =
          (await uploadDeferredImage(editPendingFile, BANNER_IMAGE_OPTIONS)) ??
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
    editMutation.mutate({
      id: editBooking.id,
      imageUrl,
      altText: editForm.altText || undefined,
      redirectUrl: editForm.redirectUrl || undefined,
    });
  }

  async function handleBook(e: React.FormEvent) {
    e.preventDefault();

    if (!selectedSlotNumber || !pickedStart || !pickedEnd) {
      showToast({
        type: "error",
        title: "Missing booking details",
        description: "Please select a slot and booking dates.",
      });
      return;
    }

    if (redirectType === "EXTERNAL" && !form.redirectUrl.trim()) {
      showToast({
        type: "error",
        title: "Redirect URL required",
        description: "Please enter an external redirect URL.",
      });
      return;
    }

    if (redirectType === "OFFER" && !selectedOffer) {
      showToast({
        type: "error",
        title: "Offer required",
        description: "Please select a merchant offer.",
      });
      return;
    }

    if (!pendingBannerFile && !form.imageUrl) {
      showToast({
        type: "error",
        title: "Banner image required",
        description: "Please upload a banner image.",
      });
      return;
    }

    const formData = new FormData();

    formData.append("bannerId", form.bannerId);
    formData.append("startDate", pickedStart);
    formData.append("endDate", pickedEnd);

    formData.append("altText", form.altText ?? "");

    formData.append("redirectType", redirectType);

    if (redirectType === "EXTERNAL") {
      formData.append("redirectUrl", form.redirectUrl.trim());
      formData.append("urlType", "EXTERNAL");
    }

    if (redirectType === "OFFER" && selectedOffer) {
      formData.append("offerId", selectedOffer.id);
      formData.append("urlType", "OFFER");
    }

    // New image upload flow:
    // Send the File to the backend instead of uploading here.
    if (pendingBannerFile) {
      formData.append("image", pendingBannerFile.file);
    } else if (form.imageUrl) {
      // Useful if editing/reusing an already-uploaded image.
      formData.append("imageUrl", form.imageUrl);
    }

    bookMutation.mutate(formData);
  }

  const bookings = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Banner Advertising"
        description="Promote your business with a banner that employees see in the app. Pick a spot, choose your dates and upload your design."
        actions={
          <Button onClick={() => setShowBook((s) => !s)}>
            <Plus className="mr-1 h-4 w-4" />
            {showBook ? "Close" : "Book a Banner"}
          </Button>
        }
      />

      <Card>
        <CardContent className="pt-6">
          <p className="mb-3 text-sm font-semibold">How banner booking works</p>
          <ol className="grid gap-3 text-xs text-muted-foreground sm:grid-cols-4">
            {[
              ["1. Choose a spot", "Pick a banner position and a free slot."],
              [
                "2. Pick your dates",
                "Select a start and end date. The price is per day.",
              ],
              [
                "3. Add your banner",
                "Upload an image and choose where a click should lead.",
              ],
              [
                "4. Review & go live",
                "We review your request. Once approved and paid, your banner is shown on the booked dates.",
              ],
            ].map(([t, d]) => (
              <li key={t} className="rounded-md bg-muted/30 p-3">
                <p className="font-medium text-foreground">{t}</p>
                <p className="mt-1">{d}</p>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {showBook && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Book a Banner</CardTitle>
            <p className="text-xs text-muted-foreground">
              Fields marked * are required. You won&apos;t be charged until your
              booking is approved.
            </p>
          </CardHeader>
          <CardContent>
            {
              <form onSubmit={handleBook} className="space-y-5">
                {/* -------------------------------------------------- */}
                {/* POSITION */}
                {/* -------------------------------------------------- */}

                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Step 1 · Where should your banner appear? *
                  </label>

                  <select
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={selectedPosition}
                    onChange={(e) => {
                      setSelectedPosition(e.target.value);
                      setSelectedSlotNumber(null);
                      setPickedStart("");
                      setPickedEnd("");
                    }}
                  >
                    {(["TOP", "BOTTOM"] as const).map((pos) => {
                      const unavailable =
                        bookablePositions !== null &&
                        !bookablePositions.has(pos);
                      return (
                        <option key={pos} value={pos} disabled={unavailable}>
                          {pos === "TOP" ? "Top banner" : "Bottom banner"}
                          {unavailable ? " (unavailable)" : ""}
                        </option>
                      );
                    })}
                  </select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {POSITION_HINTS[selectedPosition]}
                  </p>
                </div>

                {/* -------------------------------------------------- */}
                {/* SLOT */}
                {/* -------------------------------------------------- */}

                {slotsLoading ? (
                  <Skeleton className="h-24 w-full" />
                ) : !positionSlots ? (
                  <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    Banners can&apos;t be booked in this position right now.
                    Please try another position or check back later.
                  </div>
                ) : (
                  <>
                    {/* Slot information */}

                 

                    {/* Slot selection */}

                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">
                        Step 2 · Choose a slot *
                      </label>
                      <p className="mb-2 text-xs text-muted-foreground">
                        Slots are banner places in this position. Greyed-out
                        slots have no free dates left.
                      </p>

                      <div className="grid gap-2 sm:grid-cols-3">
                        {positionSlots.slots.map((slot) => {
                          const isAvailable = hasOpenWindow(
                            slot,
                            positionSlots.minDays ?? 1,
                            positionSlots.maxDays ?? 30,
                            today,
                          );

                          const isSelected =
                            selectedSlotNumber === slot.slotNumber;

                          return (
                            <button
                              type="button"
                              key={slot.slotNumber}
                              disabled={!isAvailable}
                              onClick={() => {
                                setSelectedSlotNumber(slot.slotNumber);
                                setPickedStart("");
                                setPickedEnd("");
                              }}
                              className={`rounded-md border p-3 text-left text-xs transition-colors ${
                                !isAvailable
                                  ? "cursor-not-allowed border-muted bg-muted/40 text-muted-foreground"
                                  : isSelected
                                    ? "border-primary bg-primary/10 ring-1 ring-primary"
                                    : "hover:bg-muted/50"
                              }`}
                            >
                              <p className="font-semibold">
                                Slot {slot.slotNumber}
                              </p>

                              {isAvailable ? (
                                <p className="mt-1 text-emerald-600">
                                  {(slot.bookings?.length ?? 0) > 0
                                    ? "Some dates free"
                                    : "All dates free"}
                                </p>
                              ) : (
                                <>
                                  <p className="mt-1 text-amber-600">
                                    Fully booked
                                  </p>

                                  {slot.bookedUntil && (
                                    <p className="mt-0.5 text-muted-foreground">
                                      Free again after{" "}
                                      {new Date(
                                        slot.bookedUntil,
                                      ).toLocaleDateString()}
                                    </p>
                                  )}
                                </>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* -------------------------------------------------- */}
                    {/* SELECTED SLOT + CALENDAR */}
                    {/* -------------------------------------------------- */}

                    {selectedSlotNumber != null && selectedSlot && (
                      <>
                        <div className="rounded-md bg-primary/10 p-3 text-sm">
                          <p className="font-medium">
                            You picked Slot {selectedSlot.slotNumber}
                          </p>

                          <p className="mt-1 text-xs text-muted-foreground">
                            {bookedRanges.length > 0 ? (
                              <>
                                Already taken (not selectable):{" "}
                                {bookedRanges
                                  .map(
                                    (r) =>
                                      `${new Date(
                                        r.start,
                                      ).toLocaleDateString()} – ${new Date(
                                        r.end,
                                      ).toLocaleDateString()}`,
                                  )
                                  .join(", ")}
                              </>
                            ) : (
                              "This slot is completely free – pick any dates."
                            )}
                          </p>
                        </div>

                        {/* Calendar */}

                        <div>
                          <div className="mb-2 flex items-center justify-between">
                            <label className="text-xs font-medium text-muted-foreground">
                              Step 3 · Click a start date, then an end date * (
                              {new Date(
                                calendarMonth.year,
                                calendarMonth.month,
                                1,
                              ).toLocaleDateString("en-US", {
                                month: "long",
                                year: "numeric",
                              })}
                              )
                            </label>

                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={prevMonth}
                              >
                                ‹
                              </Button>

                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={nextMonth}
                              >
                                ›
                              </Button>
                            </div>
                          </div>

                          <div className="rounded-md border">
                            <div className="grid grid-cols-7 gap-1 border-b bg-muted/30 p-1 text-center text-[10px] font-medium uppercase text-muted-foreground">
                              {WEEKDAY_LABELS.map((w) => (
                                <span key={w}>{w}</span>
                              ))}
                            </div>

                            <div className="grid grid-cols-7 gap-1 p-1">
                              {calCells.map((cell, idx) => {
                                if (!cell) {
                                  return <div key={`e-${idx}`} />;
                                }

                                const key = toDateKey(cell);
                                const isPast = cell < today;
                                const isBooked = dateInBookedRanges(cell);

                                const isSelected =
                                  key === pickedStart || key === pickedEnd;

                                const inRange =
                                  pickedStart &&
                                  pickedEnd &&
                                  key > pickedStart &&
                                  key < pickedEnd;

                                const disabled = isPast || isBooked;

                                return (
                                  <button
                                    key={key}
                                    type="button"
                                    disabled={disabled}
                                    onClick={() => handleDayClick(cell)}
                                    className={`flex h-9 items-center justify-center rounded-md text-xs transition-colors ${
                                      disabled
                                        ? "cursor-not-allowed text-muted-foreground/40 line-through"
                                        : inRange
                                          ? "bg-primary/20 text-primary"
                                          : isSelected
                                            ? "bg-primary font-semibold text-primary-foreground"
                                            : "hover:bg-muted/50"
                                    }`}
                                  >
                                    {cell.getDate()}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Calendar legend */}

                          <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <span className="inline-block h-3 w-3 rounded bg-primary" />
                              Start / end date
                            </span>

                            <span className="flex items-center gap-1">
                              <span className="inline-block h-3 w-3 rounded bg-primary/20" />
                              Your banner runs
                            </span>

                            <span className="flex items-center gap-1">
                              <span className="inline-block h-3 w-3 rounded bg-muted text-muted-foreground/40 line-through" />
                              Taken or past
                            </span>
                          </div>

                          {/* Selected dates */}

                          {pickedStart && (
                            <div className="mt-2 flex flex-wrap items-center gap-4 rounded-md bg-muted/40 p-3 text-sm">
                              <p className="font-medium">
                                Slot {selectedSlotNumber}
                              </p>

                              <p>
                                From:{" "}
                                {new Date(pickedStart).toLocaleDateString()}
                              </p>

                              <p>
                                To:{" "}
                                {pickedEnd
                                  ? new Date(pickedEnd).toLocaleDateString()
                                  : "now click an end date"}
                              </p>

                              {days > 0 && (
                                <>
                                  <p>
                                    {days} day{days !== 1 ? "s" : ""} × €
                                    {Number(positionSlots.pricePerDay).toFixed(
                                      2,
                                    )}
                                  </p>

                                  <p className="font-semibold">
                                    Estimated total:{" "}
                                    {Intl.NumberFormat("en-GB", {
                                      style: "currency",
                                      currency: "EUR",
                                    }).format(totalPrice)}
                                  </p>

                                  <button
                                    type="button"
                                    onClick={clearPicked}
                                    className="text-xs text-primary underline"
                                  >
                                    Clear
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </>
                )}

                {/* -------------------------------------------------- */}
                {/* BANNER IMAGE */}
                {/* -------------------------------------------------- */}

                <div className="border-t pt-5">
                  <ImageUpload
                    value={form.imageUrl}
                    onChange={(url) =>
                      setForm((f) => ({
                        ...f,
                        imageUrl: url,
                      }))
                    }
                    onDeferredFile={(file) => setPendingBannerFile(file)}
                    uploadMode="deferred"
                    label="Step 4 · Upload your banner image *"
                    helperText="Use a wide image (1200×400 px works best). PNG, JPG or WEBP, up to 5 MB. Keep text short and readable on mobile."
                  />
                </div>

                {/* -------------------------------------------------- */}
                {/* ALT TEXT */}
                {/* -------------------------------------------------- */}

                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Image description (optional)
                  </label>

                  <Input
                    value={form.altText}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        altText: e.target.value,
                      }))
                    }
                    placeholder="e.g. 20% off all pizzas this weekend"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    A short description of the image, read aloud by screen
                    readers and shown if the image fails to load.
                  </p>
                </div>

                {/* -------------------------------------------------- */}
                {/* REDIRECT TYPE */}
                {/* -------------------------------------------------- */}

                <div className="border-t pt-5">
                  <label className="mb-2 block text-sm font-semibold">
                    Step 5 · What happens when someone taps your banner? *
                  </label>

                  <p className="mb-3 text-xs text-muted-foreground">
                    Choose where employees are taken when they tap the banner.
                  </p>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {/* External Link */}

                    <label
                      className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
                        redirectType === "EXTERNAL"
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="redirectType"
                        value="EXTERNAL"
                        checked={redirectType === "EXTERNAL"}
                        onChange={() => {
                          setRedirectType("EXTERNAL");
                          setSelectedOffer(null);
                          setOfferSearch("");
                          setShowOfferResults(false);
                        }}
                        className="mt-0.5"
                      />

                      <div>
                        <p className="text-sm font-medium">Open a website</p>

                        <p className="mt-0.5 text-xs text-muted-foreground">
                          e.g. your online shop, menu or a landing page.
                        </p>
                      </div>
                    </label>

                    {/* Merchant Offer */}

                    <label
                      className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
                        redirectType === "OFFER"
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="redirectType"
                        value="OFFER"
                        checked={redirectType === "OFFER"}
                        onChange={() => {
                          setRedirectType("OFFER");
                          setForm((f) => ({
                            ...f,
                            redirectUrl: "",
                          }));
                          setSelectedOffer(null);
                          setOfferSearch("");
                          setShowOfferResults(false);
                        }}
                        className="mt-0.5"
                      />

                      <div>
                        <p className="text-sm font-medium">Open one of your offers</p>

                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Takes employees straight to an offer they can redeem.
                        </p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* -------------------------------------------------- */}
                {/* EXTERNAL URL */}
                {/* -------------------------------------------------- */}

                {redirectType === "EXTERNAL" && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      Website address *
                    </label>

                    <Input
                      type="url"
                      value={form.redirectUrl}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          redirectUrl: e.target.value,
                        }))
                      }
                      placeholder="https://example.com/landing"
                    />

                    <p className="mt-1 text-xs text-muted-foreground">
                      Must start with https://. Employees open this page when
                      they tap your banner.
                    </p>
                  </div>
                )}

                {/* -------------------------------------------------- */}
                {/* MERCHANT OFFER */}
                {/* -------------------------------------------------- */}

                {redirectType === "OFFER" && (
                  <div className="space-y-3">
                    <label className="block text-xs font-medium text-muted-foreground">
                      Which offer should the banner open? *
                    </label>

                    {/* Selected-offer card */}

                    {selectedOffer ? (
                      <div className="flex items-start justify-between gap-3 rounded-md border bg-muted/20 p-4">
                        <div className="min-w-0 space-y-1">
                          <p className="truncate text-sm font-semibold">
                            {selectedOffer.title}
                          </p>

                          <div className="flex items-center gap-2 text-xs">
                            <span
                              className={`rounded-full px-2 py-0.5 font-medium ${
                                selectedOffer.status === "LIVE"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : selectedOffer.status === "DRAFT"
                                    ? "bg-gray-100 text-gray-800"
                                    : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {selectedOffer.status}
                            </span>

                            {selectedOffer.startDate &&
                              selectedOffer.endDate && (
                                <span className="text-muted-foreground">
                                  {new Date(
                                    selectedOffer.startDate,
                                  ).toLocaleDateString("en-GB", {
                                    day: "numeric",
                                    month: "short",
                                  })}{" "}
                                  –{" "}
                                  {new Date(
                                    selectedOffer.endDate,
                                  ).toLocaleDateString("en-GB", {
                                    day: "numeric",
                                    month: "short",
                                  })}
                                </span>
                              )}
                          </div>
                        </div>

                        <div className="flex shrink-0 gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => {
                              setSelectedOffer(null);
                              setOfferSearch("");
                              setShowOfferResults(true);
                            }}
                          >
                            Change
                          </Button>

                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-muted-foreground"
                            onClick={() => {
                              setSelectedOffer(null);
                              setOfferSearch("");
                            }}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    ) : (
                      /* Searchable combobox */
                      <div
                        className="relative"
                        onBlur={(e) => {
                          if (
                            !e.currentTarget.contains(e.relatedTarget as Node)
                          ) {
                            setShowOfferResults(false);
                          }
                        }}
                      >
                        <div className="relative">
                          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

                          <Input
                            type="text"
                            value={offerSearch}
                            onChange={(e) => setOfferSearch(e.target.value)}
                            onFocus={() => setShowOfferResults(true)}
                            placeholder="Search your offers by title…"
                            className="pl-8"
                            autoComplete="off"
                          />
                        </div>

                        {searchActive &&
                          showOfferResults &&
                          offerResultsLoading && (
                            <Skeleton className="mt-1 h-24 w-full rounded-md border" />
                          )}

                        {searchActive &&
                          showOfferResults &&
                          !offerResultsLoading && (
                            <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border bg-background shadow-md">
                              {offerResultsError ? (
                                <p className="px-3 py-2 text-sm text-destructive">
                                  Failed to search offers.
                                </p>
                              ) : offerResults.length === 0 ? (
                                <p className="px-3 py-2 text-sm text-muted-foreground">
                                  No offers match your search. Check the
                                  spelling or create the offer first.
                                </p>
                              ) : (
                                offerResults.map((offer) => (
                                  <button
                                    key={offer.id}
                                    type="button"
                                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted/50 focus:bg-muted/50 focus:outline-none"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      setSelectedOffer(offer);
                                      setOfferSearch("");
                                      setShowOfferResults(false);
                                    }}
                                  >
                                    <div className="min-w-0">
                                      <p className="truncate font-medium">
                                        {offer.title}
                                      </p>

                                      <p className="truncate text-xs text-muted-foreground">
                                        {offer.status}
                                        {offer.offerType
                                          ? ` • ${String(offer.offerType)
                                              .replace("_", " ")
                                              .toUpperCase()}`
                                          : ""}
                                      </p>
                                    </div>

                                    {offer.startDate && offer.endDate && (
                                      <span className="shrink-0 text-xs text-muted-foreground">
                                        {new Date(
                                          offer.startDate,
                                        ).toLocaleDateString("en-GB", {
                                          day: "numeric",
                                          month: "short",
                                        })}{" "}
                                        –{" "}
                                        {new Date(
                                          offer.endDate,
                                        ).toLocaleDateString("en-GB", {
                                          day: "numeric",
                                          month: "short",
                                        })}
                                      </span>
                                    )}
                                  </button>
                                ))
                              )}
                            </div>
                          )}

                        {!searchActive &&
                          !selectedOffer &&
                          redirectType === "OFFER" && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Type at least 2 letters of the offer title to
                              search.
                            </p>
                          )}
                      </div>
                    )}
                  </div>
                )}

                {/* -------------------------------------------------- */}
                {/* SUBMIT */}
                {/* -------------------------------------------------- */}

                <div className="flex justify-end gap-2 border-t pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowBook(false)}
                  >
                    Cancel
                  </Button>

                  <LoadingButton
                    type="submit"
                    disabled={
                      (!pendingBannerFile && !form.imageUrl) ||
                      !selectedSlotNumber ||
                      !pickedStart ||
                      !pickedEnd ||
                      !isRedirectValid
                    }
                    loading={bookMutation.isPending}
                    loadingText="Sending request…"
                  >
                    Send for Review
                  </LoadingButton>
                </div>
              </form>
            }
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span>My Bookings</span>
            <span className="text-sm text-muted-foreground">
              {meta?.total ?? 0} total
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <select
              className="rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All bookings</option>
              <option value="PENDING">Awaiting review</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
            <select
              className="rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
              aria-label="Sort bookings"
            >
              <option value="createdAt:desc">Newest booked</option>
              <option value="createdAt:asc">Oldest booked</option>
              <option value="startDate:desc">Start date (latest)</option>
              <option value="startDate:asc">Start date (earliest)</option>
              <option value="endDate:desc">End date (latest)</option>
              <option value="endDate:asc">End date (earliest)</option>
              <option value="totalPrice:desc">Price (high → low)</option>
              <option value="totalPrice:asc">Price (low → high)</option>
              <option value="name:asc">Banner name (A → Z)</option>
              <option value="name:desc">Banner name (Z → A)</option>
              <option value="status:asc">Status</option>
            </select>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : bookings.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {status
                ? "No bookings with this status."
                : "You haven't booked any banners yet. Click \"Book a Banner\" to promote your business to employees."}
            </p>
          ) : (
            <>
              <ul className="space-y-2">
                {bookings.map((b) => (
                  <li key={b.id} className="rounded-md border p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{b.banner.name}</p>
                        <span className="text-xs text-muted-foreground">
                          (
                          {POSITION_LABELS[b.banner.position] ??
                            b.banner.position}
                          )
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {statusBadge(b.status)}
                        {derivedBadges(b)}
                        <span className="font-semibold">
                          €{Number(b.totalPrice).toFixed(2)}
                        </span>
                      </div>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {new Date(b.startDate).toLocaleDateString()} -{" "}
                      {new Date(b.endDate).toLocaleDateString()}
                      {b.content?.imageUrl && (
                        <img
                          src={b.content.imageUrl}
                          alt={b.content.altText ?? ""}
                          className="h-16 w-28 cursor-pointer rounded object-cover transition-opacity hover:opacity-80"
                          onClick={() => setPreviewUrl(b.content!.imageUrl)}
                        />
                      )}
                    </div>
                    {STATUS_LABELS[b.status] && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {b.status === "APPROVED" &&
                        !b.paid &&
                        new Date(b.endDate) >= new Date()
                          ? "Approved – your banner goes live once payment is received."
                          : STATUS_LABELS[b.status]?.hint}
                      </p>
                    )}
                    {b.status === "PENDING" && (
                      <div className="mt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEdit(b)}
                        >
                          Edit banner
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>

              {meta && (
                <div className="mt-3">
                  <TablePagination
                    page={page}
                    pageSize={pageSize}
                    total={meta.total}
                    totalPages={meta.totalPages}
                    onPageChange={setPage}
                    onPageSizeChange={(n) => {
                      setPageSize(n);
                      setPage(1);
                    }}
                  />
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {editBooking && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !editMutation.isPending) {
              setEditBooking(null);
              setEditPendingFile(null);
            }
          }}
        >
          <div
            className="w-full max-w-2xl overflow-hidden rounded-lg border bg-background shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-booking-title"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div className="min-w-0">
                <h2
                  id="edit-booking-title"
                  className="truncate text-base font-semibold"
                >
                  Edit Banner Booking
                </h2>

                <p className="mt-1 text-xs text-muted-foreground">
                  {editBooking.banner.name} ·{" "}
                  {POSITION_LABELS[editBooking.banner.position] ??
                    editBooking.banner.position}
                </p>
              </div>

              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="shrink-0"
                onClick={() => {
                  if (!editMutation.isPending) {
                    setEditBooking(null);
                    setEditPendingFile(null);
                  }
                }}
                disabled={editMutation.isPending}
                aria-label="Close edit booking"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Booking information */}
            <div className="border-b bg-muted/20 px-5 py-3">
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
                <span>
                  Dates:{" "}
                  <span className="font-medium text-foreground">
                    {new Date(editBooking.startDate).toLocaleDateString()} –{" "}
                    {new Date(editBooking.endDate).toLocaleDateString()}
                  </span>
                </span>

                <span>
                  Amount:{" "}
                  <span className="font-medium text-foreground">
                    €{Number(editBooking.totalPrice).toFixed(2)}
                  </span>
                </span>

                <span>
                  Status:{" "}
                  <span className="font-medium text-foreground">
                    {STATUS_LABELS[editBooking.status]?.label ??
                      editBooking.status}
                  </span>
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                You can change the image, description and link while the
                booking is awaiting review. Dates and position can&apos;t be
                changed here – submit a new booking if you need different dates.
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleEdit} className="space-y-5 px-5 py-5">
              {/* Banner image */}
              <div>
                <ImageUpload
                  value={editForm.imageUrl}
                  onChange={(url) =>
                    setEditForm((f) => ({
                      ...f,
                      imageUrl: url,
                    }))
                  }
                  onDeferredFile={(file) => setEditPendingFile(file)}
                  uploadMode="deferred"
                  label="Banner Image"
                  helperText="Recommended size: 1200×400 px, max 5 MB, PNG/JPG/WEBP"
                />
              </div>

              {/* Alt text */}
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Image description (optional)
                </label>

                <Input
                  value={editForm.altText}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      altText: e.target.value,
                    }))
                  }
                  placeholder="Describe the banner image"
                />
              </div>

              {/* Redirect URL */}
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Website address
                </label>

                <Input
                  type="url"
                  value={editForm.redirectUrl}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      redirectUrl: e.target.value,
                    }))
                  }
                  placeholder="https://example.com/landing"
                />

                <p className="mt-1 text-xs text-muted-foreground">
                  Users will be redirected to this URL when they click the
                  banner.
                </p>
              </div>

              {/* Footer */}
              <div className="flex justify-end gap-2 border-t pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (!editMutation.isPending) {
                      setEditBooking(null);
                      setEditPendingFile(null);
                    }
                  }}
                  disabled={editMutation.isPending}
                >
                  Cancel
                </Button>

                <LoadingButton
                  type="submit"
                  loading={editMutation.isPending}
                  loadingText="Saving…"
                >
                  Save Changes
                </LoadingButton>
              </div>
            </form>
          </div>
        </div>
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
    </div>
  );
}
