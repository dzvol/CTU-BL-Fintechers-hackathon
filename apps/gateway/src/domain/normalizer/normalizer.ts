import { z } from 'zod';
import type {
  DataReceivalQuery,
  JsonValue,
  NormalizationResult,
  PaymentRequiredQuery,
  ToolCatalogQuery,
} from './schemas';

const jsonObject = z.record(z.string(), z.json());
const toolSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  inputSchema: jsonObject,
  annotations: z.json().optional(),
  _meta: z.json().optional(),
});
const bazaarToolSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  input: jsonObject,
});
const rpc = <T extends z.ZodType>(result: T) => z.object({ jsonrpc: z.literal('2.0'), result });
const mcpCatalogSchema = rpc(z.object({ tools: z.array(toolSchema) }));

const requirementSchema = z.object({
  scheme: z.string().min(1),
  payTo: z.string().min(1),
});
const resourceSchema = z.object({
  url: z.url(),
  description: z.string().optional(),
  serviceName: z.string().optional(),
});
const paymentSchema = z.object({
  x402Version: z.literal(2),
  resource: resourceSchema,
  accepts: z.array(requirementSchema).min(1),
  // The HTTP adapter attaches the separate 402 body to preserve it for Screen.
  additionalContent: z.json().optional(),
});
const mcpPaymentSchema = rpc(
  z.object({
    isError: z.literal(true),
    structuredContent: paymentSchema,
    content: z.array(z.json()).optional(),
  }),
);
const discoverySchema = z.object({
  x402Version: z.literal(2),
  items: z.array(
    z.object({
      resource: z.url(),
      accepts: z.array(requirementSchema).min(1),
    }),
  ),
});
const mppPaymentSchema = z.object({
  recipient: z.string().min(1),
  description: z.string().optional(),
});

// Non-text blocks stay intact, including MIME types and nested resources.
const contentBlockSchema = z
  .object({ type: z.string().min(1) })
  .catchall(z.json())
  .refine((block) => block.type !== 'text' || typeof block.text === 'string', {
    path: ['text'],
    message: 'Text content requires a string',
  });
const mcpDataSchema = rpc(
  z.object({
    isError: z.literal(false).optional(),
    content: z.array(contentBlockSchema),
  }),
);
// x402 does not define a body envelope for paid content, so the whole decoded body is data.
const x402DataSchema = z.json();

function field<T, R extends string>(value: T, risk_type: R) {
  return { value, risk_type };
}

function hasField(query: unknown, ...keys: string[]): boolean {
  return typeof query === 'object' && query !== null && keys.some((key) => key in query);
}

function normalize<S extends z.ZodType, T>(
  schema: S,
  query: unknown,
  map: (input: z.output<S>) => T[],
): NormalizationResult<T> {
  const result = schema.safeParse(query);
  if (!result.success) {
    return {
      success: false,
      reason: 'invalid_input',
      // Keep merchant-controlled values out of diagnostics.
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        code: issue.code,
      })),
    };
  }
  return { success: true, queries: map(result.data) };
}

/** Map an MCP tools/list response or one Bazaar discovery entry. */
export function mapToolCatalog(query: unknown): NormalizationResult<ToolCatalogQuery> {
  const schema = hasField(query, 'jsonrpc', 'result') ? mcpCatalogSchema : bazaarToolSchema;
  return normalize(schema, query, (input) => {
    const tools =
      'result' in input
        ? input.result.tools
        : [{ name: input.name, description: input.description, inputSchema: input.input }];
    return tools.map((tool) => ({
      stage: 'tool_catalog',
      fields_to_inspect: {
        name: field(tool.name, 'unexpected_instructions_or_deceptive_name'),
        ...(tool.description !== undefined && {
          description: field(tool.description, 'prompt_injection_or_instruction_override'),
        }),
        inputSchema: field(tool.inputSchema, 'schema_abuse_or_deceptive_parameter_description'),
        ...('annotations' in tool &&
          tool.annotations !== undefined && { annotation: field(tool.annotations, '') }),
        ...('_meta' in tool && tool._meta !== undefined && { metadata: field(tool._meta, '') }),
      },
    }));
  });
}

