export type BrandingContentProps = {
  appName: string | null
  tagline: string | null
  heading: string | null
  description: string | null
  logoUrl: string | null
  bannerUrl: string | null
  primaryColor: string
  textColor: string
  cardBackground: string
  showLogo: boolean
  showHeading: boolean
  showDescription: boolean
  showBanner: boolean
  showFooter: boolean
  footerTitle: string | null
  footerDescription: string | null
  copyright: string | null
}

export function BrandingContent({
  appName,
  logoUrl,
  heading,
  description,
  bannerUrl,
  primaryColor,
  textColor,
  showLogo,
  showHeading,
  showDescription,
  showBanner,
  showFooter,
  footerTitle,
  footerDescription,
  copyright,
}: BrandingContentProps) {
  return (
    <>
      {showLogo && (
        logoUrl ? (
          <img src={logoUrl} alt="Logo" className="mb-6 h-16 object-contain" />
        ) : (
          <div
            className="mb-6 flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold text-white shadow-md"
            style={{ backgroundColor: primaryColor }}
          >
            {(appName || "P")[0]}
          </div>
        )
      )}

      {showHeading && (
        <h1 className="mb-3 text-3xl font-bold md:text-4xl" style={{ color: textColor }}>
          {heading || "Sign in"}
        </h1>
      )}

      {showDescription && (
        <p className="mb-6 max-w-sm text-base" style={{ color: `${textColor}99` }}>
          {description || "Sign in to continue to your dashboard."}
        </p>
      )}

      {showBanner && bannerUrl && (
        <img
          src={bannerUrl}
          alt="Hero"
          className="mb-6 w-full max-w-sm rounded-xl object-cover shadow-md"
          style={{ maxHeight: "200px" }}
        />
      )}

      {showFooter && (footerTitle || footerDescription || copyright) && (
        <div className="pt-6">
          {footerTitle && (
            <p className="text-sm font-medium" style={{ color: textColor }}>
              {footerTitle}
            </p>
          )}
          {footerDescription && (
            <p className="mt-1 text-xs" style={{ color: `${textColor}80` }}>
              {footerDescription}
            </p>
          )}
          {copyright && (
            <p className="mt-2 text-xs" style={{ color: `${textColor}60` }}>
              {copyright}
            </p>
          )}
        </div>
      )}
    </>
  )
}
