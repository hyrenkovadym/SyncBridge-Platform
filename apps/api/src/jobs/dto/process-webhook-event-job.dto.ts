import { UserRole } from '@prisma/client';

export interface ProcessWebhookEventJobPayload {
  backgroundJobId: string;
  webhookEventId: string;
  requestedByUserId?: string | null;
  requestedByRole?: UserRole | null;
}
