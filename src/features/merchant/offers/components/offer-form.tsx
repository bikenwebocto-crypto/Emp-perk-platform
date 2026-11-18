"use client";
import { useState, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { generateOfferCode, OFFER_CODE_MIN_LENGTH, OFFER_CODE_MAX_LENGTH } from "@/lib/offer-code.shared";

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

const FOREVER_YEARS = 5;

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

/** "48" → "2"; "36" → "1.5"; empty/invalid → "". */
function hoursToDays(hours: string): string {
  const h = Number(hours);
  if (!hours || !(h > 0)) return "";
  return String(Math.round((h / 24) * 100) / 100);
}

/** 30 → "1 day 6 hours", 48 → "2 days", 5 → "5 hours". */
function formatRepeat(hours: number): string {
  const d = Math.floor(hours / 24);
  const h = Math.round((hours % 24) * 100) / 100;
  const parts: string[] = [];
  if (d) parts.push(`${d} day${d === 1 ? "" : "s"}`);
  if (h) parts.push(`${h} hour${h === 1 ? "" : "s"}`);
  return parts.join(" ") || `${hours} hours`;
}

type OfferKind ="EVERGREEN" | "FLASH" | "REGULAR";

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

/** Number inputs accept e/E/+/- ; money fields never need them. */
function blockNonMoneyKeys(e: React.KeyboardEvent<HTMLInputElement>) {
  if (["e", "E", "+", "-"].includes(e.key)) e.preventDefault();
}

function getTargetOfferCodeLength(currentValue: string): number {
  const length = Number(currentValue.trim().length);
  if (!Number.isFinite(length) || length <= 0) {
    return OFFER_CODE_MIN_LENGTH;
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
      // Flash / Regular are now unlocked.
      queryClient.invalidateQueries({ queryKey: ["merchant-has-live-forever"] });
    } else {
      showToast({ type: "success", title: fallbackTitle });
    }
  };
  const [errors, setErrors] = useState<FormErrors>({});
  const [showStrength, setShowStrength] = useState(false);
  const [pendingAction, setPendingAction] = useState<"draft" | "submit" | null>(null);
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
    repeatAfterHours: initialData?.repeatAfterHours ?? "",
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
    redemptionType: initialData?.redemptionType ?? "ONLINE_CODE",
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
        if (field === "startDate" && prev.isForever && e.target.value) {
          const end = new Date(e.target.value);
          if (!isNaN(end.getTime())) {
            end.setFullYear(end.getFullYear() + FOREVER_YEARS);
            next.endDate = dateToLocalInput(end);
          }
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

  /** Forever on → start = now (if unset), end = start + 5 years. Off → clear the long end date. */
  const toggleForever = (on: boolean) => {
    setForm((prev) => {
      if (on) {
        const start = prev.startDate || dateToLocalInput(new Date());
        const end = new Date(start);
        end.setFullYear(end.getFullYear() + FOREVER_YEARS);
        return {
          ...prev,
          isForever: true,
          isFlash: false,
          startDate: start,
          endDate: dateToLocalInput(end),
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

  const offerKind: OfferKind = form.isForever ? "EVERGREEN" : form.isFlash ? "FLASH" : "REGULAR";
  // Flash/Regular need a live Evergreen. Keep an offer's existing kind selectable when editing.
  const kindLocked = (kind: OfferKind) =>
    kind !== "EVERGREEN" && !hasLiveForever && !(isEdit && offerKind === kind);

  const selectOfferKind = (kind: OfferKind) => {
    if (kindLocked(kind)) return;
    if (kind === "EVERGREEN") toggleForever(true);
    else if (kind === "FLASH") toggleFlash(true);
    else {
      if (form.isForever) toggleForever(false);
      if (form.isFlash) toggleFlash(false);
    }
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
    if (!hasLiveForever && !form.isForever) toggleForever(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveForeverLoading, hasLiveForever, isEdit]);

  // Repeat-after: days drive hours (days × 24); hours stay editable and back-fill days.
  const [repeatDays, setRepeatDays] = useState(() =>
    hoursToDays(initialData?.repeatAfterHours ?? ""),
  );
  const setRepeatHours = (hours: string, syncDays = true) => {
    setForm((prev) => ({ ...prev, repeatAfterHours: hours }));
    if (syncDays) setRepeatDays(hoursToDays(hours));
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

  const handleGenerateOfferCode = () => {
    const nextCode = generateOfferCode(getTargetOfferCodeLength(form.redemptionCode));
    setForm((prev) => ({ ...prev, redemptionCode: nextCode }));
    setErrors((prev) => {
      const n = { ...prev };
      delete n.redemptionCode;
      return n;
    });
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
    if (offerKind !== "EVERGREEN" && kindLocked(offerKind))
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

    if (form.redemptionType === "ONLINE_CODE") {
      if (!form.bookingUrl.trim()) errs.bookingUrl = "Booking URL is required";
      else if (!/^https?:\/\/\S+$/i.test(form.bookingUrl.trim()))
        errs.bookingUrl = "Enter a valid URL starting with http:// or https://";
      if (!form.redemptionCode.trim()) errs.redemptionCode = "Offer code is required";
      else if (!/^[A-Za-z0-9]{6,30}$/.test(form.redemptionCode.trim()))
        errs.redemptionCode = "Offer code must be between 6 and 30 letters or numbers.";
    }

    if (!form.startDate.trim()) errs.startDate = "Start date is required";
    if (!form.endDate.trim()) errs.endDate = "End date is required";
    else if (
      form.startDate &&
      new Date(form.endDate) <= new Date(form.startDate)
    )
      errs.endDate = "End date must be after start date";
    else {
      const flashError = validateFlashWindow(form.isFlash, form.startDate, form.endDate);
      if (flashError) errs.endDate = flashError;
    }
    // Server rejects submissions without T&C, so require it client-side too.
    if (!form.termsAndConditions.trim())
      errs.termsAndConditions = "Terms and conditions are required";

    if (form.isFlash && form.isForever)
      errs.isForever = "An offer cannot be both Flash and Forever";

    if (form.maxRedemptions.trim()) {
      const mr = Number(form.maxRedemptions);
      if (!Number.isInteger(mr) || mr <= 0)
        errs.maxRedemptions = "Must be a whole number greater than 0";
    }

    if (form.repeatAfterHours && !(Number(form.repeatAfterHours) > 0))
      errs.repeatAfterHours = "Must be a positive number of hours";

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
    const count = Object.keys(errs).length;
    if (count > 0) {
      showToast({
        type: "error",
        title: `Please fix ${count} field${count > 1 ? "s" : ""} before submitting`,
        description: Object.values(errs)[0],
      });
    }
    return count === 0;
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
    endDate: localInputToIso(form.endDate),
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
    // Don't send stale code/URL left over from a previously selected redemption type.
    ...(form.redemptionType !== "ONLINE_CODE" ? { redemptionCode: null } : {}),
    bookingUrl:
      form.redemptionType === "ONLINE_CODE" || form.redemptionType === "BOOKING_LINK"
        ? form.bookingUrl || null
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
      showToast({
        type: "error",
        title: "Failed to save draft",
        description: err.message,
      });
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
    if (!validate()) return;

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

  /** Returns true once the offer is saved and we're navigating away. */
  const doSubmit = async (): Promise<boolean> => {
    const allUrls = await resolveAllImageUrls();
    if (allUrls === null) return false;

    const body = withMerchant({ ...buildBody(false), imageUrls: allUrls });

    if (isEdit) {
      try {
        const result = await submitOffer.mutateAsync({
          id: offerId,
          ...body,
        });
        if (result.qualityCheck === "PASSED") {
          showSubmitSuccess(result, "Offer submitted for review");
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
        showToast({
          type: "error",
          title: "Submission failed",
          description: err.message,
        });
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
              : "Offer submitted for review",
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
        showToast({
          type: "error",
          title: "Failed to submit",
          description: err.message,
        });
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
            <FieldLabel
              htmlFor="replacementReason"
              info="Only visible to the admin team. Explain what changed (e.g. better discount, new menu) so the replacement can be approved faster."
            >
              Reason for replacement
            </FieldLabel>

            <textarea
              id="replacementReason"
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)] lg:items-start">
        {/* Left column — form fields */}
        <div className="min-w-0 space-y-6">
          <form onSubmit={handleSubmit} className="space-y-6">
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
                        <li><b>Evergreen</b> — always-on offer, dates set {FOREVER_YEARS} years from the start. Only one live at a time.</li>
                        <li><b>Flash</b> — short, up to {FLASH_MAX_DAYS} days. Needs a live Evergreen offer.</li>
                        <li><b>Regular</b> — a normal dated offer. Needs a live Evergreen offer.</li>
                      </ul>
                    }
                  >
                    What kind of offer are you creating?
                  </FieldLabel>
                  <div className="mt-2 grid gap-3 sm:grid-cols-3">
                    {(
                      [
                        { kind: "EVERGREEN", label: "Evergreen Offer", hint: "Always-on, one live at a time" },
                        { kind: "FLASH", label: "Flash Offer", hint: `Up to ${FLASH_MAX_DAYS} days` },
                        { kind: "REGULAR", label: "Regular Offer", hint: "Normal start and end dates" },
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
                            active ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50"
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
                    <p className="mt-2 text-xs text-muted-foreground">
                      You don&apos;t have a live Evergreen offer yet. Create one first —
                      Flash and Regular offers unlock once it&apos;s live.
                    </p>
                  )}
                  {(errors.offerKind || errors.isForever) && (
                    <p className="mt-1 text-xs text-destructive">
                      {errors.offerKind || errors.isForever}
                    </p>
                  )}
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
                    className={inputClass}
                    value={form.title}
                    onChange={set("title")}
                    placeholder="e.g. 20% Off All Menu Items"
                    maxLength={TITLE_MAX_CHARS}
                  />

                  {errors.title ? (
                    <p className="mt-1 text-xs text-destructive">
                      {errors.title}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {form.title.length}/{TITLE_MAX_CHARS}
                    </p>
                  )}
                </div>

                <div>
                  {/* <FieldLabel
                    htmlFor="shortDescription"
                    info="One-line summary shown under the title in offer lists. Keep it scannable."
                  >
                    Short Description
                  </FieldLabel> */}

                  <Input
                    id="shortDescription"
                    className={inputClass}
                    value={form.shortDescription}
                    onChange={set("shortDescription")}
          
                    style={{ display: "none" }}
                  />
                  {/* {errors.shortDescription ? (
                    <p className="mt-1 text-xs text-destructive">{errors.shortDescription}</p>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {countWords(form.shortDescription)}/{DESCRIPTION_MAX_WORDS} words
                    </p>
                  )} */}
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
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    value={form.description}
                    onChange={set("description")}
                    placeholder={`Full offer description (max ${DESCRIPTION_MAX_WORDS} words)`}
                  />
                  {errors.description ? (
                    <p className="mt-1 text-xs text-destructive">{errors.description}</p>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {countWords(form.description)}/{DESCRIPTION_MAX_WORDS} words
                    </p>
                  )}
                </div>
                
                <div className="grid gap-4 sm:grid-cols-2">
                  {/* <div>
                    <FieldLabel info="Request a highlighted placement in the app. Cannot be combined with Exclusive — turning one on turns the other off. Final placement is decided during review.">
                      Featured Offer
                    </FieldLabel>
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
                  </div> */}

                  {/* <div>
                    <FieldLabel info="Mark this as only available through this platform (not offered to the general public). Cannot be combined with Featured.">
                      Exclusive Offer
                    </FieldLabel>
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
                  </div> */}
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
                    <FieldLabel
                      htmlFor="offerType"
                      required
                      info={
                        <ul className="list-disc space-y-1 pl-4">
                          <li><b>Flat Amount</b> — a fixed amount off (e.g. 10 off).</li>
                          <li><b>Percentage</b> — a % off the bill, optionally capped.</li>
                          <li><b>Buy X Get Y</b> — buy a quantity, get items free.</li>
                        </ul>
                      }
                    >
                      Offer Type
                    </FieldLabel>

                    <select
                      id="offerType"
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
                  <FieldLabel
                    htmlFor="redemptionType"
                    required
                    info={
                      <ul className="list-disc space-y-1 pl-4">
                        <li><b>Online Code</b> — employee gets your code and uses it on your website/booking page.</li>
                        <li><b>Virtual Card</b> — employee shows a card in-store; redemption is verified automatically.</li>
                      </ul>
                    }
                  >
                    Redemption Type
                  </FieldLabel>

                  <select
                    id="redemptionType"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    value={form.redemptionType}
                    onChange={set("redemptionType")}
                    name="redemptionType"
                  >
                    {/* <option value="IN_STORE_QR">In-Store QR Code</option> */}
                    <option value="ONLINE_CODE">Online Code</option>

                     {/*<option value="BOOKING_LINK">Booking Link</option> */}
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
                        <FieldLabel
                          htmlFor="bookingUrl"
                          required
                          info="The page where employees enter the offer code — usually your checkout or booking page. Must start with http:// or https://."
                        >
                          Booking URL
                        </FieldLabel>

                        <Input
                          id="bookingUrl"
                          className={inputClass}
                          value={form.bookingUrl}
                          onChange={set("bookingUrl")}
                          placeholder="https://merchant-website.com/offer"
                          type="url"
                        />

                        {errors.bookingUrl ? (
                          <p className="mt-1 text-xs text-destructive">{errors.bookingUrl}</p>
                        ) : (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Where employees will be directed to use their code
                          </p>
                        )}
                      </div>

                      <div>
                        <FieldLabel
                          htmlFor="redemptionCode"
                          required
                          info="The discount code employees enter at checkout. It must already be set up in your own checkout system. Use Generate for a random code, then create the same code on your side."
                        >
                          Offer Code
                        </FieldLabel>

                        <div className="flex gap-2">
                          <Input
                            id="redemptionCode"
                            className={`${inputClass} flex-1`}
                            value={form.redemptionCode}
                            onChange={set("redemptionCode")}
                            placeholder="e.g. SAVE10CODE24"
                            minLength={OFFER_CODE_MIN_LENGTH}
                            maxLength={OFFER_CODE_MAX_LENGTH}
                          />

                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleGenerateOfferCode}
                            className="shrink-0"
                          >
                            <Sparkles className="mr-1 h-4 w-4" />
                            Generate
                          </Button>
                        </div>

                        {errors.redemptionCode ? (
                          <p className="mt-1 text-xs text-destructive">{errors.redemptionCode}</p>
                        ) : (
                          <p className="mt-1 text-xs text-muted-foreground">
                            6–30 character alphanumeric code employees enter at checkout.
                          </p>
                        )}
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
                        <FieldLabel required info="Direct link to your booking system where the offer applies.">
                          Booking URL
                        </FieldLabel>

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
                      <FieldLabel
                        htmlFor="discountValue"
                        required
                        info="The fixed amount taken off the bill, e.g. 10 means 10 off. Enter this first — it unlocks Minimum Spend. Must be greater than 0, with up to 2 decimal places."
                      >
                        Discount Amount
                      </FieldLabel>

                      <Input
                        id="discountValue"
                        className={inputClass}
                        type="number"
                        inputMode="decimal"
                        min={0.01}
                        step="0.01"
                        value={form.discountValue}
                        onKeyDown={blockNonMoneyKeys}
                        onChange={(e) =>
                          handleLinkedFieldChange(
                            "discountValue",
                            e.target.value,
                          )
                        }
                        placeholder="e.g. 10"
                        aria-invalid={!!flatError("discountValue")}
                      />

                      {flatError("discountValue") && (
                        <p className="mt-1 text-xs text-destructive">
                          {flatError("discountValue")}
                        </p>
                      )}
                    </div>

                    <div>
                      <FieldLabel
                        htmlFor="minimumSpendFlat"
                        required
                        info="The bill must reach this amount before the discount applies. Must be strictly greater than the Discount Amount, so the discount is always below 100% (e.g. 10 off a 50 minimum = 20%)."
                      >
                        Minimum Spend
                      </FieldLabel>

                      <Input
                        id="minimumSpendFlat"
                        className={inputClass}
                        type="number"
                        inputMode="decimal"
                        min={0.01}
                        step="0.01"
                        value={form.minimumSpend}
                        onKeyDown={blockNonMoneyKeys}
                        onChange={(e) =>
                          handleLinkedFieldChange("minimumSpend", e.target.value)
                        }
                        disabled={!flatDiscountValid}
                        placeholder={
                          flatDiscountValid
                            ? "Must be more than the discount"
                            : "Enter a discount amount first"
                        }
                        aria-invalid={!!flatError("minimumSpend")}
                      />

                      {flatDiscountValid && flatError("minimumSpend") ? (
                        <p className="mt-1 text-xs text-destructive">
                          {flatError("minimumSpend")}
                        </p>
                      ) : flatPercent !== null && flatPercent < 100 ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Effective discount: {flatPercent.toFixed(2)}% of the minimum spend
                        </p>
                      ) : !flatDiscountValid ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Enter a valid discount amount to unlock this field.
                        </p>
                      ) : null}
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
                        <FieldLabel
                          htmlFor="discountPercent"
                          required
                          info={`Percentage taken off the bill, between ${PERCENT_MIN}% and ${PERCENT_MAX}% (up to 2 decimals). Enter this first — it unlocks Minimum Spend.`}
                        >
                          Discount %
                        </FieldLabel>

                        <Input
                          id="discountPercent"
                          className={inputClass}
                          type="number"
                          inputMode="decimal"
                          min={PERCENT_MIN}
                          max={PERCENT_MAX}
                          step="0.01"
                          value={form.discountPercent}
                          onKeyDown={blockNonMoneyKeys}
                          onChange={(e) =>
                            handleLinkedFieldChange(
                              "discountPercent",
                              e.target.value,
                            )
                          }
                          placeholder="e.g. 20"
                          aria-invalid={!!pctError("discountPercent")}
                        />

                        {pctError("discountPercent") && (
                          <p className="mt-1 text-xs text-destructive">
                            {pctError("discountPercent")}
                          </p>
                        )}
                      </div>

                      <div>
                        <FieldLabel
                          htmlFor="minimumSpendPct"
                          required
                          info="The bill must reach this amount before the discount applies. Unlocks once Discount % is valid."
                        >
                          Minimum Spend
                        </FieldLabel>

                        <Input
                          id="minimumSpendPct"
                          className={inputClass}
                          type="number"
                          inputMode="decimal"
                          min={0.01}
                          step="0.01"
                          value={form.minimumSpend}
                          onKeyDown={blockNonMoneyKeys}
                          onChange={(e) =>
                            handleLinkedFieldChange(
                              "minimumSpend",
                              e.target.value,
                            )
                          }
                          disabled={!pctValid}
                          placeholder={pctValid ? "e.g. 50" : "Enter Discount % first"}
                          aria-invalid={!!pctError("minimumSpend")}
                        />

                        {pctValid && pctError("minimumSpend") && (
                          <p className="mt-1 text-xs text-destructive">
                            {pctError("minimumSpend")}
                          </p>
                        )}
                      </div>

                      <div>
                        <FieldLabel
                          htmlFor="discountMax"
                          required
                          info="The most an employee can save per redemption. Auto-filled as Minimum Spend × Discount % — you can raise it, but it must stay below the Minimum Spend and can't be lower than the auto-filled value. Clear it to go back to auto."
                        >
                          Maximum Discount
                        </FieldLabel>

                        <Input
                          id="discountMax"
                          className={inputClass}
                          type="number"
                          inputMode="decimal"
                          min={0.01}
                          step="0.01"
                          value={form.discountMax}
                          onKeyDown={blockNonMoneyKeys}
                          onChange={(e) =>
                            handleLinkedFieldChange(
                              "discountMax",
                              e.target.value,
                            )
                          }
                          disabled={!pctMinSpendValid}
                          placeholder={pctMinSpendValid ? "Cap amount" : "Enter Minimum Spend first"}
                          aria-invalid={!!pctError("discountMax")}
                        />

                        {pctMinSpendValid && pctError("discountMax") ? (
                          <p className="mt-1 text-xs text-destructive">
                            {pctError("discountMax")}
                          </p>
                        ) : pctMinSpendValid ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Allowed: {suggestedPercentMax(form.discountPercent, form.minimumSpend)} up to below {Number(form.minimumSpend).toFixed(2)}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    {showStrength &&
                      form.discountPercent &&
                      Number(form.discountPercent) > 0 && (
                        <OfferStrengthIndicator
                          discountValue={Number(form.discountPercent)}
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
                          <h4 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                            Campaign Liability Estimate
                            <InfoTip>
                              The most this offer could cost you if every
                              redemption hits the maximum discount. Actual cost
                              is usually lower.
                            </InfoTip>
                          </h4>

                          <p className="text-sm font-medium">
                            Total potential payout:{" "}
                            {(
                              Number(form.discountMax) *
                              Number(form.maxRedemptions)
                            ).toLocaleString("en-GB", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </p>

                          <p className="text-xs text-muted-foreground">
                            Based on {form.maxRedemptions} max redemptions ×{" "}
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
                        <FieldLabel required info="How many items the employee must buy, e.g. 2 in “Buy 2 Get 1”.">
                          Buy Quantity
                        </FieldLabel>

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
                        <FieldLabel required info="The item (or item group) that must be bought, e.g. “Large pizza”.">
                          Buy Item
                        </FieldLabel>

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
                        <FieldLabel required info="How many items are given free per qualifying purchase, e.g. 1 in “Buy 2 Get 1”.">
                          Get Quantity
                        </FieldLabel>

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
                        <FieldLabel required info="The item given free. Can be the same as the Buy Item or different, e.g. “Soft drink”.">
                          Free Item
                        </FieldLabel>

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
                        <FieldLabel info="Optional cap on free items per redemption, so repeated qualifying purchases in one visit don't multiply the free items.">
                          Maximum Free Items
                        </FieldLabel>

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
                        <FieldLabel info="Optional. The bill must reach this amount before the free items apply.">
                          Minimum Spend
                        </FieldLabel>

                        <Input
                          className={inputClass}
                          type="number"
                          min={0}
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
                  <FieldLabel
                    htmlFor="maxRedemptions"
                    info="Total number of times this offer can be redeemed across all employees. Once reached, the offer stops being available. Leave empty for unlimited."
                  >
                    Max Redemptions
                  </FieldLabel>

                  <Input
                    id="maxRedemptions"
                    className={inputClass}
                    type="number"
                    min={1}
                    step={1}
                    value={form.maxRedemptions}
                    onChange={set("maxRedemptions")}
                    placeholder="Unlimited if empty"
                  />
                  {errors.maxRedemptions && (
                    <p className="mt-1 text-xs text-destructive">
                      {errors.maxRedemptions}
                    </p>
                  )}
                </div>

                <div>
                  <FieldLabel
                    htmlFor="repeatAfterHours"
                    info="How long an employee must wait before redeeming this offer again. E.g. 24 = once per day, 168 = once per week. Leave empty to allow only one redemption per employee."
                  >
                    Repeat after
                  </FieldLabel>

                  <div className="mt-1 flex flex-wrap gap-2">
                    {[1, 2, 3, 7, 14, 30].map((d) => {
                      const active = Number(form.repeatAfterHours) === d * 24;
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setRepeatHours(active ? "" : String(d * 24))}
                          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                            active
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground hover:bg-muted/80"
                          }`}
                        >
                          {d === 1 ? "1 day" : d === 7 ? "1 week" : d === 30 ? "30 days" : `${d} days`}
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="repeatAfterDays" className="text-xs text-muted-foreground">
                        Days
                      </label>
                      <Input
                        id="repeatAfterDays"
                        placeholder="e.g. 1"
                        className={inputClass}
                        type="number"
                        min={1}
                        step={1}
                        onKeyDown={blockNonMoneyKeys}
                        value={repeatDays}
                        onChange={(e) => {
                          const v = e.target.value;
                          setRepeatDays(v);
                          const d = Number(v);
                          setRepeatHours(v && d > 0 ? String(Math.round(d * 24)) : "", false);
                        }}
                      />
                    </div>
                    <div>
                      <label htmlFor="repeatAfterHours" className="text-xs text-muted-foreground">
                        Hours (auto-filled, editable)
                      </label>
                      <Input
                        id="repeatAfterHours"
                        placeholder="e.g. 24"
                        className={inputClass}
                        type="number"
                        min={1}
                        onKeyDown={blockNonMoneyKeys}
                        value={form.repeatAfterHours}
                        onChange={(e) => setRepeatHours(e.target.value)}
                      />
                    </div>
                  </div>

                  <p className="mt-1 text-xs text-muted-foreground">
                    {Number(form.repeatAfterHours) > 0
                      ? `Employees can redeem again every ${formatRepeat(Number(form.repeatAfterHours))}.`
                      : "Leave empty for one redemption per employee"}
                  </p>

                  {errors.repeatAfterHours && (
                    <p className="mt-1 text-xs text-destructive">
                      {errors.repeatAfterHours}
                    </p>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <FieldLabel
                      htmlFor="startDate"
                      required
                      info="When the offer goes live, in your local time. The offer only appears after it's approved, even if this date has passed."
                    >
                      Start Date
                    </FieldLabel>

                    <Input
                      id="startDate"
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
                    <FieldLabel
                      htmlFor="endDate"
                      required
                      info="When the offer stops being available, in your local time. Must be after the start date. Flash offers must end within a few days of the start."
                    >
                      End Date
                    </FieldLabel>

                    <Input
                      id="endDate"
                      className={inputClass}
                      type="datetime-local"
                      value={form.endDate}
                      onChange={set("endDate")}
                      min={form.startDate || undefined}
                      max={form.isFlash ? flashMaxEndLocal(form.startDate) || undefined : undefined}
                    />
                    {form.isFlash && form.startDate && !errors.endDate && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Flash offers must end within {FLASH_MAX_DAYS} days of the start date
                      </p>
                    )}

                    {errors.endDate && (
                      <p className="mt-1 text-xs text-destructive">
                        {errors.endDate}
                      </p>
                    )}
                  </div>
                </div>
                {/* Days of Week */}
                <div>
                  <FieldLabel
                    required
                    info="Days of the week the offer can be redeemed. Deselect days you don't want it used, e.g. busy weekends."
                  >
                    Available Days
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
                    Redemption Instructions
                  </FieldLabel>

                  <textarea
                    id="redemptionInstructions"
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    value={form.redemptionInstructions}
                    onChange={set("redemptionInstructions")}
                    placeholder="Instructions for redeeming this offer"
                  />
                </div>

                <div>
                  <FieldLabel
                    htmlFor="termsAndConditions"
                    required
                    info="Rules employees must follow, e.g. “Not valid with other offers”, “Dine-in only”, “One per table”. Required to submit."
                  >
                    Terms & Conditions
                  </FieldLabel>

                  <textarea
                    id="termsAndConditions"
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
                  <FieldLabel
                    htmlFor="submissionNotes"
                    info="Private notes for the review team only — employees never see this."
                  >
                    Submission Notes
                  </FieldLabel>

                  <textarea
                    id="submissionNotes"
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
                    disabled={isBusy || hasFlatErrors}
                  >
                    {pendingAction === "draft" ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-1 h-4 w-4" />
                    )}
                    Save as Draft
                  </Button>

                  <Button
                    type="submit"
                    disabled={isBusy || categoryLoading || missingCategory || hasFlatErrors}
                    title={missingCategory ? "Your business category must be set before submitting" : undefined}
                  >
                    {pendingAction === "submit" ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="mr-1 h-4 w-4" />
                    )}

                    {pendingAction === "submit"
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
                    disabled={isBusy || categoryLoading || missingCategory || hasFlatErrors}
                  >
                    {pendingAction === "submit" ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-1 h-4 w-4" />
                    )}

                    {pendingAction === "submit" ? "Saving..." : "Save Changes"}
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
                    form.offerType === "PERCENTAGE"
                      ? form.discountPercent
                      : form.discountValue
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
                  minSpend={form.minimumSpend}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
