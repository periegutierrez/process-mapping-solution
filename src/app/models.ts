export type EntityType = 'process' | 'procedure';
export type ProcessStatus = 'Draft' | 'Active' | 'Under Review' | 'Archived';
export type UserRole = 'Admin' | 'Editor' | 'Viewer';
export type RelationshipType = 'depends_on';
export type ResourceLinkType = 'image' | 'document';
export type TransactionFrequency = 'day' | 'week' | 'month';
export type DurationUnit = 'seconds' | 'minutes' | 'hours' | 'days';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: 'Active' | 'Inactive';
}

export interface Platform {
  id: string;
  name: string;
  category: 'CRM' | 'ERP' | 'Productivity' | 'Manual' | 'Other';
}

export interface Process {
  id: string;
  code: string;
  name: string;
  description: string;
  ownerId: string;
  status: ProcessStatus;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
}

export interface Procedure {
  id: string;
  code: string;
  name: string;
  description: string;
  processId: string | null;
  platformId: string;
  stepOrder: number;
  transactionVolume: number;
  transactionFrequency: TransactionFrequency;
  durationValue: number;
  durationUnit: DurationUnit;
  resourceUrl: string;
  resourceType: ResourceLinkType;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
}

export interface ProcedureWorkload {
  id: string;
  procedureId: string;
  departmentGroup: string;
  transactionVolume: number;
  transactionFrequency: TransactionFrequency;
  durationValue: number;
  durationUnit: DurationUnit;
  createdAt: string;
  updatedAt: string;
}

export interface ProcedureStep {
  id: string;
  procedureId: string;
  stepNumber: number;
  title: string;
  description: string;
  resourceUrl: string;
  resourceType: ResourceLinkType;
  createdAt: string;
  updatedAt: string;
}

/** Normalized direction: source is the prerequisite, target is the dependent. */
export interface Relationship {
  id: string;
  sourceType: EntityType;
  sourceId: string;
  targetType: EntityType;
  targetId: string;
  relationType: RelationshipType;
  createdAt: string;
}

export interface AttachmentMetadata {
  id: string;
  entityType: EntityType;
  entityId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  uploadedBy: string;
  uploadedAt: string;
  version: number;
  storageStatus: 'metadata-only' | 'blob-stored';
}

export interface AuditLog {
  id: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'IMPORT' | 'EXPORT';
  entityType: EntityType | 'relationship' | 'system';
  entityId: string;
  summary: string;
  actor: string;
  createdAt: string;
}

export interface Snapshot {
  processes: Process[];
  procedures: Procedure[];
  procedureWorkloads: ProcedureWorkload[];
  procedureSteps: ProcedureStep[];
  users: User[];
  platforms: Platform[];
  relationships: Relationship[];
  attachments: AttachmentMetadata[];
  auditLogs: AuditLog[];
}

export interface WorkerEnvelope {
  snapshot: Snapshot;
  persistence: 'duckdb-opfs' | 'duckdb-memory' | 'memory-fallback';
  notice: string;
}

export interface DashboardMetrics {
  processCount: number;
  procedureCount: number;
  activeProcessCount: number;
  draftProcessCount: number;
  underReviewCount: number;
  relationshipCount: number;
  attachmentCount: number;
}
