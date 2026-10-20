import { ExternalLink, Mail } from 'lucide-react';
import { PageHeader } from '@/components/sa/common';
import { Button } from '@/components/ui/button';

const EMAIL = 'czm@fel.cvut.cz';
const LAB_URL = 'https://czm.fel.cvut.cz/en/blockchain-lab';

export function Contact() {
  return (
    <>
      <PageHeader title="Contact">
        Questions, bugs or a request to delete your data: write to us.
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
