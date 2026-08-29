"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { ADMIN_NAV_ITEMS, PRIMARY_NAV_ITEMS } from "@/lib/navigation";
import type { AppRole } from "@/lib/permissions";

type ShellScope = {
  tenantName: string;
  workspaceName: string | null;
  roleLabel: string;
  preview: boolean;
};

export function NavHeader({ email, role, scope, fulfillmentCount = 0, logoutAction }: { email: string; role: AppRole; scope: ShellScope; fulfillmentCount?: number; logoutAction: () => Promise<void> }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const adminMenuRef = useRef<HTMLDivElement>(null);
  const adminButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const mobileButtonRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isAdmin = role === "admin";
  const activeAdminItem = ADMIN_NAV_ITEMS.find((item) => isActivePath(pathname, item.href, searchParams));

  useEffect(() => {
    if (!adminOpen && !mobileOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      const restoreTarget = adminOpen ? adminButtonRef.current : mobileButtonRef.current;
      setAdminOpen(false);
      setMobileOpen(false);
      window.setTimeout(() => restoreTarget?.focus({ preventScroll: true }), 0);
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      const inAdminMenu = adminMenuRef.current?.contains(event.target) ?? false;
      const inMobileMenu = mobileMenuRef.current?.contains(event.target) ?? false;
      const onMobileButton = mobileButtonRef.current?.contains(event.target) ?? false;
      if (!inAdminMenu && !inMobileMenu && !onMobileButton) {
        setAdminOpen(false);
        setMobileOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [adminOpen, mobileOpen]);

  return (
    <header
      className="sticky top-0 z-50"
      style={{
        background: "var(--nav-bg)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        borderBottom: "1px solid var(--nav-border)",
        boxShadow: "var(--nav-shadow)",
      }}
    >
      <div className="mx-auto flex w-full max-w-[1360px] items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <BrandMark />
          <div className="min-w-0">
            <h1 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Nova Trade
            </h1>
            <p className="hidden text-[0.6875rem] leading-tight xl:block" style={{ color: "var(--text-tertiary)" }}>
              Lead intelligence
            </p>
          </div>
          <ScopeContext scope={scope} className="hidden lg:flex" />
        </div>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          <Link href="/onboarding" className={`nav-link ${isActivePath(pathname, "/onboarding", searchParams) ? "nav-link-active" : ""}`}>
            Setup
          </Link>
          <Link href="/knowledge" className={`nav-link ${isActivePath(pathname, "/knowledge", searchParams) ? "nav-link-active" : ""}`}>
            Knowledge
          </Link>
          {PRIMARY_NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} className={`nav-link ${isActivePath(pathname, item.href, searchParams) ? "nav-link-active" : ""}`}>
              <NavLabel label={item.label} count={item.badge === "fulfillment" ? fulfillmentCount : 0} />
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ScopeContext scope={scope} compact className="flex lg:hidden" />
          <ThemeToggle className="min-h-11 min-w-11 md:min-h-10 md:min-w-10" />

          {isAdmin && (
            <div ref={adminMenuRef} className="relative hidden md:block">
              <button
                ref={adminButtonRef}
                type="button"
                className={`btn-glass btn-icon relative ${activeAdminItem ? "nav-link-active" : ""}`}
                aria-label="Admin menu"
                aria-expanded={adminOpen}
                aria-controls="admin-nav-menu"
                aria-haspopup="true"
                title="Admin menu"
                onClick={() => {
                  setMobileOpen(false);
                  setAdminOpen((open) => !open);
                }}
              >
                <MenuIcon />
                {fulfillmentCount > 0 && (
                  <span className="absolute -right-1 -top-1">
                    <NavBadge count={fulfillmentCount} />
                  </span>
                )}
              </button>
              {adminOpen && (
                <AdminMenu
                  activeAdminHref={activeAdminItem?.href ?? null}
                  fulfillmentCount={fulfillmentCount}
                  searchParams={searchParams}
                  pathname={pathname}
                  onSelect={() => setAdminOpen(false)}
                />
              )}
            </div>
          )}

          <form action={logoutAction} className="hidden md:block">
            <button type="submit" className="btn-glass text-xs" aria-label={`Log out ${email}`} title={`Signed in as ${email}`}>
              Log out
            </button>
          </form>

          {/* Hamburger button */}
          <div className="md:hidden">
            <button
              ref={mobileButtonRef}
              type="button"
              className="btn-glass min-h-11 min-w-11 px-3"
              onClick={() => {
                setAdminOpen(false);
                setMobileOpen((open) => !open);
              }}
              aria-label="Toggle menu"
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav-menu"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                {mobileOpen ? (
                  <>
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </>
                ) : (
                  <>
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <line x1="3" y1="18" x2="21" y2="18" />
                  </>
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div
          ref={mobileMenuRef}
          id="mobile-nav-menu"
          className="relative z-[60] border-t px-6 py-3 md:hidden"
          style={{ borderColor: "var(--menu-border)", background: "var(--menu-bg)", boxShadow: "var(--menu-shadow)" }}
        >
          <nav className="flex flex-col gap-1" aria-label="Mobile">
            <div className="mb-2 rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
              <p className="section-label">Signed in</p>
              <p className="mt-1 break-all text-xs" style={{ color: "var(--text-secondary)" }}>{email}</p>
            </div>
            <p className="section-label px-3 pt-1">Setup</p>
            <Link href="/onboarding" className={`nav-link min-h-11 w-full ${isActivePath(pathname, "/onboarding", searchParams) ? "nav-link-active" : ""}`} onClick={() => setMobileOpen(false)}>
              Onboarding
            </Link>
            <Link href="/knowledge" className={`nav-link min-h-11 w-full ${isActivePath(pathname, "/knowledge", searchParams) ? "nav-link-active" : ""}`} onClick={() => setMobileOpen(false)}>
              Knowledge review
            </Link>
            <p className="section-label px-3 pt-3">Legacy</p>
            {PRIMARY_NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-link min-h-11 w-full ${isActivePath(pathname, item.href, searchParams) ? "nav-link-active" : ""}`}
                onClick={() => setMobileOpen(false)}
              >
                <NavLabel label={item.label} count={item.badge === "fulfillment" ? fulfillmentCount : 0} />
              </Link>
            ))}
            {isAdmin && (
              <>
                <p className="section-label px-3 pt-3">Admin</p>
                {ADMIN_NAV_ITEMS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`nav-link min-h-11 w-full ${isActivePath(pathname, item.href, searchParams) ? "nav-link-active" : ""}`}
                    onClick={() => setMobileOpen(false)}
                  >
                    <NavLabel label={item.label} count={item.badge === "fulfillment" ? fulfillmentCount : 0} />
                  </Link>
                ))}
              </>
            )}
          </nav>
          <form action={logoutAction} className="mt-2">
            <button type="submit" className="btn-glass text-xs w-full">Log out</button>
          </form>
        </div>
      )}
    </header>
  );
}

function ScopeContext({ scope, compact = false, className = "" }: { scope: ShellScope; compact?: boolean; className?: string }) {
  const workspace = scope.workspaceName ?? "Tenant-wide";
  const previewLabel = scope.preview ? "Preview fixture · " : "";
  const fullLabel = `${previewLabel}${scope.tenantName} · ${workspace} · ${scope.roleLabel}`;

  return (
    <div
      aria-label={scope.preview ? "Preview tenant and workspace" : "Current tenant and workspace"}
      title={fullLabel}
      className={`${className} min-w-0 items-center rounded-xl border ${compact ? "max-w-24 px-2 py-1.5" : "max-w-64 px-3 py-2"}`}
      style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}
    >
      <div className="min-w-0">
        <p className="section-label">{scope.preview ? "Preview fixture" : compact ? "Scope" : "Tenant / workspace"}</p>
        <p className="truncate text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{scope.tenantName}</p>
        <p className="truncate text-[0.65rem]" style={{ color: "var(--text-tertiary)" }}>{workspace} · {scope.roleLabel}</p>
      </div>
    </div>
  );
}

function AdminMenu({
  activeAdminHref,
  fulfillmentCount,
  pathname,
  searchParams,
  onSelect,
}: {
  activeAdminHref: string | null;
  fulfillmentCount: number;
  pathname: string;
  searchParams: { get(name: string): string | null };
  onSelect: () => void;
}) {
  return (
    <nav
      id="admin-nav-menu"
      aria-label="Admin"
      className="absolute right-0 z-[70] mt-2 w-72 rounded-xl p-2"
      style={{
        background: "var(--menu-bg)",
        border: "1px solid var(--menu-border)",
        boxShadow: "var(--menu-shadow)",
      }}
    >
      <p className="section-label px-3 pb-2 pt-1">Admin</p>
      {ADMIN_NAV_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`block rounded-lg px-3 py-2 text-sm transition ${activeAdminHref === item.href || isActivePath(pathname, item.href, searchParams) ? "nav-link-active" : ""}`}
          style={{ color: "var(--text-primary)" }}
          onClick={onSelect}
        >
          <span className="flex items-center justify-between gap-2 font-medium">
            <NavLabel label={item.label} count={item.badge === "fulfillment" ? fulfillmentCount : 0} />
          </span>
          {item.description && (
            <span className="mt-0.5 block text-xs leading-snug" style={{ color: "var(--text-tertiary)" }}>
              {item.description}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}

function NavLabel({ label, count }: { label: string; count: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span>{label}</span>
      {count > 0 && <NavBadge count={count} />}
    </span>
  );
}

function NavBadge({ count }: { count: number }) {
  return (
    <span
      className="rounded-full px-1.5 py-0.5 text-[0.65rem] font-semibold leading-none"
      style={{ background: "var(--danger-bg)", color: "var(--danger-text)" }}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

function MenuIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </svg>
  );
}

function isActivePath(pathname: string, href: string, searchParams: { get(name: string): string | null }): boolean {
  if (href.includes("#")) return false;
  const [hrefWithoutHash] = href.split("#");
  const [path, query] = hrefWithoutHash.split("?");
  const pathMatches = pathname === path || (path !== "/" && pathname.startsWith(`${path}/`));
  if (!pathMatches) return false;
  if (query?.includes("assigned=me")) return searchParams.get("assigned") === "me";
  if (path === "/leads" && searchParams.get("assigned") === "me") return false;
  return true;
}
