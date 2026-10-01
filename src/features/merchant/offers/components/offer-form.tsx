"use client";
import { useState, useMemo, useRef  } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Save, Send, Loader2, Sparkles, Store } from "lucide-react";
import {
  useCreateMerchantOffer,
  useUpdateMerchantOffer,
  useSubmitMerchantOffer,
} from "@/hooks/queries/use-merchant-offers";
import { OfferStrengthIndicator } from "./offer-strength-indicator";
import {
  OfferImageUploader,
  type PendingImage,
} from "@/components/merchant/offers/OfferImageUploader";
import type { DeferredFile } from "@/components/shared/ImageUploader";
import { OfferImageGallery } from "@/components/merchant/offers/OfferImageGallery";
import { OfferMobilePreview } from "@/components/merchant/offers/OfferMobilePreview";
import { OfferBannerInfo } from "@/components/merchant/offers/OfferBannerInfo";
import { showToast } from "@/hooks/use-toast";
import { uploadImage, OFFER_IMAGE_OPTIONS } from "@/lib/upload/image";
import { deleteOfferImage } from "@/lib/upload-offer-image";

interface FormData {
  title: string;
  description: string;
  shortDescription: string;
  termsAndConditions: string;
  imageUrls: string[];
  offerType: string;
  discountValue: string;
  discountMax: string;
  discountPercent: string;
  minimumSpend: string;
  maxRedemptions: string;
  buyQuantity: string;
  buyItem: string;
  getQuantity: string;
  freeItem: string;
  maxFreeItems: string;
  startDate: string;
  endDate: string;
  daysOfWeek: string;
  redemptionCode: string;
  redemptionInstructions: string;
  submissionNotes: string;
  replacementReason: string;
  redemptionType: string;
  bookingUrl: string;
  qrCodeUrl: string;
  isFeatured: boolean;
  isExclusive: boolean;
}

interface FormErrors {
  [key: string]: string;
}

export interface MerchantCategory {
  id: string;
  name: string;
  slug: string;
}

interface OfferFormProps {
  offerId?: string;
  initialData?: Partial<FormData>;
  isReplacement?: boolean;
  currentLiveOffer?: { id: string; title: string } | null;
  onSuccess?: () => void;
  onCancel?: () => void;
  merchantId?: string;
  /** True when a superadmin is acting on behalf of `merchantId`. */
  isAdmin?: boolean;
  /**
   * The owning merchant's category. When omitted (merchant portal), it is
   * read from the merchant's own profile. The offer's category is always set
   * server-side from the merchant; this is for display only.
   */
  merchantCategory?: MerchantCategory | null;
}

async function fetchMerchantProfileCategory(): Promise<MerchantCategory | null> {
  const res = await fetch("/api/merchant/profile");
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? "Failed to load profile");
  return json.data?.category ?? null;
}

const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/svg+xml",
  "image/webp",
  "image/gif",
];
const MAX_SIZE = 5 * 1024 * 1024;

const OFFER_TYPE_MAP: Record<string, string> = {
  FLAT: "flat_rate",
  PERCENTAGE: "percentage",
  BUY_X_GET_Y: "buy_x_get_y",
};

const DAYS_OF_WEEK = [
  { value: 0, short: "Sun", full: "Sunday" },
  { value: 1, short: "Mon", full: "Monday" },
  { value: 2, short: "Tue", full: "Tuesday" },
  { value: 3, short: "Wed", full: "Wednesday" },
  { value: 4, short: "Thu", full: "Thursday" },
  { value: 5, short: "Fri", full: "Friday" },
  { value: 6, short: "Sat", full: "Saturday" },
] as const;

