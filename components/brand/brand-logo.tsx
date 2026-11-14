import { cn } from "@/lib/utils";

export interface BrandLogoProps {
  variant?: "horizontal" | "icon" | "full" | "thermal";
  logoSrc?: string;
  businessName?: string;
  className?: string;
}

const DEFAULT_LOGO_PATH = "/brand/logo.png";

/**
 * Komponen Logo Manga' Travel (design-spec.json > brand.logo).
 * Mendukung logo bawaan maupun logo kustom yang diunggah melalui halaman Pengaturan (/settings).
 */
export function BrandLogo({
  variant = "horizontal",
  logoSrc,
  businessName = "Manga' Travel",
  className,
}: BrandLogoProps) {
  const resolvedLogoSrc = logoSrc?.trim() || DEFAULT_LOGO_PATH;
  const isCustomLogo = resolvedLogoSrc !== DEFAULT_LOGO_PATH;

  if (variant === "icon") {
    return (
      <div
        className={cn(
          "inline-flex h-8 w-8 shrink-0 items-center justify-center",
          className
        )}
        role="img"
        aria-label={businessName}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={isCustomLogo ? resolvedLogoSrc : "/brand/logo-icon.png"}
          alt={`Logo ${businessName}`}
          className="h-8 w-8 object-contain"
        />
      </div>
    );
  }

  if (variant === "thermal") {
    return (
      <div
        className={cn(
          "inline-flex flex-col items-center justify-center grayscale contrast-125",
          className
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={resolvedLogoSrc}
          alt={`Logo ${businessName}`}
          className="h-auto max-h-14 max-w-full object-contain"
        />
      </div>
    );
  }

  if (variant === "full") {
    return (
      <div className={cn("inline-flex flex-col items-center", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={resolvedLogoSrc}
          alt={`Logo ${businessName}`}
          className="h-auto max-h-24 w-auto max-w-[220px] object-contain"
        />
      </div>
    );
  }

  return (
    <div className={cn("inline-flex items-center gap-2.5", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={isCustomLogo ? resolvedLogoSrc : "/brand/logo-icon.png"}
        alt={`Logo ${businessName}`}
        className="h-9 w-9 shrink-0 object-contain"
      />
      <div className="flex flex-col leading-tight">
        <span className="text-[15px] font-bold tracking-tight text-primary-800">
          {businessName}
        </span>
        <span className="text-[11px] font-medium text-neutral-500">
          Sistem Transaksi
        </span>
      </div>
    </div>
  );
}
