"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { ADMIN_NAV_ITEMS, PRIMARY_NAV_ITEMS } from "@/lib/navigation";
import type { AppRole } from "@/lib/permissions";

export function NavHeader({ email, role, fulfillmentCount = 0, logoutAction }: { email: string; role: AppRole; fulfillmentCount?: number; logoutAction: () => Promise<void> }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isAdmin = role === "admin";
  const activeAdminItem = ADMIN_NAV_ITEMS.find((item) => isActivePath(pathname, item.href, searchParams));

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
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-3.5">
        <div className="flex items-center gap-3">
          <BrandMark />
          <div>
            <h1 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              NoSite Leads
            </h1>
            <p className="text-[0.6875rem] leading-tight" style={{ color: "var(--text-tertiary)" }}>
              {email} - {role}
            </p>
          </div>
        </div>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {PRIMARY_NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} className={`nav-link ${isActivePath(pathname, item.href, searchParams) ? "nav-link-active" : ""}`}>
              <NavLabel label={item.label} count={item.badge === "fulfillment" ? fulfillmentCount : 0} />
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />

          {isAdmin && (
            <div className="relative hidden md:block">
              <button
                type="button"
                className={`btn-glass btn-icon relative ${activeAdminItem ? "nav-link-active" : ""}`}
                aria-label="Admin menu"
                aria-expanded={adminOpen}
                aria-controls="admin-nav-menu"
                title="Admin menu"
                onClick={() => setAdminOpen((open) => !open)}
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
            <button type="submit" className="btn-glass text-xs">
              Log out
            </button>
          </form>

          {/* Hamburger button */}
          <div className="md:hidden">
            <button
              type="button"
              className="btn-glass"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle menu"
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
          className="relative z-[60] border-t px-6 py-3 md:hidden"
          style={{ borderColor: "var(--menu-border)", background: "var(--menu-bg)", boxShadow: "var(--menu-shadow)" }}
        >
          <nav className="flex flex-col gap-1">
            {PRIMARY_NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-link w-full ${isActivePath(pathname, item.href, searchParams) ? "nav-link-active" : ""}`}
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
                    className={`nav-link w-full ${isActivePath(pathname, item.href, searchParams) ? "nav-link-active" : ""}`}
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
    <div
      id="admin-nav-menu"
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
    </div>
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
  const [hrefWithoutHash] = href.split("#");
  const [path, query] = hrefWithoutHash.split("?");
  const pathMatches = pathname === path || (path !== "/" && pathname.startsWith(`${path}/`));
  if (!pathMatches) return false;
  if (query?.includes("assigned=me")) return searchParams.get("assigned") === "me";
  if (path === "/leads" && searchParams.get("assigned") === "me") return false;
  return true;
}
