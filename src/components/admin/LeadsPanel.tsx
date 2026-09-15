'use client';

import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { UserCheck, Mail, Download, Trash2, Phone, Building2, Users2, MessageSquare, Clock, Copy } from 'lucide-react';
import {
  getTrainerLeads, getLandingLeads, updateTrainerLeadStatus,
  deleteTrainerLead, deleteLandingLead,
} from '@/lib/firestore';
import { downloadCsv } from '@/lib/csv';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import type { TrainerLead, LandingLead } from '@/types';

/**
 * Demo requests and email captures.
 *
 * Every field the form collects has always been saved; the panel just could
 * not show them. Each lead was one line of text with `truncate` on it, so on a
 * phone everything after the email address was cut off — the name, the gym,
 * the phone number, the message. It read as though only an email had been
 * captured, and the notification email's "view the rest in the admin panel"
 * pointed at a page that showed less than the email did.
 *
 * Labelled rows that wrap instead, so a long message is readable and a missing
 * optional field is visibly missing rather than indistinguishable from one
 * that scrolled off the edge.
 */

const STATUS_STYLES: Record<TrainerLead['status'], string> = {
  new: 'bg-accent/15 text-accent border-accent/30',
  contacted: 'bg-blue-500/15 text-blue-300 border-blue-400/30',
  closed: 'bg-white/5 text-text-tertiary border-white/10',
};

function leadDate(lead: { createdAt: unknown }): string {
  const ts = (lead.createdAt as { toDate?: () => Date } | null)?.toDate?.();
  if (!ts) return '';
  return ts.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function leadDateIso(lead: { createdAt: unknown }): string {
  return (lead.createdAt as { toDate?: () => Date } | null)?.toDate?.().toISOString().slice(0, 10) ?? '';
}

async function copy(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  } catch {
    toast.error('Could not copy — select the text instead');
  }
}

/** One labelled row. Renders the dash rather than vanishing, so "not given" is legible. */
function Field({ icon: Icon, label, value, href }: {
  icon: React.ElementType;
  label: string;
  value?: string;
  href?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-text-tertiary flex items-center gap-1.5">
        <Icon className="w-3 h-3" /> {label}
      </p>
      {value ? (
        href ? (
          <a href={href} className="text-sm text-accent hover:underline break-words">{value}</a>
        ) : (
          <p className="text-sm text-white break-words">{value}</p>
        )
      ) : (
        <p className="text-sm text-text-tertiary">—</p>
      )}
    </div>
  );
}

