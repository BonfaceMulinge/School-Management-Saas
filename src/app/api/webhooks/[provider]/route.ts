import { processProviderWebhook } from "@/server/integrations/payments/payment-service";

/**
 * Provider webhook endpoint (Phase 15).
 *
 *   POST /api/webhooks/{provider}
 *
 * The raw body is read exactly once and handed to `processProviderWebhook`,
 * which verifies the provider signature, looks up the stored transaction,
 * cross-checks tenant/amount, and applies the payment. The returned HTTP code
 * is provider-facing: 2xx = ack (may be IGNORED for replays), errors pause
 * delivery drive. Nothing is ever persisted for unverified requests.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ provider: string }> }
) {
  const { provider: providerName } = await ctx.params;

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return Response.json({ status: "FAILED", note: "Could not read the request body." }, { status: 400 });
  }

  let payload: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(rawBody);
    payload = (parsed && typeof parsed === "object" ? parsed : {}) as Record<string, unknown>;
  } catch {
    return Response.json({ status: "FAILED", note: "Invalid JSON payload." }, { status: 400 });
  }

  const headers: Record<string, string | string[] | undefined> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const result = await processProviderWebhook({
    providerName,
    headers,
    rawBody,
    payload,
  });

  return Response.json(
    {
      status: result.status,
      note: result.note,
      eventId: result.eventId ?? null,
    },
    { status: result.code }
  );
}