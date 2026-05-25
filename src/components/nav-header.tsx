"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { AppRole } from "@/lib/permissions";

type NavItem = {
  href: string;
  label: string;
  description?: string;
  badge?: "fulfillment";
};

const primaryItems: NavItem[] = [
  { href: "/queue", label: "Workbench", description: "Daily call, text, email, and follow-up queue." },
  { href: "/explore", label: "Explore", description: "Search, map, filter, and claim available businesses." },
  { href: "/leads?assigned=me", label: "My Leads", description: "Only leads owned by the current user." },
  { href: "/team", label: "Team", description: "Team workload and recent outreach activity." },
];

const adminItems: NavItem[] = [
  { href: "/dashboard", label: "Overview", description: "Revenue, discovery controls, and admin shortcuts." },
  { href: "/fulfillment", label: "Fulfillment", description: "Website and quote requests from researchers.", badge: "fulfillment" },
  { href: "/coverage", label: "Discovery", description: "Live crawl run status and ZIP/category unit health." },
  { href: "/scheduler", label: "Scheduler", description: "Background workers, backlogs, and worker controls." },
  { href: "/quality", label: "Quality", description: "AI verification and manual lead quality review." },
  { href: "/leads", label: "All Leads", description: "Full lead database, filters, Kanban, and export." },
  { href: "/statistics", label: "Statistics", description: "Lead mix, quality, and conversion reporting." },
  { href: "/settings", label: "Settings", description: "API keys, scoring, cost, and model settings." },
  { href: "/users", label: "Users", description: "Team roles, status, and team lead assignment." },
];

export function NavHeader({ email, role, fulfillmentCount = 0, logoutAction }: { email: string; role: AppRole; fulfillmentCount?: number; logoutAction: () => Promise<void> }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isAdmin = role === "admin";
  const activeAdminItem = adminItems.find((item) => isActivePath(pathname, item.href, searchParams));

  return (
    <header
      className="sticky top-0 z-50"
      style={{
        background: "rgba(255, 255, 255, 0.55)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        borderBottom: "1px solid rgba(255, 255, 255, 0.45)",
        boxShadow: "0 1px 8px rgba(0, 0, 0, 0.04)",
      }}
    >
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-3.5">
        <div className="flex items-center gap-3">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-xl"
            style={{
              background: "var(--accent)",
              boxShadow: "0 2px 8px var(--accent-glow)",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
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
          {primaryItems.map((item) => (
            <Link key={item.href} href={item.href} className={`nav-link ${isActivePath(pathname, item.href, searchParams) ? "nav-link-active" : ""}`}>
              <NavLabel label={item.label} count={item.badge === "fulfillment" ? fulfillmentCount : 0} />
            </Link>
          ))}
          {isAdmin && (
            <div className="relative">
              <button
                type="button"
                className={`nav-link ${activeAdminItem ? "nav-link-active" : ""}`}
                aria-expanded={adminOpen}
                aria-controls="admin-nav-menu"
                onClick={() => setAdminOpen((open) => !open)}
              >
                Admin{activeAdminItem ? `: ${activeAdminItem.label}` : ""}
                {fulfillmentCount > 0 && <NavBadge count={fulfillmentCount} />}
              </button>
              {adminOpen && (
                <div
                  id="admin-nav-menu"
                  className="absolute right-0 mt-2 w-72 rounded-xl p-2"
                  style={{
                    background: "rgba(255,255,255,0.96)",
                    border: "1px solid rgba(255,255,255,0.72)",
                    boxShadow: "0 18px 60px rgba(15,23,42,0.16)",
                  }}
                >
                  {adminItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`block rounded-lg px-3 py-2 text-sm transition ${isActivePath(pathname, item.href, searchParams) ? "nav-link-active" : ""}`}
                      style={{ color: "var(--text-primary)" }}
                      onClick={() => setAdminOpen(false)}
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
              )}
            </div>
          )}
        </nav>

        <div className="flex items-center gap-2">
          <form action={logoutAction}>
            <button type="submit" className="btn-glass text-xs hidden md:inline-flex">
              Log out
            </button>
          </form>

          {/* Hamburger button */}
          <button
            type="button"
            className="btn-glass md:hidden"
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

      {/* Mobile menu */}
      {mobileOpen && (
        <div
          className="border-t px-6 py-3 md:hidden"
          style={{ borderColor: "rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.55)" }}
        >
          <nav className="flex flex-col gap-1">
            {primaryItems.map((item) => (
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
                {adminItems.map((item) => (
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
      style={{ background: "rgba(239,68,68,0.12)", color: "#dc2626" }}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

function isActivePath(pathname: string, href: string, searchParams: { get(name: string): string | null }): boolean {
  const [path, query] = href.split("?");
  const pathMatches = pathname === path || (path !== "/" && pathname.startsWith(`${path}/`));
  if (!pathMatches) return false;
  if (query?.includes("assigned=me")) return searchParams.get("assigned") === "me";
  if (path === "/leads" && searchParams.get("assigned") === "me") return false;
  return true;
}
