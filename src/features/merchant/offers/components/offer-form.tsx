"use client";
import { isOnlineBranch, isPhysicalBranch } from "@/lib/branch-helpers";
import { useState, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, Sparkles, Store } from "lucide-react";
import { OfferBannerInfo } from "@/components/merchant/offers/OfferBannerInfo";
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
import { showToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EVERGREEN_REPLACE_CONFIRM_CODE } from "@/lib/offers/evergreen";
import { uploadImage, OFFER_IMAGE_OPTIONS } from "@/lib/upload/image";
import { deleteOfferImage } from "@/lib/upload-offer-image";
import { FieldLabel, InfoTip } from "@/components/ui/info-tip";
import {
  flatDiscountPercent,
  isValidDiscountAmount,
  isValidPercent,
  PERCENT_MAX,
  PERCENT_MIN,
  suggestedPercentMax,
  validateFlatDiscount,
  validatePercentDiscount,
} from "@/lib/offers/flat-discount";
import { FLASH_MAX_DAYS, flashMaxEndLocal, validateFlashWindow } from "@/lib/offers/flash";
import {
  EVERGREEN_LIVE_MESSAGE,
  EVERGREEN_REQUIRED_MESSAGE,
  isEvergreenRange,
} from "@/lib/offers/evergreen";
import {
  isValidOfferCode,
  OFFER_CODE_MIN_LENGTH,
  OFFER_CODE_MAX_LENGTH,
  OFFER_CODE_DEFAULT_LENGTH,
  OFFER_CODE_INVALID_MESSAGE,
} from "@/lib/offer-code.shared";
import {
  DEFAULT_OFFER_FREQUENCY,
  frequencyToRepeatHours,
  OFFER_FREQUENCY_OPTIONS,
  repeatHoursToFrequency,
  type OfferFrequency,
} from "@/lib/offers/frequency";
import {
  BRANCHES_REQUIRED_MESSAGE,
  channelFromRedemption,
  channelHasOnlineCode,
  channelRedemptionType,
  channelUsesBranches,
  missingBranchesMessage,
  type ActiveBranchCounts,
  OFFER_CHANNELS,
  type OfferChannel,
} from "@/lib/offers/channel";

interface BranchOption {
  id: string;
  name: string;
  city: string | null;
  isPrimary: boolean;
}

async function fetchInStoreBranches(): Promise<BranchOption[]> {
  // PHYSICAL = IN_STORE + BOTH (a store that also sells online is still an in-store branch).
  const res = await fetch("/api/merchant/branches?type=PHYSICAL&status=active");
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? "Failed to load branches");
  // Only branches an offer can actually be redeemed at (status ACTIVE as well as switched on).
  return (json.data ?? []).filter((b: { status?: string }) => b.status === undefined || b.status === "ACTIVE");
}

async function fetchActiveBranchCounts(): Promise<ActiveBranchCounts> {
  const res = await fetch("/api/merchant/branches?status=active");
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? "Failed to load branches");
  const rows: { branchType: string; status: string }[] = json.data ?? [];
  const active = rows.filter((b) => b.status === "ACTIVE");
  return {
    inStore: active.filter((b) => isPhysicalBranch(b.branchType)).length,
    online: active.filter((b) => isOnlineBranch(b.branchType)).length,
  };
}

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
  repeatAfterHours: string;
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
  /** In-store / Online / Both. Decides redemptionType (see lib/offers/channel). */
  channel: OfferChannel;
  /** In-store and Both offers: every in-store branch, or only `branchIds`. */
  allBranches: boolean;
  branchIds: string[];
  bookingUrl: string;
  qrCodeUrl: string;
  isFeatured: boolean;
  isExclusive: boolean;
  isFlash: boolean;
  isForever: boolean;
}

/** "2026-10-08T23:59" (local, from datetime-local) → UTC ISO string. Empty/invalid stays as-is. */
function localInputToIso(value: string): string {
  if (!value) return value;
  const d = new Date(value);
  return isNaN(d.getTime()) ? value : d.toISOString();
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
  "image/webp",
];
const MAX_SIZE = 2 * 1024 * 1024;

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

const TITLE_MAX_CHARS = 40;
const DESCRIPTION_MAX_WORDS = 400;

function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

/** Keep at most `max` words, preserving the original spacing of what's kept. */
function limitWords(text: string, max: number): string {
  if (countWords(text) <= max) return text;
  const match = text.match(new RegExp(`^\\s*(?:\\S+\\s+){${max - 1}}\\S+`));
  return match ? match[0] : text;
}

/** Every offer is either Evergreen (always-on) or Flash (short window). */
type OfferKind = "EVERGREEN" | "FLASH";

async function fetchHasLiveForever(merchantId?: string, isAdmin?: boolean): Promise<boolean> {
  const url =
    isAdmin && merchantId
      ? `/api/admin/merchants/${merchantId}/offers`
      : "/api/merchant/offers?pageSize=1";
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? "Failed to load offers");
  return !!json.hasLiveForever;
}

