import { getStatusToneStyle, type StatusTone } from "@/lib/status-tone";

export type Notice = {
  text: string;
  tone: StatusTone;
};

export function StatusNotice({ notice, compact = false }: { notice: Notice; compact?: boolean }) {
  const isError = notice.tone === "danger";
  return (
    <div
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      className={`rounded-xl border text-sm ${compact ? "px-3 py-2" : "px-4 py-3"}`}
      style={getStatusToneStyle(notice.tone)}
    >
      {notice.text}
    </div>
  );
}
