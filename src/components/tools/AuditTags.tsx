import { CircleAlert, CircleCheck, CircleMinus, CircleX, ShieldOff } from "lucide-react";
import { SEVERITY_LABEL, STATUS_LABEL, type Severity, type Status } from "../../lib/auditRules";

/** Estado con ícono y texto (nunca solo color). */
const STATUS_ICON: Record<Status, typeof CircleX> = { fail: CircleX, review: CircleAlert, waived: ShieldOff, pass: CircleCheck, "n/a": CircleMinus };
const STATUS_TEXT: Record<Status, string> = { fail: "text-danger", review: "text-warn", waived: "text-accent", pass: "text-ok", "n/a": "text-muted" };
export function StatusTag({ status }: { status: Status }) {
  const Icon = STATUS_ICON[status];
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 h-5 rounded-full border border-line text-caption font-medium whitespace-nowrap shrink-0 ${STATUS_TEXT[status]}`}>
      <Icon size={12} aria-hidden />
      <span className="text-fg">{STATUS_LABEL[status]}</span>
    </span>
  );
}

export function SeverityTag({ severity }: { severity: Severity }) {
  const cls = severity === "critical" || severity === "high" ? "text-danger" : severity === "medium" ? "text-warn" : "text-muted";
  return (
    <span className="inline-flex items-center gap-1 text-caption font-medium whitespace-nowrap shrink-0">
      <span aria-hidden className={`${cls} text-[10px]`}>
        {severity === "critical" ? "◆◆" : severity === "high" ? "◆" : severity === "medium" ? "◇" : "·"}
      </span>
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

