import { Snapshot } from './models';

export function createDemoSnapshot(): Snapshot {
  const now = new Date().toISOString();
  return {
    users: [
      { id: 'usr-anna', name: 'Anna Santos', email: 'anna.santos@example.com', role: 'Admin', status: 'Active' },
      { id: 'usr-miguel', name: 'Miguel Reyes', email: 'miguel.reyes@example.com', role: 'Editor', status: 'Active' },
      { id: 'usr-jamie', name: 'Jamie Cruz', email: 'jamie.cruz@example.com', role: 'Viewer', status: 'Active' }
    ],
    platforms: [
      { id: 'plt-salesforce', name: 'Salesforce', category: 'CRM' },
      { id: 'plt-sap', name: 'SAP S/4HANA', category: 'ERP' },
      { id: 'plt-excel', name: 'Excel', category: 'Productivity' },
      { id: 'plt-manual', name: 'Manual / Offline', category: 'Manual' }
    ],
    processes: [
      {
        id: 'prc-intake', code: 'P-001', name: 'Customer onboarding',
        description: 'Capture a new customer, validate required information, and establish the account baseline.',
        ownerId: 'usr-anna', status: 'Active', createdBy: 'usr-anna', createdAt: now,
        updatedBy: 'usr-miguel', updatedAt: now
      },
      {
        id: 'prc-order', code: 'P-002', name: 'Order fulfilment',
        description: 'Coordinate order review, allocation, fulfilment, and customer dispatch communication.',
        ownerId: 'usr-miguel', status: 'Under Review', createdBy: 'usr-anna', createdAt: now,
        updatedBy: 'usr-miguel', updatedAt: now
      },
      {
        id: 'prc-support', code: 'P-003', name: 'After-sales support',
        description: 'Manage customer queries, incidents, and feedback after fulfilment.',
        ownerId: 'usr-jamie', status: 'Draft', createdBy: 'usr-miguel', createdAt: now,
        updatedBy: 'usr-miguel', updatedAt: now
      }
    ],
    procedures: [
      {
        id: 'prd-profile', code: 'PR-001', name: 'Create customer profile', description: 'Create the account and contact records after intake validation.',
        processId: 'prc-intake', platformId: 'plt-salesforce', stepOrder: 1, transactionVolume: 120, transactionFrequency: 'day', durationValue: 12, durationUnit: 'minutes', resourceUrl: '', resourceType: 'document', createdBy: 'usr-anna', createdAt: now, updatedBy: 'usr-miguel', updatedAt: now
      },
      {
        id: 'prd-validate', code: 'PR-002', name: 'Validate order request', description: 'Check order details, credit status, and required approvals.',
        processId: 'prc-order', platformId: 'plt-sap', stepOrder: 1, transactionVolume: 85, transactionFrequency: 'day', durationValue: 18, durationUnit: 'minutes', resourceUrl: '', resourceType: 'document', createdBy: 'usr-anna', createdAt: now, updatedBy: 'usr-miguel', updatedAt: now
      },
      {
        id: 'prd-allocate', code: 'PR-003', name: 'Allocate inventory', description: 'Reserve available inventory and flag exceptions for review.',
        processId: 'prc-order', platformId: 'plt-excel', stepOrder: 2, transactionVolume: 60, transactionFrequency: 'day', durationValue: 25, durationUnit: 'minutes', resourceUrl: '', resourceType: 'document', createdBy: 'usr-miguel', createdAt: now, updatedBy: 'usr-miguel', updatedAt: now
      },
      {
        id: 'prd-ticket', code: 'PR-004', name: 'Log support case', description: 'Register customer issue, priority, owner, and response target.',
        processId: 'prc-support', platformId: 'plt-salesforce', stepOrder: 1, transactionVolume: 40, transactionFrequency: 'day', durationValue: 10, durationUnit: 'minutes', resourceUrl: '', resourceType: 'document', createdBy: 'usr-miguel', createdAt: now, updatedBy: 'usr-miguel', updatedAt: now
      }
    ],
    procedureWorkloads: [
      { id: 'wkl-profile-cs', procedureId: 'prd-profile', departmentGroup: 'Customer Success', transactionVolume: 120, transactionFrequency: 'day', durationValue: 12, durationUnit: 'minutes', createdAt: now, updatedAt: now },
      { id: 'wkl-profile-ops', procedureId: 'prd-profile', departmentGroup: 'Operations', transactionVolume: 40, transactionFrequency: 'week', durationValue: 20, durationUnit: 'minutes', createdAt: now, updatedAt: now },
      { id: 'wkl-validate-sales', procedureId: 'prd-validate', departmentGroup: 'Sales Operations', transactionVolume: 85, transactionFrequency: 'day', durationValue: 18, durationUnit: 'minutes', createdAt: now, updatedAt: now },
      { id: 'wkl-allocate-warehouse', procedureId: 'prd-allocate', departmentGroup: 'Warehouse', transactionVolume: 60, transactionFrequency: 'day', durationValue: 25, durationUnit: 'minutes', createdAt: now, updatedAt: now },
      { id: 'wkl-ticket-support', procedureId: 'prd-ticket', departmentGroup: 'Customer Support', transactionVolume: 40, transactionFrequency: 'day', durationValue: 10, durationUnit: 'minutes', createdAt: now, updatedAt: now }
    ],
    procedureSteps: [
      { id: 'stp-profile-1', procedureId: 'prd-profile', stepNumber: 1, title: 'Validate intake record', description: 'Confirm required customer and contact fields are complete.', resourceUrl: '', resourceType: 'document', createdAt: now, updatedAt: now },
      { id: 'stp-profile-2', procedureId: 'prd-profile', stepNumber: 2, title: 'Create account', description: 'Create the customer profile in the selected platform.', resourceUrl: '', resourceType: 'document', createdAt: now, updatedAt: now },
      { id: 'stp-validate-1', procedureId: 'prd-validate', stepNumber: 1, title: 'Review order details', description: 'Check quantities, pricing, approvals, and credit status.', resourceUrl: '', resourceType: 'document', createdAt: now, updatedAt: now },
      { id: 'stp-allocate-1', procedureId: 'prd-allocate', stepNumber: 1, title: 'Check available inventory', description: 'Confirm the requested items can be allocated.', resourceUrl: '', resourceType: 'document', createdAt: now, updatedAt: now },
      { id: 'stp-ticket-1', procedureId: 'prd-ticket', stepNumber: 1, title: 'Capture the customer issue', description: 'Record the issue, urgency, owner, and response target.', resourceUrl: '', resourceType: 'document', createdAt: now, updatedAt: now }
    ],
    relationships: [
      { id: 'rel-1', sourceType: 'process', sourceId: 'prc-intake', targetType: 'process', targetId: 'prc-order', relationType: 'depends_on', createdAt: now },
      { id: 'rel-2', sourceType: 'process', sourceId: 'prc-order', targetType: 'process', targetId: 'prc-support', relationType: 'depends_on', createdAt: now },
      { id: 'rel-3', sourceType: 'procedure', sourceId: 'prd-profile', targetType: 'procedure', targetId: 'prd-validate', relationType: 'depends_on', createdAt: now }
    ],
    attachments: [],
    auditLogs: [
      { id: 'aud-1', action: 'CREATE', entityType: 'process', entityId: 'prc-intake', summary: 'Seeded sample process map', actor: 'usr-anna', createdAt: now }
    ]
  };
}
