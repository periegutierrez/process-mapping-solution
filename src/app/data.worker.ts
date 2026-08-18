import { createDemoSnapshot } from './demo-data';
import { AuditLog, AttachmentMetadata, EntityType, Procedure, ProcedureStep, ProcedureWorkload, Process, Relationship, Snapshot } from './models';

type PersistenceMode = 'duckdb-opfs' | 'duckdb-memory' | 'memory-fallback';
interface RequestMessage { id: number; action: string; payload?: any; }
interface ResponseMessage { id: number; ok: boolean; result?: any; error?: string; }

let snapshot: Snapshot = createDemoSnapshot();
let persistenceMode: PersistenceMode = 'memory-fallback';
let persistenceNotice = 'Worker is loading the local data engine…';
let connection: any = null;

const context: any = self;
context.onmessage = async (event: MessageEvent<RequestMessage>) => {
  const { id, action, payload } = event.data;
  try {
    const result = await handle(action, payload);
    const response: ResponseMessage = { id, ok: true, result };
    context.postMessage(response);
  } catch (error) {
    const response: ResponseMessage = { id, ok: false, error: error instanceof Error ? error.message : String(error) };
    context.postMessage(response);
  }
};

async function handle(action: string, payload: any): Promise<any> {
  switch (action) {
    case 'initialize':
      await initializeDuckDb();
      return envelope();
    case 'get-state':
      return envelope();
    case 'save-process':
      saveProcess(payload as Process);
      await persist();
      return envelope();
    case 'delete-process':
      deleteEntity('process', payload.id);
      await persist();
      return envelope();
    case 'save-procedure':
      saveProcedure(payload as Procedure);
      await persist();
      return envelope();
    case 'delete-procedure':
      deleteEntity('procedure', payload.id);
      await persist();
      return envelope();
    case 'save-procedure-workload':
      saveProcedureWorkload(payload as ProcedureWorkload);
      await persist();
      return envelope();
    case 'delete-procedure-workload':
      snapshot.procedureWorkloads = snapshot.procedureWorkloads.filter((item) => item.id !== payload.id);
      addAudit('DELETE', 'procedure', payload.procedureId, `Deleted workload for ${payload.departmentGroup}`);
      await persist();
      return envelope();
    case 'save-procedure-step':
      saveProcedureStep(payload as ProcedureStep);
      await persist();
      return envelope();
    case 'delete-procedure-step':
      snapshot.procedureSteps = snapshot.procedureSteps.filter((item) => item.id !== payload.id);
      addAudit('DELETE', 'procedure', payload.procedureId, `Deleted step ${payload.stepNumber ?? ''}`.trim());
      await persist();
      return envelope();
    case 'add-attachment':
      snapshot.attachments.unshift(payload as AttachmentMetadata);
      addAudit('CREATE', payload.entityType, payload.entityId, `Added attachment metadata: ${payload.fileName}`);
      await persist();
      return envelope();
    case 'set-relationships':
      snapshot.relationships = Array.isArray(payload) ? payload as Relationship[] : snapshot.relationships;
      await persist();
      return envelope();
    case 'import-state':
      snapshot = sanitizeSnapshot(payload as Snapshot);
      addAudit('IMPORT', 'system', 'snapshot', 'Imported a JSON snapshot');
      await persist();
      return envelope();
    case 'export-state':
      addAudit('EXPORT', 'system', 'snapshot', 'Exported a JSON snapshot');
      return envelope();
    default:
      throw new Error(`Unknown worker action: ${action}`);
  }
}

