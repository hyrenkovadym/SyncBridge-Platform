import { SyncRunTriggerType, UserRole } from '@prisma/client';

export interface SyncRunMockRecordPayload {
  externalId?: string;
  raw: Record<string, unknown>;
}

export interface ExecuteSyncRunJobPayload {
  backgroundJobId: string;
  syncRunId: string;
  pipelineId: string;
  requestedByUserId: string;
  requestedByRole: UserRole;
  mockRecords: SyncRunMockRecordPayload[];
  ignoreCursor: boolean;
  triggerType: SyncRunTriggerType;
}