export function LeadsPanel() {
  const [trainerLeads, setTrainerLeads] = useState<TrainerLead[] | null>(null);
  const [landingLeads, setLandingLeads] = useState<LandingLead[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    getTrainerLeads().then(setTrainerLeads).catch(() => { setTrainerLeads([]); toast.error('Could not load demo requests'); });
    getLandingLeads().then(setLandingLeads).catch(() => { setLandingLeads([]); toast.error('Could not load landing leads'); });
  }, []);

  const setStatus = useCallback((lead: TrainerLead, status: TrainerLead['status']) => {
    const previous = lead.status;
    setTrainerLeads((ls) => ls?.map((l) => (l.id === lead.id ? { ...l, status } : l)) ?? null);
    updateTrainerLeadStatus(lead.id, status).catch(() => {
      // Put it back rather than leaving the screen claiming something that did
      // not happen.
      setTrainerLeads((ls) => ls?.map((l) => (l.id === lead.id ? { ...l, status: previous } : l)) ?? null);
      toast.error('Could not update the status');
    });
  }, []);

  async function removeTrainerLead(lead: TrainerLead) {
    if (!confirm(`Delete the demo request from ${lead.name}? This cannot be undone.`)) return;
    setBusyId(lead.id);
    try {
      await deleteTrainerLead(lead.id);
      setTrainerLeads((ls) => ls?.filter((l) => l.id !== lead.id) ?? null);
      toast.success('Demo request deleted');
    } catch {
      toast.error('Could not delete it');
    } finally {
      setBusyId(null);
    }
  }

  async function removeLandingLead(lead: LandingLead) {
    if (!confirm(`Delete ${lead.email}? This cannot be undone.`)) return;
    setBusyId(lead.id);
    try {
      await deleteLandingLead(lead.id);
      setLandingLeads((ls) => ls?.filter((l) => l.id !== lead.id) ?? null);
      toast.success('Lead deleted');
    } catch {
      toast.error('Could not delete it');
    } finally {
      setBusyId(null);
    }
  }

  const newCount = trainerLeads?.filter((l) => l.status === 'new').length ?? 0;

  return (
    <div className="space-y-5">
      <Card className="p-4 lg:p-5 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-accent" /> Demo requests
              {newCount > 0 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent text-black">{newCount} new</span>
              )}
            </h2>
            <p className="text-xs text-text-secondary mt-1">
              Submitted from the trainers page, newest first.
            </p>
          </div>
          {!!trainerLeads?.length && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => downloadCsv(
                'demo-requests.csv',
                ['Name', 'Email', 'Phone', 'Business', 'Client count', 'Message', 'Status', 'Date'],
                trainerLeads.map((l) => [
                  l.name, l.email, l.phone ?? '', l.businessName ?? '',
                  l.clientCount ?? '', l.message ?? '', l.status, leadDateIso(l),
                ]),
              )}
            >
              <Download className="w-3.5 h-3.5" /> Export CSV
            </Button>
          )}
        </div>

        {trainerLeads === null ? (
          <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-40 rounded-xl" />)}</div>
        ) : trainerLeads.length === 0 ? (
          <p className="text-xs text-text-tertiary py-4">No demo requests yet.</p>
        ) : (
          <div className="space-y-3">
            {trainerLeads.map((lead) => (
              <div key={lead.id} className="bg-surface-elevated border border-white/8 rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-bold text-white break-words">{lead.name}</p>
                    <p className="text-[11px] text-text-tertiary mt-0.5">{leadDate(lead)}</p>
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full border flex-shrink-0 ${STATUS_STYLES[lead.status]}`}>
                    {lead.status}
                  </span>
                </div>

                {/* Every field the form asks for, each one labelled. A blank
                    optional field shows a dash so it reads as "they did not
                    say" rather than as something the panel failed to load. */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field icon={Mail} label="Email" value={lead.email} href={`mailto:${lead.email}`} />
                  <Field icon={Phone} label="Phone" value={lead.phone} href={lead.phone ? `tel:${lead.phone}` : undefined} />
                  <Field icon={Building2} label="Business or gym" value={lead.businessName} />
                  <Field icon={Users2} label="Clients" value={lead.clientCount} />
                </div>

                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-text-tertiary flex items-center gap-1.5">
                    <MessageSquare className="w-3 h-3" /> Anything else
                  </p>
                  {lead.message ? (
                    <p className="text-sm text-white whitespace-pre-wrap break-words mt-0.5">{lead.message}</p>
                  ) : (
                    <p className="text-sm text-text-tertiary">—</p>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-white/8">
                  <label className="sr-only" htmlFor={`status-${lead.id}`}>Status for {lead.name}</label>
                  <select
                    id={`status-${lead.id}`}
                    className="bg-surface border border-border rounded-lg px-2.5 py-1.5 text-xs text-white"
                    value={lead.status}
                    onChange={(e) => setStatus(lead, e.target.value as TrainerLead['status'])}
                  >
                    <option value="new">New</option>
                    <option value="contacted">Contacted</option>
                    <option value="closed">Closed</option>
                  </select>

                  <Button size="sm" variant="ghost" onClick={() => copy(lead.email, 'Email address')}>
                    <Copy className="w-3.5 h-3.5" /> Copy email
                  </Button>

                  <button
                    onClick={() => removeTrainerLead(lead)}
                    disabled={busyId === lead.id}
                    className="ml-auto p-2 rounded-lg text-text-tertiary hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-40"
                    aria-label={`Delete the demo request from ${lead.name}`}
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4 lg:p-5 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Mail className="w-4 h-4 text-accent" /> Landing page emails
            </h2>
            <p className="text-xs text-text-secondary mt-1">
              Captured before someone left the athlete landing page. Email address only — that form asks for nothing else.
            </p>
          </div>
          {!!landingLeads?.length && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => downloadCsv(
                'landing-page-emails.csv',
                ['Email', 'Date'],
                landingLeads.map((l) => [l.email, leadDateIso(l)]),
              )}
            >
              <Download className="w-3.5 h-3.5" /> Export CSV
            </Button>
          )}
        </div>

        {landingLeads === null ? (
          <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
        ) : landingLeads.length === 0 ? (
          <p className="text-xs text-text-tertiary py-4">Nothing captured yet.</p>
        ) : (
          <ul className="space-y-2">
            {landingLeads.map((lead) => (
              <li key={lead.id} className="flex items-center gap-3 bg-surface-elevated border border-white/8 rounded-xl px-3.5 py-2.5">
                <div className="min-w-0 flex-1">
                  <a href={`mailto:${lead.email}`} className="text-sm text-accent hover:underline break-words">{lead.email}</a>
                  <p className="text-[11px] text-text-tertiary flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3" /> {leadDate(lead)}
                  </p>
                </div>
                <button
                  onClick={() => copy(lead.email, 'Email address')}
                  className="p-2 rounded-lg text-text-tertiary hover:text-white hover:bg-white/5 transition-colors flex-shrink-0"
                  aria-label={`Copy ${lead.email}`}
                  title="Copy"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  onClick={() => removeLandingLead(lead)}
                  disabled={busyId === lead.id}
                  className="p-2 rounded-lg text-text-tertiary hover:text-danger hover:bg-danger/10 transition-colors flex-shrink-0 disabled:opacity-40"
                  aria-label={`Delete ${lead.email}`}
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