/** Date → "YYYY-MM-DDTHH:mm" in local time, for datetime-local inputs. */
function dateToLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "shop.com/x" → "https://shop.com/x"; links that already have a scheme are kept. */
function normalizeUrl(value: string): string {
  const v = value.trim();
  if (!v) return v;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

/** Field key → name used in the "Please fix N fields" summary. */
const FIELD_NAMES: Record<string, string> = {
  offerKind: "offer type",
  isForever: "offer type",
  title: "title",
  description: "description",
  shortDescription: "description",
  offerType: "discount type",
  discountValue: "discount",
  discountPercent: "discount",
  minimumSpend: "minimum spend",
  discountMax: "maximum discount",
  buyQuantity: "buy quantity",
  buyItem: "buy item",
  getQuantity: "get quantity",
  freeItem: "free item",
  maxFreeItems: "maximum free items",
  branches: "branches",
  channel: "required branches",
  redemptionCode: "promo code",
  bookingUrl: "booking link",
  startDate: "start date",
  endDate: "end date",
  repeatAfterHours: "frequency",
  maxRedemptions: "max redemptions",
  daysOfWeek: "available days",
  termsAndConditions: "terms and conditions",
  categoryId: "category",
};

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Number inputs accept e/E/+/- ; money fields never need them. */
function blockNonMoneyKeys(e: React.KeyboardEvent<HTMLInputElement>) {
  if (["e", "E", "+", "-"].includes(e.key)) e.preventDefault();
}

function getTargetOfferCodeLength(currentValue: string): number {
  const length = Number(currentValue.trim().length);
  if (!Number.isFinite(length) || length <= 0) {
    return OFFER_CODE_DEFAULT_LENGTH;
  }

  return Math.min(
    OFFER_CODE_MAX_LENGTH,
    Math.max(OFFER_CODE_MIN_LENGTH, Math.round(length)),
  );
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
  const queryClient = useQueryClient();
  // Server decides whether an Evergreen went LIVE; show its message if so.
  const showSubmitSuccess = (result: any, fallbackTitle: string) => {
    if (result?.autoActivated) {
      showToast({
        type: "success",
        title: result.message ?? EVERGREEN_LIVE_MESSAGE,
      });
      // Flash is now unlocked.
      queryClient.invalidateQueries({ queryKey: ["merchant-has-live-forever"] });
    } else {
      showToast({ type: "success", title: fallbackTitle });
    }
  };
  const [errors, setErrors] = useState<FormErrors>({});
  // "More options" starts open: it still holds required fields (min spend, terms).
  const summaryRef = useRef<HTMLDivElement>(null);
  const [showStrength, setShowStrength] = useState(false);
  const [pendingAction, setPendingAction] = useState<"draft" | "submit" | null>(null);
  // Set when the server says an Evergreen is already LIVE and needs confirmation.
  const [evergreenConfirm, setEvergreenConfirm] = useState<{ title: string } | null>(null);
  // Synchronous lock: state updates are async, so a fast double-click can slip
  // past `disabled`. Stays set after success until the page navigates away.
  const submittingRef = useRef(false);
  const isBusy =
    pendingAction !== null ||
    createOffer.isPending ||
    updateOffer.isPending ||
    submitOffer.isPending;
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
  const { data: hasLiveForever = false, isLoading: liveForeverLoading } = useQuery({
    queryKey: ["merchant-has-live-forever", isAdmin ? merchantId : "self"],
    queryFn: () => fetchHasLiveForever(merchantId, isAdmin),
    staleTime: 60 * 1000,
  });
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
    // New offers start on the default Frequency; edits keep their stored value.
    repeatAfterHours:
      initialData?.repeatAfterHours ??
      (isEdit ? "" : String(frequencyToRepeatHours(DEFAULT_OFFER_FREQUENCY))),
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
    redemptionType: initialData?.redemptionType ?? "VIRTUAL_CARD_AUTO_VERIFY",
    channel:
      initialData?.channel ??
      // New offers default to In-store: an online code needs an ONLINE branch,
      // which most merchants don't have, so defaulting to Online fails submit.
      channelFromRedemption(initialData?.redemptionType ?? "VIRTUAL_CARD_AUTO_VERIFY", null),
    allBranches: initialData?.allBranches ?? true,
    branchIds: initialData?.branchIds ?? [],
    bookingUrl: initialData?.bookingUrl ?? "",
    qrCodeUrl: initialData?.qrCodeUrl ?? "",
    isFeatured: initialData?.isFeatured ?? false,
    isExclusive: initialData?.isExclusive ?? false,
    isFlash: initialData?.isFlash ?? false,
    isForever: initialData?.isForever ?? false,
  });

  useEffect(() => {
    const start = form.startDate ? new Date(form.startDate) : null;
    const end = form.endDate ? new Date(form.endDate) : null;
    if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) {
      return;
    }

    const shouldBeForever = isEvergreenRange(start, end);
    setForm((prev) => {
      if (!shouldBeForever) return prev;
      return prev.isForever === true ? prev : { ...prev, isForever: true };
    });
  }, [form.startDate, form.endDate]);

  const set =
    (field: keyof FormData) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) => {
      const raw = e.target.value;
      const value =
        field === "description" || field === "shortDescription"
          ? limitWords(raw, DESCRIPTION_MAX_WORDS)
          : raw;
      setForm((prev) => {
        const next = { ...prev, [field]: value };
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
        // Keep the suggestion (Min Spend × %) in sync until the merchant sets their own max
        if (
          (field === "minimumSpend" || field === "discountPercent") &&
          !maxManuallySet.current
        ) {
          next.discountMax = suggestedPercentMax(next.discountPercent, next.minimumSpend);
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

  /** Forever on → start = now (if unset), no end date. Off → clear the long end date. */
  const toggleForever = (on: boolean) => {
    setForm((prev) => {
      if (on) {
        return {
          ...prev,
          isForever: true,
          isFlash: false,
          startDate: prev.startDate || dateToLocalInput(new Date()),
          endDate: "",
        };
      }
      // Leaving a ≥1-year range would immediately re-mark the offer as Forever.
      const stillEvergreen =
        prev.startDate && prev.endDate && isEvergreenRange(prev.startDate, prev.endDate);
      return { ...prev, isForever: false, endDate: stillEvergreen ? "" : prev.endDate };
    });
    setErrors((prev) => {
      const n = { ...prev };
      delete n.isForever;
      delete n.startDate;
      delete n.endDate;
      return n;
    });
  };

  /** Flash on → turns Forever off and drops an end date that's beyond the flash limit. */
  const toggleFlash = (on: boolean) => {
    setForm((prev) => {
      if (!on) return { ...prev, isFlash: false };
      const tooLong =
        !!prev.startDate &&
        !!prev.endDate &&
        validateFlashWindow(true, prev.startDate, prev.endDate) !== null;
      return {
        ...prev,
        isFlash: true,
        isForever: false,
        endDate: tooLong || prev.isForever ? "" : prev.endDate,
      };
    });
    setErrors((prev) => {
      const n = { ...prev };
      delete n.isForever;
      delete n.endDate;
      return n;
    });
  };

  // null only for legacy dated offers saved before Regular was removed: the merchant must pick one.
  const offerKind: OfferKind | null = form.isForever ? "EVERGREEN" : form.isFlash ? "FLASH" : null;
  // Flash needs a live Evergreen. Keep an offer's existing kind selectable when editing.
  const kindLocked = (kind: OfferKind) =>
    kind !== "EVERGREEN" && !hasLiveForever && !(isEdit && offerKind === kind);

  const selectOfferKind = (kind: OfferKind) => {
    if (kindLocked(kind)) return;
    if (kind === "EVERGREEN") toggleForever(true);
    else toggleFlash(true);
    setErrors((prev) => {
      const n = { ...prev };
      delete n.offerKind;
      return n;
    });
  };

  // New offer with no live Evergreen: Evergreen is the only valid choice, so preselect it.
  const autoKindApplied = useRef(false);
  useEffect(() => {
    if (autoKindApplied.current || isEdit || liveForeverLoading) return;
    autoKindApplied.current = true;
    if (form.isForever || form.isFlash) return;
    // No live Evergreen → Evergreen; otherwise → Flash.
    if (!hasLiveForever) toggleForever(true);
    else toggleFlash(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveForeverLoading, hasLiveForever, isEdit]);

  // Frequency is stored as the repeat-after cooldown (see lib/offers/frequency).
  const frequency = repeatHoursToFrequency(form.repeatAfterHours);
  const setFrequency = (value: OfferFrequency) => {
    setForm((prev) => ({ ...prev, repeatAfterHours: String(frequencyToRepeatHours(value)) }));
    if (errors.repeatAfterHours)
      setErrors((prev) => {
        const n = { ...prev };
        delete n.repeatAfterHours;
        return n;
      });
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

  const usesBranches = channelUsesBranches(form.channel);
  const hasOnlineCode = channelHasOnlineCode(form.channel);
  const { data: branchOptions = [], isLoading: branchesLoading, isError: branchesError } = useQuery({
    queryKey: ["merchant-branches", "PHYSICAL", "active"],
    queryFn: fetchInStoreBranches,
    // Admins act through other endpoints; they can still pick "All branches".
    enabled: !isAdmin,
    staleTime: 60 * 1000,
  });

  // Channel needs: In-store → active In-store branch, Online → active Online
  // branch, Both → one of each. Warn up front so the merchant adds them first.
  const { data: activeBranchCounts } = useQuery({
    queryKey: ["merchant-branches", "active-counts"],
    queryFn: fetchActiveBranchCounts,
    enabled: !isAdmin,
    staleTime: 30 * 1000,
  });
  const missingBranchesMsg = activeBranchCounts
    ? missingBranchesMessage(form.channel, activeBranchCounts)
    : null;

  const clearError = (...keys: string[]) =>
    setErrors((prev) => {
      if (!keys.some((k) => k in prev)) return prev;
      const n = { ...prev };
      keys.forEach((k) => delete n[k]);
      return n;
    });

  /** A 400 from the API can name a field; show it inline as well as in a toast. */
  const showFieldApiError = (err: any, title: string) => {
    if (typeof err?.field === "string" && typeof err?.message === "string") {
      setErrors((prev) => ({ ...prev, [err.field]: err.message }));
    }
    showToast({ type: "error", title, description: err?.message });
  };

  const setChannel = (channel: OfferChannel) => {
    setForm((prev) => ({ ...prev, channel, redemptionType: channelRedemptionType(channel) }));
    clearError("branches", "redemptionCode", "bookingUrl");
  };

  const setAllBranches = (allBranches: boolean) => {
    setForm((prev) => ({ ...prev, allBranches }));
    clearError("branches");
  };

  const toggleBranch = (id: string) => {
    setForm((prev) => ({
      ...prev,
      branchIds: prev.branchIds.includes(id)
        ? prev.branchIds.filter((b) => b !== id)
        : [...prev.branchIds, id],
    }));
    clearError("branches");
  };

  /** Ask the server for a code that is not already used by another offer. */
  const handleGenerateOfferCode = async () => {
    try {
      const res = await fetch("/api/merchant/offers/generate-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ length: getTargetOfferCodeLength(form.redemptionCode) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Failed to generate a code");
      setForm((prev) => ({ ...prev, redemptionCode: json.data.code }));
      clearError("redemptionCode");
    } catch (err: any) {
      showToast({
        type: "error",
        title: "Could not generate a code",
        description: err?.message ?? "Please try again",
      });
    }
  };

  const validate = (): boolean => {
    const errs: FormErrors = {};
    if (!form.title.trim()) errs.title = "Title is required";
    else if (form.title.trim().length < 5)
      errs.title = "Title must be at least 5 characters";
    else if (form.title.trim().length > TITLE_MAX_CHARS)
      errs.title = `Title must be ${TITLE_MAX_CHARS} characters or fewer`;
    if (countWords(form.shortDescription) > DESCRIPTION_MAX_WORDS)
      errs.shortDescription = `Short description must be ${DESCRIPTION_MAX_WORDS} words or fewer`;
    if (countWords(form.description) > DESCRIPTION_MAX_WORDS)
      errs.description = `Description must be ${DESCRIPTION_MAX_WORDS} words or fewer`;
    // Legacy dated offers (no kind) can still be edited or replaced as they are.
    if (!offerKind) { if (!isEdit && !isReplacement) errs.offerKind = "Choose Evergreen or Flash"; }
    else if (kindLocked(offerKind))
      errs.offerKind = EVERGREEN_REQUIRED_MESSAGE;
    if (!form.offerType) errs.offerType = "Offer type is required";

    if (form.offerType === "FLAT") {
      Object.assign(
        errs,
        validateFlatDiscount(
          { discountValue: form.discountValue, minimumSpend: form.minimumSpend },
          { requireAll: true },
        ),
      );
    } else if (form.offerType === "PERCENTAGE") {
      Object.assign(
        errs,
        validatePercentDiscount(
          {
            discountPercent: form.discountPercent,
            minimumSpend: form.minimumSpend,
            discountMax: form.discountMax,
          },
          { requireAll: true },
        ),
      );
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

    if (usesBranches && !form.allBranches && form.branchIds.length === 0)
      errs.branches = BRANCHES_REQUIRED_MESSAGE;
    if (missingBranchesMsg) errs.channel = missingBranchesMsg;

    if (hasOnlineCode) {
      if (!form.bookingUrl.trim()) errs.bookingUrl = "Booking link is required";
      else if (!/^https?:\/\/[^\s.]+\.\S+$/i.test(normalizeUrl(form.bookingUrl)))
        errs.bookingUrl = "Enter a valid link, e.g. yourwebsite.com/offer";
      if (!form.redemptionCode.trim()) errs.redemptionCode = "Offer code is required";
      else if (!isValidOfferCode(form.redemptionCode.trim()))
        errs.redemptionCode = OFFER_CODE_INVALID_MESSAGE;
    }

    if (!form.startDate.trim()) errs.startDate = "Start date is required";
    if (form.isForever) {
      // Evergreen offers are open-ended: no end date to validate.
    } else if (!form.endDate.trim()) errs.endDate = "End date is required";
    else if (
      form.startDate &&
      new Date(form.endDate) <= new Date(form.startDate)
    )
      errs.endDate = "End date must be after start date";
    else {
      const flashError = validateFlashWindow(form.isFlash, form.startDate, form.endDate);
      if (flashError) errs.endDate = flashError;
    }
    // Terms and conditions are optional free text; empty means no terms are shown.

    if (form.isFlash && form.isForever)
      errs.isForever = "An offer cannot be both Flash and Forever";

    if (form.maxRedemptions.trim()) {
      const mr = Number(form.maxRedemptions);
      if (!Number.isInteger(mr) || mr <= 0)
        errs.maxRedemptions = "Must be a whole number greater than 0";
    }

    if (!frequency) errs.repeatAfterHours = "Choose how often employees can use this offer";

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

    // The "Please fix N fields" banner at the top of the form shows the summary.
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
    isFlash: form.isFlash,
    isForever: form.isForever,
    imageUrls: form.imageUrls,
    offerType: OFFER_TYPE_MAP[form.offerType] ?? form.offerType,
    discountValue: form.discountValue ? Number(form.discountValue) : null,
    discountMax: form.discountMax ? Number(form.discountMax) : null,
    discountPercent: form.discountPercent ? Number(form.discountPercent) : null,
    minimumSpend: form.minimumSpend ? Number(form.minimumSpend) : null,
    maxRedemptions: form.maxRedemptions ? Number(form.maxRedemptions) : null,
    repeatAfterHours: form.repeatAfterHours ? Number(form.repeatAfterHours) : null,
    buyQuantity: form.buyQuantity ? Number(form.buyQuantity) : null,
    buyItem: form.buyItem || null,
    getQuantity: form.getQuantity ? Number(form.getQuantity) : null,
    freeItem: form.freeItem || null,
    maxFreeItems: form.maxFreeItems ? Number(form.maxFreeItems) : null,
    // datetime-local values have no timezone; convert in the browser so the
    // server stores the merchant's local time correctly (it runs in UTC).
    startDate: localInputToIso(form.startDate),
    // Evergreen offers are open-ended: send null, never a made-up end date.
    endDate: form.isForever ? null : localInputToIso(form.endDate),
    daysOfWeek: form.daysOfWeek
      .split(",")
      .map((s) => parseInt(s.trim()))
      .filter((n) => !isNaN(n)),
    redemptionCode: form.redemptionCode || null,
    redemptionInstructions: form.redemptionInstructions || null,
    submissionNotes: form.submissionNotes || null,
    replacementReason: isReplacement ? form.replacementReason || null : null,
    saveAsDraft,
    redemptionType: channelRedemptionType(form.channel),
    channel: form.channel,
    allBranches: usesBranches ? form.allBranches : false,
    branchIds: usesBranches && !form.allBranches ? form.branchIds : [],
    // Don't send stale code/URL left over from a previously selected channel.
    ...(!hasOnlineCode ? { redemptionCode: null } : {}),
    bookingUrl:
      hasOnlineCode
        ? form.bookingUrl.trim()
          ? normalizeUrl(form.bookingUrl)
          : null
        : null,
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
    // Drafts may be incomplete, but a promo code that is present must be valid.
    if (channelHasOnlineCode(form.channel) && form.redemptionCode.trim()) {
      if (!isValidOfferCode(form.redemptionCode.trim())) {
        setErrors((prev) => ({ ...prev, redemptionCode: OFFER_CODE_INVALID_MESSAGE }));
        return;
      }
      clearError("redemptionCode");
    }
    if (submittingRef.current) return;
    submittingRef.current = true;
    setPendingAction("draft");
    let succeeded = false;
    const allUrls = await resolveAllImageUrls();
    if (allUrls === null) {
      submittingRef.current = false;
      return setPendingAction(null);
    }

    try {
      const body = withMerchant({ ...buildBody(true), imageUrls: allUrls });
      if (isEdit) {
        await updateOffer.mutateAsync({ id: offerId, ...body });
        showToast({ type: "success", title: "Draft saved" });
      } else {
        await createOffer.mutateAsync(body);
        showToast({ type: "success", title: "Draft saved" });
      }
      succeeded = true;
      if (onSuccess) {
        onSuccess();
      } else {
        router.push(fallbackRoute);
      }
    } catch (err: any) {
      showFieldApiError(err, "Failed to save draft");
    } finally {
      // On success keep the buttons locked while navigation completes.
      if (!succeeded) {
        submittingRef.current = false;
        setPendingAction(null);
      }
    }
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    if (!validate()) {
      // Errors may sit inside "More options"; make sure they're visible.
      requestAnimationFrame(() =>
        summaryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
      return;
    }

    submittingRef.current = true;
    setPendingAction("submit");
    let succeeded = false;
    try {
      succeeded = await doSubmit();
    } finally {
      // On success keep the buttons locked while navigation completes.
      if (!succeeded) {
        submittingRef.current = false;
        setPendingAction(null);
      }
    }
  };

  const handleConfirmReplaceEvergreen = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setPendingAction("submit");
    let succeeded = false;
    try {
      succeeded = await doSubmit(true);
    } finally {
      setEvergreenConfirm(null);
      if (!succeeded) {
        submittingRef.current = false;
        setPendingAction(null);
      }
    }
  };

  /** Opens the replace-Evergreen popup if the server asked for confirmation. */
  const needsEvergreenConfirm = (err: any): boolean => {
    if (err?.code !== EVERGREEN_REPLACE_CONFIRM_CODE) return false;
    setEvergreenConfirm({ title: err.currentOffer?.title ?? "" });
    return true;
  };

  /** Returns true once the offer is saved and we're navigating away. */
  const doSubmit = async (confirmReplaceEvergreen = false): Promise<boolean> => {
    const allUrls = await resolveAllImageUrls();
    if (allUrls === null) return false;

    const body = withMerchant({
      ...buildBody(false),
      imageUrls: allUrls,
      ...(confirmReplaceEvergreen ? { confirmReplaceEvergreen: true } : {}),
    });

    if (isEdit) {
      try {
        const result = await submitOffer.mutateAsync({
          id: offerId,
          ...body,
        });
        if (result.qualityCheck === "PASSED") {
          showSubmitSuccess(result, "Submitted for review. We will email you when it is approved.");
        } else {
          showToast({
            type: "error",
            title: "Validation failed",
            description: "Fix the errors and resubmit",
          });
          if (result.validationErrors) setErrors(result.validationErrors);
          return false; // stay on the form so the merchant can see the errors
        }
        if (onSuccess) {
          onSuccess();
        } else {
          router.push(fallbackRoute);
        }
        return true;
      } catch (err: any) {
        if (needsEvergreenConfirm(err)) return false;
        showFieldApiError(err, "Submission failed");
        return false;
      }
    } else {
      try {
        const result = await createOffer.mutateAsync(body);
        if (result.qualityCheck === "PASSED") {
          showSubmitSuccess(
            result,
            isReplacement
              ? "Replacement offer submitted for review"
              : "Submitted for review. We will email you when it is approved.",
          );
        } else {
          showToast({
            type: "error",
            title: "Validation failed",
            description: "Fix the errors and resubmit",
          });
          if (result.validationErrors) {
            setErrors(result.validationErrors);
          }
          // The offer is still created server-side (as a draft with QC errors),
          // so navigate away rather than risk a duplicate on resubmit.
        }
        if (onSuccess) {
          onSuccess();
        } else {
          router.push(fallbackRoute);
        }
        // Offer exists server-side either way; keep locked to avoid a duplicate.
        return true;
      } catch (err: any) {
        if (needsEvergreenConfirm(err)) return false;
        showFieldApiError(err, "Failed to submit");
        return false;
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

  // Live flat-discount validation: runs on every keystroke. Empty fields are
  // reported as "required" only after a submit attempt (via `errors`).
  const isFlat = form.offerType === "FLAT";
  const flatDiscountValid = isFlat && isValidDiscountAmount(form.discountValue);
  const liveFlatErrors = isFlat
    ? validateFlatDiscount(
        { discountValue: form.discountValue, minimumSpend: form.minimumSpend },
        { requireAll: false },
      )
    : {};
  const flatError = (field: "discountValue" | "minimumSpend") =>
    liveFlatErrors[field] ?? errors[field];
  // Live percentage validation (same idea: Discount % → Min Spend → Max Discount).
  const isPct = form.offerType === "PERCENTAGE";
  const pctValid = isPct && isValidPercent(form.discountPercent);
  const pctMinSpendValid = pctValid && isValidDiscountAmount(form.minimumSpend);
  const livePctErrors = isPct
    ? validatePercentDiscount(
        {
          discountPercent: form.discountPercent,
          minimumSpend: form.minimumSpend,
          discountMax: form.discountMax,
        },
        { requireAll: false },
      )
    : {};
  const pctError = (field: "discountPercent" | "minimumSpend" | "discountMax") =>
    livePctErrors[field] ?? errors[field];
  const hasFlatErrors =
    Object.keys(liveFlatErrors).length > 0 ||
    Object.keys(livePctErrors).length > 0;
  const flatPercent = isFlat
    ? flatDiscountPercent(form.discountValue, form.minimumSpend)
    : null;

  const categoryName = merchantCategory?.name;
  const previewImageUrls = useMemo(
      () =>
        pendingImages
          .map((p) => p.url ?? p.previewUrl)
          .filter((u): u is string => !!u),
      [pendingImages],
    );
  const inputClass = "w-full";
  const textareaClass =
    "flex min-h-[80px] w-full rounded-md border bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";
  const selectClass =
    "flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring";
  /** Red border for a field with an error; normal border otherwise. */
  const borderFor = (message?: string) =>
    message ? "border-destructive focus-visible:ring-destructive" : "border-input";
  const ErrorText = ({ message }: { message?: string }) =>
    message ? <p className="mt-1 text-xs text-destructive">{message}</p> : null;
  const HintText = ({ children }: { children: React.ReactNode }) => (
    <p className="mt-1 text-xs text-muted-foreground">{children}</p>
  );

  const errorKeys = Object.keys(errors);
  const errorNames = Array.from(
    new Set(errorKeys.map((k) => FIELD_NAMES[k] ?? k)),
  );
  const summaryText = errorNames.length
    ? `${joinNames(errorNames).replace(/^./, (c) => c.toUpperCase())} need${
        errorNames.length === 1 ? "s" : ""
      } attention.`
    : "";

  const pageTitle = isReplacement ? "Replace offer" : isEdit ? "Edit offer" : "Create offer";
  const pageSubtitle = isReplacement
    ? "Your current offer stays live until the replacement is approved."
    : isEdit
      ? "Update your offer details"
      : "Fill in the essentials, then submit for review.";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="mt-1"
          onClick={() => (onCancel ? onCancel() : router.push(fallbackRoute))}
          aria-label="Back to offers"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{pageTitle}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{pageSubtitle}</p>
        </div>
      </div>

      {/* Error summary */}
      <div ref={summaryRef} className="scroll-mt-4">
        {errorKeys.length > 0 && (
          <div
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3"
          >
            <p className="text-sm font-semibold text-destructive">
              Please fix {errorKeys.length} field{errorKeys.length > 1 ? "s" : ""}
            </p>
            <p className="mt-0.5 text-sm text-destructive/90">{summaryText}</p>
          </div>
        )}
      </div>

      {isReplacement && currentLiveOffer && (
        <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
          <CardContent className="p-4 text-sm">
            <p className="font-medium">
              Replacing: <span className="text-blue-600">{currentLiveOffer.title}</span>
            </p>
            <p className="mt-1 text-muted-foreground">
              Your current live offer will remain visible to employees until the
              replacement is approved.
            </p>
          </CardContent>
        </Card>
      )}

      {missingCategory && (
        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="p-4 text-sm">
            <p className="font-medium">Business category not set</p>
            <p className="mt-1 text-muted-foreground">
              Your business category is not set. Please contact hello@perksandmore.com. You
              can still save a draft, but the offer cannot be submitted until a
              category is assigned.
            </p>
          </CardContent>
        </Card>
      )}

        {isReplacement && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Replacement details</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldLabel
                htmlFor="replacementReason"
                info="Only visible to the admin team. Explain what changed (e.g. better discount, new menu) so the replacement can be approved faster."
              >
                Reason for replacement
              </FieldLabel>
              <textarea
                id="replacementReason"
                className={`${textareaClass} border-input`}
                value={form.replacementReason}
                onChange={set("replacementReason")}
                placeholder="Why are you replacing your current offer? (shown to admins during review)"
                maxLength={1000}
              />
              <HintText>{form.replacementReason.length}/1000</HintText>
            </CardContent>
          </Card>
        )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)] lg:items-start">
        {/* Left column — form fields */}
        <div className="min-w-0 space-y-6">
          <form onSubmit={handleSubmit} className="space-y-6" noValidate>
            <Card>
              <CardHeader>
                <CardTitle>Offer Details</CardTitle>
              </CardHeader>

              <CardContent className="space-y-4">
                <div>
                  <FieldLabel
                    required
                    info={
                <ul className="list-disc space-y-1 pl-4">
                  <li>
                    <b>Evergreen</b> — always-on, one per branch. Starts when we
                    approve it and has no end date.
                  </li>
                  <li>
                    <b>Flash</b> — up to {FLASH_MAX_DAYS} days, only while your
                    evergreen offer is live.
                  </li>
                </ul>
                    }
                  >
                    What kind of offer are you creating?
                  </FieldLabel>
            <div className="grid gap-3 sm:grid-cols-2 lg:max-w-2xl">
              {(
                [
                  { kind: "EVERGREEN", label: "Evergreen offer", hint: "Always-on, one per branch" },
                  {
                    kind: "FLASH",
                    label: "Flash offer",
                    hint: `Up to ${FLASH_MAX_DAYS} days, only while your evergreen is live`,
                  },
                ] as const
              ).map(({ kind, label, hint }) => {
                const locked = kindLocked(kind);
                const active = offerKind === kind;
                return (
                  <button
                    key={kind}
                    type="button"
                    disabled={locked || liveForeverLoading}
                    onClick={() => selectOfferKind(kind)}
                    aria-pressed={active}
                    className={`rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      active
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : errors.offerKind
                          ? "border-destructive"
                          : "hover:bg-muted/50"
                    }`}
                  >
                    <span className="block text-sm font-medium">{label}</span>
                    <span className="block text-xs text-muted-foreground">
                      {locked ? "Requires a live Evergreen offer" : hint}
                    </span>
                  </button>
                );
              })}
            </div>
            {!liveForeverLoading && !hasLiveForever && (
              <HintText>
                You don&apos;t have a live evergreen offer yet. Create one first —
                Flash offers unlock once it&apos;s live.
              </HintText>
            )}
            {!liveForeverLoading && hasLiveForever && !isEdit && !isReplacement && (
              <HintText>You already have a live evergreen offer. Submitting this one will ask to replace it.</HintText>
            )}
            <ErrorText message={errors.offerKind || errors.isForever} />
                </div>

              <div>
                <FieldLabel
                  htmlFor="title"
                  required
                  info={`The headline employees see on the offer card. Lead with the benefit, e.g. “20% off all main courses”. 5–${TITLE_MAX_CHARS} characters.`}
                >
                  Title
                </FieldLabel>
                <Input
                  id="title"
                  className={`${inputClass} ${borderFor(errors.title)}`}
                  value={form.title}
                  onChange={set("title")}
                  placeholder="e.g. 20% off all menu items"
                  maxLength={TITLE_MAX_CHARS}
                  aria-invalid={!!errors.title}
                />
                {errors.title ? (
                  <ErrorText message={errors.title} />
                ) : (
                  <HintText>
                    {form.title.length}/{TITLE_MAX_CHARS}
                  </HintText>
                )}
              </div>

              <div>
                <FieldLabel
                  htmlFor="description"
                  info="Full details shown on the offer page: what's included, what's excluded, and anything that makes the offer stand out."
                >
                  Description
                </FieldLabel>
                <textarea
                  id="description"
                  className={`${textareaClass} ${borderFor(errors.description)}`}
                  value={form.description}
                  onChange={set("description")}
                  placeholder="Tell employees about the offer"
                />
                {errors.description ? (
                  <ErrorText message={errors.description} />
                ) : (
                  <HintText>
                    {countWords(form.description)}/{DESCRIPTION_MAX_WORDS} words
                  </HintText>
                )}
              </div>

                <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel
                  htmlFor="category"
                  info="Set automatically from your business profile and can't be changed per offer. Contact support if it's wrong."
                >
                  Category
                </FieldLabel>
                <Input
                  id="category"
                  className={`${inputClass} md:max-w-md`}
                  value={categoryLoading ? "Loading..." : (merchantCategory?.name ?? "Not set")}
                  readOnly
                  disabled
                />
                <ErrorText message={errors.categoryId} />
              </div>

              <div>
                <FieldLabel
                  htmlFor="offerType"
                  required
                  info={
                    <ul className="list-disc space-y-1 pl-4">
                      <li><b>Flat amount</b> — a fixed € amount off (e.g. €10 off).</li>
                      <li><b>Percentage</b> — a % off the bill, capped by the maximum discount.</li>
                      <li><b>Buy X Get Y</b> — buy a quantity, get items free.</li>
                    </ul>
                  }
                >
                  Discount type
                </FieldLabel>
                <select
                  id="offerType"
                  name="offerType"
                  className={`${selectClass} ${borderFor(errors.offerType)}`}
                  value={form.offerType}
                  onChange={set("offerType")}
                >
                  <option value="PERCENTAGE">Percentage</option>
                  <option value="FLAT">Flat amount (€)</option>
                  <option value="BUY_X_GET_Y">Buy X Get Y</option>
                </select>
                <ErrorText message={errors.offerType} />
              </div>
                </div>

            {/* Channel + Branches */}
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <FieldLabel
                  required
                  info={
                    <ul className="list-disc space-y-1 pl-4">
                      <li><b>In-store</b> — employee shows a virtual card at your branch; verified automatically.</li>
                      <li><b>Online</b> — employee gets your promo code to use on your website.</li>
                      <li><b>Both</b> — the offer works in your branches and online.</li>
                    </ul>
                  }
                >
                  Channel
                </FieldLabel>
                <div
                  role="radiogroup"
                  aria-label="Channel"
                  className="inline-flex rounded-md border border-input p-0.5"
                >
                  {OFFER_CHANNELS.map((c) => {
                    const active = form.channel === c.value;
                    return (
                      <button
                        key={c.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setChannel(c.value)}
                        className={`rounded px-4 py-1.5 text-sm transition-colors ${
                          active
                            ? "bg-primary/10 font-medium text-primary"
                            : "text-foreground hover:bg-muted"
                        }`}
                      >
                        {c.label}
                      </button>
                    );
                  })}
                </div>
                {missingBranchesMsg && (
                  <div
                    role="alert"
                    className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
                  >
                    {missingBranchesMsg}{" "}
                    <Link href="/merchant/branches" className="font-medium underline">
                      Manage branches
                    </Link>
                  </div>
                )}
              </div>

              {usesBranches && (
                <div>
                  <FieldLabel
                    required
                    info="Which of your in-store branches accept this offer. Choose all branches, or pick at least one."
                  >
                    Branches
                  </FieldLabel>
                  <div
                    role="radiogroup"
                    aria-label="Branches"
                    className={`inline-flex rounded-md border p-0.5 ${
                      errors.branches ? "border-destructive" : "border-input"
                    }`}
                  >
                    {(
                      [
                        { all: true, label: "All branches" },
                        { all: false, label: "Choose branches" },
                      ] as const
                    ).map((o) => {
                      const active = form.allBranches === o.all;
                      return (
                        <button
                          key={o.label}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => setAllBranches(o.all)}
                          disabled={!o.all && isAdmin}
                          className={`rounded px-4 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                            active
                              ? "bg-primary/10 font-medium text-primary"
                              : "text-foreground hover:bg-muted"
                          }`}
                        >
                          {o.label}
                        </button>
                      );
                    })}
                  </div>

                  {!form.allBranches && (
                    <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-md border border-input p-2">
                      {branchesLoading ? (
                        <p className="text-xs text-muted-foreground">Loading branches…</p>
                      ) : branchesError ? (
                        <p className="text-xs text-destructive">Couldn&apos;t load your branches. Refresh and try again.</p>
                      ) : branchOptions.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          You have no in-store branches yet. Add one under Branches.
                        </p>
                      ) : (
                        branchOptions.map((b) => (
                          <label
                            key={b.id}
                            className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted/50"
                          >
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-primary"
                              checked={form.branchIds.includes(b.id)}
                              onChange={() => toggleBranch(b.id)}
                            />
                            <span>{b.name}</span>
                            {b.city && <span className="text-xs text-muted-foreground">· {b.city}</span>}
                            {b.isPrimary && <span className="text-xs text-muted-foreground">(main)</span>}
                          </label>
                        ))
                      )}
                    </div>
                  )}

                  {errors.branches ? (
                    <ErrorText message={errors.branches} />
                  ) : !form.allBranches && form.branchIds.length > 0 ? (
                    <HintText>
                      {form.branchIds.length} branch{form.branchIds.length > 1 ? "es" : ""} chosen
                    </HintText>
                  ) : form.allBranches ? (
                    <HintText>Every in-store branch, including ones you add later</HintText>
                  ) : null}
                </div>
              )}
            </div>

            {/* How employees redeem */}
            <div className="space-y-3">
              <p className="text-sm font-medium">How employees redeem</p>
              <div className="grid gap-4 md:grid-cols-3">
                {usesBranches && (
                  <div>
                    <FieldLabel
                      htmlFor="inStoreMethod"
                      info="In-store, the employee shows a virtual card with their name, company and a unique code to your staff. The redemption is verified automatically — no confirmation needed on your side."
                    >
                      In-store
                    </FieldLabel>
                    <Input id="inStoreMethod" className={inputClass} value="Virtual card" readOnly disabled />
                  </div>
                )}

                {hasOnlineCode && (
                  <>
                    <div>
                      <FieldLabel
                        htmlFor="redemptionCode"
                        required
                        info="The discount code employees enter at checkout. It must already be set up in your own checkout system. Use Generate for a random code, then create the same code on your side."
                      >
                        Promo code
                      </FieldLabel>
                      <div className="flex gap-2">
                        <Input
                          id="redemptionCode"
                          className={`${inputClass} flex-1 ${borderFor(errors.redemptionCode)}`}
                          value={form.redemptionCode}
                          onChange={(e) => {
                            // Codes are stored uppercase; strip anything that isn't a letter or digit.
                            e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
                            set("redemptionCode")(e);
                          }}
                          placeholder="e.g. SAVE10"
                          maxLength={OFFER_CODE_MAX_LENGTH}
                          aria-invalid={!!errors.redemptionCode}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleGenerateOfferCode}
                          className="h-9 shrink-0"
                        >
                          <Sparkles className="mr-1 h-4 w-4" />
                          Generate
                        </Button>
                      </div>
                      {errors.redemptionCode ? (
                        <ErrorText message={errors.redemptionCode} />
                      ) : (
                        <HintText>
                          {OFFER_CODE_MIN_LENGTH} to {OFFER_CODE_MAX_LENGTH} letters and numbers
                        </HintText>
                      )}
                    </div>

                    <div>
                      <FieldLabel
                        htmlFor="bookingUrl"
                        required
                        info="The page where employees enter the promo code — usually your checkout or booking page."
                      >
                        Booking link
                      </FieldLabel>
                      <Input
                        id="bookingUrl"
                        className={`${inputClass} ${borderFor(errors.bookingUrl)}`}
                        value={form.bookingUrl}
                        onChange={set("bookingUrl")}
                        placeholder="yourwebsite.com/offer"
                        inputMode="url"
                        aria-invalid={!!errors.bookingUrl}
                      />
                      {errors.bookingUrl ? (
                        <ErrorText message={errors.bookingUrl} />
                      ) : (
                        <HintText>We add https:// for you</HintText>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

                <div className="grid gap-4 sm:grid-cols-3">
              <div>
                {form.offerType === "FLAT" && (
                  <>
                    <FieldLabel
                      htmlFor="discountValue"
                      required
                      info="The fixed € amount taken off the bill, e.g. 10 means €10 off. Must be greater than 0, with up to 2 decimal places."
                    >
                      Discount
                    </FieldLabel>
                    <Input
                      id="discountValue"
                      className={`${inputClass} ${borderFor(flatError("discountValue"))}`}
                      type="number"
                      inputMode="decimal"
                      min={0.01}
                      step="0.01"
                      value={form.discountValue}
                      onKeyDown={blockNonMoneyKeys}
                      onChange={(e) => handleLinkedFieldChange("discountValue", e.target.value)}
                      placeholder="€ e.g. 10"
                      aria-invalid={!!flatError("discountValue")}
                    />
                    <ErrorText message={flatError("discountValue")} />
                  </>
                )}
                {form.offerType === "PERCENTAGE" && (
                  <>
                    <FieldLabel
                      htmlFor="discountPercent"
                      required
                      info={`Percentage taken off the bill, between ${PERCENT_MIN}% and ${PERCENT_MAX}% (up to 2 decimals).`}
                    >
                      Discount
                    </FieldLabel>
                    <Input
                      id="discountPercent"
                      className={`${inputClass} ${borderFor(pctError("discountPercent"))}`}
                      type="number"
                      inputMode="decimal"
                      min={PERCENT_MIN}
                      max={PERCENT_MAX}
                      step="0.01"
                      value={form.discountPercent}
                      onKeyDown={blockNonMoneyKeys}
                      onChange={(e) => handleLinkedFieldChange("discountPercent", e.target.value)}
                      placeholder="% e.g. 20"
                      aria-invalid={!!pctError("discountPercent")}
                    />
                    <ErrorText message={pctError("discountPercent")} />
                  </>
                )}
                {form.offerType === "BUY_X_GET_Y" && (
                  <>
                    <FieldLabel
                      htmlFor="buyQuantity"
                      required
                      info="How many items the employee must buy, e.g. 2 in “Buy 2 Get 1”."
                    >
                      Buy quantity
                    </FieldLabel>
                    <Input
                      id="buyQuantity"
                      className={`${inputClass} ${borderFor(errors.buyQuantity)}`}
                      type="number"
                      value={form.buyQuantity}
                      onChange={set("buyQuantity")}
                      placeholder="e.g. 2"
                    />
                    <ErrorText message={errors.buyQuantity} />
                  </>
                )}
              </div>

                  {(form.offerType === "FLAT" || form.offerType === "PERCENTAGE") && (
                  <div>
                    <FieldLabel
                      htmlFor="minimumSpend"
                      required
                      info={
                        form.offerType === "FLAT"
                          ? "The bill must reach this € amount before the discount applies. Must be more than the discount, so it stays below 100%."
                          : "The bill must reach this € amount before the discount applies. Unlocks once the discount % is valid."
                      }
                    >
                      Minimum spend
                    </FieldLabel>
                    {form.offerType === "FLAT" ? (
                      <>
                        <Input
                          id="minimumSpend"
                          className={`${inputClass} ${borderFor(flatDiscountValid ? flatError("minimumSpend") : undefined)}`}
                          type="number"
                          inputMode="decimal"
                          min={0.01}
                          step="0.01"
                          value={form.minimumSpend}
                          onKeyDown={blockNonMoneyKeys}
                          onChange={(e) => handleLinkedFieldChange("minimumSpend", e.target.value)}
                          disabled={!flatDiscountValid}
                          placeholder={flatDiscountValid ? "€ must be more than the discount" : "Enter a discount first"}
                          aria-invalid={!!flatError("minimumSpend")}
                        />
                        {flatDiscountValid && flatError("minimumSpend") ? (
                          <ErrorText message={flatError("minimumSpend")} />
                        ) : flatPercent !== null && flatPercent < 100 ? (
                          <HintText>Effective discount: {flatPercent.toFixed(2)}% of the minimum spend</HintText>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <Input
                          id="minimumSpend"
                          className={`${inputClass} ${borderFor(pctValid ? pctError("minimumSpend") : undefined)}`}
                          type="number"
                          inputMode="decimal"
                          min={0.01}
                          step="0.01"
                          value={form.minimumSpend}
                          onKeyDown={blockNonMoneyKeys}
                          onChange={(e) => handleLinkedFieldChange("minimumSpend", e.target.value)}
                          disabled={!pctValid}
                          placeholder={pctValid ? "€ e.g. 50" : "Enter a discount first"}
                          aria-invalid={!!pctError("minimumSpend")}
                        />
                        {pctValid && <ErrorText message={pctError("minimumSpend")} />}
                      </>
                    )}
                  </div>
                  )}

                  {form.offerType === "PERCENTAGE" && (
                    <div>
                      <FieldLabel
                        htmlFor="discountMax"
                        required
                        info="The most an employee can save per redemption, in €. Auto-filled as Minimum spend × Discount % — you can raise it, but it must stay below the minimum spend. Clear it to go back to auto."
                      >
                        Maximum discount
                      </FieldLabel>
                      <Input
                        id="discountMax"
                        className={`${inputClass} ${borderFor(pctMinSpendValid ? pctError("discountMax") : undefined)}`}
                        type="number"
                        inputMode="decimal"
                        min={0.01}
                        step="0.01"
                        value={form.discountMax}
                        onKeyDown={blockNonMoneyKeys}
                        onChange={(e) => handleLinkedFieldChange("discountMax", e.target.value)}
                        disabled={!pctMinSpendValid}
                        placeholder={pctMinSpendValid ? "€ cap amount" : "Enter minimum spend first"}
                        aria-invalid={!!pctError("discountMax")}
                      />
                      {pctMinSpendValid && pctError("discountMax") ? (
                        <ErrorText message={pctError("discountMax")} />
                      ) : pctMinSpendValid ? (
                        <HintText>
                          Allowed: €{suggestedPercentMax(form.discountPercent, form.minimumSpend)} up to below €
                          {Number(form.minimumSpend).toFixed(2)}
                        </HintText>
                      ) : null}
                    </div>
                  )}
                </div>

            {form.offerType === "BUY_X_GET_Y" && (
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <FieldLabel required info="The item (or item group) that must be bought, e.g. “Large pizza”.">
                    Buy item
                  </FieldLabel>
                  <Input
                    className={`${inputClass} ${borderFor(errors.buyItem)}`}
                    value={form.buyItem}
                    onChange={set("buyItem")}
                    placeholder="e.g. Pizza"
                  />
                  <ErrorText message={errors.buyItem} />
                </div>
                <div>
                  <FieldLabel required info="How many items are given free per qualifying purchase, e.g. 1 in “Buy 2 Get 1”.">
                    Get quantity
                  </FieldLabel>
                  <Input
                    className={`${inputClass} ${borderFor(errors.getQuantity)}`}
                    type="number"
                    value={form.getQuantity}
                    onChange={set("getQuantity")}
                    placeholder="e.g. 1"
                  />
                  <ErrorText message={errors.getQuantity} />
                </div>
                <div>
                  <FieldLabel required info="The item given free. Can be the same as the Buy item or different, e.g. “Soft drink”.">
                    Free item
                  </FieldLabel>
                  <Input
                    className={`${inputClass} ${borderFor(errors.freeItem)}`}
                    value={form.freeItem}
                    onChange={set("freeItem")}
                    placeholder="e.g. Pizza"
                  />
                  <ErrorText message={errors.freeItem} />
                </div>
              </div>
            )}

              {form.offerType === "BUY_X_GET_Y" && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <FieldLabel info="Optional cap on free items per redemption, so repeated qualifying purchases in one visit don't multiply the free items.">
                      Maximum free items
                    </FieldLabel>
                    <Input
                      className={`${inputClass} ${borderFor(errors.maxFreeItems)}`}
                      type="number"
                      value={form.maxFreeItems}
                      onChange={set("maxFreeItems")}
                      placeholder="Optional, empty means no limit"
                    />
                    <ErrorText message={errors.maxFreeItems} />
                  </div>
                  <div>
                    <FieldLabel info="Optional. The bill must reach this € amount before the free items apply.">
                      Minimum spend
                    </FieldLabel>
                    <Input
                      className={`${inputClass} ${borderFor(errors.minimumSpend)}`}
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.minimumSpend}
                      onChange={set("minimumSpend")}
                      placeholder="Optional, empty means no limit"
                    />
                    <ErrorText message={errors.minimumSpend} />
                  </div>
                </div>
              )}

            {showStrength &&
              ((form.offerType === "FLAT" && Number(form.discountValue) > 0) ||
                (form.offerType === "PERCENTAGE" && Number(form.discountPercent) > 0)) && (
                <OfferStrengthIndicator
                  discountValue={Number(
                    form.offerType === "PERCENTAGE" ? form.discountPercent : form.discountValue,
                  )}
                  offerType={form.offerType}
                  categoryId={merchantCategory?.slug ?? null}
                  minimumSpend={form.minimumSpend ? Number(form.minimumSpend) : undefined}
                  discountMax={form.discountMax ? Number(form.discountMax) : undefined}
                />
              )}

            {/* Frequency */}
            <div className="md:max-w-md">
              <FieldLabel
                htmlFor="frequency"
                required
                info="How often each employee can use this offer. Once a day, Once a week, Once a month or Unlimited."
              >
                Frequency
              </FieldLabel>
              <select
                id="frequency"
                name="frequency"
                className={`${selectClass} ${borderFor(errors.repeatAfterHours)}`}
                value={frequency ?? ""}
                onChange={(e) => setFrequency(e.target.value as OfferFrequency)}
              >
                {!frequency && (
                  <option value="" disabled>
                    Choose how often
                  </option>
                )}
                {OFFER_FREQUENCY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {errors.repeatAfterHours ? (
                <ErrorText message={errors.repeatAfterHours} />
              ) : (
                <HintText>
                  How often each employee can use this offer. Once a day, Once a
                  week, Once a month or Unlimited.
                </HintText>
              )}
              <ErrorText message={errors.maxRedemptions} />
            </div>

            {/* Dates */}
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <FieldLabel
                  htmlFor="startDate"
                  required={!form.isForever}
                  info={
                    form.isForever
                      ? "Evergreen offers go live as soon as we approve them."
                      : "When the offer goes live, in Cyprus time. The offer only appears after it's approved, even if this date has passed."
                  }
                >
                  Start date
                </FieldLabel>
                {form.isForever ? (
                  <>
                    <Input id="startDate" className={inputClass} value="On approval" readOnly disabled />
                    <HintText>Evergreen offers start when we approve them</HintText>
                  </>
                ) : (
                  <>
                    <Input
                      id="startDate"
                      className={`${inputClass} ${borderFor(errors.startDate)}`}
                      type="datetime-local"
                      value={form.startDate}
                      onChange={set("startDate")}
                    />
                    <ErrorText message={errors.startDate} />
                  </>
                )}
              </div>

              {/* Evergreen offers have no end date. */}
              {!form.isForever && (
                <div>
                  <FieldLabel
                    htmlFor="endDate"
                    required
                    info={`When the offer stops being available, in Cyprus time. Flash offers must end within ${FLASH_MAX_DAYS} days of the start.`}
                  >
                    End date
                  </FieldLabel>
                  <Input
                    id="endDate"
                    className={`${inputClass} ${borderFor(errors.endDate)}`}
                    type="datetime-local"
                    value={form.endDate}
                    onChange={set("endDate")}
                    min={form.startDate || undefined}
                    max={form.isFlash ? flashMaxEndLocal(form.startDate) || undefined : undefined}
                  />
                  {errors.endDate ? (
                    <ErrorText message={errors.endDate} />
                  ) : form.isFlash && form.startDate ? (
                    <HintText>Flash offers must end within {FLASH_MAX_DAYS} days of the start date</HintText>
                  ) : null}
                </div>
              )}
            </div>
            {form.isForever && (
              <p className="-mt-3 text-xs text-muted-foreground">
                Evergreen offers have no end date. Dates use DD/MM/YYYY, Cyprus time.
              </p>
            )}

              <div>
                <FieldLabel
                  required
                  info="Days of the week the offer can be redeemed. Deselect days you don't want it used, e.g. busy weekends."
                >
                  Available days
                </FieldLabel>
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
                        aria-pressed={selected}
                        className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                          selected
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:bg-muted/80"
                        }`}
                      >
                        {day.short}
                      </button>
                    );
                  })}
                </div>
                {errors.daysOfWeek ? (
                  <ErrorText message={errors.daysOfWeek} />
                ) : (
                  <HintText>
                    {(() => {
                      const sel = form.daysOfWeek.split(",").filter(Boolean);
                      if (sel.length === 7) return "Every day";
                      return sel
                        .map((s) => DAYS_OF_WEEK.find((d) => d.value === Number(s))?.short)
                        .join(" • ");
                    })()}
                  </HintText>
                )}
              </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Offer Banner
                  <InfoTip>
                    Images shown on the offer card and detail page. The first
                    image is the main banner — use the arrows to reorder. See
                    the size guidance on the right.
                  </InfoTip>
                </CardTitle>
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
                <FieldLabel
                  htmlFor="redemptionInstructions"
                  info="Step-by-step guidance shown to employees, e.g. “Enter the code at checkout” or “Show the card before ordering”."
                >
                  Redemption instructions
                </FieldLabel>
                <textarea
                  id="redemptionInstructions"
                  className={`${textareaClass} border-input`}
                  value={form.redemptionInstructions}
                  onChange={set("redemptionInstructions")}
                  placeholder="Optional. How employees redeem this offer"
                />
              </div>

              <div>
                <FieldLabel
                  htmlFor="termsAndConditions"
                  info="Rules employees must follow, e.g. “Valid Mon to Fri only”, “Not valid with other offers”. Write exclusions here."
                >
                  Terms and conditions
                </FieldLabel>
                <textarea
                  id="termsAndConditions"
                  className={`${textareaClass} ${borderFor(errors.termsAndConditions)}`}
                  value={form.termsAndConditions}
                  onChange={set("termsAndConditions")}
                  placeholder="e.g. valid Mon to Fri only, excludes chairs"
                />
                {errors.termsAndConditions ? (
                  <ErrorText message={errors.termsAndConditions} />
                ) : (
                  <HintText>Optional. Write specific conditions such as valid days and exclusions. Leave empty for no terms.</HintText>
                )}
              </div>

              <div>
                <FieldLabel
                  htmlFor="submissionNotes"
                  info="Private notes for the review team only — employees never see this."
                >
                  Notes for the review team
                </FieldLabel>
                <textarea
                  id="submissionNotes"
                  className={`${textareaClass} min-h-[60px] border-input`}
                  value={form.submissionNotes}
                  onChange={set("submissionNotes")}
                  placeholder="Optional"
                />
              </div>
              </CardContent>
            </Card>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => (onCancel ? onCancel() : router.push(fallbackRoute))}
          >
            Cancel
          </Button>

          {isReplacement || !isEdit ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={handleSaveDraft}
                disabled={isBusy || hasFlatErrors}
              >
                {pendingAction === "draft" && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                Save as draft
              </Button>
              <Button
                type="submit"
                disabled={isBusy || categoryLoading || missingCategory || hasFlatErrors}
                title={missingCategory ? "Your business category must be set before submitting" : undefined}
              >
                {pendingAction === "submit" && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                {pendingAction === "submit"
                  ? "Submitting..."
                  : isReplacement
                    ? "Submit replacement"
                    : "Submit for review"}
              </Button>
            </>
          ) : (
            <Button
              type="submit"
              disabled={isBusy || categoryLoading || missingCategory || hasFlatErrors}
            >
              {pendingAction === "submit" && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {pendingAction === "submit" ? "Saving..." : "Save changes"}
            </Button>
          )}
        </div>
          </form>
        </div>

        {/* Right column — preview panel */}
        <div className="min-w-0 space-y-6 lg:self-stretch">
          <OfferBannerInfo imageUrls={form.imageUrls} />
          <div className="lg:sticky lg:top-0">
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
                discountValue={
                  form.offerType === "PERCENTAGE" ? form.discountPercent : form.discountValue
                }
                offerType={form.offerType}
                startDate={form.startDate}
                endDate={form.endDate}
                imageUrls={previewImageUrls}
                isFeatured={form.isFeatured}
                isExclusive={form.isExclusive}
                merchantName="Your Business"
                categoryName={categoryName}
                redemptionType={form.redemptionType}
                channel={form.channel}
                minSpend={form.minimumSpend}
              />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={!!evergreenConfirm}
        title="Replace your live Evergreen offer?"
        message={`Only one Evergreen offer can be live per account. Your current Evergreen offer${
          evergreenConfirm?.title ? ` "${evergreenConfirm.title}"` : ""
        } will become inactive once this new offer is approved by admin and goes LIVE.`}
        confirmLabel="Yes, submit for approval"
        variant="default"
        loading={pendingAction === "submit"}
        onCancel={() => setEvergreenConfirm(null)}
        onConfirm={handleConfirmReplaceEvergreen}
      />
    </div>
  );
}
