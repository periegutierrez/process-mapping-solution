import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DataService } from './data.service';
import { createDemoSnapshot } from './demo-data';
import { AttachmentMetadata, DashboardMetrics, DurationUnit, EntityType, Procedure, ProcedureStep, ProcedureWorkload, Process, ProcessStatus, Relationship, ResourceLinkType, Snapshot, TransactionFrequency } from './models';

type View = 'overview' | 'processes' | 'procedures' | 'graph' | 'settings';
type ProcedureTemplateValues = {
  procedure_code: string; procedure_name: string; procedure_description: string; parent_process_code: string; platform_name: string; department_group: string;
  transaction_volume: string; transaction_frequency: string; duration_value: string; duration_unit: string;
  procedure_resource_type: string; procedure_resource_url: string; step_number: string; step_title: string; step_description: string;
  step_resource_type: string; step_resource_url: string;
};
type ProcedureTemplateGroup = { firstRow: number; values: ProcedureTemplateValues; workloads: ProcedureTemplateValues[]; steps: ProcedureTemplateValues[] };

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class AppComponent {
  private readonly formBuilder = inject(FormBuilder);
  readonly data = inject(DataService);

  readonly view = signal<View>('overview');
  readonly search = signal('');
  readonly processEditorOpen = signal(false);
  readonly procedureEditorOpen = signal(false);
  readonly selectedProcessId = signal<string | null>(null);
  readonly selectedProcedureId = signal<string | null>(null);
  readonly relationError = signal('');
  readonly toast = signal('');
  readonly procedureTemplateError = signal('');
  readonly showImportInput = signal(false);
  readonly procedureTab = signal<'details' | 'steps'>('details');
  readonly editingStepId = signal<string | null>(null);
  readonly editingWorkloadId = signal<string | null>(null);
  readonly resourceLinkTypes: Array<{ value: ResourceLinkType; label: string }> = [
    { value: 'document', label: 'Document' },
    { value: 'image', label: 'Image' }
  ];
  readonly transactionFrequencyOptions: Array<{ value: TransactionFrequency; label: string }> = [
    { value: 'day', label: 'Per day' },
    { value: 'week', label: 'Per week' },
    { value: 'month', label: 'Per month' }
  ];
  readonly durationUnitOptions: Array<{ value: DurationUnit; label: string }> = [
    { value: 'seconds', label: 'Seconds' },
    { value: 'minutes', label: 'Minutes' },
    { value: 'hours', label: 'Hours' },
    { value: 'days', label: 'Days' }
  ];
  readonly procedureTemplateHeaders = [
    'procedure_code', 'procedure_name', 'procedure_description', 'parent_process_code', 'platform_name', 'department_group',
    'transaction_volume', 'transaction_frequency', 'duration_value', 'duration_unit',
    'procedure_resource_type', 'procedure_resource_url', 'step_number', 'step_title', 'step_description',
    'step_resource_type', 'step_resource_url'
  ] as const;

  readonly processStatuses: ProcessStatus[] = ['Draft', 'Active', 'Under Review', 'Archived'];

  readonly processForm = this.formBuilder.nonNullable.group({
    code: ['', [Validators.required, Validators.maxLength(20)]],
    name: ['', [Validators.required, Validators.maxLength(80)]],
    description: ['', [Validators.required, Validators.maxLength(500)]],
    ownerId: ['usr-anna', Validators.required],
    status: ['Draft' as ProcessStatus, Validators.required]
  });

  readonly procedureForm = this.formBuilder.nonNullable.group({
    code: ['', [Validators.required, Validators.maxLength(20)]],
    name: ['', [Validators.required, Validators.maxLength(80)]],
    description: ['', [Validators.required, Validators.maxLength(500)]],
    processId: [''],
    platformId: ['plt-manual', Validators.required],
    transactionVolume: [1, [Validators.required, Validators.min(0)]],
    transactionFrequency: ['day' as TransactionFrequency, Validators.required],
    durationValue: [15, [Validators.required, Validators.min(0)]],
    durationUnit: ['minutes' as DurationUnit, Validators.required],
    resourceUrl: [''],
    resourceType: ['document' as ResourceLinkType]
  });

  readonly stepForm = this.formBuilder.nonNullable.group({
    stepNumber: [1, [Validators.required, Validators.min(1)]],
    title: ['', [Validators.required, Validators.maxLength(120)]],
    description: ['', [Validators.required, Validators.maxLength(500)]],
    resourceUrl: [''],
    resourceType: ['document' as ResourceLinkType]
  });

  readonly workloadForm = this.formBuilder.nonNullable.group({
    departmentGroup: ['', [Validators.required, Validators.maxLength(100)]],
    transactionVolume: [1, [Validators.required, Validators.min(0)]],
    transactionFrequency: ['day' as TransactionFrequency, Validators.required],
    durationValue: [15, [Validators.required, Validators.min(0)]],
    durationUnit: ['minutes' as DurationUnit, Validators.required]
  });

  readonly selectedProcessDependencies = signal<string[]>([]);
  readonly selectedProcessSuccessions = signal<string[]>([]);
  readonly selectedProcedureDependencies = signal<string[]>([]);
  readonly selectedProcedureSuccessions = signal<string[]>([]);

  readonly metrics = computed<DashboardMetrics>(() => {
    const snapshot = this.data.snapshot();
    return {
      processCount: snapshot.processes.length,
      procedureCount: snapshot.procedures.length,
      activeProcessCount: snapshot.processes.filter((item) => item.status === 'Active').length,
      draftProcessCount: snapshot.processes.filter((item) => item.status === 'Draft').length,
      underReviewCount: snapshot.processes.filter((item) => item.status === 'Under Review').length,
      relationshipCount: snapshot.relationships.length,
      attachmentCount: snapshot.attachments.length
    };
  });

  readonly filteredProcesses = computed(() => {
    const query = this.search().trim().toLowerCase();
    const snapshot = this.data.snapshot();
    if (!query) return snapshot.processes;
    return snapshot.processes.filter((item) => `${item.code} ${item.name} ${item.description} ${this.ownerName(item.ownerId)} ${item.status}`.toLowerCase().includes(query));
  });

  readonly filteredProcedures = computed(() => {
    const query = this.search().trim().toLowerCase();
    const snapshot = this.data.snapshot();
    if (!query) return snapshot.procedures;
    return snapshot.procedures.filter((item) => `${item.code} ${item.name} ${item.description} ${this.platformName(item.platformId)} ${this.processName(item.processId)}`.toLowerCase().includes(query));
  });

  readonly recentActivity = computed(() => this.data.snapshot().auditLogs.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6));
  readonly graphNodes = computed(() => {
    const snapshot = this.data.snapshot();
    return [
      ...snapshot.processes.map((item) => ({ id: `process:${item.id}`, entityId: item.id, type: 'process' as EntityType, label: item.name, code: item.code, status: item.status })),
      ...snapshot.procedures.map((item) => ({ id: `procedure:${item.id}`, entityId: item.id, type: 'procedure' as EntityType, label: item.name, code: item.code, status: this.processName(item.processId) }))
    ];
  });
  readonly graphEdges = computed(() => this.data.snapshot().relationships);

  selectedProcessAttachments = computed(() => {
    const id = this.selectedProcessId();
    return id ? this.data.snapshot().attachments.filter((item) => item.entityType === 'process' && item.entityId === id) : [];
  });

  selectedProcedureAttachments = computed(() => {
    const id = this.selectedProcedureId();
    return id ? this.data.snapshot().attachments.filter((item) => item.entityType === 'procedure' && item.entityId === id) : [];
  });

  readonly selectedProcedureSteps = computed(() => {
    const id = this.selectedProcedureId();
    return id ? this.data.snapshot().procedureSteps.filter((item) => item.procedureId === id).sort((a, b) => a.stepNumber - b.stepNumber) : [];
  });

  readonly selectedProcedureWorkloads = computed(() => {
    const id = this.selectedProcedureId();
    return id ? this.data.snapshot().procedureWorkloads.filter((item) => item.procedureId === id).sort((a, b) => a.departmentGroup.localeCompare(b.departmentGroup)) : [];
  });

  setView(view: View): void {
    this.view.set(view);
    this.search.set('');
    this.closeEditors();
  }

  openNewProcess(): void {
    this.selectedProcessId.set(null);
    this.relationError.set('');
    this.processForm.reset({ code: 'P-00' + (this.metrics().processCount + 1), name: '', description: '', ownerId: 'usr-anna', status: 'Draft' });
    this.selectedProcessDependencies.set([]);
    this.selectedProcessSuccessions.set([]);
    this.processEditorOpen.set(true);
    this.view.set('processes');
  }

  editProcess(process: Process): void {
    this.selectedProcessId.set(process.id);
    this.processForm.reset({ code: process.code, name: process.name, description: process.description, ownerId: process.ownerId, status: process.status });
    this.selectedProcessDependencies.set(this.dependenciesFor('process', process.id));
    this.selectedProcessSuccessions.set(this.successionsFor('process', process.id));
    this.relationError.set('');
    this.processEditorOpen.set(true);
    this.view.set('processes');
  }

  async saveProcess(): Promise<void> {
    if (this.processForm.invalid) { this.processForm.markAllAsTouched(); return; }
    const raw = this.processForm.getRawValue();
    const existing = this.data.snapshot().processes.find((item) => item.id === this.selectedProcessId());
    const id = existing?.id ?? `prc-${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const process: Process = {
      id, code: raw.code.trim(), name: raw.name.trim(), description: raw.description.trim(), ownerId: raw.ownerId,
      status: raw.status, createdBy: existing?.createdBy ?? 'usr-anna', createdAt: existing?.createdAt ?? now, updatedBy: 'usr-anna', updatedAt: now
    };
    const relationships = this.replaceRelationships('process', id, this.selectedProcessDependencies(), this.selectedProcessSuccessions());
    const validation = this.validateNoCycle(relationships);
    if (validation) { this.relationError.set(validation); return; }
    await this.data.saveProcess(process);
    await this.data.setRelationships(relationships);
    this.selectedProcessId.set(id);
    this.toast.set(existing ? 'Process updated.' : 'Process created.');
    this.processEditorOpen.set(false);
  }

  async deleteProcess(process: Process): Promise<void> {
    if (!window.confirm(`Delete ${process.name} and its linked procedures?`)) return;
    await this.data.deleteProcess(process.id);
    if (this.selectedProcessId() === process.id) this.closeEditors();
    this.toast.set('Process deleted.');
  }

  openNewProcedure(): void {
    this.selectedProcedureId.set(null);
    this.procedureTab.set('details');
    this.editingStepId.set(null);
    this.editingWorkloadId.set(null);
    this.relationError.set('');
    this.procedureForm.reset({ code: 'PR-00' + (this.metrics().procedureCount + 1), name: '', description: '', processId: '', platformId: 'plt-manual', transactionVolume: 1, transactionFrequency: 'day', durationValue: 15, durationUnit: 'minutes', resourceUrl: '', resourceType: 'document' });
    this.resetStepForm(1);
    this.resetWorkloadForm();
    this.selectedProcedureDependencies.set([]);
    this.selectedProcedureSuccessions.set([]);
    this.procedureEditorOpen.set(true);
    this.view.set('procedures');
  }

  editProcedure(procedure: Procedure): void {
    this.selectedProcedureId.set(procedure.id);
    this.procedureTab.set('details');
    this.editingStepId.set(null);
    this.editingWorkloadId.set(null);
    this.procedureForm.reset({ code: procedure.code, name: procedure.name, description: procedure.description, processId: procedure.processId ?? '', platformId: procedure.platformId, transactionVolume: procedure.transactionVolume ?? 0, transactionFrequency: procedure.transactionFrequency ?? 'day', durationValue: procedure.durationValue ?? 0, durationUnit: procedure.durationUnit ?? 'minutes', resourceUrl: procedure.resourceUrl ?? '', resourceType: procedure.resourceType ?? 'document' });
    this.resetStepForm(this.nextStepNumber(procedure.id));
    this.resetWorkloadForm();
    this.selectedProcedureDependencies.set(this.dependenciesFor('procedure', procedure.id));
    this.selectedProcedureSuccessions.set(this.successionsFor('procedure', procedure.id));
    this.relationError.set('');
    this.procedureEditorOpen.set(true);
    this.view.set('procedures');
  }

  async saveProcedure(): Promise<void> {
    if (this.procedureForm.invalid) { this.procedureForm.markAllAsTouched(); return; }
    const raw = this.procedureForm.getRawValue();
    const existing = this.data.snapshot().procedures.find((item) => item.id === this.selectedProcedureId());
    const id = existing?.id ?? `prd-${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const procedure: Procedure = {
      id, code: raw.code.trim(), name: raw.name.trim(), description: raw.description.trim(), processId: raw.processId || null,
      platformId: raw.platformId, stepOrder: existing?.stepOrder ?? 1, transactionVolume: raw.transactionVolume, transactionFrequency: raw.transactionFrequency, durationValue: raw.durationValue, durationUnit: raw.durationUnit,
      resourceUrl: raw.resourceUrl.trim(), resourceType: raw.resourceType,
      createdBy: existing?.createdBy ?? 'usr-anna', createdAt: existing?.createdAt ?? now, updatedBy: 'usr-anna', updatedAt: now
    };
    const relationships = this.replaceRelationships('procedure', id, this.selectedProcedureDependencies(), this.selectedProcedureSuccessions());
    const validation = this.validateNoCycle(relationships);
    if (validation) { this.relationError.set(validation); return; }
    await this.data.saveProcedure(procedure);
    await this.data.setRelationships(relationships);
    this.selectedProcedureId.set(id);
    this.toast.set(existing ? 'Procedure details saved.' : 'Procedure created. Add department workloads below.');
    this.procedureEditorOpen.set(true);
    this.procedureTab.set('details');
    this.resetWorkloadForm();
  }

  async deleteProcedure(procedure: Procedure): Promise<void> {
    if (!window.confirm(`Delete ${procedure.name}?`)) return;
    await this.data.deleteProcedure(procedure.id);
    if (this.selectedProcedureId() === procedure.id) this.closeEditors();
    this.toast.set('Procedure deleted.');
  }

  editProcedureWorkload(workload: ProcedureWorkload): void {
    this.editingWorkloadId.set(workload.id);
    this.workloadForm.reset({ departmentGroup: workload.departmentGroup, transactionVolume: workload.transactionVolume, transactionFrequency: workload.transactionFrequency, durationValue: workload.durationValue, durationUnit: workload.durationUnit });
  }

  startNewProcedureWorkload(): void {
    this.editingWorkloadId.set(null);
    this.resetWorkloadForm();
  }

  async saveProcedureWorkload(): Promise<void> {
    const procedureId = this.selectedProcedureId();
    if (!procedureId) { this.toast.set('Save the procedure details before adding department workloads.'); return; }
    if (this.workloadForm.invalid) { this.workloadForm.markAllAsTouched(); return; }
    const raw = this.workloadForm.getRawValue();
    const existing = this.data.snapshot().procedureWorkloads.find((item) => item.id === this.editingWorkloadId());
    const now = new Date().toISOString();
    const workload: ProcedureWorkload = {
      id: existing?.id ?? `wkl-${crypto.randomUUID().slice(0, 8)}`, procedureId, departmentGroup: raw.departmentGroup.trim(), transactionVolume: Number(raw.transactionVolume), transactionFrequency: raw.transactionFrequency,
      durationValue: Number(raw.durationValue), durationUnit: raw.durationUnit, createdAt: existing?.createdAt ?? now, updatedAt: now
    };
    await this.data.saveProcedureWorkload(workload);
    this.toast.set(existing ? 'Department workload updated.' : 'Department workload added.');
    this.resetWorkloadForm();
  }

  async deleteProcedureWorkload(workload: ProcedureWorkload): Promise<void> {
    if (!window.confirm(`Delete the ${workload.departmentGroup} workload?`)) return;
    await this.data.deleteProcedureWorkload(workload.id, workload.procedureId, workload.departmentGroup);
    if (this.editingWorkloadId() === workload.id) this.resetWorkloadForm();
    this.toast.set('Department workload deleted.');
  }

  setProcedureTab(tab: 'details' | 'steps'): void {
    if (tab === 'steps' && !this.selectedProcedureId()) {
      this.toast.set('Save the procedure details first, then add its steps.');
      return;
    }
    this.procedureTab.set(tab);
    if (tab === 'steps' && this.selectedProcedureId()) this.resetStepForm(this.nextStepNumber(this.selectedProcedureId()!));
  }

  editProcedureStep(step: ProcedureStep): void {
    this.editingStepId.set(step.id);
    this.stepForm.reset({ stepNumber: step.stepNumber, title: step.title, description: step.description, resourceUrl: step.resourceUrl ?? '', resourceType: step.resourceType ?? 'document' });
  }

  startNewProcedureStep(): void {
    this.editingStepId.set(null);
    this.resetStepForm(this.nextStepNumber(this.selectedProcedureId()!));
  }

  async saveProcedureStep(): Promise<void> {
    const procedureId = this.selectedProcedureId();
    if (!procedureId) { this.toast.set('Save the procedure details before adding steps.'); return; }
    if (this.stepForm.invalid) { this.stepForm.markAllAsTouched(); return; }
    const raw = this.stepForm.getRawValue();
    const existing = this.data.snapshot().procedureSteps.find((item) => item.id === this.editingStepId());
    const now = new Date().toISOString();
    const step: ProcedureStep = {
      id: existing?.id ?? `stp-${crypto.randomUUID().slice(0, 8)}`, procedureId, stepNumber: Number(raw.stepNumber), title: raw.title.trim(), description: raw.description.trim(),
      resourceUrl: raw.resourceUrl.trim(), resourceType: raw.resourceType, createdAt: existing?.createdAt ?? now, updatedAt: now
    };
    await this.data.saveProcedureStep(step);
    this.toast.set(existing ? 'Step updated.' : 'Step added.');
    this.editingStepId.set(null);
    this.resetStepForm(this.nextStepNumber(procedureId));
  }

  async deleteProcedureStep(step: ProcedureStep): Promise<void> {
    if (!window.confirm(`Delete step ${step.stepNumber}: ${step.title}?`)) return;
    await this.data.deleteProcedureStep(step.id, step.procedureId, step.stepNumber);
    this.editingStepId.set(null);
    this.resetStepForm(this.nextStepNumber(step.procedureId));
    this.toast.set('Step deleted.');
  }

  toggleProcessDependency(id: string): void { this.selectedProcessDependencies.update((items) => this.toggle(items, id)); }
  toggleProcessSuccession(id: string): void { this.selectedProcessSuccessions.update((items) => this.toggle(items, id)); }
  toggleProcedureDependency(id: string): void { this.selectedProcedureDependencies.update((items) => this.toggle(items, id)); }
  toggleProcedureSuccession(id: string): void { this.selectedProcedureSuccessions.update((items) => this.toggle(items, id)); }

  isChecked(list: string[], id: string): boolean { return list.includes(id); }

  async onFileSelected(event: Event, entityType: EntityType): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    const entityId = entityType === 'process' ? this.selectedProcessId() : this.selectedProcedureId();
    if (!file || !entityId) return;
    const attachment: AttachmentMetadata = {
      id: `att-${crypto.randomUUID().slice(0, 8)}`, entityType, entityId, fileName: file.name, mimeType: file.type || 'application/octet-stream',
      fileSize: file.size, uploadedBy: 'usr-anna', uploadedAt: new Date().toISOString(), version: 1, storageStatus: 'metadata-only'
    };
    await this.data.addAttachment(attachment);
    input.value = '';
    this.toast.set(`Attachment metadata saved for ${file.name}.`);
  }

  downloadProcedureTemplate(): void {
    const csv = `${this.procedureTemplateHeaders.join(',')}\r\n`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'procedure-template.csv'; anchor.click(); URL.revokeObjectURL(url);
    this.procedureTemplateError.set('');
    this.toast.set('Procedure template downloaded.');
  }

  async onProcedureTemplateSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.procedureTemplateError.set('');
    try {
      const rows = this.parseCsv(await file.text());
      if (rows.length < 2) throw new Error('The template has no data rows. Add at least one procedure before uploading.');
      const headers = rows[0].map((header) => header.trim().replace(/^\uFEFF/, '').toLowerCase());
      const requiredHeaders = this.procedureTemplateHeaders.filter((header) => header !== 'department_group');
      const missing = requiredHeaders.filter((header) => !headers.includes(header));
      if (missing.length) throw new Error(`Missing template columns: ${missing.join(', ')}`);
      const records = this.procedureTemplateRecords(headers, rows.slice(1));
      if (!records.length) throw new Error('The template has no data rows. Add at least one procedure before uploading.');
      for (const record of records) {
        await this.data.saveProcedure(record.procedure);
        for (const workload of record.workloads) await this.data.saveProcedureWorkload(workload);
        for (const step of record.steps) await this.data.saveProcedureStep(step);
      }
      this.toast.set(`${records.length} procedure${records.length === 1 ? '' : 's'} imported from template.`);
      this.view.set('procedures');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Choose a valid filled procedure CSV template.';
      this.procedureTemplateError.set(message);
      this.toast.set('Procedure template import failed.');
    } finally {
      input.value = '';
    }
  }

  async exportJson(): Promise<void> {
    const snapshot = await this.data.exportSnapshot();
    const blob = new Blob([JSON.stringify({ schemaVersion: '0.1', exportedAt: new Date().toISOString(), snapshot }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `process-map-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url);
    this.toast.set('JSON snapshot exported.');
  }

  onImportJson(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as { snapshot?: Snapshot } | Snapshot;
        const snapshot = 'snapshot' in parsed && parsed.snapshot ? parsed.snapshot : parsed as Snapshot;
        await this.data.importSnapshot(snapshot);
        this.toast.set('JSON snapshot imported.');
      } catch { this.toast.set('Import failed: choose a valid v0.1 JSON snapshot.'); }
      input.value = '';
    };
    reader.readAsText(file);
  }

  resetDemo(): void {
    if (!window.confirm('Reset the local map to the v0.1 sample data?')) return;
    void this.data.importSnapshot(createDemoSnapshot()).then(() => this.toast.set('Sample data restored.'));
  }

  closeEditors(): void { this.processEditorOpen.set(false); this.procedureEditorOpen.set(false); this.procedureTab.set('details'); this.editingStepId.set(null); this.editingWorkloadId.set(null); this.relationError.set(''); }

  ownerName(id: string): string { return this.data.snapshot().users.find((item) => item.id === id)?.name ?? 'Unassigned'; }
  platformName(id: string): string { return this.data.snapshot().platforms.find((item) => item.id === id)?.name ?? 'Unspecified'; }
  processName(id: string | null): string { return id ? this.data.snapshot().processes.find((item) => item.id === id)?.name ?? 'Unknown process' : 'Standalone'; }
  procedureName(id: string): string { return this.data.snapshot().procedures.find((item) => item.id === id)?.name ?? id; }
  relationshipCount(id: string): number { return this.data.snapshot().relationships.filter((item) => item.sourceId === id || item.targetId === id).length; }
  initials(name: string): string { return name.split(' ').map((part) => part[0] ?? '').join('').slice(0, 2).toUpperCase(); }
  linkTypeLabel(type: ResourceLinkType): string { return type === 'image' ? 'Image' : 'Document'; }
  transactionFrequencyLabel(value: TransactionFrequency): string { return value === 'day' ? 'per day' : value === 'week' ? 'per week' : 'per month'; }
  durationUnitLabel(value: DurationUnit): string { return value.replace(/s$/, ''); }
  formatDate(value: string): string { return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)); }
  formatBytes(value: number): string { return value < 1024 ? `${value} B` : `${(value / 1024).toFixed(1)} KB`; }
  statusClass(status: string): string { return status.toLowerCase().replaceAll(' ', '-'); }
  trackById(_: number, item: { id: string }): string { return item.id; }
  graphX(index: number): number { return 110 + (index % 4) * 205; }
  graphY(index: number): number { return 74 + Math.floor(index / 4) * 118; }
  graphNode(id: string): { x: number; y: number; label: string } | null {
    const index = this.graphNodes().findIndex((node) => node.id === id);
    const node = this.graphNodes()[index];
    return node ? { x: this.graphX(index), y: this.graphY(index), label: node.label } : null;
  }

  private procedureTemplateRecords(headers: string[], rows: string[][]): Array<{ procedure: Procedure; workloads: ProcedureWorkload[]; steps: ProcedureStep[] }> {
    const procedureKeys: Array<keyof ProcedureTemplateValues> = ['procedure_code', 'procedure_name', 'procedure_description', 'parent_process_code', 'platform_name', 'procedure_resource_type', 'procedure_resource_url'];
    const workloadKeys: Array<keyof ProcedureTemplateValues> = ['department_group', 'transaction_volume', 'transaction_frequency', 'duration_value', 'duration_unit'];
    const stepKeys: Array<keyof ProcedureTemplateValues> = ['step_number', 'step_title', 'step_description', 'step_resource_type', 'step_resource_url'];
    const groups = new Map<string, ProcedureTemplateGroup>();
    const valueAt = (row: string[], key: string): string => (row[headers.indexOf(key)] ?? '').trim();
    rows.forEach((row, index) => {
      const rowNumber = index + 2;
      if (!row.some((cell) => cell.trim())) return;
      const values = Object.fromEntries(this.procedureTemplateHeaders.map((header) => [header, valueAt(row, header)])) as ProcedureTemplateValues;
      const code = values.procedure_code;
      if (!code) throw new Error(`Row ${rowNumber}: procedure_code is required.`);
      const groupKey = code.toLowerCase();
      const existingGroup = groups.get(groupKey);
      if (existingGroup) {
        if (procedureKeys.some((key) => existingGroup.values[key] !== values[key])) throw new Error(`Row ${rowNumber}: procedure fields must match other rows for ${code}.`);
      } else {
        groups.set(groupKey, { firstRow: rowNumber, values, workloads: [], steps: [] });
      }
      const group = groups.get(groupKey)!;
      const workloadValues = { ...values, department_group: values.department_group || 'General' };
      if (!workloadKeys.some((key) => values[key])) throw new Error(`Row ${rowNumber}: department_group, transaction_volume, transaction_frequency, duration_value, and duration_unit are required.`);
      if (!workloadValues.transaction_volume || !workloadValues.transaction_frequency || !workloadValues.duration_value || !workloadValues.duration_unit) throw new Error(`Row ${rowNumber}: complete the workload fields for ${workloadValues.department_group}.`);
      const sameDepartment = group.workloads.find((item) => item.department_group.toLowerCase() === workloadValues.department_group.toLowerCase());
      if (sameDepartment) {
        const sameWorkload = workloadKeys.every((key) => sameDepartment[key] === workloadValues[key]);
        if (!sameWorkload) throw new Error(`Row ${rowNumber}: workload values must match other rows for the ${workloadValues.department_group} group.`);
      } else {
        group.workloads.push(workloadValues);
      }
      const hasStep = stepKeys.some((key) => values[key]);
      if (!hasStep) return;
      if (!values.step_number || !values.step_title || !values.step_description) throw new Error(`Row ${rowNumber}: step_number, step_title, and step_description are required when defining a step.`);
      const stepNumber = Number(values.step_number);
      if (!Number.isInteger(stepNumber) || stepNumber < 1) throw new Error(`Row ${rowNumber}: step_number must be a whole number greater than zero.`);
      if (group.steps.some((step) => step.step_number === values.step_number)) throw new Error(`Row ${rowNumber}: duplicate step_number ${stepNumber} for ${code}.`);
      group.steps.push(values);
    });

    const snapshot = this.data.snapshot();
    return [...groups.values()].map((group) => {
      const values = group.values;
      const code = values.procedure_code;
      if (!values.procedure_name) throw new Error(`Row ${group.firstRow}: procedure_name is required.`);
      if (!values.procedure_description) throw new Error(`Row ${group.firstRow}: procedure_description is required.`);
      if (!values.platform_name) throw new Error(`Row ${group.firstRow}: platform_name is required.`);
      if (snapshot.procedures.some((item) => item.code.toLowerCase() === code.toLowerCase())) throw new Error(`Procedure code ${code} already exists. Use a new code for template imports.`);
      const platform = snapshot.platforms.find((item) => item.name.toLowerCase() === values.platform_name.toLowerCase());
      if (!platform) throw new Error(`Row ${group.firstRow}: platform_name must match an existing platform master.`);
      const process = values.parent_process_code ? snapshot.processes.find((item) => item.code.toLowerCase() === values.parent_process_code.toLowerCase() || item.name.toLowerCase() === values.parent_process_code.toLowerCase()) : undefined;
      if (values.parent_process_code && !process) throw new Error(`Row ${group.firstRow}: parent_process_code was not found in the process master.`);
      if (!group.workloads.length) throw new Error(`Row ${group.firstRow}: define at least one department/group workload.`);
      const now = new Date().toISOString();
      const workloads: ProcedureWorkload[] = group.workloads.map((workloadValues) => {
        const transactionVolume = Number(workloadValues.transaction_volume);
        if (!Number.isInteger(transactionVolume) || transactionVolume < 0) throw new Error(`Row ${group.firstRow}: transaction_volume must be a whole number zero or greater.`);
        const transactionFrequency = this.templateFrequency(workloadValues.transaction_frequency);
        if (!transactionFrequency) throw new Error(`Row ${group.firstRow}: transaction_frequency must be day, week, or month.`);
        const durationValue = Number(workloadValues.duration_value);
        if (!Number.isFinite(durationValue) || durationValue < 0) throw new Error(`Row ${group.firstRow}: duration_value must be zero or greater.`);
        const durationUnit = this.templateDurationUnit(workloadValues.duration_unit);
        if (!durationUnit) throw new Error(`Row ${group.firstRow}: duration_unit must be seconds, minutes, hours, or days.`);
        return { id: `wkl-${crypto.randomUUID().slice(0, 8)}`, procedureId: '', departmentGroup: workloadValues.department_group, transactionVolume, transactionFrequency, durationValue, durationUnit, createdAt: now, updatedAt: now };
      });
      const firstWorkload = workloads[0];
      const procedure: Procedure = {
        id: `prd-${crypto.randomUUID().slice(0, 8)}`, code, name: values.procedure_name, description: values.procedure_description,
        processId: process?.id ?? null, platformId: platform.id, stepOrder: 1, transactionVolume: firstWorkload.transactionVolume, transactionFrequency: firstWorkload.transactionFrequency, durationValue: firstWorkload.durationValue, durationUnit: firstWorkload.durationUnit,
        resourceUrl: values.procedure_resource_url, resourceType: this.templateResourceType(values.procedure_resource_type),
        createdBy: 'usr-anna', createdAt: now, updatedBy: 'usr-anna', updatedAt: now
      };
      workloads.forEach((workload) => workload.procedureId = procedure.id);
      const steps: ProcedureStep[] = group.steps.map((stepValues) => ({
        id: `stp-${crypto.randomUUID().slice(0, 8)}`, procedureId: procedure.id, stepNumber: Number(stepValues.step_number), title: stepValues.step_title,
        description: stepValues.step_description, resourceUrl: stepValues.step_resource_url, resourceType: this.templateResourceType(stepValues.step_resource_type), createdAt: now, updatedAt: now
      }));
      return { procedure, workloads, steps };
    });
  }

  private parseCsv(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [], value = '', quoted = false;
    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      const next = text[index + 1];
      if (character === '"' && quoted && next === '"') { value += '"'; index += 1; continue; }
      if (character === '"') { quoted = !quoted; continue; }
      if (character === ',' && !quoted) { row.push(value); value = ''; continue; }
      if ((character === '\n' || character === '\r') && !quoted) {
        if (character === '\r' && next === '\n') index += 1;
        row.push(value); value = '';
        if (row.some((cell) => cell.trim())) rows.push(row);
        row = [];
        continue;
      }
      value += character;
    }
    if (value || row.length) { row.push(value); if (row.some((cell) => cell.trim())) rows.push(row); }
    return rows;
  }

  private templateFrequency(value: string): TransactionFrequency | null {
    const normalized = value.toLowerCase().replace(/^per\s+/, '').trim();
    return normalized === 'day' || normalized === 'daily' ? 'day' : normalized === 'week' || normalized === 'weekly' ? 'week' : normalized === 'month' || normalized === 'monthly' ? 'month' : null;
  }

  private templateDurationUnit(value: string): DurationUnit | null {
    const normalized = value.toLowerCase().trim();
    if (['second', 'seconds', 'sec', 'secs', 's'].includes(normalized)) return 'seconds';
    if (['minute', 'minutes', 'min', 'mins', 'm'].includes(normalized)) return 'minutes';
    if (['hour', 'hours', 'hr', 'hrs', 'h'].includes(normalized)) return 'hours';
    if (['day', 'days', 'd'].includes(normalized)) return 'days';
    return null;
  }

  private templateResourceType(value: string): ResourceLinkType {
    const normalized = value.toLowerCase().trim();
    if (!normalized || normalized === 'document') return 'document';
    if (normalized === 'image') return 'image';
    throw new Error('Resource type must be image or document.');
  }

  private dependenciesFor(type: EntityType, id: string): string[] {
    return this.data.snapshot().relationships.filter((item) => item.targetType === type && item.targetId === id).map((item) => item.sourceId);
  }

  private successionsFor(type: EntityType, id: string): string[] {
    return this.data.snapshot().relationships.filter((item) => item.sourceType === type && item.sourceId === id).map((item) => item.targetId);
  }

  private replaceRelationships(type: EntityType, id: string, dependencies: string[], successions: string[]): Relationship[] {
    const snapshot = this.data.snapshot();
    const retained = snapshot.relationships.filter((item) => !((item.targetType === type && item.targetId === id) || (item.sourceType === type && item.sourceId === id)));
    const now = new Date().toISOString();
    const newRelations: Relationship[] = [
      ...dependencies.map((sourceId) => ({ id: `rel-${crypto.randomUUID().slice(0, 8)}`, sourceType: type, sourceId, targetType: type, targetId: id, relationType: 'depends_on' as const, createdAt: now })),
      ...successions.map((targetId) => ({ id: `rel-${crypto.randomUUID().slice(0, 8)}`, sourceType: type, sourceId: id, targetType: type, targetId, relationType: 'depends_on' as const, createdAt: now }))
    ];
    return [...retained, ...newRelations];
  }

  private validateNoCycle(relationships: Relationship[]): string {
    const adjacency = new Map<string, string[]>();
    for (const relationship of relationships) {
      const source = `${relationship.sourceType}:${relationship.sourceId}`;
      const target = `${relationship.targetType}:${relationship.targetId}`;
      adjacency.set(source, [...(adjacency.get(source) ?? []), target]);
    }
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (node: string): boolean => {
      if (visiting.has(node)) return true;
      if (visited.has(node)) return false;
      visiting.add(node);
      for (const next of adjacency.get(node) ?? []) if (visit(next)) return true;
      visiting.delete(node); visited.add(node); return false;
    };
    for (const node of adjacency.keys()) if (visit(node)) return 'Circular dependency detected. Remove one dependency or succession before saving.';
    return '';
  }

  private toggle(items: string[], id: string): string[] { return items.includes(id) ? items.filter((item) => item !== id) : [...items, id]; }

  private nextStepNumber(procedureId: string): number { return Math.max(0, ...this.data.snapshot().procedureSteps.filter((item) => item.procedureId === procedureId).map((item) => item.stepNumber)) + 1; }
  private resetStepForm(stepNumber: number): void { this.stepForm.reset({ stepNumber, title: '', description: '', resourceUrl: '', resourceType: 'document' }); }
  private resetWorkloadForm(): void { this.editingWorkloadId.set(null); this.workloadForm.reset({ departmentGroup: '', transactionVolume: 1, transactionFrequency: 'day', durationValue: 15, durationUnit: 'minutes' }); }
}
