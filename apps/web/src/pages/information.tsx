import { PublicShell } from '@/components/sa/public-shell';
import { PageHeader, Unsupported } from '@/components/sa/common';
export function Faq() {
  return (
    <>
      <PageHeader title="Frequently asked questions" />
      <section className="space-y-6">
        <div>
          <h2 className="mb-2 font-semibold">Who approves spending?</h2>
          <p>
            The owner approves an agent's intent in this dashboard. The gateway enforces the
            approved task on each purchase. Agent keys cannot approve.
          </p>
        </div>
        <div>
          <h2 className="mb-2 font-semibold">Is this a personal wallet?</h2>
          <p>
            No. The gateway uses a shared sponsor-funded wallet on Base Sepolia. Your assigned
            allocation does not show the wallet balance or your currently available funds.
          </p>
        </div>
        <div>
          <h2 className="mb-2 font-semibold">What happens if payment times out?</h2>
          <p>
            An unknown outcome is not a failed payment. Issued authorizations count as spent until
            reconciliation proves otherwise. Never retry payment automatically.
          </p>
        </div>
        <div>
          <h2 className="mb-2 font-semibold">Can I edit a proposed task?</h2>
          <p>
            Intent terms are immutable. Reject incorrect terms and ask the agent for a new proposal.
          </p>
        </div>
        <div>
          <h2 className="mb-2 font-semibold">What is still unavailable?</h2>
          <p>
            Purchase review decisions return 501 in this backend. Paid offer selection, payment
            execution and ledger totals are incomplete. Magic links, administration, contact
            submission and detailed audit evidence have no dashboard implementation yet.
          </p>
        </div>
      </section>
    </>
  );
}
export function Contact() {
  return (
    <>
      <PageHeader title="Contact" description="Ask your hackathon team for support." />
      <Unsupported>
        Contact submission is not connected. The gateway does not expose a contact endpoint; no
        message will be sent from this page.
      </Unsupported>
    </>
  );
}
export function AdminUnavailable() {
  return (
    <PublicShell>
      <PageHeader title="Administration" />
      <Unsupported>
        User roles and administrator operations are not exposed by the gateway. Administration is
        unavailable.
      </Unsupported>
    </PublicShell>
  );
}
