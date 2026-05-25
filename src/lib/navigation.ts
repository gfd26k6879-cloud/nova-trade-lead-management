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
