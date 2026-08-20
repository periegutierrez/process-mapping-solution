export type EntityType = 'process' | 'procedure';
export type ProcessStatus = 'Draft' | 'Active' | 'Under Review' | 'Archived';
export type UserRole = 'Admin' | 'Editor' | 'Viewer';
export type ResourceLinkType = 'image' | 'document';
export type TransactionFrequency = 'day' | 'week' | 'month';
export type DurationUnit = 'seconds' | 'minutes' | 'hours' | 'days';
export type SupportingDocumentStatus = ProcessStatus;
export type DropdownListKey = 'supporting-document-status' | 'transaction-frequency' | 'duration-unit' | 'resource-link-type';

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
  /** Parent process when this record is a sub-process. */
  parentProcessId: string | null;
  /** Top-level process grouping for this record; null means this process is top-level. */
  topLevelProcessId: string | null;
  ownerId: string;
  ownerPositionId?: string | null;
  /** Retained for older snapshots; process status is no longer authored in the UI. */
  status: ProcessStatus;
  timeGapValue: number;
  timeGapUnit: DurationUnit;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
}

export interface ProcessOwnerPosition {
  id: string;
  position: string;
  assignedEmployeeId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Procedure {
  id: string;
  code: string;
  name: string;
  description: string;
  processId: string | null;
  /** Position of this procedure within its assigned process. */
  processOrder: number | null;
  platformId: string;
  transactionVolume: number;
  transactionFrequency: TransactionFrequency;
  durationValue: number;
  durationUnit: DurationUnit;
  timeGapValue: number;
  timeGapUnit: DurationUnit;
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

export interface SupportingDocument {
  id: string;
  entityType: EntityType;
  entityId: string;
  title: string;
  url: string;
  resourceType: ResourceLinkType;
  status: SupportingDocumentStatus;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
}

export interface DropdownValue {
  id: string;
  listKey: DropdownListKey;
  label: string;
  value: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'IMPORT' | 'EXPORT';
  entityType: EntityType | 'system';
  entityId: string;
  summary: string;
  actor: string;
  createdAt: string;
}

export interface Snapshot {
  processes: Process[];
  processOwnerPositions: ProcessOwnerPosition[];
  procedures: Procedure[];
  procedureWorkloads: ProcedureWorkload[];
  procedureSteps: ProcedureStep[];
  users: User[];
  platforms: Platform[];
  attachments: AttachmentMetadata[];
  supportingDocuments: SupportingDocument[];
  dropdownValues: DropdownValue[];
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
  hierarchyCount: number;
  attachmentCount: number;
}