async function initializeDuckDb(): Promise<void> {
  if (connection) return;
  try {
    const duckdb = await import('@duckdb/duckdb-wasm');
    const bundles: any = {
      mvp: {
        mainModule: `${self.location.origin}/duckdb/duckdb-mvp.wasm`,
        mainWorker: `${self.location.origin}/duckdb/duckdb-browser-mvp.worker.js`
      },
      eh: {
        mainModule: `${self.location.origin}/duckdb/duckdb-eh.wasm`,
        mainWorker: `${self.location.origin}/duckdb/duckdb-browser-eh.worker.js`
      }
    };
    const bundle = await duckdb.selectBundle(bundles);
    const duckWorker = new Worker(bundle.mainWorker!);
    const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), duckWorker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    try {
      await db.open({ path: 'opfs://process-mapping-v01.duckdb', accessMode: duckdb.DuckDBAccessMode.READ_WRITE });
      persistenceMode = 'duckdb-opfs';
      persistenceNotice = 'DuckDB WASM is persisting the workspace in OPFS.';
    } catch {
      await db.open({ path: ':memory:', accessMode: duckdb.DuckDBAccessMode.READ_WRITE });
      persistenceMode = 'duckdb-memory';
      persistenceNotice = 'DuckDB WASM is active; this browser did not expose OPFS, so this session is in memory.';
    }
    connection = await db.connect();
    await connection.query(schemaSql());
    const stored = await readSnapshot();
    if (stored) snapshot = sanitizeSnapshot(stored);
    else await persist();
  } catch (error) {
    persistenceMode = 'memory-fallback';
    const detail = error instanceof Error ? error.message : String(error);
    persistenceNotice = `DuckDB WASM could not initialize (${detail.slice(0, 140)}). The worker remains usable with an in-memory fallback.`;
  }
}

function schemaSql(): string {
  return `
    CREATE TABLE IF NOT EXISTS processes (id VARCHAR PRIMARY KEY, name VARCHAR, description VARCHAR, owner_id VARCHAR, status VARCHAR, created_by VARCHAR, created_at TIMESTAMP, updated_by VARCHAR, updated_at TIMESTAMP);
    CREATE TABLE IF NOT EXISTS procedures (id VARCHAR PRIMARY KEY, name VARCHAR, description VARCHAR, process_id VARCHAR, platform_id VARCHAR, step_order INTEGER, created_by VARCHAR, created_at TIMESTAMP, updated_by VARCHAR, updated_at TIMESTAMP);
    CREATE TABLE IF NOT EXISTS procedure_workloads (id VARCHAR PRIMARY KEY, procedure_id VARCHAR, department_group VARCHAR, transaction_volume INTEGER, transaction_frequency VARCHAR, duration_value DOUBLE, duration_unit VARCHAR, created_at TIMESTAMP, updated_at TIMESTAMP);
    CREATE TABLE IF NOT EXISTS procedure_steps (id VARCHAR PRIMARY KEY, procedure_id VARCHAR, step_number INTEGER, title VARCHAR, description VARCHAR, resource_url VARCHAR, resource_type VARCHAR, created_at TIMESTAMP, updated_at TIMESTAMP);
    CREATE TABLE IF NOT EXISTS users (id VARCHAR PRIMARY KEY, name VARCHAR, email VARCHAR, role VARCHAR, status VARCHAR);
    CREATE TABLE IF NOT EXISTS platforms (id VARCHAR PRIMARY KEY, name VARCHAR, category VARCHAR);
    CREATE TABLE IF NOT EXISTS process_relationships (id VARCHAR PRIMARY KEY, source_type VARCHAR, source_id VARCHAR, target_type VARCHAR, target_id VARCHAR, relation_type VARCHAR, created_at TIMESTAMP);
    CREATE TABLE IF NOT EXISTS attachments (id VARCHAR PRIMARY KEY, entity_type VARCHAR, entity_id VARCHAR, file_name VARCHAR, mime_type VARCHAR, file_size BIGINT, uploaded_by VARCHAR, uploaded_at TIMESTAMP, version INTEGER, storage_status VARCHAR);
    CREATE TABLE IF NOT EXISTS audit_logs (id VARCHAR PRIMARY KEY, action VARCHAR, entity_type VARCHAR, entity_id VARCHAR, summary VARCHAR, actor VARCHAR, created_at TIMESTAMP);
    CREATE TABLE IF NOT EXISTS app_state (key VARCHAR PRIMARY KEY, value JSON);
  `;
}

