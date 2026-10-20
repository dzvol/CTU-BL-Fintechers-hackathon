import type { NormalizedOffer } from '@semanticauth/contracts';
import { ChevronDown, ExternalLink, ShieldAlert } from 'lucide-react';
import { host } from '@/lib/labels';
import { Button } from '../ui/button';
import { CopyButton } from './common';

/**
 * What the agent is trying to buy, in the merchant's own words. Merchant text is untrusted: it is
 * shown as plain text, marked as unverified, and never turned into links.
 */
export function OfferSummary({ url, offer }: { url: string; offer?: NormalizedOffer }) {
  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-medium [overflow-wrap:anywhere]">
            {offer?.serviceName ?? host(url)}
          </h3>
          {offer?.serviceName && <p className="text-xs text-muted-foreground">{host(url)}</p>}
        </div>
        <Button asChild variant="outline" size="sm" className="h-8">
          <a href={new URL(url).origin} target="_blank" rel="noreferrer noopener">
            Website
            <ExternalLink aria-hidden />
          </a>
        </Button>
      </div>

      {offer?.description ? (
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">
          {offer.description}
        </p>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">The merchant gives no description.</p>
      )}

      <div className="mt-3 flex items-center gap-1 rounded-lg bg-muted py-1 pl-3 pr-1 font-mono text-xs">
        <span className="min-w-0 flex-1 truncate" title={url}>
          {url}
        </span>
        <CopyButton value={url} label="Copy URL" className="size-7" />
      </div>

      {offer?.details && (
        <details className="group mt-3 text-sm">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
            <ChevronDown
              className="size-4 transition-transform group-open:rotate-180"
              aria-hidden
            />
            Payment request
          </summary>
          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed [overflow-wrap:anywhere]">
            {offer.details}
          </pre>
        </details>
      )}

      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <ShieldAlert className="size-3.5" aria-hidden />
        Written by the merchant, not verified.
      </p>
    </div>
  );
}
