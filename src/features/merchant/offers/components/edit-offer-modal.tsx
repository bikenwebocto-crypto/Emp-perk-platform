"use client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { OfferForm } from "./offer-form";

interface EditOfferModalProps {
  open: boolean;
  onClose: () => void;
  offer: any | null;
}

export function EditOfferModal({ open, onClose, offer }: EditOfferModalProps) {
  if (!offer) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) {
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Offer</DialogTitle>
        </DialogHeader>
        <OfferForm
          offerId={offer.id}
          initialData={{
            title: offer.title ?? "",
            description: offer.description ?? "",
            shortDescription: offer.shortDescription ?? "",
            termsAndConditions: offer.termsAndConditions ?? "",
            imageUrls: offer.imageUrls ?? [],
            offerType: offer.offerType ?? "FLAT",
            discountValue: offer.discountValue?.toString() ?? "",
            discountMax: offer.discountMax?.toString() ?? "",
            discountPercent: offer.discountPercent?.toString() ?? "",
            minimumSpend: offer.minimumSpend?.toString() ?? "",
            maxRedemptions: offer.maxRedemptions?.toString() ?? "",
            buyQuantity: offer.buyQuantity?.toString() ?? "",
            buyItem: offer.buyItem ?? "",
            getQuantity: offer.getQuantity?.toString() ?? "",
            freeItem: offer.freeItem ?? "",
            maxFreeItems: offer.maxFreeItems?.toString() ?? "",
            startDate: offer.startDate ?? "",
            endDate: offer.endDate ?? "",
            daysOfWeek: offer.daysOfWeek ?? "",
            redemptionCode: offer.redemptionCode ?? "",
            redemptionInstructions: offer.redemptionInstructions ?? "",
            categoryId: offer.categoryId ?? "",
            submissionNotes: offer.submissionNotes ?? "",
            redemptionType: offer.redemptionType ?? "IN_STORE_QR",
            bookingUrl: offer.bookingUrl ?? "",
            qrCodeUrl: offer.qrCodeUrl ?? "",
          }}
          onSuccess={onClose}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}
