import type { ReactNode } from "react";
import Image from "next/image";
import { extractColors } from "./branding-helpers";

export interface LayoutBranding {
  appName?: string | null;
  tagline?: string | null;
  heading?: string | null;
  description?: string | null;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  backgroundImageUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
  textColor?: string | null;
  cardBackground?: string | null;
  showLogo?: boolean;
  showHeading?: boolean;
  showDescription?: boolean;
  showBanner?: boolean;
  showFooter?: boolean;
  footerTitle?: string | null;
  footerDescription?: string | null;
  copyright?: string | null;
}

interface SplitCardLayoutProps {
  branding: LayoutBranding;
  children: ReactNode;
  compact?: boolean;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace("#", "");
  if (clean.length !== 6 && clean.length !== 3) return null;
  const full =
    clean.length === 3
      ? clean.charAt(0) +
        clean.charAt(0) +
        clean.charAt(1) +
        clean.charAt(1) +
        clean.charAt(2) +
        clean.charAt(2)
      : clean;
  const num = parseInt(full, 16);
  if (isNaN(num)) return null;
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

//

export function SplitCardLayout({
  branding,
  children,
  compact,
}: SplitCardLayoutProps) {
  const colors = extractColors(branding);
  // Left-side hero text (tagline/heading/description): branding Text Color, else brand purple.
  const cardTextColor = branding.textColor || "#693192";
  const {
    backgroundImageUrl,
    appName,
    logoUrl,
    bannerUrl,
    tagline,
    footerTitle,
    footerDescription,
  } = branding;

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[#eef1fb] p-6">
      <div className="relative w-full max-w-[1450px] rounded-[34px] shadow-[0_25px_70px_rgba(0,0,0,.12)]">
        <div
          className="relative overflow-hidden rounded-[28px]"
          style={{
            // backgroundColor: colors.secondary,
            minHeight: compact ? "auto" : "760px",
          }}
        >
          {!compact && (
            <>
              <div className="pointer-events-none absolute -left-32 top-20 h-72 w-72 select-none rounded-full bg-indigo-500/10 blur-3xl" />
              <div className="pointer-events-none absolute right-10 top-0 h-80 w-80 select-none rounded-full bg-purple-300/10 blur-3xl" />
              <div
                className="pointer-events-none absolute inset-0 select-none opacity-10"
                style={{
                  backgroundImage:
                    "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
                  backgroundSize: "32px 32px",
                }}
              />
            </>
          )}

          {backgroundImageUrl && (
            <img
              src={backgroundImageUrl}
              alt=""
              className="pointer-events-none absolute inset-0 h-full w-full select-none object-content hidden md:block"
            />
          )}

          {/* Navigation */}
          <header
            className={`relative z-10 flex items-center justify-between ${compact ? "px-6 py-4" : "px-14 py-10"}`}
          >
            <div className="flex items-center gap-3">
              {branding.showLogo !== false && logoUrl && (
                <img
                  src={logoUrl}
                  alt={`${appName || ""} logo`}
                  className="h-10 object-contain"
                />
              )}
              {/* {appName && (
                <span className="text-lg font-semibold text-white">
                  {appName}
                </span>
              )} */}
            </div>
          </header>

          {/* Hero grid */}
       <div className={`relative z-10 ${compact ? "px-6 pb-8" : "px-4 sm:px-8 md:px-16"}`}>
  <div className={`${compact ? "" : "grid grid-cols-1 md:grid-cols-[65%_35%] gap-4 md:gap-0"}`}>
    {/* Left: Banner - Hidden on mobile */}
    {!compact && (
      <div className="relative h-[300px] sm:h-[400px] md:h-[500px] hidden md:block">
        {branding.showBanner !== false && bannerUrl ? (
          <Image
            src={bannerUrl}
            fill
            className="object-contain"
            alt="Illustration"
          />
        ) : (
          <div className="flex h-full items-center">
            <div>
              {tagline && (
                <span className="block text-sm tracking-[4px]" style={{ color: `${cardTextColor}99` }}>
                  * {tagline.toUpperCase()} *
                </span>
              )}
              {branding.showHeading !== false && (
                <h1 className="mt-2 text-3xl md:text-4xl font-bold" style={{ color: cardTextColor }}>
                  {branding.heading || ""}
                </h1>
              )}
              {branding.showDescription !== false && (
                <p className="mt-3 max-w-md text-sm md:text-base" style={{ color: `${cardTextColor}b3` }}>
                  {branding.description || "Sign in to continue to your dashboard."}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    )}

    {/* Right: Login card - Full width on mobile */}
    <div className={`flex ${compact ? "w-full" : "justify-center md:justify-center"} ${!compact ? "md:col-start-2" : ""}`}>
      <div
        className={`rounded-[24px] bg-white shadow-xl ${
          compact 
            ? "w-full p-6" 
            : "w-full max-w-[390px] p-5 mx-auto md:mx-0"
        }`}
      >
        {/* <span className="text-xs uppercase tracking-[4px] text-slate-400">
          {appName ? `${appName.toUpperCase()} ACCESS` : "PLATFORM ACCESS"}
        </span> */}
        <h1
          className={`mt-3 font-bold text-gray-900 ${
            compact ? "text-2xl" : "text-2xl md:text-4xl"
          }`}
        >
          {branding.heading || "Sign in"}
        </h1>
        <p
          className={`mt-2 text-slate-500 ${
            compact ? "mb-4 text-xs" : "mb-4 md:mb-8 text-sm md:text-base"
          }`}
        >
          {branding.description || "Sign in to continue"}
        </p>
        {children}
      </div>
    </div>
  </div>
</div>

          {/* Mobile heading + description */}
          {compact && (
            <div className="relative z-10 px-6 pb-6">
              {tagline && (
                <span className="block text-sm tracking-[4px]" style={{ color: `${cardTextColor}99` }}>
                  * {tagline.toUpperCase()} *
                </span>
              )}
              {branding.showHeading !== false && (
                <h1 className="mt-2 text-2xl font-bold" style={{ color: cardTextColor }}>
                  {branding.heading || "Sign in"}
                </h1>
              )}
              {branding.showDescription !== false && (
                <p className="mt-2 max-w-md text-sm" style={{ color: `${cardTextColor}b3` }}>
                  {branding.description ||
                    "Sign in to continue to your dashboard."}
                </p>
              )}
            </div>
          )}

          {/* Curved bottom */}
          {/* {!compact && (
            <div className="absolute bottom-0 left-0 h-[120px] w-[5%] rounded-tr-[120px] bg-white" />
          )} */}

          {/* Footer links */}
          {/* {!compact && (
            <footer className="absolute bottom-8 left-[45%] z-10 flex gap-10 text-sm " style={{ color: cardBackground, opacity: 0.4 }}  >
              <a className="cursor-pointer transition-colors hover:text-white">Twitter</a>
              <a className="cursor-pointer transition-colors hover:text-white">Instagram</a>
              <a className="cursor-pointer transition-colors hover:text-white">Privacy</a>
            </footer>
          )} */}
        </div>

        {/* Floating testimonial */}
        {/* Floating testimonial - WITH SHADOW BACKGROUND */}
        {!compact && (
          <div className="absolute -bottom-4 left-4 w-[calc(100%-2rem)] max-w-[420px] rounded-full bg-white px-4 py-4  shadow-[0_8px_20px_rgba(0,0,0,0.5)] lg:-bottom-8 lg:left-14 lg:px-8  md:block hidden">
            <div className="flex items-center gap-3 sm:gap-5">
              {logoUrl ? (
                <div className="relative h-10 w-10 overflow-hidden sm:h-12 sm:w-fit lg:h-14 lg:w-fit">
                  <img src={logoUrl} alt="" className="" />
                </div>
              ) : (
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-slate-300 text-lg font-bold text-slate-600 sm:h-12 sm:w-12 lg:h-14 lg:w-14">
                  {(footerTitle || appName || "?")[0]?.toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                {footerTitle && (
                  <p className="truncate font-semibold text-gray-900 text-sm sm:text-base">
                    {footerTitle}
                  </p>
                )}
                {footerDescription && (
                  <p className="truncate text-xs text-slate-500 sm:text-sm">
                    {footerDescription}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
