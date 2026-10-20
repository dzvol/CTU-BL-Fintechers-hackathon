import { ExternalLink, Mail } from 'lucide-react';
import { PageHeader } from '@/components/sa/common';
import { Button } from '@/components/ui/button';

const EMAIL = 'czm@fel.cvut.cz';
const LAB_URL = 'https://czm.fel.cvut.cz/en/blockchain-lab';

export function Contact() {
  return (
    <>
      <PageHeader title="Contact">
        SemanticAuth was built at the CTU Blockchain Lab hackathon. Reach the lab by email or on its
        website.
      </PageHeader>
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <a href={`mailto:${EMAIL}`}>
            <Mail aria-hidden />
            {EMAIL}
          </a>
        </Button>
        <Button asChild variant="outline">
          <a href={LAB_URL} target="_blank" rel="noreferrer">
            CTU Blockchain Lab
            <ExternalLink aria-hidden />
          </a>
        </Button>
      </div>
    </>
  );
}
