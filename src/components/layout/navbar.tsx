"use client";

import { ChevronDown, LogOut, Menu } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase/client";
import { usePathname, useRouter } from "next/navigation";
import { NotificationBell } from "@/components/shared/notification-bell";

interface NavbarProps {
  title: string;
  onMenuClick?: () => void;
  userName?: string;
  userEmail?: string;
  userRole?: string | null;
  avatarUrl?: string | null;
}

function getInitials(name: string): string {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "U"
  );
}

function UserAvatar({
  src,
  name,
  initials,
  className,
}: {
  src?: string | null;
  name: string;
  initials: string;
  className?: string;
}) {
  return (
    <Avatar className={className}>
      {/* Falls back to initials when there is no picture or it fails to load */}
      {src ? <AvatarImage src={src} alt={name} className="object-cover" /> : null}
      <AvatarFallback className="text-xs font-medium">{initials}</AvatarFallback>
    </Avatar>
  );
}

export function Navbar({
  title,
  onMenuClick,
  userName,
  userEmail,
  userRole,
  avatarUrl,
}: NavbarProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();

  // Close on outside click or Escape
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setDropdownOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Close when navigating to another page
  useEffect(() => {
    setDropdownOpen(false);
  }, [pathname]);

  const displayName = userName || "NA";
  const displayEmail = userEmail || "NA";
  const initials = getInitials(displayName);
  const roleLabel = userRole ? userRole.replace(/_/g, " ") : null;

  // Determine notification URLs based on user type
  const notificationBase = pathname.startsWith("/admin")
    ? "/api/admin/notifications"
    : pathname.startsWith("/merchant")
      ? "/api/merchant/notifications"
      : pathname.startsWith("/company")
        ? "/api/company/notifications"
        : "/api/employee/notifications";

  const notificationViewAll = pathname.startsWith("/admin")
    ? "/admin/notifications"
    : pathname.startsWith("/merchant")
      ? "/merchant/notifications"
      : pathname.startsWith("/company")
        ? "/company/notifications"
        : "/employee/notifications";

  const logout = async () => {
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
      router.push("/login");
    } catch (error) {
      console.error("Logout failed:", error);
      setSigningOut(false);
    }
  };

  return (
    <header
      className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b px-4 md:px-6"
      style={{
        backgroundColor: `hsl(var(--navbar-bg) / var(--navbar-bg-opacity, 1))`,
        borderColor: `hsl(var(--navbar-border))`,
      }}
    >
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={onMenuClick}
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <h1
        className="min-w-0 flex-1 truncate text-lg font-semibold"
        style={{ color: `hsl(var(--navbar-text))` }}
      >
        {title}
      </h1>

      <div className="flex items-center gap-2 sm:gap-3">
        {/* Realtime indicator */}
        <div
          className="hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium sm:flex"
          style={{
            backgroundColor: `hsl(var(--live-indicator-bg))`,
            color: `hsl(var(--live-indicator-text))`,
          }}
        >
          <span
            className="realtime-dot h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: `hsl(var(--live-dot-color))` }}
          />
          Live
        </div>

        {/* Notifications */}
        <NotificationBell
          fetchUrl={notificationBase}
          markAllUrl={notificationBase}
          viewAllUrl={notificationViewAll}
        />

        {/* Divider */}
        <span
          className="hidden h-6 w-px sm:block"
          style={{ backgroundColor: `hsl(var(--navbar-border))` }}
        />

        {/* User menu */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setDropdownOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={dropdownOpen}
            aria-label="Account menu"
            className="flex items-center gap-2 rounded-full p-0.5 text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:pr-2"
          >
            <UserAvatar
              src={avatarUrl}
              name={displayName}
              initials={initials}
              className="h-8 w-8 ring-1 ring-border"
            />
            <span
              className="hidden max-w-[140px] truncate font-medium lg:block"
              style={{ color: `hsl(var(--navbar-text))` }}
            >
              {displayName}
            </span>
            <ChevronDown
              className={`hidden h-4 w-4 text-muted-foreground transition-transform sm:block ${
                dropdownOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {dropdownOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-xl border shadow-lg"
              style={{
                backgroundColor: `hsl(var(--navbar-dropdown-bg))`,
                borderColor: `hsl(var(--navbar-border))`,
              }}
            >
              {/* Profile summary */}
              <div className="flex items-center gap-3 p-4">
                <UserAvatar
                  src={avatarUrl}
                  name={displayName}
                  initials={initials}
                  className="h-11 w-11 shrink-0 ring-1 ring-border"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{displayName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {displayEmail}
                  </p>
                  {roleLabel && (
                    <Badge variant="outline" className="mt-1.5 text-[10px]">
                      {roleLabel}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div
                className="border-t p-1.5"
                style={{ borderColor: `hsl(var(--navbar-border))` }}
              >
                <LoadingButton
                  variant="ghost"
                  onClick={logout}
                  loading={signingOut}
                  loadingText="Signing out..."
                  className="w-full justify-start gap-2"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Sign Out</span>
                </LoadingButton>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}