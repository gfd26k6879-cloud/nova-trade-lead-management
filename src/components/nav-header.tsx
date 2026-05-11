"use client";

import { useState } from "react";
import Link from "next/link";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/coverage", label: "Coverage" },
  { href: "/leads", label: "Leads" },
  { href: "/queue", label: "Queue" },
  { href: "/statistics", label: "Statistics" },
  { href: "/settings", label: "Settings" },
];

export function NavHeader({ email, logoutAction }: { email: string; logoutAction: () => Promise<void> }) {
  const [mobileOpen, setMobileOpen] = useState(false);

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
              {email}
            </p>
          </div>
        </div>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 md:flex">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className="nav-link">
              {item.label}
            </Link>
          ))}
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
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="nav-link block"
                onClick={() => setMobileOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <form action={logoutAction} className="mt-2">
            <button type="submit" className="btn-glass text-xs w-full">Log out</button>
          </form>
        </div>
      )}
    </header>
  );
}