function paymentQueries(
  resource: z.infer<typeof resourceSchema>,
  accepts: z.infer<typeof requirementSchema>[],
  additionalContent?: JsonValue,
): PaymentRequiredQuery[] {
  return accepts.map((requirement) => ({
    stage: 'payment_required',
    ...(resource.serviceName !== undefined && { serviceName: resource.serviceName }),
    fields_to_inspect: {
      resourceUrl: field(resource.url, 'untrusted_destination_or_url_mismatch'),
      ...(resource.description !== undefined && {
        resourceDescription: field(
          resource.description,
          'prompt_injection_or_deceptive_payment_purpose',
        ),
      }),
      payToAddress: field(requirement.payTo, 'unexpected_or_unverified_payment_recipient'),
      scheme: field(requirement.scheme, 'unsupported_or_unexpected_payment_scheme'),
      ...(additionalContent !== undefined && {
        additionalContent: field(additionalContent, 'unexpected_data_with_harmful_text'),
      }),
    },
  }));
}

/** Map x402 v2, MCP, Bazaar resources/search, or MPP; emit one query per payment option. */
export function mapPaymentRequired(query: unknown): NormalizationResult<PaymentRequiredQuery> {
  // Select the transport before validation so an invalid envelope cannot fall back to another format.
  const schema = hasField(query, 'jsonrpc', 'result')
    ? mcpPaymentSchema
    : hasField(query, 'items')
      ? discoverySchema
      : hasField(query, 'x402Version', 'resource', 'accepts')
        ? paymentSchema
        : mppPaymentSchema;
  return normalize(schema, query, (input) => {
    if ('result' in input) {
      const { structuredContent, content } = input.result;
      return paymentQueries(
        structuredContent.resource,
        structuredContent.accepts,
        content ?? structuredContent.additionalContent,
      );
    }
    if ('items' in input) {
      return input.items.flatMap((item) => paymentQueries({ url: item.resource }, item.accepts));
    }
    if ('recipient' in input) {
      return [
        {
          stage: 'payment_required',
          fields_to_inspect: {
            payToAddress: field(input.recipient, 'unexpected_or_unverified_payment_recipient'),
            ...(input.description !== undefined && {
              resourceDescription: field(
                input.description,
                'prompt_injection_or_deceptive_payment_purpose',
              ),
            }),
          },
        },
      ];
    }
    return paymentQueries(input.resource, input.accepts, input.additionalContent);
  });
}

function dataQuery(value: JsonValue, contentType?: string): DataReceivalQuery {
  return {
    stage: 'data_receival',
    fields_to_inspect: {
      body: {
        value,
        ...(contentType !== undefined && { contentType }),
        risk_type: 'prompt_injection_or_malicious_content',
      },
    },
  };
}

/** Map the whole decoded x402 body, or every block in an MCP result. */
export function mapDataReceival(
  query: unknown,
  contentType?: string,
): NormalizationResult<DataReceivalQuery> {
  if (hasField(query, 'jsonrpc', 'result')) {
    return normalize(mcpDataSchema, query, (input) =>
      input.result.content.map((block) =>
        dataQuery(
          block.type === 'text' && typeof block.text === 'string' ? block.text : block,
          block.type,
        ),
      ),
    );
  }
  return normalize(x402DataSchema, query, (input) => [dataQuery(input, contentType)]);
}

/** MPP maps the entire decoded body; the optional content type comes from the HTTP header. */
export function mapMppDataReceival(
  query: unknown,
  contentType?: string,
): NormalizationResult<DataReceivalQuery> {
  return normalize(z.json(), query, (input) => [dataQuery(input, contentType)]);
}
