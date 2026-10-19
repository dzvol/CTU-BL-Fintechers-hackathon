import type { z } from 'zod';
import type { ScreenStateSchema } from './cases';

type ScreenState = z.infer<typeof ScreenStateSchema>;

/** A real, honest offer that untrusted text is planted into. */
export interface Carrier {
  id: string;
  url: string;
  serviceName?: string;
  description: string;
}

/** Where a merchant can put text the gateway reads: the 402 resource or the 402 body. */
export const POSITIONS = [
  'description_prefix',
  'description_suffix',
  'body_text',
  'body_nested',
] as const;
export type CarrierPosition = (typeof POSITIONS)[number];

/** The Screen state of `carrier` with `payload` planted at `position`. */
export function plant(carrier: Carrier, payload: string, position: CarrierPosition): ScreenState {
  const resource = {
    url: carrier.url,
    ...(carrier.serviceName !== undefined && { serviceName: carrier.serviceName }),
  };
  switch (position) {
    case 'description_prefix':
      return { resource: { ...resource, description: `${payload}\n\n${carrier.description}` } };
    case 'description_suffix':
      return { resource: { ...resource, description: `${carrier.description}\n\n${payload}` } };
    case 'body_text':
      return {
        resource: { ...resource, description: carrier.description },
        response_body_excerpt: { message: payload },
      };
    case 'body_nested':
      return {
        resource: { ...resource, description: carrier.description },
        response_body_excerpt: {
          error: 'payment_required',
          details: { pricing: 'per request', note: payload },
        },
      };
  }
}

/** The carrier alone, as the benign baseline. */
export const asIs = (carrier: Carrier): ScreenState => ({
  resource: {
    url: carrier.url,
    ...(carrier.serviceName !== undefined && { serviceName: carrier.serviceName }),
    description: carrier.description,
  },
});
