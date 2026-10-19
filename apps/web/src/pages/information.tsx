import { ChevronDown, ExternalLink } from 'lucide-react';
import { PageHeader } from '@/components/sa/common';
import { Button } from '@/components/ui/button';

const QUESTIONS = [
  {
    q: 'Who approves spending?',
    a: 'You do. Your agent proposes a task with a budget and rules, and nothing is bought until you approve it here. Agents can never approve anything themselves.',
  },
  {
    q: 'Why did a payment stop for my review?',
    a: 'The gateway pauses purchases that look risky: a changed recipient, a subscription, or an offer that doesn’t clearly fit the task. You have 5 minutes to approve or reject it on Overview.',
  },
  {
    q: 'Whose money does my agent spend?',
    a: 'A shared sponsor wallet on the Base Sepolia testnet. Your account gets an allowance, shown in the sidebar. When it runs out, agent keys stop working.',
  },
  {
    q: 'What does “Unconfirmed” mean?',
    a: 'The payment was sent but isn’t confirmed on chain yet. It counts as spent and is never retried automatically.',
  },
  {
    q: 'Can I change a proposed task?',
    a: 'No, approved terms can’t change. Reject the proposal and ask your agent for a new one.',
  },
  {
    q: 'What happens when I replace my key?',
    a: 'The old key stops working at once and its active task ends. Your history and allowance stay as they are.',
  },
];

export function Faq() {
  return (
    <>
      <PageHeader title="FAQ" />
      <div className="divide-y overflow-hidden rounded-xl border bg-card">
        {QUESTIONS.map(({ q, a }) => (
          <details key={q} className="group px-4 sm:px-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-medium [&::-webkit-details-marker]:hidden">
              {q}
              <ChevronDown
                className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                aria-hidden
              />
            </summary>
            <p className="-mt-1 pb-4 text-sm leading-relaxed text-muted-foreground">{a}</p>
          </details>
        ))}
      </div>
    </>
  );
}

export function Contact() {
  return (
    <>
      <PageHeader title="Contact">
        Found a bug or have a question? Open an issue and the team will get back to you.
      </PageHeader>
      <Button asChild variant="outline">
        <a
          href="https://github.com/dzvol/CTU-BL-Fintechers-hackathon/issues"
          target="_blank"
          rel="noreferrer"
        >
          Open an issue on GitHub
          <ExternalLink aria-hidden />
        </a>
      </Button>
    </>
  );
}
