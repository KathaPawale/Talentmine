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

function linkedinSearchUrl(contact: ExecutiveContactRow): string {
  const keywords = [contact.name, contact.title].filter(Boolean).join(" ");
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(keywords)}`;
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
    <div className="overflow-x-auto rounded-lg border border-border/70">
      <table className="w-full min-w-[920px] text-left text-xs">
        <thead className="bg-muted/40 text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Executive</th>
            <th className="px-3 py-2 font-medium">Title</th>
            <th className="px-3 py-2 font-medium">Primary email</th>
            <th className="px-3 py-2 font-medium">Alternate email</th>
            <th className="px-3 py-2 font-medium">Primary phone</th>
            <th className="px-3 py-2 font-medium">Alternate phone</th>
            <th className="px-3 py-2 font-medium">LinkedIn</th>
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {contacts.slice(0, 3).map((contact) => (
            <tr key={contact.id} className="bg-muted/10 align-top">
              <td className="px-3 py-3 font-semibold text-foreground">{contact.name}</td>
              <td className="px-3 py-3 text-muted-foreground">{contact.title}</td>
              <td className="px-3 py-3"><EmailLine label="" email={contact.primaryEmail} status={contact.primaryEmailStatus} /></td>
              <td className="px-3 py-3"><EmailLine label="" email={contact.alternateEmail} status={contact.alternateEmailStatus} /></td>
              <td className="px-3 py-3"><PhoneLine label="" phone={contact.primaryPhone} /></td>
              <td className="px-3 py-3"><PhoneLine label="" phone={contact.alternatePhone} /></td>
              <td className="px-3 py-3"><LinkLine label="" url={contact.linkedinUrl ?? linkedinSearchUrl(contact)} /></td>
              <td className="px-3 py-3">
                <div className="flex flex-col items-start gap-1">
                  <VerificationBadge status={contact.verificationStatus} />
                  <span className="tabular-nums text-muted-foreground">{contact.confidenceScore}%</span>
                  <span className="text-[11px] text-muted-foreground">{contact.verifiedAt ? contact.verifiedAt.toLocaleDateString() : "Unavailable"}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