async function readSnapshot(): Promise<Snapshot | null> {
  if (!connection) return null;
  try {
    const rows = await connection.query("SELECT value::VARCHAR AS value FROM app_state WHERE key = 'snapshot'");
    const first = rows.toArray?.()[0] as any;
    if (!first?.value) return null;
    return typeof first.value === 'string' ? JSON.parse(first.value) as Snapshot : first.value as Snapshot;
  } catch {
    return null;
  }
}

async function persist(): Promise<void> {
  if (!connection) return;
  const json = escapeSql(JSON.stringify(snapshot));
  await connection.query(`INSERT OR REPLACE INTO app_state VALUES ('snapshot', '${json}'::JSON)`);
  await connection.query('CHECKPOINT');
}

function saveProcess(process: Process): void {
  const existing = snapshot.processes.some((item) => item.id === process.id);
  snapshot.processes = existing ? snapshot.processes.map((item) => item.id === process.id ? process : item) : [process, ...snapshot.processes];
  addAudit(existing ? 'UPDATE' : 'CREATE', 'process', process.id, `${existing ? 'Updated' : 'Created'} process ${process.name}`);
}

function saveProcedure(procedure: Procedure): void {
  const existing = snapshot.procedures.some((item) => item.id === procedure.id);
  snapshot.procedures = existing ? snapshot.procedures.map((item) => item.id === procedure.id ? procedure : item) : [procedure, ...snapshot.procedures];
  addAudit(existing ? 'UPDATE' : 'CREATE', 'procedure', procedure.id, `${existing ? 'Updated' : 'Created'} procedure ${procedure.name}`);
}

function saveProcedureWorkload(workload: ProcedureWorkload): void {
  const existing = snapshot.procedureWorkloads.some((item) => item.id === workload.id);
  snapshot.procedureWorkloads = existing ? snapshot.procedureWorkloads.map((item) => item.id === workload.id ? workload : item) : [...snapshot.procedureWorkloads, workload];
  addAudit(existing ? 'UPDATE' : 'CREATE', 'procedure', workload.procedureId, `${existing ? 'Updated' : 'Added'} workload for ${workload.departmentGroup}`);
}

function saveProcedureStep(step: ProcedureStep): void {
  const existing = snapshot.procedureSteps.some((item) => item.id === step.id);
  snapshot.procedureSteps = existing ? snapshot.procedureSteps.map((item) => item.id === step.id ? step : item) : [...snapshot.procedureSteps, step];
  addAudit(existing ? 'UPDATE' : 'CREATE', 'procedure', step.procedureId, `${existing ? 'Updated' : 'Added'} step ${step.stepNumber}: ${step.title}`);
}

function deleteEntity(type: EntityType, id: string): void {
  if (type === 'process') {
    const removed = snapshot.processes.find((item) => item.id === id);
    snapshot.processes = snapshot.processes.filter((item) => item.id !== id);
    snapshot.procedures = snapshot.procedures.filter((item) => item.processId !== id);
    const procedureIds = new Set(snapshot.procedures.filter((item) => item.processId !== id).map((item) => item.id));
    snapshot.procedureWorkloads = snapshot.procedureWorkloads.filter((item) => procedureIds.has(item.procedureId));
    snapshot.procedureSteps = snapshot.procedureSteps.filter((item) => procedureIds.has(item.procedureId));
    snapshot.relationships = snapshot.relationships.filter((item) => !(item.sourceType === type && item.sourceId === id) && !(item.targetType === type && item.targetId === id));
    snapshot.attachments = snapshot.attachments.filter((item) => !(item.entityType === type && item.entityId === id));
    addAudit('DELETE', type, id, `Deleted process ${removed?.name ?? id} and its linked records`);
  } else {
    const removed = snapshot.procedures.find((item) => item.id === id);
    snapshot.procedures = snapshot.procedures.filter((item) => item.id !== id);
    snapshot.procedureWorkloads = snapshot.procedureWorkloads.filter((item) => item.procedureId !== id);
    snapshot.procedureSteps = snapshot.procedureSteps.filter((item) => item.procedureId !== id);
    snapshot.relationships = snapshot.relationships.filter((item) => !(item.sourceType === type && item.sourceId === id) && !(item.targetType === type && item.targetId === id));
    snapshot.attachments = snapshot.attachments.filter((item) => !(item.entityType === type && item.entityId === id));
    addAudit('DELETE', type, id, `Deleted procedure ${removed?.name ?? id} and its linked records`);
  }
}

