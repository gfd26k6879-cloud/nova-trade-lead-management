"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createManualLeadAction } from "@/lib/leads/actions";
import { BUSINESS_TYPE_OPTIONS } from "@/lib/business-types";

interface Props {
  open: boolean;
  onClose: () => void;
}

const WEBSITE_STATUS_OPTIONS = [
  { value: "none", label: "No website" },
  { value: "social", label: "Social only" },
  { value: "basic", label: "Basic site" },
  { value: "custom", label: "Custom site" },
];

export function ManualLeadModal({ open, onClose }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [businessType, setBusinessType] = useState<string>(BUSINESS_TYPE_OPTIONS[0]?.id ?? "local_services");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [websiteStatus, setWebsiteStatus] = useState("none");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const resetForm = () => {
    setName("");
    setBusinessType(BUSINESS_TYPE_OPTIONS[0]?.id ?? "local_services");
    setPhone("");
    setAddress("");
    setWebsiteStatus("none");
    setNotes("");
    setError(null);
  };

  const createLead = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!name.trim() || !businessType || (!phone.trim() && !address.trim())) {
      setError("Add a business name, type, and either a phone number or address.");
      return;
    }
    setBusy(true);
    const result = await createManualLeadAction({
      name,
      businessType,
      phone,
      address,
      websiteStatus,
      notes,
    });
    setBusy(false);
    if ("error" in result) {
      setError(result.error ?? "Unable to create lead.");
      return;
    }
    resetForm();
    onClose();
    router.push(`/leads/${result.lead.id}`);
    router.refresh();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 py-8">
      <form
        onSubmit={createLead}
        role="dialog"
        aria-modal="true"
        aria-labelledby="manual-lead-title"
        className="glass-heavy w-full max-w-2xl rounded-2xl p-6 shadow-2xl"
        style={{ border: "1px solid rgba(255,255,255,0.55)" }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="manual-lead-title" className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>Add Lead</h2>
            <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
              Create a manual candidate, then review, claim, archive, verify, or log outreach from the detail page.
            </p>
          </div>
          <button type="button" className="btn-glass text-xs" onClick={onClose} disabled={busy}>
            Close
          </button>
        </div>

        {error && (
          <div aria-live="polite" className="mt-4 rounded-xl px-3 py-2 text-sm" style={{ background: "rgba(239,68,68,0.1)", color: "#991b1b" }}>
            {error}
          </div>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label htmlFor="manual-lead-name" className="flex flex-col gap-1 sm:col-span-2">
            <span className="section-label">Business name</span>
            <input id="manual-lead-name" name="manualLeadName" className="glass-input" value={name} onChange={(event) => setName(event.target.value)} required maxLength={200} autoFocus />
          </label>
          <label htmlFor="manual-lead-business-type" className="flex flex-col gap-1">
            <span className="section-label">Business type</span>
            <select id="manual-lead-business-type" name="manualLeadBusinessType" className="glass-select" value={businessType} onChange={(event) => setBusinessType(event.target.value)} required>
              {BUSINESS_TYPE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </label>
          <label htmlFor="manual-lead-website-status" className="flex flex-col gap-1">
            <span className="section-label">Website status</span>
            <select id="manual-lead-website-status" name="manualLeadWebsiteStatus" className="glass-select" value={websiteStatus} onChange={(event) => setWebsiteStatus(event.target.value)}>
              {WEBSITE_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label htmlFor="manual-lead-phone" className="flex flex-col gap-1">
            <span className="section-label">Phone</span>
            <input id="manual-lead-phone" name="manualLeadPhone" className="glass-input" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="303-555-0100" maxLength={80} />
          </label>
          <label htmlFor="manual-lead-address" className="flex flex-col gap-1">
            <span className="section-label">Address</span>
            <input id="manual-lead-address" name="manualLeadAddress" className="glass-input" value={address} onChange={(event) => setAddress(event.target.value)} placeholder="123 Main St, Denver, CO" maxLength={300} />
          </label>
          <label htmlFor="manual-lead-notes" className="flex flex-col gap-1 sm:col-span-2">
            <span className="section-label">Notes</span>
            <textarea id="manual-lead-notes" name="manualLeadNotes" className="glass-input" rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} />
          </label>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-glass text-sm" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn-primary text-sm" disabled={busy}>
            {busy ? "Creating..." : "Create lead"}
          </button>
        </div>
      </form>
    </div>
  );
}
