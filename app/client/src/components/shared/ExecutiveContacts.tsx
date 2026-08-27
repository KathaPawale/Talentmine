import { ExternalLink, Mail, Phone } from "lucide-react";
import type { ExecutiveContactRow } from "@server/db/schema";
import {
  emailVerificationLabel,
  isUsableExecutiveEmailStatus,
  NO_VERIFIED_EXECUTIVE_CONTACT,
  type EmailVerificationStatus,
} from "@shared/executive-contact";
import { cn } from "@/lib/utils";

function statusClass(status: EmailVerificationStatus): string {
  if (status === "verified") return "bg-emerald-400/10 text-emerald-300 ring-emerald-400/20";
  if (status === "publicly_confirmed") return "bg-cyan-400/10 text-cyan-300 ring-cyan-400/20";
  if (status === "pattern_based_guess") return "bg-amber-400/10 text-amber-300 ring-amber-400/20";
  return "bg-slate-400/10 text-slate-400 ring-slate-400/20";
}

function VerificationBadge({ status }: { status: EmailVerificationStatus }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1", statusClass(status))}>
      {emailVerificationLabel(status)}
    </span>
  );
}

function EmailLine({
  label,
  email,
  status,
}: {
  label: string;
  email: string | null;
  status: EmailVerificationStatus;
}) {
  const usable = Boolean(email && isUsableExecutiveEmailStatus(status));
  const shownStatus: EmailVerificationStatus = usable ? status : "unavailable";
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex flex-wrap items-center justify-end gap-1.5">
        {usable ? (
          <a href={`mailto:${email}`} className="inline-flex items-center gap-1 text-primary hover:underline">
            <Mail className="h-3 w-3" /> {email}
          </a>
        ) : (
          <span className="text-muted-foreground">Unavailable</span>
        )}
        <VerificationBadge status={shownStatus} />
      </span>
    </div>
  );
}

function PhoneLine({ label, phone }: { label: string; phone: string | null }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      {phone ? (
        <a href={`tel:${phone}`} className="inline-flex items-center gap-1 text-primary hover:underline">
          <Phone className="h-3 w-3" /> {phone}
        </a>
      ) : (
        <span className="text-muted-foreground">Unavailable</span>
      )}
    </div>
  );
}

function LinkLine({ label, url }: { label: string; url: string | null }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex max-w-[70%] items-center gap-1 truncate text-primary hover:underline"
        >
          <ExternalLink className="h-3 w-3 shrink-0" /> View
        </a>
      ) : (
        <span className="text-muted-foreground">Unavailable</span>
      )}
    </div>
  );
}

export function ExecutiveContacts({ contacts }: { contacts: ExecutiveContactRow[] }) {
  if (contacts.length === 0) {
    return (
      <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-sm text-amber-200">
        {NO_VERIFIED_EXECUTIVE_CONTACT}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {contacts.slice(0, 3).map((contact) => (
        <article key={contact.id} className="rounded-lg border border-border/70 bg-muted/20 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold text-foreground">{contact.name}</div>
              <div className="text-xs text-muted-foreground">{contact.title}</div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-xs font-semibold tabular-nums text-primary">{contact.confidenceScore}%</span>
              <VerificationBadge status={contact.verificationStatus} />
            </div>
          </div>

          <div className="mt-3 space-y-2">
            <EmailLine label="Primary email" email={contact.primaryEmail} status={contact.primaryEmailStatus} />
            <EmailLine label="Alternate email" email={contact.alternateEmail} status={contact.alternateEmailStatus} />
            <PhoneLine label="Primary business phone" phone={contact.primaryPhone} />
            <PhoneLine label="Alternate business phone" phone={contact.alternatePhone} />
            <LinkLine label="Executive LinkedIn" url={contact.linkedinUrl} />
            <LinkLine label="Contact source" url={contact.sourceUrl} />
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
            <span>Verification date</span>
            <span>{contact.verifiedAt ? contact.verifiedAt.toLocaleDateString() : "Unavailable"}</span>
          </div>
        </article>
      ))}
    </div>
  );
}
