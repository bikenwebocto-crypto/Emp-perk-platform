"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EvidenceUpload } from "@/components/ui/evidence-upload";
import type { DeferredFile } from "@/components/shared/ImageUploader";
import { uploadDeferredImage } from "@/components/ui/image-upload";
import { TICKET_EVIDENCE_OPTIONS } from "@/lib/upload/image";
import { showToast } from "@/hooks/use-toast";
import { Loader2, Sparkles, Search, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  getPriorityForType,
  getPriorityForCategory,
  APPLICATION_SUPPORT_CATEGORIES,
  PRIORITY_STYLES,
} from "@/features/complaints/constants";

interface Offer {
  id: string;
  title: string;
  merchant: { businessName: string };
}

const COMPLAINT_KINDS = [
  { value: "OFFER", label: "Offer Complaint" },
  { value: "APPLICATION_SUPPORT", label: "Application Support" },
] as const;

type ComplaintKind = (typeof COMPLAINT_KINDS)[number]["value"];

const COMPLAINT_TYPES = [
  { value: "MISLEADING", label: "Misleading" },
  { value: "INVALID_TERMS", label: "Invalid Terms" },
  { value: "NON_FUNCTIONAL", label: "Non Functional" },
  { value: "POLICY_VIOLATION", label: "Policy Violation" },
];

