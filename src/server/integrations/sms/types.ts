/**
 * Provider-agnostic SMS delivery abstraction (Phase 15).
 *
 * SMS is the most privacy-sensitive channel: providers must be configured and
 * the school's communication preferences must allow the message type before
 * anything is sent. Production never fakes a delivered SMS.
 */

export type SmsSendRequest = {
  recipient: string;
  body: string;
};

export type SmsSendResult = {
  /** Provider-issued message id, when available. */
  providerReference?: string | null;
};

export interface SmsProvider {
  readonly name: string;
  send(req: SmsSendRequest): Promise<SmsSendResult>;
}