function addAudit(action: AuditLog['action'], entityType: AuditLog['entityType'], entityId: string, summary: string): void {
  snapshot.auditLogs = [{ id: `aud-${crypto.randomUUID()}`, action, entityType, entityId, summary, actor: 'usr-anna', createdAt: new Date().toISOString() }, ...snapshot.auditLogs].slice(0, 100);
}

function sanitizeSnapshot(input: Snapshot): Snapshot {
  const seed = createDemoSnapshot();
  const procedures = Array.isArray(input?.procedures) ? input.procedures.map((item) => ({
    ...item,
    transactionVolume: typeof item.transactionVolume === 'number' && Number.isFinite(item.transactionVolume) ? item.transactionVolume : 0,
    transactionFrequency: item.transactionFrequency ?? 'day',
    durationValue: typeof item.durationValue === 'number' && Number.isFinite(item.durationValue) ? item.durationValue : 0,
    durationUnit: item.durationUnit ?? 'minutes'
  })) : seed.procedures;
  const storedWorkloads = Array.isArray(input?.procedureWorkloads) ? input.procedureWorkloads : null;
  const containsOnlyLegacyGeneralWorkloads = Boolean(storedWorkloads?.length) && storedWorkloads!.every((item) => item.departmentGroup === 'General' && item.id === `wkl-${item.procedureId}`);
  const procedureWorkloads = storedWorkloads && !containsOnlyLegacyGeneralWorkloads
    ? storedWorkloads
    : procedures.flatMap((item) => {
      const seedWorkloads = seed.procedureWorkloads.filter((workload) => workload.procedureId === item.id);
      const storedWorkload = storedWorkloads?.find((workload) => workload.procedureId === item.id);
      return seedWorkloads.length ? seedWorkloads : storedWorkload ? [storedWorkload] : [{
        id: `wkl-${item.id}`,
        procedureId: item.id,
        departmentGroup: 'General',
        transactionVolume: item.transactionVolume,
        transactionFrequency: item.transactionFrequency,
        durationValue: item.durationValue,
        durationUnit: item.durationUnit,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
      }];
    });
  return {
    processes: Array.isArray(input?.processes) ? input.processes : seed.processes,
    procedures,
    procedureWorkloads,
    procedureSteps: Array.isArray(input?.procedureSteps) ? input.procedureSteps : seed.procedureSteps,
    users: Array.isArray(input?.users) ? input.users : seed.users,
    platforms: Array.isArray(input?.platforms) ? input.platforms : seed.platforms,
    relationships: Array.isArray(input?.relationships) ? input.relationships : [],
    attachments: Array.isArray(input?.attachments) ? input.attachments : [],
    auditLogs: Array.isArray(input?.auditLogs) ? input.auditLogs : []
  };
}

function envelope(): { snapshot: Snapshot; persistence: PersistenceMode; notice: string } {
  return { snapshot, persistence: persistenceMode, notice: persistenceNotice };
}

function escapeSql(value: string): string {
  return value.replaceAll("'", "''");
}