export default function NewComplaintPage() {
  const router = useRouter();
  const [complaintKind, setComplaintKind] = useState<ComplaintKind>("OFFER");

  const [offerId, setOfferId] = useState("");
  const [offerQuery, setOfferQuery] = useState("");
  const [offerDebounced, setOfferDebounced] = useState("");
  const [selectedOfferLabel, setSelectedOfferLabel] = useState("");
  const [offerDropdownOpen, setOfferDropdownOpen] = useState(false);

  const [complaintType, setComplaintType] = useState("MISLEADING");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [evidenceFiles, setEvidenceFiles] = useState<DeferredFile[]>([]);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);

  const [offerError, setOfferError] = useState(false);
  const [categoryError, setCategoryError] = useState(false);
  const [descriptionError, setDescriptionError] = useState(false);

  const offerInputRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  const isOfferMode = complaintKind === "OFFER";
  const priority = isOfferMode
    ? getPriorityForType(complaintType)
    : getPriorityForCategory(category);

  // Debounce the free-text offer search, 300ms.
  useEffect(() => {
    const t = setTimeout(() => setOfferDebounced(offerQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [offerQuery]);

  const { data: offersData, isLoading: offersLoading } = useQuery({
    queryKey: ["employee-offers-search", offerDebounced],
    enabled: isOfferMode && offerDebounced.length > 0,
    queryFn: async () => {
      // ASSUMPTION: this route accepts a `search` param — verify against
      // the real /api/employee/offers implementation before relying on it.
      const res = await fetch(
        `/api/employee/offers?q=${encodeURIComponent(offerDebounced)}&pageSize=10`,
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Failed to load");
      return json as { data: Offer[] };
    },
  });

  const createOfferComplaint = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch("/api/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Failed to submit");
      return json;
    },
    onSuccess: () => {
      showToast({
        type: "success",
        title: "Complaint submitted",
        description: "Your complaint has been filed successfully.",
      });
      router.push("/employee/complaints");
    },
    onError: (e: Error) =>
      showToast({ type: "error", title: "Failed", description: e.message }),
  });

  const createAppSupport = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch("/api/complaints/application-support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Failed to submit");
      return json;
    },
    onSuccess: () => {
      showToast({
        type: "success",
        title: "Request submitted",
        description: "Your application support request has been filed.",
      });
      router.push("/employee/complaints");
    },
    onError: (e: Error) =>
      showToast({ type: "error", title: "Failed", description: e.message }),
  });

  const isSubmitting =
    createOfferComplaint.isPending ||
    createAppSupport.isPending ||
    uploadingEvidence;

  function selectOffer(o: Offer) {
    setOfferId(o.id);
    setSelectedOfferLabel(`${o.title} — ${o.merchant?.businessName ?? ""}`);
    setOfferQuery("");
    setOfferDropdownOpen(false);
    if (offerError) setOfferError(false);
  }

  function clearOffer() {
    setOfferId("");
    setSelectedOfferLabel("");
    setOfferQuery("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const missingOffer = isOfferMode && !offerId;
    const missingCategory = !isOfferMode && !category;
    const missingDescription = !description.trim();

    setOfferError(missingOffer);
    setCategoryError(missingCategory);
    setDescriptionError(missingDescription);

    if (missingOffer || missingCategory || missingDescription) {
      const firstInvalidRef = missingOffer
        ? offerInputRef
        : missingCategory
          ? categoryRef
          : descriptionRef;

      firstInvalidRef.current?.focus();
      firstInvalidRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });

      showToast({
        type: "error",
        title: "Required",
        description: missingOffer
          ? "Please select an offer."
          : missingCategory
            ? "Please select a category."
            : "Please provide a description.",
      });

      return;
    }

    const urls: string[] = [];

    if (evidenceFiles.length > 0) {
      setUploadingEvidence(true);
      try {
        for (const deferred of evidenceFiles) {
          const url = await uploadDeferredImage(
            deferred,
            TICKET_EVIDENCE_OPTIONS,
          );
          if (url) urls.push(url);
        }
      } catch (uploadErr) {
        showToast({
          type: "error",
          title: "Upload failed",
          description:
            uploadErr instanceof Error
              ? uploadErr.message
              : "Could not upload evidence images.",
        });
        return;
      } finally {
        setUploadingEvidence(false);
      }
    }

    const evidencePayload = urls.length > 0 ? { evidenceUrls: urls } : {};

    if (isOfferMode) {
      createOfferComplaint.mutate({
        offerId,
        complaintType,
        description: description.trim(),
        ...evidencePayload,
      });
    } else {
      createAppSupport.mutate({
        description: description.trim(),
        category,
        ...evidencePayload,
      });
    }
  }

  function handleOpenChange(open: boolean) {
    if (!open) router.push("/employee/complaints");
  }

  return (
    <div className="space-y-6">
      <Dialog open onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>File a Complaint</DialogTitle>
            <DialogDescription>
              Report an issue with an offer, or reach application support.
            </DialogDescription>
          </DialogHeader>

          <div className="mb-2">
            <label className="mb-2 block text-xs font-medium text-muted-foreground">
              Complaint Kind
            </label>
            <div className="flex gap-1 rounded-lg border bg-muted p-1">
              {COMPLAINT_KINDS.map((k) => (
                <button
                  key={k.value}
                  type="button"
                  onClick={() => {
                    setComplaintKind(k.value);
                    clearOffer();
                    setComplaintType("MISLEADING");
                    setCategory("");
                    setEvidenceFiles([]);
                    setOfferError(false);
                    setCategoryError(false);
                  }}
                  disabled={isSubmitting}
                  className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    complaintKind === k.value
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {k.label}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            {isOfferMode && (
              <div className="relative">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Offer *
                </label>

                {offerId ? (
                  <div
                    className={`flex h-10 w-full items-center justify-between rounded-md border bg-muted/30 px-3 text-sm ${
                      offerError ? "border-red-500 ring-2 ring-red-500" : ""
                    }`}
                  >
                    <span className="truncate">{selectedOfferLabel}</span>
                    <button
                      type="button"
                      onClick={clearOffer}
                      disabled={isSubmitting}
                      className="ml-2 shrink-0 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      ref={offerInputRef}
                      type="text"
                      className={`h-10 w-full rounded-md border bg-background pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        offerError
                          ? "border-red-500 ring-2 ring-red-500 animate-pulse"
                          : ""
                      }`}
                      placeholder="Search active offers…"
                      value={offerQuery}
                      onChange={(e) => {
                        setOfferQuery(e.target.value);
                        setOfferDropdownOpen(true);
                      }}
                      onFocus={() => setOfferDropdownOpen(true)}
                      onBlur={() =>
                        setTimeout(() => setOfferDropdownOpen(false), 150)
                      }
                      disabled={isSubmitting}
                    />

                    {offerDropdownOpen && offerDebounced.length > 0 && (
                      <div className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-background shadow-md">
                        {offersLoading ? (
                          <div className="space-y-1 p-2">
                            <Skeleton className="h-8 w-full" />
                            <Skeleton className="h-8 w-full" />
                          </div>
                        ) : (offersData?.data ?? []).length > 0 ? (
                          (offersData?.data ?? []).map((o) => (
                            <button
                              key={o.id}
                              type="button"
                              onClick={() => selectOffer(o)}
                              className="block w-full truncate px-3 py-2 text-left text-sm hover:bg-muted"
                            >
                              {o.title} — {o.merchant?.businessName ?? ""}
                            </button>
                          ))
                        ) : (
                          <p className="px-3 py-2 text-sm text-muted-foreground">
                            No matching offers.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {offerError && (
                  <p className="mt-1 text-xs font-medium text-red-600">
                    An offer is required.
                  </p>
                )}
              </div>
            )}

            {isOfferMode && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Complaint Type *
                  </label>
                  <select
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={complaintType}
                    onChange={(e) => setComplaintType(e.target.value)}
                  >
                    {COMPLAINT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Priority
                  </label>
                  <div className="flex h-9 items-center gap-2 rounded-md border bg-muted/30 px-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_STYLES[priority]}`}
                    >
                      {priority}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Sparkles className="h-3 w-3" /> Auto-set
                    </span>
                  </div>
                </div>
              </div>
            )}

            {!isOfferMode && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Category *
                  </label>
                  <select
                    ref={categoryRef}
                    className={`w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      categoryError
                        ? "border-red-500 ring-2 ring-red-500 animate-pulse"
                        : ""
                    }`}
                    value={category}
                    onChange={(e) => {
                      setCategory(e.target.value);
                      if (categoryError) setCategoryError(false);
                    }}
                  >
                    <option value="">Select a category…</option>
                    {APPLICATION_SUPPORT_CATEGORIES.map((cat) => (
                      <option key={cat.value} value={cat.value}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                  {categoryError && (
                    <p className="mt-1 text-xs font-medium text-red-600">
                      A category is required.
                    </p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Priority
                  </label>
                  <div className="flex h-9 items-center gap-2 rounded-md border bg-muted/30 px-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_STYLES[priority]}`}
                    >
                      {priority}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Sparkles className="h-3 w-3" /> Auto-set
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Description *
              </label>
              <textarea
                ref={descriptionRef}
                rows={4}
                className={`w-full resize-none rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  descriptionError
                    ? "border-red-500 ring-2 ring-red-500 animate-pulse"
                    : ""
                }`}
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  if (descriptionError) setDescriptionError(false);
                }}
                placeholder={
                  isOfferMode
                    ? "Describe the issue in detail..."
                    : "Describe your application support request..."
                }
                disabled={isSubmitting}
                required
              />
              {descriptionError && (
                <p className="mt-1 text-xs font-medium text-red-600">
                  A description is required.
                </p>
              )}
            </div>

            <EvidenceUpload
              files={evidenceFiles}
              onChange={setEvidenceFiles}
              disabled={isSubmitting}
              label="Evidence Screenshots (optional)"
              helperText="Screenshots are uploaded to S3 when you submit. Max 5."
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/employee/complaints")}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />{" "}
                    Submitting…
                  </>
                ) : isOfferMode ? (
                  "Submit Complaint"
                ) : (
                  "Submit Request"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
