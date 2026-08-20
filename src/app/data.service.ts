import { Injectable, signal } from '@angular/core';
import { createDemoSnapshot } from './demo-data';
import { AttachmentMetadata, DropdownValue, Procedure, ProcedureStep, ProcedureWorkload, Process, ProcessOwnerPosition, Snapshot, SupportingDocument, WorkerEnvelope } from './models';

interface PendingRequest { resolve: (value: any) => void; reject: (reason: unknown) => void; }

@Injectable({ providedIn: 'root' })
export class DataService {
  readonly snapshot = signal<Snapshot>(createDemoSnapshot());
  readonly persistence = signal<WorkerEnvelope['persistence']>('memory-fallback');
  readonly notice = signal('Starting the local data worker…');
  readonly ready = signal(false);

  private readonly worker = new Worker(new URL('./data.worker', import.meta.url), { type: 'module' });
  private readonly pending = new Map<number, PendingRequest>();
  private sequence = 0;

  constructor() {
    this.worker.onmessage = (event: MessageEvent<{ id: number; ok: boolean; result?: any; error?: string }>) => {
      const request = this.pending.get(event.data.id);
      if (!request) return;
      this.pending.delete(event.data.id);
      if (event.data.ok) request.resolve(event.data.result);
      else request.reject(new Error(event.data.error ?? 'Worker request failed'));
    };
    this.worker.onerror = () => {
      this.notice.set('The data worker reported an error; the in-memory view remains available.');
      this.persistence.set('memory-fallback');
    };
    void this.initialize();
  }

  async initialize(): Promise<void> {
    try {
      const result = await this.request<WorkerEnvelope>('initialize');
      this.apply(result);
    } catch {
      this.ready.set(true);
    }
  }

  async saveProcess(process: Process): Promise<void> { this.apply(await this.request<WorkerEnvelope>('save-process', process)); }
  async saveProcessOwnerPosition(position: ProcessOwnerPosition): Promise<void> { this.apply(await this.request<WorkerEnvelope>('save-process-owner-position', position)); }
  async deleteProcessOwnerPosition(id: string): Promise<void> { this.apply(await this.request<WorkerEnvelope>('delete-process-owner-position', { id })); }
  async saveProcedure(procedure: Procedure): Promise<void> { this.apply(await this.request<WorkerEnvelope>('save-procedure', procedure)); }
  async deleteProcess(id: string): Promise<void> { this.apply(await this.request<WorkerEnvelope>('delete-process', { id })); }
  async deleteProcedure(id: string): Promise<void> { this.apply(await this.request<WorkerEnvelope>('delete-procedure', { id })); }
  async saveProcedureWorkload(workload: ProcedureWorkload): Promise<void> { this.apply(await this.request<WorkerEnvelope>('save-procedure-workload', workload)); }
  async deleteProcedureWorkload(id: string, procedureId: string, departmentGroup: string): Promise<void> { this.apply(await this.request<WorkerEnvelope>('delete-procedure-workload', { id, procedureId, departmentGroup })); }
  async saveProcedureStep(step: ProcedureStep): Promise<void> { this.apply(await this.request<WorkerEnvelope>('save-procedure-step', step)); }
  async deleteProcedureStep(id: string, procedureId: string, stepNumber: number): Promise<void> { this.apply(await this.request<WorkerEnvelope>('delete-procedure-step', { id, procedureId, stepNumber })); }
  async addAttachment(attachment: AttachmentMetadata): Promise<void> { this.apply(await this.request<WorkerEnvelope>('add-attachment', attachment)); }
  async saveSupportingDocument(document: SupportingDocument): Promise<void> { this.apply(await this.request<WorkerEnvelope>('save-supporting-document', document)); }
  async deleteSupportingDocument(id: string, entityId: string): Promise<void> { this.apply(await this.request<WorkerEnvelope>('delete-supporting-document', { id, entityId })); }
  async saveDropdownValue(value: DropdownValue): Promise<void> { this.apply(await this.request<WorkerEnvelope>('save-dropdown-value', value)); }
  async deleteDropdownValue(id: string): Promise<void> { this.apply(await this.request<WorkerEnvelope>('delete-dropdown-value', { id })); }
  async importSnapshot(snapshot: Snapshot): Promise<void> { this.apply(await this.request<WorkerEnvelope>('import-state', snapshot)); }

  async exportSnapshot(): Promise<Snapshot> {
    const result = await this.request<WorkerEnvelope>('export-state');
    this.apply(result);
    return result.snapshot;
  }

  private apply(result: WorkerEnvelope): void {
    this.snapshot.set(result.snapshot);
    this.persistence.set(result.persistence);
    this.notice.set(result.notice);
    this.ready.set(true);
  }

  private request<T>(action: string, payload?: unknown): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const id = ++this.sequence;
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, action, payload });
    });
  }
}