function parseInitialImageUrls(input: string | string[] | undefined): string[] {
  if (!input) return [];
  if (Array.isArray(input)) return input.filter(Boolean);
  return input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function urlToPendingImage(url: string, index: number): PendingImage {
  const name = url.split("/").pop() || `image-${index + 1}`;
  return {
    id: `existing-${index}`,
    file: new File([], name),
    previewUrl: url,
    status: "done",
    url,
  };
}

export function OfferForm({
  offerId,
  initialData,
  isReplacement,
  currentLiveOffer,
  onSuccess,
  onCancel,
  merchantId,
  isAdmin = false,
  merchantCategory: merchantCategoryProp,
}: OfferFormProps) {
  const router = useRouter();
  const isEdit = !!offerId;
  const createOffer = useCreateMerchantOffer();
  const updateOffer = useUpdateMerchantOffer();
  const submitOffer = useSubmitMerchantOffer();
  const [errors, setErrors] = useState<FormErrors>({});
  const [showStrength, setShowStrength] = useState(false);
  const hasCategoryProp = merchantCategoryProp !== undefined;
  const { data: profileCategory, isLoading: profileCategoryLoading } = useQuery({
    queryKey: ["merchant-profile", "category"],
    queryFn: fetchMerchantProfileCategory,
    enabled: !hasCategoryProp,
    staleTime: 5 * 60 * 1000,
  });
  const merchantCategory = hasCategoryProp
    ? merchantCategoryProp
    : (profileCategory ?? null);
  const categoryLoading = !hasCategoryProp && profileCategoryLoading;
  const missingCategory = !categoryLoading && !merchantCategory;
    // true once the merchant types their own Maximum Discount
  const maxManuallySet = useRef(!!initialData?.discountMax);
  const [lastEditedField, setLastEditedField] = useState<
    "discountValue" | "minimumSpend" | "discountMax" | "discountPercent" | null
  >(null);
  const fallbackRoute = isAdmin ? "/admin/offers" : "/merchant/offers";

const withMerchant = <T extends Record<string, unknown>>(payload: T) =>
  isAdmin && merchantId ? { ...payload, merchantId } : payload;
  const initialImageUrls = useMemo(
    () => parseInitialImageUrls(initialData?.imageUrls),
    [initialData?.imageUrls],
  );

  const [pendingImages, setPendingImages] = useState<PendingImage[]>(() =>
    initialImageUrls.map(urlToPendingImage),
  );

  const initialFormImageUrls = useMemo(() => initialImageUrls, []);
  const [form, setForm] = useState<FormData>({
    title: initialData?.title ?? "",
    description: initialData?.description ?? "",
    shortDescription: initialData?.shortDescription ?? "",
    termsAndConditions: initialData?.termsAndConditions ?? "",
    imageUrls: initialFormImageUrls,
    offerType: initialData?.offerType ?? "FLAT",
    discountValue: initialData?.discountValue ?? "",
    discountMax: initialData?.discountMax ?? "",
    discountPercent: initialData?.discountPercent ?? "",
    minimumSpend: initialData?.minimumSpend ?? "",
    maxRedemptions: initialData?.maxRedemptions ?? "",
    buyQuantity: initialData?.buyQuantity ?? "",
    buyItem: initialData?.buyItem ?? "",
    getQuantity: initialData?.getQuantity ?? "",
    freeItem: initialData?.freeItem ?? "",
    maxFreeItems: initialData?.maxFreeItems ?? "",
    startDate: initialData?.startDate ?? "",
    endDate: initialData?.endDate ?? "",
    daysOfWeek: initialData?.daysOfWeek ?? "0,1,2,3,4,5,6",
    redemptionCode: initialData?.redemptionCode ?? "",
    redemptionInstructions: initialData?.redemptionInstructions ?? "",
    submissionNotes: initialData?.submissionNotes ?? "",
    replacementReason: initialData?.replacementReason ?? "",
    redemptionType: initialData?.redemptionType ?? "IN_STORE_QR",
    bookingUrl: initialData?.bookingUrl ?? "",
    qrCodeUrl: initialData?.qrCodeUrl ?? "",
    isFeatured: initialData?.isFeatured ?? false,
    isExclusive: initialData?.isExclusive ?? false,
  });

  const set =
    (field: keyof FormData) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) => {
            setForm((prev) => {
        const next = { ...prev, [field]: e.target.value };
        if (field === "offerType" && prev.offerType !== e.target.value) {
          next.discountValue = "";
          next.discountPercent = "";
          next.discountMax = "";
          next.minimumSpend = "";
          maxManuallySet.current = false;
        }
        return next;
      });
      if (errors[field])
        setErrors((prev) => {
          const n = { ...prev };
          delete n[field];
          return n;
        });
      if (field === "discountValue" || field === "offerType")
        setShowStrength(true);
    };
    
    const toggleBoolean = (field: "isFeatured" | "isExclusive") => () => {
      setForm((prev) => {
        const turningOn = !prev[field];
        if (turningOn) {
          // Mutually exclusive: turning one on turns the other off
          const other = field === "isFeatured" ? "isExclusive" : "isFeatured";
          return { ...prev, [field]: true, [other]: false };
        }
        return { ...prev, [field]: false };
      });
    };

   const handleLinkedFieldChange = (
    field: "discountValue" | "minimumSpend" | "discountMax" | "discountPercent",
    value: string,
  ) => {
    setLastEditedField(field);

    // Merchant typing in Maximum Discount takes over; clearing it hands back to auto
    if (field === "discountMax") {
      maxManuallySet.current = value.trim() !== "";
    }

    setForm((prev) => {
      const next = { ...prev, [field]: value };

      if (next.offerType === "PERCENTAGE") {
        const ms = Number(next.minimumSpend);
        const dp = Number(next.discountPercent);
        const hasMs = !isNaN(ms) && ms > 0;
        const hasDp = !isNaN(dp) && dp > 0;

        // Keep the suggestion in sync on every keystroke until the merchant sets their own max
        if (
          (field === "minimumSpend" || field === "discountPercent") &&
          !maxManuallySet.current
        ) {
          next.discountMax =
            hasMs && hasDp ? String(Math.round(ms * dp) / 100) : "";
        }
      } else if (next.offerType === "FLAT") {
        const dv = Number(next.discountValue);
        if (field === "discountValue" && !isNaN(dv) && dv > 0) {
          next.discountMax = String(dv);
        }
      }

      return next;
    });

    setErrors((prev) => {
      const n = { ...prev };
      delete n[field];
      delete n.discountMax;
      delete n.discountPercent;
      delete n.minimumSpend;
      delete n.discountValue;
      return n;
    });

    setShowStrength(true);
  };

  const toggleDay = (day: number) => {
    setForm((prev) => {
      const current = prev.daysOfWeek.split(",").filter(Boolean);
      const str = String(day);
      const next = current.includes(str)
        ? current.filter((d) => d !== str)
        : [...current, str].sort();
      return { ...prev, daysOfWeek: next.join(",") };
    });
    if (errors.daysOfWeek) {
      setErrors((prev) => {
        const n = { ...prev };
        delete n.daysOfWeek;
        return n;
      });
    }
  };

  const validate = (): boolean => {
    const errs: FormErrors = {};
    if (!form.title.trim()) errs.title = "Title is required";
    if (form.title.length < 5)
      errs.title = "Title must be at least 5 characters";
    if (!form.offerType) errs.offerType = "Offer type is required";

    if (form.offerType === "FLAT") {
      if (!form.discountValue.trim())
        errs.discountValue = "Discount value is required";
      else if (
        isNaN(Number(form.discountValue)) ||
        Number(form.discountValue) <= 0
      )
        errs.discountValue = "Must be a positive number";
      if (form.discountPercent.trim()) {
        const dp = Number(form.discountPercent);
        if (isNaN(dp) || dp < 0 || dp > 90)
          errs.discountPercent = "Must be between 0% and 90%";
      }
      if (form.discountMax.trim() && form.discountValue.trim()) {
        const dm = Number(form.discountMax);
        if (isNaN(dm) || dm <= 0) errs.discountMax = "Must be greater than 0";
        if (dm > Number(form.discountValue))
          errs.discountMax = "Maximum discount cannot exceed discount value";
      }
    } else if (form.offerType === "PERCENTAGE") {
      if (!form.discountPercent.trim())
        errs.discountPercent = "Discount percentage is required";
      else {
        const dp = Number(form.discountPercent);
        if (isNaN(dp) || dp < 0 || dp > 90)
          errs.discountPercent = "Must be between 0% and 90%";
      }
      if (form.discountMax.trim()) {
        const dm = Number(form.discountMax);
        if (isNaN(dm) || dm <= 0) errs.discountMax = "Must be greater than 0";
        if (form.discountValue.trim() && dm > Number(form.discountValue))
          errs.discountMax = "Maximum discount cannot exceed discount value";
      }
      if (form.minimumSpend.trim()) {
        const ms = Number(form.minimumSpend);
        if (isNaN(ms) || ms <= 0) errs.minimumSpend = "Must be greater than 0";
        if (form.discountValue.trim() && ms < Number(form.discountValue))
          errs.minimumSpend =
            "Minimum spend cannot be lower than discount value";
      }
    } else if (form.offerType === "BUY_X_GET_Y") {
      if (!form.buyQuantity.trim())
        errs.buyQuantity = "Buy quantity is required";
      else if (isNaN(Number(form.buyQuantity)) || Number(form.buyQuantity) <= 0)
        errs.buyQuantity = "Must be a positive number";
      if (!form.buyItem.trim()) errs.buyItem = "Buy item is required";
      if (!form.getQuantity.trim())
        errs.getQuantity = "Get quantity is required";
      else if (isNaN(Number(form.getQuantity)) || Number(form.getQuantity) <= 0)
        errs.getQuantity = "Must be a positive number";
      if (!form.freeItem.trim()) errs.freeItem = "Free item is required";
      if (form.maxFreeItems.trim()) {
        const mfi = Number(form.maxFreeItems);
        if (isNaN(mfi) || mfi <= 0)
          errs.maxFreeItems = "Must be a positive number";
      }
    }

    if (!form.startDate.trim()) errs.startDate = "Start date is required";
    if (!form.endDate.trim()) errs.endDate = "End date is required";
    else if (
      form.startDate &&
      new Date(form.endDate) <= new Date(form.startDate)
    )
      errs.endDate = "End date must be after start date";
    if (isReplacement && !form.termsAndConditions.trim())
      errs.termsAndConditions =
        "Terms and conditions are required for replacement offers"; // Days of week validation

    const selectedDays = form.daysOfWeek.split(",").filter(Boolean);
    if (selectedDays.length === 0) {
      errs.daysOfWeek = "Select at least one valid day";
    } else {
      const invalid = selectedDays.filter(
        (d) => !DAYS_OF_WEEK.map((day) => String(day.value)).includes(d),
      );
      if (invalid.length > 0) {
        errs.daysOfWeek = "Select at least one valid day";
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const buildBody = (saveAsDraft = false): Record<string, unknown> => ({
    title: form.title,
    categoryId: merchantCategory?.id ?? null, 
    description: form.description || null,
    shortDescription: form.shortDescription || null,
    termsAndConditions: form.termsAndConditions || null,
    isFeatured: form.isFeatured,
    isExclusive: form.isExclusive,
    imageUrls: form.imageUrls,
    offerType: OFFER_TYPE_MAP[form.offerType] ?? form.offerType,
    discountValue: form.discountValue ? Number(form.discountValue) : null,
    discountMax: form.discountMax ? Number(form.discountMax) : null,
    discountPercent: form.discountPercent ? Number(form.discountPercent) : null,
    minimumSpend: form.minimumSpend ? Number(form.minimumSpend) : null,
    maxRedemptions: form.maxRedemptions ? Number(form.maxRedemptions) : null,
    buyQuantity: form.buyQuantity ? Number(form.buyQuantity) : null,
    buyItem: form.buyItem || null,
    getQuantity: form.getQuantity ? Number(form.getQuantity) : null,
    freeItem: form.freeItem || null,
    maxFreeItems: form.maxFreeItems ? Number(form.maxFreeItems) : null,
    startDate: form.startDate,
    endDate: form.endDate,
    daysOfWeek: form.daysOfWeek
      .split(",")
      .map((s) => parseInt(s.trim()))
      .filter((n) => !isNaN(n)),
    redemptionCode: form.redemptionCode || null,
    redemptionInstructions: form.redemptionInstructions || null,
    submissionNotes: form.submissionNotes || null,
    replacementReason: isReplacement ? form.replacementReason || null : null,
    saveAsDraft,
    redemptionType: form.redemptionType || null,
    bookingUrl: form.bookingUrl || null,
    qrCodeUrl: form.qrCodeUrl || null,
    ...(isReplacement && currentLiveOffer
      ? { replacesOfferId: currentLiveOffer.id }
      : {}),
  });

  /** Upload any pending (not yet uploaded) images and return the complete image URL list. */

  const resolveAllImageUrls = async (): Promise<string[] | null> => {
    const existingUrls = [...form.imageUrls];
    const pendingItems = pendingImages.filter(
      (p) => p.status === "pending" && p.file?.size > 0,
    );

    if (pendingItems.length === 0) return existingUrls;

    try {
      const newUrls = await Promise.all(
        pendingItems.map((item) => uploadImage(item.file, OFFER_IMAGE_OPTIONS)),
      ); // Mark pending images as done
      setPendingImages((prev) =>
        prev.map((p) =>
          p.status === "pending" ? { ...p, status: "done" as const } : p,
        ),
      );
      return [...existingUrls, ...newUrls];
    } catch (err: any) {
      showToast({
        type: "error",
        title: "Image upload failed",
        description:
          err.message || "Failed to upload images. Changes not saved.",
      });
      return null;
    }
  };

  const handleSaveDraft = async () => {
    if (!form.title.trim()) {
      showToast({ type: "error", title: "Title is required to save a draft" });
      return;
    }
    const allUrls = await resolveAllImageUrls();
    if (allUrls === null) return;

    try {
      const body = withMerchant({ ...buildBody(true), imageUrls: allUrls });
      if (isEdit) {
        await updateOffer.mutateAsync({ id: offerId, ...body });
        showToast({ type: "success", title: "Draft saved" });
      } else {
        await createOffer.mutateAsync(body);
        showToast({ type: "success", title: "Draft saved" });
      }
      if (onSuccess) {
        onSuccess();
      } else {
        router.push(fallbackRoute);
      }
    } catch (err: any) {
      showToast({
        type: "error",
        title: "Failed to save draft",
        description: err.message,
      });
    }
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const allUrls = await resolveAllImageUrls();
    if (allUrls === null) return;

    const body = withMerchant({ ...buildBody(false), imageUrls: allUrls });

    if (isEdit) {
      try {
        const result = await submitOffer.mutateAsync({
          id: offerId,
          ...body,
        });
        if (result.qualityCheck === "PASSED") {
          showToast({ type: "success", title: "Offer submitted for review" });
        } else {
          showToast({
            type: "error",
            title: "Validation failed",
            description: "Fix the errors and resubmit",
          });
        }
        if (onSuccess) {
          onSuccess();
        } else {
          router.push(fallbackRoute);
        }
      } catch (err: any) {
        showToast({
          type: "error",
          title: "Submission failed",
          description: err.message,
        });
      }
    } else {
      try {
        const result = await createOffer.mutateAsync(body);
        if (result.qualityCheck === "PASSED") {
          showToast({
            type: "success",
            title: isReplacement
              ? "Replacement offer submitted for review"
              : "Offer submitted for review",
          });
        } else {
          showToast({
            type: "error",
            title: "Validation failed",
            description: "Fix the errors and resubmit",
          });
          if (result.validationErrors) {
            setErrors(result.validationErrors);
          }
        }
        if (onSuccess) {
          onSuccess();
        } else {
          router.push(fallbackRoute);
        }
      } catch (err: any) {
        showToast({
          type: "error",
          title: "Failed to submit",
          description: err.message,
        });
      }
    }
  };

  const handleFilesSelected = (files: DeferredFile[]) => {
    const newImages: PendingImage[] = files.map((f) => ({
      id: `pending-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      file: f.file,
      previewUrl: f.previewUrl,
      status: "pending" as const,
    }));
    setPendingImages((prev) => [...prev, ...newImages]);
  };

  const handleRemoveImage = (id: string) => {
    setPendingImages((prev) => {
      const img = prev.find((p) => p.id === id);
      if (img?.url) {
        // Existing uploaded image — clean up from storage
        deleteOfferImage(img.url);
      }
      return prev.filter((p) => p.id !== id);
    });
    setForm((prev) => {
      const img = pendingImages.find((p) => p.id === id);
      if (img?.url) {
        return {
          ...prev,
          imageUrls: prev.imageUrls.filter((u) => u !== img.url),
        };
      }
      return prev;
    });
  };

  const handleMoveUp = (id: string) => {
    setPendingImages((prev) => {
      const idx = prev.findIndex((p) => p.id === id);
      if (idx <= 0) return prev;
      const next = [...prev];
      const temp = next[idx]!;
      next[idx] = next[idx - 1]!;
      next[idx - 1] = temp;
      return next;
    });
    setForm((prev) => {
      const idx = prev.imageUrls.findIndex((u) => {
        const img = pendingImages.find((p) => p.id === id);
        return img?.url === u;
      });
      if (idx <= 0) return prev;
      const next = [...prev.imageUrls];
      const temp = next[idx]!;
      next[idx] = next[idx - 1]!;
      next[idx - 1] = temp;
      return { ...prev, imageUrls: next };
    });
  };

  const handleMoveDown = (id: string) => {
    setPendingImages((prev) => {
      const idx = prev.findIndex((p) => p.id === id);
      if (idx < 0 || idx >= prev.length - 1) return prev;
      const next = [...prev];
      const temp = next[idx]!;
      next[idx] = next[idx + 1]!;
      next[idx + 1] = temp;
      return next;
    });
    setForm((prev) => {
      const idx = prev.imageUrls.findIndex((u) => {
        const img = pendingImages.find((p) => p.id === id);
        return img?.url === u;
      });
      if (idx < 0 || idx >= prev.imageUrls.length - 1) return prev;
      const next = [...prev.imageUrls];
      const temp = next[idx]!;
      next[idx] = next[idx + 1]!;
      next[idx + 1] = temp;
      return { ...prev, imageUrls: next };
    });
  };

  const categoryName = merchantCategory?.name;
  const previewImageUrls = useMemo(
      () =>
        pendingImages
          .map((p) => p.url ?? p.previewUrl)
          .filter((u): u is string => !!u),
      [pendingImages],
    );
  const labelClass = "text-sm font-medium";
  const inputClass = "w-full";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => router.push(fallbackRoute)}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>

        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {isReplacement
              ? "Replace My Offer"
              : isEdit
                ? "Edit Offer"
                : "Create Offer"}
          </h1>

          <p className="mt-1 text-sm text-muted-foreground">
            {isReplacement
              ? "Submit a replacement offer for review. Your current offer stays live until approved."
              : isEdit
                ? "Update your offer details"
                : "Create a new discount offer"}
          </p>
        </div>
      </div>

      {isReplacement && currentLiveOffer && (
        <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
          <CardContent className="p-4 text-sm">
            <p className="font-medium">
              Replacing:
              <span className="text-blue-600">{currentLiveOffer.title}</span>
            </p>

            <p className="text-muted-foreground mt-1">
              Your current live offer will remain visible to employees until the
              replacement is approved.
            </p>
          </CardContent>
        </Card>
      )}

      {isReplacement && (
        <Card>
          <CardHeader>
            <CardTitle>Replacement Details</CardTitle>
          </CardHeader>

          <CardContent>
            <label className={labelClass}>Reason for replacement</label>

            <textarea
              className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              value={form.replacementReason}
              onChange={set("replacementReason")}
              placeholder="Why are you replacing your current offer? (shown to admins during review)"
              maxLength={1000}
            />

            <p className="mt-1 text-xs text-muted-foreground">
              {form.replacementReason.length}/1000
            </p>
          </CardContent>
        </Card>
      )}

      {missingCategory && (
        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="p-4 text-sm">
            <p className="font-medium">Business category not set</p>
            <p className="text-muted-foreground mt-1">
              Your business category is not set. Please contact support. You
              can still save a draft, but the offer cannot be submitted until a
              category is assigned.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left column — form fields */}
        <div className="space-y-6 lg:col-span-1">
          <form onSubmit={handleSubmit}>
            <Card>
              <CardHeader>
                <CardTitle>Offer Details</CardTitle>
              </CardHeader>

              <CardContent className="space-y-4">
                <div>
                  <label className={labelClass}>Title <span className="text-destructive">*</span></label>

                  <Input
                    className={inputClass}
                    value={form.title}
                    onChange={set("title")}
                    placeholder="e.g. 20% Off All Menu Items"
                    maxLength={255}
                  />

                  {errors.title && (
                    <p className="mt-1 text-xs text-destructive">
                      {errors.title}
                    </p>
                  )}
                </div>

                <div>
                  <label className={labelClass}>Short Description</label>

                  <Input
                    className={inputClass}
                    value={form.shortDescription}
                    onChange={set("shortDescription")}
                    placeholder="Brief description (max 500 chars)"
                    maxLength={500}
                  />
                </div>

                <div>
                  <label className={labelClass}>Description</label>

                  <textarea
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    value={form.description}
                    onChange={set("description")}
                    placeholder="Full offer description"
                    maxLength={2000}
                  />
                </div>
                
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>Featured Offer</label>
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={toggleBoolean("isFeatured")}
                        className={`
                          rounded-full px-3 py-1.5 text-xs font-medium transition-colors
                          ${
                            form.isFeatured
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground hover:bg-muted/80"
                          }
                        `}
                      >
                        {form.isFeatured ? "Featured" : "Not Featured"}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>Exclusive Offer</label>
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={toggleBoolean("isExclusive")}
                        className={`
                          rounded-full px-3 py-1.5 text-xs font-medium transition-colors
                          ${
                            form.isExclusive
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground hover:bg-muted/80"
                          }
                        `}
                      >
                        {form.isExclusive ? "Exclusive" : "Not Exclusive"}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>Category</label>
                   
                    <Input
                      name="category"
                      className={inputClass}
                      value={
                        categoryLoading
                          ? "Loading..."
                          : (merchantCategory?.name ?? "Not set")
                      }
                      readOnly
                      disabled
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Based on your business category
                    </p>
                  </div>

                  <div>
                    <label className={labelClass}>Offer Type <span className="text-destructive">*</span></label>

                    <select
                      name="offerType"
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      value={form.offerType}
                      onChange={set("offerType")}
                    >
                      <option value="FLAT">Flat Amount</option>
                      <option value="PERCENTAGE">Percentage</option>

                      <option value="BUY_X_GET_Y">Buy X Get Y</option>
                    </select>
                  </div>
                </div>
                {/* Redemption Type Selection */}
                <div>
                  <label className={labelClass}>Redemption Type</label>

                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    value={form.redemptionType}
                    onChange={set("redemptionType")}
                    name="redemptionType"
                  >
                    <option value="IN_STORE_QR">In-Store QR Code</option>
                    <option value="ONLINE_CODE">Online Code</option>

                    <option value="BOOKING_LINK">Booking Link</option>
                    <option value="VIRTUAL_CARD_AUTO_VERIFY">
                      Virtual Card (Auto Verify)
                    </option>
                  </select>

                  <p className="mt-1 text-xs text-muted-foreground">
                    {form.redemptionType === "ONLINE_CODE" &&
                      "Employee gets a code to enter on merchant website"}

                    {form.redemptionType === "BOOKING_LINK" &&
                      "Employee is redirected to merchant booking page"}

                    {form.redemptionType === "IN_STORE_QR" &&
                      "Employee shows QR code at merchant location"}

                    {form.redemptionType === "VIRTUAL_CARD_AUTO_VERIFY" &&
                      "Employee shows a virtual card at the counter; redemption is verified automatically"}
                  </p>
                </div>
                {/* Redemption Type Specific Fields */}

                {form.redemptionType === "ONLINE_CODE" && (
                  <Card className="bg-muted/30">
                    <CardHeader>
                      <CardTitle className="text-sm">
                        Online Code Configuration
                      </CardTitle>
                    </CardHeader>

                    <CardContent className="space-y-4">
                      <div>
                        <label className={labelClass}>Booking URL *</label>

                        <Input
                          className={inputClass}
                          value={form.bookingUrl}
                          onChange={set("bookingUrl")}
                          placeholder="https://merchant-website.com/offer"
                          type="url"
                        />

                        <p className="mt-1 text-xs text-muted-foreground">
                          Where employees will be directed to use their code
                        </p>
                      </div>

                      <div>
                        <label className={labelClass}>Offer Code</label>

                        <Input
                          className={inputClass}
                          value={form.redemptionCode}
                          onChange={set("redemptionCode")}
                          placeholder="Auto-generated if empty"
                          maxLength={6}
                        />

                        <p className="mt-1 text-xs text-muted-foreground">
                          6-character alphanumeric code. Leave empty to
                          auto-generate.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {form.redemptionType === "BOOKING_LINK" && (
                  <Card className="bg-muted/30">
                    <CardHeader>
                      <CardTitle className="text-sm">
                        Booking Link Configuration
                      </CardTitle>
                    </CardHeader>

                    <CardContent>
                      <div>
                        <label className={labelClass}>Booking URL <span className="text-destructive">*</span></label>

                        <Input
                          className={inputClass}
                          value={form.bookingUrl}
                          onChange={set("bookingUrl")}
                          placeholder="https://booking-system.com/offers/..."
                          type="url"
                        />

                        <p className="mt-1 text-xs text-muted-foreground">
                          Direct link to merchant booking system
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {form.redemptionType === "IN_STORE_QR" && (
                  <Card className="bg-muted/30">
                    <CardHeader>
                      <CardTitle className="text-sm">
                        In-Store QR Configuration
                      </CardTitle>
                    </CardHeader>

                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        A unique QR code will be generated for this offer.
                        Employees will scan it at the merchant location to
                        receive their redemption code.
                      </p>
                    </CardContent>
                  </Card>
                )}

                {form.redemptionType === "VIRTUAL_CARD_AUTO_VERIFY" && (
                  <Card className="bg-muted/30">
                    <CardHeader>
                      <CardTitle className="text-sm">
                        Virtual Card Configuration
                      </CardTitle>
                    </CardHeader>

                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        On redeem, the employee gets a virtual card with their
                        name, company and a unique code to show your staff. The
                        redemption is verified automatically — no confirmation
                        is needed on your side.
                      </p>
                    </CardContent>
                  </Card>
                )}

                {form.offerType === "FLAT" && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className={labelClass}>Discount Amount <span className="text-destructive">*</span></label>

                      <Input
                        className={inputClass}
                        type="number"
                        step="0.01"
                        value={form.discountValue}
                        onChange={(e) =>
                          handleLinkedFieldChange(
                            "discountValue",
                            e.target.value,
                          )
                        }
                        placeholder="e.g. 100"
                      />

                      {errors.discountValue && (
                        <p className="mt-1 text-xs text-destructive">
                          {errors.discountValue}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className={labelClass}>Minimum Spend</label>

                      <Input
                        className={inputClass}
                        type="number"
                        step="0.01"
                        value={form.minimumSpend}
                        onChange={set("minimumSpend")}
                        placeholder="Minimum order amount"
                      />

                      {errors.minimumSpend && (
                        <p className="mt-1 text-xs text-destructive">
                          {errors.minimumSpend}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {showStrength &&
                  form.offerType === "FLAT" &&
                  form.discountValue &&
                  Number(form.discountValue) > 0 && (
                    <OfferStrengthIndicator
                      discountValue={Number(form.discountValue)}
                      offerType={form.offerType}
                      categoryId={merchantCategory?.slug ?? null}
                      minimumSpend={
                        form.minimumSpend
                          ? Number(form.minimumSpend)
                          : undefined
                      }
                      discountMax={
                        form.discountMax ? Number(form.discountMax) : undefined
                      }
                    />
                  )}

                {form.offerType === "PERCENTAGE" && (
                  <>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div>
                        <label className={labelClass}>
                          Discount Percentage <span className="text-destructive">*</span>
                        </label>

                        <Input
                          className={inputClass}
                          type="number"
                          value={form.discountPercent}
                          onChange={(e) =>
                            handleLinkedFieldChange(
                              "discountPercent",
                              e.target.value,
                            )
                          }
                          placeholder="e.g. 20"
                        />

                        {errors.discountPercent && (
                          <p className="mt-1 text-xs text-destructive">
                            {errors.discountPercent}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className={labelClass}>Maximum Discount</label>

                        <Input
                          className={inputClass}
                          type="number"
                          step="0.01"
                          value={form.discountMax}
                          onChange={(e) =>
                            handleLinkedFieldChange(
                              "discountMax",
                              e.target.value,
                            )
                          }
                          placeholder="Cap amount"
                        />

                        {errors.discountMax && (
                          <p className="mt-1 text-xs text-destructive">
                            {errors.discountMax}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className={labelClass}>Minimum Spend</label>

                        <Input
                          className={inputClass}
                          type="number"
                          step="0.01"
                          value={form.minimumSpend}
                          onChange={(e) =>
                            handleLinkedFieldChange(
                              "minimumSpend",
                              e.target.value,
                            )
                          }
                          placeholder="Minimum order amount"
                        />

                        {errors.minimumSpend && (
                          <p className="mt-1 text-xs text-destructive">
                            {errors.minimumSpend}
                          </p>
                        )}
                      </div>
                    </div>

                    {showStrength &&
                      form.discountValue &&
                      Number(form.discountValue) > 0 && (
                        <OfferStrengthIndicator
                          discountValue={Number(form.discountValue)}
                          offerType={form.offerType}
                          categoryId={merchantCategory?.slug ?? null}
                          minimumSpend={
                            form.minimumSpend
                              ? Number(form.minimumSpend)
                              : undefined
                          }
                          discountMax={
                            form.discountMax
                              ? Number(form.discountMax)
                              : undefined
                          }
                        />
                      )}

                    {form.minimumSpend &&
                      form.discountMax &&
                      form.maxRedemptions && (
                        <div className="rounded-lg border bg-muted/50 p-3 space-y-1">
                          <h4 className="text-xs font-semibold text-muted-foreground">
                            Campaign Liability Estimate
                          </h4>

                          <p className="text-sm font-medium">
                            Total potential payout: $
                            {(
                              Number(form.discountMax) *
                              Number(form.maxRedemptions)
                            ).toLocaleString("en-GB", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </p>

                          <p className="text-xs text-muted-foreground">
                            Based on max
                            {form.maxRedemptions} redemptions × $
                            {Number(form.discountMax).toFixed(2)} max discount
                          </p>
                        </div>
                      )}
                  </>
                )}

                {form.offerType === "BUY_X_GET_Y" && (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className={labelClass}>Buy Quantity <span className="text-destructive">*</span></label>

                        <Input
                          className={inputClass}
                          type="number"
                          value={form.buyQuantity}
                          onChange={set("buyQuantity")}
                          placeholder="e.g. 2"
                        />

                        {errors.buyQuantity && (
                          <p className="mt-1 text-xs text-destructive">
                            {errors.buyQuantity}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className={labelClass}>Buy Item <span className="text-destructive">*</span></label>

                        <Input
                          className={inputClass}
                          value={form.buyItem}
                          onChange={set("buyItem")}
                          placeholder="e.g. Pizza"
                        />

                        {errors.buyItem && (
                          <p className="mt-1 text-xs text-destructive">
                            {errors.buyItem}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className={labelClass}>Get Quantity <span className="text-destructive">*</span></label>

                        <Input
                          className={inputClass}
                          type="number"
                          value={form.getQuantity}
                          onChange={set("getQuantity")}
                          placeholder="e.g. 1"
                        />

                        {errors.getQuantity && (
                          <p className="mt-1 text-xs text-destructive">
                            {errors.getQuantity}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className={labelClass}>Free Item <span className="text-destructive">*</span></label>

                        <Input
                          className={inputClass}
                          value={form.freeItem}
                          onChange={set("freeItem")}
                          placeholder="e.g. Pizza"
                        />

                        {errors.freeItem && (
                          <p className="mt-1 text-xs text-destructive">
                            {errors.freeItem}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className={labelClass}>Maximum Free Items</label>

                        <Input
                          className={inputClass}
                          type="number"
                          value={form.maxFreeItems}
                          onChange={set("maxFreeItems")}
                          placeholder="Cap on free items"
                        />

                        {errors.maxFreeItems && (
                          <p className="mt-1 text-xs text-destructive">
                            {errors.maxFreeItems}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className={labelClass}>Minimum Spend</label>

                        <Input
                          className={inputClass}
                          type="number"
                          step="0.01"
                          value={form.minimumSpend}
                          onChange={set("minimumSpend")}
                          placeholder="Minimum order amount"
                        />

                        {errors.minimumSpend && (
                          <p className="mt-1 text-xs text-destructive">
                            {errors.minimumSpend}
                          </p>
                        )}
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <label className={labelClass}>Max Redemptions</label>

                  <Input
                    className={inputClass}
                    type="number"
                    value={form.maxRedemptions}
                    onChange={set("maxRedemptions")}
                    placeholder="Unlimited if empty"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>Start Date <span className="text-destructive">*</span></label>

                    <Input
                      className={inputClass}
                      type="datetime-local"
                      value={form.startDate}
                      onChange={set("startDate")}
                    />

                    {errors.startDate && (
                      <p className="mt-1 text-xs text-destructive">
                        {errors.startDate}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className={labelClass}>End Date <span className="text-destructive">*</span></label>

                    <Input
                      className={inputClass}
                      type="datetime-local"
                      value={form.endDate}
                      onChange={set("endDate")}
                    />

                    {errors.endDate && (
                      <p className="mt-1 text-xs text-destructive">
                        {errors.endDate}
                      </p>
                    )}
                  </div>
                </div>
                {/* Days of Week */}
                <div>
                  <label className={labelClass}>Available Days</label>

                  <div className="mt-2 flex flex-wrap gap-2">
                    {DAYS_OF_WEEK.map((day) => {
                      const selected = form.daysOfWeek
                        .split(",")
                        .map((s) => s.trim())
                        .includes(String(day.value));
                      return (
                        <button
                          key={day.value}
                          type="button"
                          onClick={() => toggleDay(day.value)}
                          className={`
                            rounded-full px-3 py-1.5 text-xs font-medium transition-colors
                            ${
                              selected
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground hover:bg-muted/80"
                            }
                          `}
                        >
                          {day.short}
                        </button>
                      );
                    })}
                  </div>

                  <p className="mt-1 text-xs text-muted-foreground">
                    {(() => {
                      const sel = form.daysOfWeek.split(",").filter(Boolean);
                      if (sel.length === 7) return "Every day";
                      return sel
                        .map(
                          (s) =>
                            DAYS_OF_WEEK.find((d) => d.value === Number(s))
                              ?.short,
                        )
                        .join(" • ");
                    })()}
                  </p>

                  {errors.daysOfWeek && (
                    <p className="mt-1 text-xs text-destructive">
                      {errors.daysOfWeek}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Offer Banner</CardTitle>
              </CardHeader>

              <CardContent className="space-y-4">
                <OfferImageUploader
                  uploadMode="deferred"
                  onFilesSelected={handleFilesSelected}
                  disabled={false}
                  currentCount={pendingImages.length}
                />

                <OfferImageGallery
                  images={pendingImages}
                  onRemove={handleRemoveImage}
                  onMoveUp={handleMoveUp}
                  onMoveDown={handleMoveDown}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Redemption & Terms</CardTitle>
              </CardHeader>

              <CardContent className="space-y-4">
                <div>
                  <label className={labelClass}>Redemption Instructions</label>

                  <textarea
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    value={form.redemptionInstructions}
                    onChange={set("redemptionInstructions")}
                    placeholder="Instructions for redeeming this offer"
                  />
                </div>

                <div>
                  <label className={labelClass}>
                    Terms & Conditions
                    <span className="text-destructive">*</span>
                  </label>

                  <textarea
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    value={form.termsAndConditions}
                    onChange={set("termsAndConditions")}
                    placeholder="Terms and conditions"
                  />

                  {errors.termsAndConditions && (
                    <p className="mt-1 text-xs text-destructive">
                      {errors.termsAndConditions}
                    </p>
                  )}
                </div>

                <div>
                  <label className={labelClass}>Submission Notes</label>

                  <textarea
                    className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    value={form.submissionNotes}
                    onChange={set("submissionNotes")}
                    placeholder="Any notes for the review team"
                  />
                </div>
              </CardContent>
            </Card>
            {/* Action buttons */}
            <div className="flex items-center gap-3">
              {isReplacement || (!isEdit && !offerId) ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSaveDraft}
                    disabled={createOffer.isPending || updateOffer.isPending}
                  >
                    {createOffer.isPending ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-1 h-4 w-4" />
                    )}
                    Save as Draft
                  </Button>

                  <Button
                    type="submit"
                    disabled={
                      createOffer.isPending ||
                      submitOffer.isPending ||
                      categoryLoading ||
                      missingCategory
                    }
                  >
                    {submitOffer.isPending ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="mr-1 h-4 w-4" />
                    )}

                    {submitOffer.isPending
                      ? "Submitting..."
                      : isReplacement
                        ? "Submit Replacement"
                        : "Submit for Review"}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="submit"
                    disabled={
                      updateOffer.isPending ||
                      submitOffer.isPending ||
                      categoryLoading ||
                      missingCategory
                    }
                  >
                    {updateOffer.isPending ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-1 h-4 w-4" />
                    )}

                    {updateOffer.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </>
              )}

              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (onCancel) {
                    onCancel();
                  } else {
                    router.push(fallbackRoute);
                  }
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
        {/* Right column — preview panel */}
        <div className="space-y-6 lg:col-span-1">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <Card className="overflow-hidden border-2">
              <CardHeader className="border-b bg-gradient-to-br from-muted/50 to-muted/20 pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                      <Sparkles className="h-4 w-4 text-primary" />
                    </div>
                    Live Preview
                  </CardTitle>

                  <Badge variant="secondary" className="text-[10px]">
                    <Store className="mr-1 h-2.5 w-2.5" />
                    Mobile
                  </Badge>
                </div>

                <p className="text-xs text-muted-foreground">
                  How employees will see this offer in their app
                </p>
              </CardHeader>

              <CardContent className="bg-gradient-to-br from-background via-muted/20 to-muted/40 p-6">
                <OfferMobilePreview
                  title={form.title}
                  shortDescription={form.shortDescription}
                  description={form.description}
                  discountValue={form.discountValue}
                  offerType={form.offerType}
                  startDate={form.startDate}
                  endDate={form.endDate}
                  imageUrls={previewImageUrls}
                  isFeatured={form.isFeatured}
                  isExclusive={form.isExclusive}
                  merchantName="Your Business"
                  categoryName={categoryName}
                  redemptionType={form.redemptionType}
                  minSpend={form.minimumSpend}
                />
              </CardContent>
            </Card>

            <div className="mt-6">
              <OfferBannerInfo imageUrls={form.imageUrls} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
