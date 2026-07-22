export type NavItem = {
  href: string;
  label: string;
  description?: string;
  badge?: "fulfillment";
};

export const PRIMARY_NAV_ITEMS: NavItem[] = [
  { href: "/explore", label: "Explore", description: "Search, map, filter, and claim available businesses." },
  { href: "/queue", label: "Workbench", description: "Daily call, text, email, and follow-up queue." },
  { href: "/leads?assigned=me", label: "My Leads", description: "Only leads owned by the current user." },
  { href: "/team", label: "Team", description: "Team workload and recent outreach activity." },
];

export const ADMIN_NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Admin Home", description: "Lead inventory, discovery, and fulfillment command center." },
  { href: "/dashboard#discovery", label: "Discovery", description: "Configure and start a new discovery run." },
  { href: "/coverage", label: "Monitor", description: "Inspect discovery items, run status, and coverage." },
  { href: "/fulfillment", label: "Fulfillment", description: "Website and quote requests from researchers.", badge: "fulfillment" },
  { href: "/leads", label: "All Leads", description: "Full lead database, filters, Kanban, and export." },
  { href: "/quality", label: "Quality", description: "AI verification and manual lead quality review." },
  { href: "/scheduler", label: "Scheduler", description: "Worker health, usage, backlog, and run history." },
  { href: "/statistics", label: "Statistics", description: "Pipeline conversion, quality, and cost reporting." },
  { href: "/settings", label: "Settings", description: "API keys, scoring, and model settings." },
  { href: "/users", label: "Users", description: "Team roles, status, and team lead assignment." },
];
