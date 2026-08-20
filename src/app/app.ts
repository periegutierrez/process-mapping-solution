import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import * as XLSX from 'xlsx';
import { DataService } from './data.service';
import { createDemoSnapshot } from './demo-data';
import { AttachmentMetadata, DashboardMetrics, DropdownListKey, DropdownValue, DurationUnit, EntityType, Procedure, ProcedureStep, ProcedureWorkload, Process, ProcessOwnerPosition, ProcessStatus, ResourceLinkType, Snapshot, SupportingDocument, SupportingDocumentStatus, TransactionFrequency } from './models';

type View = 'overview' | 'processes' | 'procedures' | 'graph' | 'settings';
type GraphNode = { id: string; entityId: string; type: EntityType; label: string; code: string; status: string; processOrder?: number | null };
type GraphEdge = { id: string; sourceType: EntityType; sourceId: string; targetType: EntityType; targetId: string };
type GraphPosition = { x: number; y: number; width: number; height: number };
type ProcedureTemplateValues = {
  procedure_code: string; procedure_name: string; procedure_description: string; parent_process_code: string; process_order: string; time_gap_value: string; time_gap_unit: string; platform_name: string; department_group: string;
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
  readonly procedureOrderDrafts = signal<Record<string, number>>({});
  readonly formError = signal('');
  readonly toast = signal('');
  readonly procedureTemplateError = signal('');
  readonly showImportInput = signal(false);
  readonly procedureTab = signal<'details' | 'steps'>('details');
  readonly editingStepId = signal<string | null>(null);
  readonly editingWorkloadId = signal<string | null>(null);
  readonly editingSupportingDocumentId = signal<string | null>(null);
  readonly procedureStepMapId = signal<string | null>(null);
  readonly editingOwnerPositionId = signal<string | null>(null);
  readonly editingDropdownValueId = signal<string | null>(null);
  readonly maintenanceListKey = signal<DropdownListKey>('supporting-document-status');
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
    'procedure_code', 'procedure_name', 'procedure_description', 'parent_process_code', 'process_order', 'time_gap_value', 'time_gap_unit', 'platform_name', 'department_group',
    'transaction_volume', 'transaction_frequency', 'duration_value', 'duration_unit',
    'procedure_resource_type', 'procedure_resource_url', 'step_number', 'step_title', 'step_description',
    'step_resource_type', 'step_resource_url'
  ] as const;

  readonly processStatuses: ProcessStatus[] = ['Draft', 'Active', 'Under Review', 'Archived'];

  readonly processForm = this.formBuilder.nonNullable.group({
    code: ['', [Validators.required, Validators.maxLength(20)]],
    name: ['', [Validators.required, Validators.maxLength(80)]],
    description: ['', [Validators.required, Validators.maxLength(500)]],
    timeGapValue: [0, [Validators.required, Validators.min(0)]],
    timeGapUnit: ['minutes' as DurationUnit, Validators.required],
    parentProcessId: [''],
    topLevelProcessId: [''],
    ownerId: ['usr-anna', Validators.required],
    ownerPositionId: ['pos-customer-success-manager', Validators.required],
    status: ['Draft' as ProcessStatus, Validators.required]
  });

  readonly supportingDocumentForm = this.formBuilder.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(120)]],
    url: ['', [Validators.required, Validators.pattern(/^https?:\/\/.+/i)]],
    resourceType: ['document' as ResourceLinkType, Validators.required],
    status: ['Draft' as SupportingDocumentStatus, Validators.required]
  });

  readonly ownerPositionForm = this.formBuilder.nonNullable.group({
    position: ['', [Validators.required, Validators.maxLength(100)]],
    assignedEmployeeId: ['', Validators.required]
  });

  readonly dropdownValueForm = this.formBuilder.nonNullable.group({
    listKey: ['supporting-document-status' as DropdownListKey, Validators.required],
    label: ['', [Validators.required, Validators.maxLength(80)]],
    value: ['', [Validators.required, Validators.maxLength(80)]]
  });

  readonly procedureForm = this.formBuilder.nonNullable.group({
    code: ['', [Validators.required, Validators.maxLength(20)]],
    name: ['', [Validators.required, Validators.maxLength(80)]],
    description: ['', [Validators.required, Validators.maxLength(500)]],
    processId: [''],
    processOrder: [1, [Validators.required, Validators.min(1)]],
    platformId: ['plt-manual', Validators.required],
    transactionVolume: [1, [Validators.required, Validators.min(0)]],
    transactionFrequency: ['day' as TransactionFrequency, Validators.required],
    durationValue: [15, [Validators.required, Validators.min(0)]],
    durationUnit: ['minutes' as DurationUnit, Validators.required],
    timeGapValue: [0, [Validators.required, Validators.min(0)]],
    timeGapUnit: ['minutes' as DurationUnit, Validators.required],
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

  readonly metrics = computed<DashboardMetrics>(() => {
    const snapshot = this.data.snapshot();
    return {
      processCount: snapshot.processes.length,
      procedureCount: snapshot.procedures.length,
      activeProcessCount: snapshot.processes.filter((item) => item.status === 'Active').length,
      draftProcessCount: snapshot.processes.filter((item) => item.status === 'Draft').length,
      underReviewCount: snapshot.processes.filter((item) => item.status === 'Under Review').length,
      hierarchyCount: snapshot.processes.filter((item) => Boolean(item.parentProcessId || item.topLevelProcessId)).length,
      attachmentCount: snapshot.attachments.length
    };
  });

  readonly filteredProcesses = computed(() => {
    const query = this.search().trim().toLowerCase();
    const snapshot = this.data.snapshot();
    const processes = query
      ? snapshot.processes.filter((item) => `${item.code} ${item.name} ${item.description} ${this.ownerPositionName(item.ownerPositionId)} ${this.ownerName(item.ownerId)} ${this.processName(item.parentProcessId)} ${this.processTopLevelName(item)}`.toLowerCase().includes(query))
      : snapshot.processes;
    return processes.slice().sort((a, b) => this.compareProcessHierarchy(a, b));
  });

  readonly filteredProcedures = computed(() => {
    const query = this.search().trim().toLowerCase();
    const snapshot = this.data.snapshot();
    const procedures = query
      ? snapshot.procedures.filter((item) => `${item.code} ${item.name} ${item.description} ${this.platformName(item.platformId)} ${this.processName(item.processId)}`.toLowerCase().includes(query))
      : snapshot.procedures;
    const groups = new Map<string, Procedure[]>();
    procedures.forEach((procedure) => groups.set(procedure.processId ?? '', [...(groups.get(procedure.processId ?? '') ?? []), procedure]));
    return [...groups.entries()]
      .sort(([left], [right]) => this.processName(left || null).localeCompare(this.processName(right || null)))
      .flatMap(([, items]) => items.slice().sort((a, b) => this.compareProcedureOrder(a, b)));
  });

  readonly selectedProcessProcedures = computed(() => {
    const processId = this.selectedProcessId();
    return processId ? this.data.snapshot().procedures.filter((item) => item.processId === processId).slice().sort((a, b) => this.compareProcedureOrder(a, b)) : [];
  });

  readonly processParentOptions = computed(() => {
    const currentId = this.selectedProcessId();
    return this.data.snapshot().processes.filter((item) => item.id !== currentId).slice().sort((a, b) => this.compareProcessHierarchy(a, b));
  });

  readonly processTopLevelOptions = computed(() => {
    const currentId = this.selectedProcessId();
    return this.data.snapshot().processes.filter((item) => item.id !== currentId && !item.parentProcessId && this.processTopLevelId(item) === item.id).slice().sort((a, b) => this.compareProcessHierarchy(a, b));
  });

  readonly recentActivity = computed(() => this.data.snapshot().auditLogs.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6));
  readonly graphNodes = computed<GraphNode[]>(() => {
    const snapshot = this.data.snapshot();
    return [
      ...snapshot.processes.map((item) => ({ id: `process:${item.id}`, entityId: item.id, type: 'process' as EntityType, label: item.name, code: item.code, status: this.ownerPositionName(item.ownerPositionId) })),
      ...snapshot.procedures.map((item) => ({ id: `procedure:${item.id}`, entityId: item.id, type: 'procedure' as EntityType, label: item.name, code: item.code, status: this.processName(item.processId), processOrder: item.processOrder }))
    ];
  });
  readonly graphProcessNodes = computed(() => this.graphNodes().filter((node) => node.type === 'process'));
  readonly graphPositions = computed(() => this.buildGraphPositions(this.graphDisplayNodes()));
  readonly graphProcessOptions = computed(() => this.graphProcessNodes().filter((node) => {
    const process = this.data.snapshot().processes.find((item) => item.id === node.entityId);
    return process ? this.processTopLevelId(process) === process.id : false;
  }).sort((a, b) => a.label.localeCompare(b.label)));
  readonly graphTrail = signal<string[]>([]);
  readonly graphTopLevelId = signal<string | null>(null);
  readonly graphFocusNode = computed(() => {
    const focusId = this.graphTrail().at(-1);
    return focusId ? this.graphNodes().find((node) => node.id === focusId) ?? null : null;
  });
  readonly graphTrailNodes = computed(() => this.graphTrail().map((id) => this.graphNodes().find((node) => node.id === id)).filter((node): node is GraphNode => Boolean(node)));
  readonly graphDisplayNodes = computed(() => {
    const topLevelId = this.graphTopLevelId();
    if (!topLevelId) return [];
    const processNodes = this.graphProcessNodes().filter((node) => this.processTopLevelIdById(node.entityId) === topLevelId);
    const focusProcessId = this.graphFocusNode()?.type === 'process' ? this.graphFocusNode()?.entityId : null;
    const procedureNodes = this.graphNodes().filter((node) => node.type === 'procedure' && this.data.snapshot().procedures.some((procedure) => procedure.id === node.entityId && procedure.processId === focusProcessId));
    return [...processNodes, ...procedureNodes];
  });
  readonly graphEdges = computed<GraphEdge[]>(() => {
    const visibleIds = new Set(this.graphDisplayNodes().map((node) => node.id));
    return this.graphAllEdges().filter((edge) => visibleIds.has(`${edge.sourceType}:${edge.sourceId}`) && visibleIds.has(`${edge.targetType}:${edge.targetId}`));
  });
  readonly graphProcedureNodes = computed(() => this.graphDisplayNodes().filter((node) => node.type === 'procedure').slice().sort((a, b) => (a.processOrder ?? Number.MAX_SAFE_INTEGER) - (b.processOrder ?? Number.MAX_SAFE_INTEGER) || a.label.localeCompare(b.label) || a.code.localeCompare(b.code)));
  readonly graphConnectedNodes = computed(() => {
    const focusId = this.graphFocusNode()?.id;
    return focusId ? this.graphProcessNodes().filter((node) => node.id !== focusId && this.processTopLevelIdById(node.entityId) === this.graphTopLevelId()) : [];
  });

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
  readonly procedureStepMapProcedure = computed(() => {
    const id = this.procedureStepMapId();
    return id ? this.data.snapshot().procedures.find((item) => item.id === id) ?? null : null;
  });
  readonly procedureStepMapSteps = computed(() => {
    const id = this.procedureStepMapId();
    return id ? this.data.snapshot().procedureSteps.filter((item) => item.procedureId === id).sort((a, b) => a.stepNumber - b.stepNumber) : [];
  });
  readonly processOwnerPositions = computed(() => this.data.snapshot().processOwnerPositions.slice().sort((a, b) => a.position.localeCompare(b.position)));
  readonly selectedProcessSupportDocuments = computed(() => {
    const id = this.selectedProcessId();
    return id ? this.data.snapshot().supportingDocuments.filter((item) => item.entityType === 'process' && item.entityId === id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : [];
  });
  readonly supportingDocumentStatusOptions = computed(() => this.dropdownOptions('supporting-document-status').map((item) => ({ value: item.value as SupportingDocumentStatus, label: item.label })));
  readonly maintenanceDropdownValues = computed(() => this.data.snapshot().dropdownValues.filter((item) => item.listKey === this.maintenanceListKey()).sort((a, b) => a.label.localeCompare(b.label)));
  readonly maintenanceListOptions: Array<{ value: DropdownListKey; label: string }> = [
    { value: 'supporting-document-status', label: 'Supporting document status' },
    { value: 'transaction-frequency', label: 'Transaction frequency' },
    { value: 'duration-unit', label: 'Duration unit' },
    { value: 'resource-link-type', label: 'Resource link type' }
  ];

  setView(view: View): void {
    this.view.set(view);
    this.search.set('');
    this.closeEditors();
    if (view === 'graph') this.resetGraphSelection();
    else this.closeProcedureStepMap();
  }

  onGraphRootChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.selectGraphRoot(value);
  }

  onProcessParentChange(event: Event): void {
    const parentId = (event.target as HTMLSelectElement).value || null;
    if (parentId) this.processForm.controls.topLevelProcessId.setValue(this.processTopLevelIdById(parentId) ?? '');
  }

  selectGraphRoot(id: string): void {
    const process = this.data.snapshot().processes.find((item) => item.id === id);
    if (!process || this.processTopLevelId(process) !== process.id) {
      this.resetGraphSelection();
      return;
    }
    this.graphTopLevelId.set(id);
    this.graphTrail.set([`process:${id}`]);
  }

  drillDownGraphNode(id: string): void {
    const node = this.graphDisplayNodes().find((item) => item.id === id);
    if (!node) return;
    if (node.type === 'procedure') { this.openProcedureStepMap(node.entityId); return; }
    const trail = this.graphTrail();
    const existingIndex = trail.indexOf(id);
    this.graphTrail.set(existingIndex >= 0 ? trail.slice(0, existingIndex + 1) : [...trail, id]);
  }

  drillUpGraphNode(): void {
    const trail = this.graphTrail();
    if (trail.length > 1) this.graphTrail.set(trail.slice(0, -1));
  }

  resetGraphSelection(): void { this.graphTrail.set([]); this.graphTopLevelId.set(null); this.closeProcedureStepMap(); }

  openProcedureStepMap(procedureId: string): void {
    if (!this.data.snapshot().procedures.some((item) => item.id === procedureId)) return;
    this.procedureStepMapId.set(procedureId);
  }

  closeProcedureStepMap(): void { this.procedureStepMapId.set(null); }

  openNewProcess(): void {
    this.selectedProcessId.set(null);
    this.procedureOrderDrafts.set({});
    this.formError.set('');
    this.processForm.reset({ code: 'P-00' + (this.metrics().processCount + 1), name: '', description: '', timeGapValue: 0, timeGapUnit: 'minutes', parentProcessId: '', topLevelProcessId: '', ownerId: this.defaultOwnerEmployeeId(), ownerPositionId: this.defaultOwnerPositionId(), status: 'Draft' });
    this.startNewSupportingDocument();
    this.processEditorOpen.set(true);
    this.view.set('processes');
  }

  editProcess(process: Process): void {
    this.selectedProcessId.set(process.id);
    this.initializeProcedureOrderDrafts(process.id);
    this.processForm.reset({ code: process.code, name: process.name, description: process.description, timeGapValue: process.timeGapValue ?? 0, timeGapUnit: process.timeGapUnit ?? 'minutes', parentProcessId: process.parentProcessId ?? '', topLevelProcessId: process.topLevelProcessId ?? (process.parentProcessId ? this.processTopLevelId(process) : ''), ownerId: process.ownerId, ownerPositionId: process.ownerPositionId ?? this.defaultOwnerPositionId(), status: process.status ?? 'Draft' });
    this.startNewSupportingDocument();
    this.formError.set('');
    this.processEditorOpen.set(true);
    this.view.set('processes');
  }

  async saveProcess(): Promise<void> {
    if (this.processForm.invalid) { this.processForm.markAllAsTouched(); return; }
    const raw = this.processForm.getRawValue();
    const existing = this.data.snapshot().processes.find((item) => item.id === this.selectedProcessId());
    const id = existing?.id ?? `prc-${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const ownerPosition = this.data.snapshot().processOwnerPositions.find((item) => item.id === raw.ownerPositionId);
    const parentProcessId = raw.parentProcessId || null;
    const topLevelProcessId = raw.topLevelProcessId || (parentProcessId ? this.processTopLevelIdById(parentProcessId) : null);
    const process: Process = {
      id, code: raw.code.trim(), name: raw.name.trim(), description: raw.description.trim(), parentProcessId, topLevelProcessId, ownerId: ownerPosition?.id ?? existing?.ownerId ?? raw.ownerId,
      ownerPositionId: raw.ownerPositionId, status: existing?.status ?? 'Draft', timeGapValue: raw.timeGapValue, timeGapUnit: raw.timeGapUnit, createdBy: existing?.createdBy ?? 'usr-anna', createdAt: existing?.createdAt ?? now, updatedBy: 'usr-anna', updatedAt: now
    };
    const hierarchyValidation = this.validateProcessHierarchy(process);
    if (hierarchyValidation) { this.formError.set(hierarchyValidation); return; }
    await this.data.saveProcess(process);
    this.selectedProcessId.set(id);
    this.toast.set(existing ? 'Process updated.' : 'Process created.');
    this.processEditorOpen.set(false);
  }

  procedureOrderDraft(procedure: Procedure): number {
    return this.procedureOrderDrafts()[procedure.id] ?? procedure.processOrder ?? 1;
  }

  onProcedureOrderChange(event: Event, procedureId: string): void {
    const value = Math.max(1, Math.trunc(Number((event.target as HTMLInputElement).value) || 1));
    this.procedureOrderDrafts.update((draft) => ({ ...draft, [procedureId]: value }));
  }

  async saveProcedureOrder(): Promise<void> {
    const processId = this.selectedProcessId();
    if (!processId || !this.selectedProcessProcedures().length) {
      this.toast.set('There are no assigned procedures to order yet.');
      return;
    }
    const ranked = this.selectedProcessProcedures().map((procedure, index) => ({ procedure, requestedOrder: this.procedureOrderDraft(procedure), index })).sort((a, b) => a.requestedOrder - b.requestedOrder || a.index - b.index);
    const now = new Date().toISOString();
    const nextDraft: Record<string, number> = {};
    for (const [index, item] of ranked.entries()) {
      const updated = { ...item.procedure, processOrder: index + 1, updatedBy: 'usr-anna', updatedAt: now };
      await this.data.saveProcedure(updated);
      nextDraft[updated.id] = index + 1;
    }
    this.procedureOrderDrafts.set(nextDraft);
    this.toast.set('Procedure order saved and applied to the process map.');
  }

  async deleteProcess(process: Process): Promise<void> {
    if (!window.confirm(`Delete ${process.name} and its linked procedures?`)) return;
    await this.data.deleteProcess(process.id);
    if (this.selectedProcessId() === process.id) this.closeEditors();
    this.toast.set('Process deleted.');
  }

  editSupportingDocument(document: SupportingDocument): void {
    this.editingSupportingDocumentId.set(document.id);
    this.supportingDocumentForm.reset({ title: document.title, url: document.url, resourceType: document.resourceType, status: document.status });
  }

  startNewSupportingDocument(): void {
    this.editingSupportingDocumentId.set(null);
    this.supportingDocumentForm.reset({ title: '', url: '', resourceType: 'document', status: 'Draft' });
  }

  async saveSupportingDocument(): Promise<void> {
    const entityId = this.selectedProcessId();
    if (!entityId) { this.toast.set('Save the process details before adding supporting documents.'); return; }
    if (this.supportingDocumentForm.invalid) { this.supportingDocumentForm.markAllAsTouched(); return; }
    const raw = this.supportingDocumentForm.getRawValue();
    const existing = this.data.snapshot().supportingDocuments.find((item) => item.id === this.editingSupportingDocumentId());
    const now = new Date().toISOString();
    const document: SupportingDocument = {
      id: existing?.id ?? `doc-${crypto.randomUUID().slice(0, 8)}`, entityType: 'process', entityId, title: raw.title.trim(), url: raw.url.trim(), resourceType: raw.resourceType,
      status: raw.status, createdBy: existing?.createdBy ?? 'usr-anna', createdAt: existing?.createdAt ?? now, updatedBy: 'usr-anna', updatedAt: now
    };
    await this.data.saveSupportingDocument(document);
    this.toast.set(existing ? 'Supporting document updated.' : 'Supporting document added.');
    this.startNewSupportingDocument();
  }

  async deleteSupportingDocument(document: SupportingDocument): Promise<void> {
    if (!window.confirm(`Delete the supporting document link “${document.title}”?`)) return;
    await this.data.deleteSupportingDocument(document.id, document.entityId);
    if (this.editingSupportingDocumentId() === document.id) this.startNewSupportingDocument();
    this.toast.set('Supporting document deleted.');
  }

  editOwnerPosition(position: ProcessOwnerPosition): void {
    this.editingOwnerPositionId.set(position.id);
    this.ownerPositionForm.reset({ position: position.position, assignedEmployeeId: position.assignedEmployeeId ?? '' });
  }

  startNewOwnerPosition(): void {
    this.editingOwnerPositionId.set(null);
    this.ownerPositionForm.reset({ position: '', assignedEmployeeId: '' });
  }

  async saveOwnerPosition(): Promise<void> {
    if (this.ownerPositionForm.invalid) { this.ownerPositionForm.markAllAsTouched(); return; }
    const raw = this.ownerPositionForm.getRawValue();
    const existing = this.data.snapshot().processOwnerPositions.find((item) => item.id === this.editingOwnerPositionId());
    const now = new Date().toISOString();
    const position: ProcessOwnerPosition = { id: existing?.id ?? `pos-${crypto.randomUUID().slice(0, 8)}`, position: raw.position.trim(), assignedEmployeeId: raw.assignedEmployeeId || null, createdAt: existing?.createdAt ?? now, updatedAt: now };
    await this.data.saveProcessOwnerPosition(position);
    this.toast.set(existing ? 'Process owner position updated.' : 'Process owner position added.');
    this.startNewOwnerPosition();
  }

  async deleteOwnerPosition(position: ProcessOwnerPosition): Promise<void> {
    if (this.data.snapshot().processes.some((item) => item.ownerPositionId === position.id)) { this.toast.set('This position is assigned to a process and cannot be deleted yet.'); return; }
    if (!window.confirm(`Delete the ${position.position} position?`)) return;
    await this.data.deleteProcessOwnerPosition(position.id);
    if (this.editingOwnerPositionId() === position.id) this.startNewOwnerPosition();
    this.toast.set('Process owner position deleted.');
  }

  onMaintenanceListChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as DropdownListKey;
    this.maintenanceListKey.set(value);
    this.dropdownValueForm.controls.listKey.setValue(value);
    this.startNewDropdownValue();
  }

  editDropdownValue(value: DropdownValue): void {
    this.editingDropdownValueId.set(value.id);
    this.maintenanceListKey.set(value.listKey);
    this.dropdownValueForm.reset({ listKey: value.listKey, label: value.label, value: value.value });
  }

  startNewDropdownValue(): void {
    this.editingDropdownValueId.set(null);
    this.dropdownValueForm.reset({ listKey: this.maintenanceListKey(), label: '', value: '' });
  }

  async saveDropdownValue(): Promise<void> {
    if (this.dropdownValueForm.invalid) { this.dropdownValueForm.markAllAsTouched(); return; }
    const raw = this.dropdownValueForm.getRawValue();
    const existing = this.data.snapshot().dropdownValues.find((item) => item.id === this.editingDropdownValueId());
    const duplicate = this.data.snapshot().dropdownValues.some((item) => item.id !== this.editingDropdownValueId() && item.listKey === raw.listKey && item.value.toLowerCase() === raw.value.trim().toLowerCase());
    if (duplicate) { this.toast.set('That dropdown value already exists in this list.'); return; }
    const now = new Date().toISOString();
    const value: DropdownValue = { id: existing?.id ?? `ddl-${crypto.randomUUID().slice(0, 8)}`, listKey: raw.listKey, label: raw.label.trim(), value: raw.value.trim(), active: existing?.active ?? true, createdAt: existing?.createdAt ?? now, updatedAt: now };
    await this.data.saveDropdownValue(value);
    this.toast.set(existing ? 'Dropdown value updated.' : 'Dropdown value added.');
    this.startNewDropdownValue();
  }

  async deleteDropdownValue(value: DropdownValue): Promise<void> {
    if (this.data.snapshot().dropdownValues.filter((item) => item.listKey === value.listKey && item.active).length <= 1) { this.toast.set('Keep at least one active value in this list.'); return; }
    if (!window.confirm(`Delete the ${value.label} dropdown value?`)) return;
    await this.data.deleteDropdownValue(value.id);
    if (this.editingDropdownValueId() === value.id) this.startNewDropdownValue();
    this.toast.set('Dropdown value deleted.');
  }

  openNewProcedure(): void {
    this.selectedProcedureId.set(null);
    this.procedureTab.set('details');
    this.editingStepId.set(null);
    this.editingWorkloadId.set(null);
    this.formError.set('');
    this.procedureForm.reset({ code: 'PR-00' + (this.metrics().procedureCount + 1), name: '', description: '', processId: '', processOrder: 1, platformId: 'plt-manual', transactionVolume: 1, transactionFrequency: 'day', durationValue: 15, durationUnit: 'minutes', timeGapValue: 0, timeGapUnit: 'minutes', resourceUrl: '', resourceType: 'document' });
    this.resetStepForm(1);
    this.resetWorkloadForm();
    this.procedureEditorOpen.set(true);
    this.view.set('procedures');
  }

  editProcedure(procedure: Procedure): void {
    this.selectedProcedureId.set(procedure.id);
    this.procedureTab.set('details');
    this.editingStepId.set(null);
    this.editingWorkloadId.set(null);
    this.procedureForm.reset({ code: procedure.code, name: procedure.name, description: procedure.description, processId: procedure.processId ?? '', processOrder: procedure.processOrder ?? 1, platformId: procedure.platformId, transactionVolume: procedure.transactionVolume ?? 0, transactionFrequency: procedure.transactionFrequency ?? 'day', durationValue: procedure.durationValue ?? 0, durationUnit: procedure.durationUnit ?? 'minutes', timeGapValue: procedure.timeGapValue ?? 0, timeGapUnit: procedure.timeGapUnit ?? 'minutes', resourceUrl: procedure.resourceUrl ?? '', resourceType: procedure.resourceType ?? 'document' });
    this.resetStepForm(this.nextStepNumber(procedure.id));
    this.resetWorkloadForm();
    this.formError.set('');
    this.procedureEditorOpen.set(true);
    this.view.set('procedures');
  }

  async saveProcedure(): Promise<void> {
    if (this.procedureForm.invalid) { this.procedureForm.markAllAsTouched(); return; }
    const raw = this.procedureForm.getRawValue();
    const existing = this.data.snapshot().procedures.find((item) => item.id === this.selectedProcedureId());
    const id = existing?.id ?? `prd-${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const processId = raw.processId || null;
    const processOrder = processId ? Math.max(1, Math.trunc(raw.processOrder)) : null;
    const procedure: Procedure = {
      id, code: raw.code.trim(), name: raw.name.trim(), description: raw.description.trim(), processId: raw.processId || null,
      processOrder, platformId: raw.platformId, transactionVolume: raw.transactionVolume, transactionFrequency: raw.transactionFrequency, durationValue: raw.durationValue, durationUnit: raw.durationUnit, timeGapValue: raw.timeGapValue, timeGapUnit: raw.timeGapUnit,
      resourceUrl: raw.resourceUrl.trim(), resourceType: raw.resourceType,
      createdBy: existing?.createdBy ?? 'usr-anna', createdAt: existing?.createdAt ?? now, updatedBy: 'usr-anna', updatedAt: now
    };
    await this.data.saveProcedure(procedure);
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
    const worksheet = XLSX.utils.aoa_to_sheet([[...this.procedureTemplateHeaders]]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Procedures');
    XLSX.writeFile(workbook, 'procedure-template.xlsx', { bookType: 'xlsx' });
    this.procedureTemplateError.set('');
    this.toast.set('Procedure template downloaded.');
  }

  async onProcedureTemplateSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.procedureTemplateError.set('');
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) throw new Error('The Excel workbook has no worksheet.');
      const worksheet = workbook.Sheets[firstSheetName];
      const rows = (XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: '', raw: false }) as unknown[][]).map((row) => row.map((cell) => String(cell ?? '')));
      if (rows.length < 2) throw new Error('The template has no data rows. Add at least one procedure before uploading.');
      const headers = rows[0].map((header) => header.trim().replace(/^\uFEFF/, '').toLowerCase());
      const optionalHeaders = new Set(['department_group', 'process_order', 'time_gap_value', 'time_gap_unit']);
      const requiredHeaders = this.procedureTemplateHeaders.filter((header) => !optionalHeaders.has(header));
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
      const message = error instanceof Error ? error.message : 'Choose a valid filled procedure XLS/XLSX template.';
      this.procedureTemplateError.set(message);
    this.toast.set('Procedure Excel template import failed.');
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

  closeEditors(): void { this.processEditorOpen.set(false); this.procedureEditorOpen.set(false); this.procedureTab.set('details'); this.editingStepId.set(null); this.editingWorkloadId.set(null); this.editingSupportingDocumentId.set(null); this.formError.set(''); }

  ownerName(id: string): string { return this.data.snapshot().users.find((item) => item.id === id)?.name ?? this.data.snapshot().processOwnerPositions.find((item) => item.id === id)?.position ?? 'Unassigned'; }
  employeeName(id: string): string { return this.data.snapshot().users.find((item) => item.id === id)?.name ?? 'Unassigned'; }
  employeeNameForPosition(positionId: string): string { const position = this.data.snapshot().processOwnerPositions.find((item) => item.id === positionId); return this.employeeName(position?.assignedEmployeeId ?? ''); }
  ownerPositionName(id: string | null | undefined): string { return id ? this.data.snapshot().processOwnerPositions.find((item) => item.id === id)?.position ?? 'Unassigned position' : 'Unassigned position'; }
  ownerDisplay(process: Process): string { const position = this.data.snapshot().processOwnerPositions.find((item) => item.id === process.ownerPositionId); return `${this.ownerPositionName(process.ownerPositionId)} · ${this.employeeName(position?.assignedEmployeeId ?? '')}`; }
  platformName(id: string): string { return this.data.snapshot().platforms.find((item) => item.id === id)?.name ?? 'Unspecified'; }
  processName(id: string | null): string { return id ? this.data.snapshot().processes.find((item) => item.id === id)?.name ?? 'Unknown process' : 'Standalone'; }
  processParentName(process: Process): string { return process.parentProcessId ? this.processName(process.parentProcessId) : 'Top-level process'; }
  processTopLevelId(process: Process): string {
    const processes = this.data.snapshot().processes;
    const byId = new Map(processes.map((item) => [item.id, item]));
    if (process.topLevelProcessId && byId.has(process.topLevelProcessId) && process.topLevelProcessId !== process.id) return process.topLevelProcessId;
    const visited = new Set<string>();
    let current = process;
    while (current.parentProcessId && byId.has(current.parentProcessId) && !visited.has(current.id)) {
      visited.add(current.id);
      current = byId.get(current.parentProcessId)!;
      if (current.topLevelProcessId && byId.has(current.topLevelProcessId) && current.topLevelProcessId !== current.id) return current.topLevelProcessId;
    }
    return current.id;
  }
  processTopLevelIdById(id: string | null): string | null {
    if (!id) return null;
    const process = this.data.snapshot().processes.find((item) => item.id === id);
    return process ? this.processTopLevelId(process) : null;
  }
  processTopLevelName(process: Process): string { return this.processName(this.processTopLevelId(process)); }
  procedureName(id: string): string { return this.data.snapshot().procedures.find((item) => item.id === id)?.name ?? id; }
  hierarchyLabel(process: Process): string { return process.parentProcessId ? `Sub-process of ${this.processName(process.parentProcessId)}` : process.topLevelProcessId ? `Assigned to ${this.processName(process.topLevelProcessId)}` : 'Top-level process'; }
  initials(name: string): string { return name.split(' ').map((part) => part[0] ?? '').join('').slice(0, 2).toUpperCase(); }
  linkTypeLabel(type: ResourceLinkType): string { return type === 'image' ? 'Image' : 'Document'; }
  transactionFrequencyLabel(value: TransactionFrequency): string { return value === 'day' ? 'per day' : value === 'week' ? 'per week' : 'per month'; }
  durationUnitLabel(value: DurationUnit): string { return value.replace(/s$/, ''); }
  timeGapLabel(value: number, unit: DurationUnit): string { return `${value} ${this.durationUnitLabel(unit)}`; }
  formatDate(value: string): string { return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)); }
  formatBytes(value: number): string { return value < 1024 ? `${value} B` : `${(value / 1024).toFixed(1)} KB`; }
  statusClass(status: string): string { return status.toLowerCase().replaceAll(' ', '-'); }
  trackById(_: number, item: { id: string }): string { return item.id; }
  graphX(index: number, nodeId?: string): number {
    const id = nodeId ?? this.graphNodes()[index]?.id;
    return id ? this.graphPositions().get(id)?.x ?? 110 : 110;
  }
  graphY(index: number, nodeId?: string): number {
    const id = nodeId ?? this.graphNodes()[index]?.id;
    return id ? this.graphPositions().get(id)?.y ?? 74 : 74;
  }
  graphNode(id: string): (GraphPosition & { label: string }) | null {
    const node = this.graphNodes().find((item) => item.id === id);
    const position = this.graphPositions().get(id);
    return node && position ? { ...position, label: node.label } : null;
  }
  graphEdgePath(edge: GraphEdge): string {
    const source = this.graphNode(`${edge.sourceType}:${edge.sourceId}`);
    const target = this.graphNode(`${edge.targetType}:${edge.targetId}`);
    if (!source || !target) return '';
    const sameRow = Math.abs(source.y - target.y) < 2;
    if (sameRow) {
      const direction = target.x >= source.x ? 1 : -1;
      const startX = source.x + direction * source.width / 2;
      const endX = target.x - direction * target.width / 2;
      return `M ${startX} ${source.y} H ${endX}`;
    }
    const direction = target.y >= source.y ? 1 : -1;
    const startY = source.y + direction * source.height / 2;
    const endY = target.y - direction * target.height / 2;
    const targetApproachY = endY - direction * 12;
    const verticalMin = Math.min(startY, targetApproachY);
    const verticalMax = Math.max(startY, targetApproachY);
    const directRouteBlocked = Array.from(this.graphPositions().entries()).some(([nodeId, position]) => {
      if (nodeId === `${edge.sourceType}:${edge.sourceId}` || nodeId === `${edge.targetType}:${edge.targetId}`) return false;
      const left = position.x - position.width / 2;
      const right = position.x + position.width / 2;
      const top = position.y - position.height / 2;
      const bottom = position.y + position.height / 2;
      return source.x >= left && source.x <= right && bottom > verticalMin && top < verticalMax;
    });

    if (!directRouteBlocked && Math.abs(source.x - target.x) < 2) {
      return `M ${source.x} ${startY} V ${endY}`;
    }

    const laneX = source.x <= 465 ? 12 : 918;
    const firstHorizontal = directRouteBlocked ? `H ${laneX} V ${targetApproachY} H ${target.x}` : `V ${targetApproachY} H ${target.x}`;
    return `M ${source.x} ${startY} ${firstHorizontal} V ${endY}`;
  }
  graphHeight(): number {
    return Math.max(420, ...Array.from(this.graphPositions().values()).map((position) => position.y + position.height + 30));
  }
  graphConnectionLabel(nodeId: string): string {
    const focusId = this.graphFocusNode()?.id;
    const edge = focusId ? this.graphAllEdges().find((item) => `${item.sourceType}:${item.sourceId}` === focusId && `${item.targetType}:${item.targetId}` === nodeId || `${item.targetType}:${item.targetId}` === focusId && `${item.sourceType}:${item.sourceId}` === nodeId) : null;
    if (!edge) return 'Related item';
    if (edge.targetType === 'procedure') return `${`${edge.targetType}:${edge.targetId}` === nodeId ? 'Procedure in' : 'Process for'} ${this.processName(edge.sourceId)}`;
    return `${`${edge.targetType}:${edge.targetId}` === nodeId ? 'Sub-process of' : 'Parent process for'} ${this.processName(edge.sourceId)}`;
  }

  private compareProcessHierarchy(a: Process, b: Process): number {
    const topLevelCompare = this.processTopLevelName(a).localeCompare(this.processTopLevelName(b));
    const parentCompare = this.processParentName(a).localeCompare(this.processParentName(b));
    return topLevelCompare || parentCompare || a.name.localeCompare(b.name) || a.code.localeCompare(b.code);
  }

  private compareProcedureOrder(a: Procedure, b: Procedure): number {
    return (a.processOrder ?? Number.MAX_SAFE_INTEGER) - (b.processOrder ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name) || a.code.localeCompare(b.code);
  }

  private initializeProcedureOrderDrafts(processId: string): void {
    this.procedureOrderDrafts.set(Object.fromEntries(this.data.snapshot().procedures.filter((item) => item.processId === processId).map((item) => [item.id, item.processOrder ?? 1])));
  }

  private validateProcessHierarchy(process: Process): string {
    const topLevel = process.topLevelProcessId ? this.data.snapshot().processes.find((item) => item.id === process.topLevelProcessId) : null;
    if (process.topLevelProcessId && !topLevel) return 'Select an existing top-level process or leave this process as a top-level process.';
    if (topLevel && (topLevel.parentProcessId || this.processTopLevelId(topLevel) !== topLevel.id)) return 'Select a top-level process, not a sub-process, as the grouping level.';
    if (process.topLevelProcessId === process.id && process.parentProcessId) return 'A sub-process cannot assign itself as its top-level process.';
    if (!process.parentProcessId) return '';
    if (process.parentProcessId === process.id) return 'A process cannot be its own parent process.';
    if (!this.data.snapshot().processes.some((item) => item.id === process.parentProcessId)) return 'Select an existing parent process or leave the process at the top level.';
    const parentById = new Map(this.data.snapshot().processes.filter((item) => item.id !== process.id).map((item) => [item.id, item.parentProcessId ?? null]));
    parentById.set(process.id, process.parentProcessId);
    const visited = new Set<string>();
    let current: string | null = process.id;
    while (current) {
      if (visited.has(current)) return 'Circular process hierarchy detected. A process cannot be placed under one of its own sub-processes.';
      visited.add(current);
      current = parentById.get(current) ?? null;
    }
    const expectedTopLevelId = this.processTopLevelIdById(process.parentProcessId);
    if (process.topLevelProcessId && expectedTopLevelId && process.topLevelProcessId !== expectedTopLevelId) return `Assign this process to ${this.processName(expectedTopLevelId)}, the top level of its selected parent.`;
    return '';
  }

  private dropdownOptions(listKey: DropdownListKey): Array<{ value: string; label: string }> {
    const values = this.data.snapshot().dropdownValues.filter((item) => item.listKey === listKey && item.active).sort((a, b) => a.label.localeCompare(b.label));
    if (values.length) return values.map((item) => ({ value: item.value, label: item.label }));
    if (listKey === 'supporting-document-status') return this.processStatuses.map((value) => ({ value, label: value }));
    if (listKey === 'transaction-frequency') return this.transactionFrequencyOptions;
    if (listKey === 'duration-unit') return this.durationUnitOptions;
    return this.resourceLinkTypes;
  }

  private defaultOwnerPositionId(): string { return this.data.snapshot().processOwnerPositions[0]?.id ?? ''; }
  private defaultOwnerEmployeeId(): string { return this.data.snapshot().processOwnerPositions[0]?.assignedEmployeeId ?? this.data.snapshot().users[0]?.id ?? ''; }

  private graphAllEdges(): GraphEdge[] {
    const snapshot = this.data.snapshot();
    const procedureEdges: GraphEdge[] = snapshot.procedures.filter((procedure) => procedure.processId).map((procedure) => ({
      id: `contains-procedure-${procedure.id}`, sourceType: 'process', sourceId: procedure.processId!, targetType: 'procedure', targetId: procedure.id
    }));
    const subProcessEdges: GraphEdge[] = snapshot.processes.filter((process) => process.parentProcessId).map((process) => ({
      id: `contains-process-${process.id}`, sourceType: 'process', sourceId: process.parentProcessId!, targetType: 'process', targetId: process.id
    }));
    const assignedTopLevelEdges: GraphEdge[] = snapshot.processes.filter((process) => !process.parentProcessId && this.processTopLevelId(process) !== process.id).map((process) => ({
      id: `contains-top-level-${process.id}`, sourceType: 'process', sourceId: this.processTopLevelId(process), targetType: 'process', targetId: process.id
    }));
    return [...procedureEdges, ...subProcessEdges, ...assignedTopLevelEdges];
  }

  private buildGraphPositions(nodes: GraphNode[]): Map<string, GraphPosition> {
    const snapshot = this.data.snapshot();
    const positions = new Map<string, GraphPosition>();
    const processById = new Map(snapshot.processes.map((process) => [process.id, process]));
    const processNodes = nodes.filter((node) => node.type === 'process');
    const procedureNodes = nodes.filter((node) => node.type === 'procedure');
    const depthCache = new Map<string, number>();
    const processDepth = (id: string, path = new Set<string>()): number => {
      const cached = depthCache.get(id);
      if (cached !== undefined) return cached;
      if (path.has(id)) return 0;
      const process = processById.get(id);
      const parentId = process?.parentProcessId;
      const depth = parentId && processById.has(parentId) ? processDepth(parentId, new Set([...path, id])) + 1 : 0;
      depthCache.set(id, depth);
      return depth;
    };
    const maxDepth = Math.max(0, ...processNodes.map((node) => processDepth(node.entityId)));
    let processRow = 0;
    for (let depth = 0; depth <= maxDepth; depth += 1) {
      const rowNodes = processNodes.filter((node) => processDepth(node.entityId) === depth).slice().sort((a, b) => a.label.localeCompare(b.label) || a.code.localeCompare(b.code));
      for (let start = 0; start < rowNodes.length; start += 4) {
        rowNodes.slice(start, start + 4).forEach((node, index) => positions.set(node.id, { x: 110 + index * 205, y: 74 + processRow * 130, width: 164, height: 56 }));
        processRow += 1;
      }
    }

    const procedureRows = new Map<string, GraphNode[]>();
    procedureNodes.forEach((node) => {
      const procedure = snapshot.procedures.find((item) => item.id === node.entityId);
      if (!procedure?.processId) return;
      procedureRows.set(procedure.processId, [...(procedureRows.get(procedure.processId) ?? []), node]);
    });
    let procedureRow = 0;
    procedureRows.forEach((rowNodes) => {
      rowNodes.sort((a, b) => (a.processOrder ?? Number.MAX_SAFE_INTEGER) - (b.processOrder ?? Number.MAX_SAFE_INTEGER) || a.label.localeCompare(b.label) || a.code.localeCompare(b.code));
      rowNodes.forEach((node, index) => positions.set(node.id, { x: 110 + index * 205, y: 74 + (processRow + procedureRow) * 130, width: 164, height: 56 }));
      procedureRow += 1;
    });
    return positions;
  }

  private procedureTemplateRecords(headers: string[], rows: string[][]): Array<{ procedure: Procedure; workloads: ProcedureWorkload[]; steps: ProcedureStep[] }> {
    const procedureKeys: Array<keyof ProcedureTemplateValues> = ['procedure_code', 'procedure_name', 'procedure_description', 'parent_process_code', 'process_order', 'time_gap_value', 'time_gap_unit', 'platform_name', 'procedure_resource_type', 'procedure_resource_url'];
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
    const importedOrderByProcess = new Map<string, number>();
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
      const requestedOrder = values.process_order ? Number(values.process_order) : null;
      if (requestedOrder !== null && (!Number.isInteger(requestedOrder) || requestedOrder < 1)) throw new Error(`Row ${group.firstRow}: process_order must be a whole number greater than zero.`);
      const processOrder = process ? requestedOrder ?? importedOrderByProcess.get(process.id) ?? 1 : null;
      if (process) importedOrderByProcess.set(process.id, Math.max(importedOrderByProcess.get(process.id) ?? 1, (processOrder ?? 1) + 1));
      const timeGapValue = values.time_gap_value ? Number(values.time_gap_value) : 0;
      if (!Number.isFinite(timeGapValue) || timeGapValue < 0) throw new Error(`Row ${group.firstRow}: time_gap_value must be zero or greater.`);
      const timeGapUnit = values.time_gap_unit ? this.templateDurationUnit(values.time_gap_unit) : 'minutes';
      if (!timeGapUnit) throw new Error(`Row ${group.firstRow}: time_gap_unit must be seconds, minutes, hours, or days.`);
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
        processId: process?.id ?? null, processOrder, platformId: platform.id, transactionVolume: firstWorkload.transactionVolume, transactionFrequency: firstWorkload.transactionFrequency, durationValue: firstWorkload.durationValue, durationUnit: firstWorkload.durationUnit, timeGapValue, timeGapUnit,
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

  private nextStepNumber(procedureId: string): number { return Math.max(0, ...this.data.snapshot().procedureSteps.filter((item) => item.procedureId === procedureId).map((item) => item.stepNumber)) + 1; }
  private resetStepForm(stepNumber: number): void { this.stepForm.reset({ stepNumber, title: '', description: '', resourceUrl: '', resourceType: 'document' }); }
  private resetWorkloadForm(): void { this.editingWorkloadId.set(null); this.workloadForm.reset({ departmentGroup: '', transactionVolume: 1, transactionFrequency: 'day', durationValue: 15, durationUnit: 'minutes' }); }
}
