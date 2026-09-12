/** Provider-neutral transactional email message. */
export interface EmailMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailSendResult {
  providerMessageId?: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<EmailSendResult | void>;
}
