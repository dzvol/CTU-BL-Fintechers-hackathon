import { z } from 'zod';

export const JsonValueSchema = z.json();
export type JsonValue = z.infer<typeof JsonValueSchema>;

const inspectedField = <T extends z.ZodType, R extends string>(value: T, risk: R) =>
  z.object({ value, risk_type: z.literal(risk) });

export const ToolCatalogQuerySchema = z.object({
  stage: z.literal('tool_catalog'),
  fields_to_inspect: z.object({
    name: inspectedField(z.string(), 'unexpected_instructions_or_deceptive_name'),
    description: inspectedField(z.string(), 'prompt_injection_or_instruction_override').optional(),
    inputSchema: inspectedField(z.json(), 'schema_abuse_or_deceptive_parameter_description'),
    annotation: inspectedField(z.json(), '').optional(),
    metadata: inspectedField(z.json(), '').optional(),
  }),
});
export type ToolCatalogQuery = z.infer<typeof ToolCatalogQuerySchema>;

export const PaymentRequiredQuerySchema = z.object({
  stage: z.literal('payment_required'),
  serviceName: z.string().optional(),
  fields_to_inspect: z.object({
    resourceUrl: inspectedField(z.string(), 'untrusted_destination_or_url_mismatch').optional(),
    resourceDescription: inspectedField(
      z.string(),
      'prompt_injection_or_deceptive_payment_purpose',
    ).optional(),
    payToAddress: inspectedField(z.string(), 'unexpected_or_unverified_payment_recipient'),
    scheme: inspectedField(z.string(), 'unsupported_or_unexpected_payment_scheme').optional(),
    additionalContent: inspectedField(z.json(), 'unexpected_data_with_harmful_text').optional(),
  }),
});
export type PaymentRequiredQuery = z.infer<typeof PaymentRequiredQuerySchema>;

export const DataReceivalQuerySchema = z.object({
  stage: z.literal('data_receival'),
  fields_to_inspect: z.object({
    body: z.object({
      value: z.json(),
      contentType: z.string().optional(),
      risk_type: z.literal('prompt_injection_or_malicious_content'),
    }),
  }),
});
export type DataReceivalQuery = z.infer<typeof DataReceivalQuerySchema>;

export const InspectionQuerySchema = z.discriminatedUnion('stage', [
  ToolCatalogQuerySchema,
  PaymentRequiredQuerySchema,
  DataReceivalQuerySchema,
]);
export type InspectionQuery = z.infer<typeof InspectionQuerySchema>;

export type NormalizationResult<T> =
  | { success: true; queries: T[] }
  | {
      success: false;
      reason: 'invalid_input';
      issues: { path: string; code: string }[];
    };
