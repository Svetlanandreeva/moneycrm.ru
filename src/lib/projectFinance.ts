import { supabase } from './supabase'

export type ProjectExpenseType = 'materials' | 'labor' | 'contractor' | 'logistics' | 'packaging' | 'fees' | 'taxes' | 'other'
export type ExpectedPaymentType = 'prepayment' | 'final' | 'full' | 'other'
export type ProjectOwnerAdvanceStatus = 'outstanding' | 'partially_repaid' | 'repaid' | 'settled_on_acceptance'

export type ProjectFinanceRow = {
  project_id: string
  workspace_id: string
  name: string
  client_name: string | null
  status: string
  currency: string
  contract_value_minor: number
  received_minor: number
  restricted_minor: number
  earned_minor: number
  outstanding_minor: number
  actual_cost_minor: number
  project_cash_remaining_minor: number
  realized_profit_minor: number
  projected_profit_minor: number
  owner_funded_minor: number
  owner_advance_taken_minor: number
  owner_advance_repaid_minor: number
  owner_advance_outstanding_minor: number
  production_due_at: string | null
  ship_due_at: string | null
  acceptance_due_at: string | null
  accepted_at: string | null
}

export type ProjectOwnerAdvance = {
  id: string
  project_id: string
  source_account_id: string
  destination_account_id: string
  amount_minor: number
  repaid_minor: number
  status: ProjectOwnerAdvanceStatus
  taken_at: string
  settled_at: string | null
  note: string | null
}

export type PlannedProjectReceipt = {
  expected_payment_id: string | null
  project_id: string
  workspace_id: string
  project_name: string
  client_name: string | null
  currency: string
  payment_type: ExpectedPaymentType
  label: string
  amount_minor: number
  due_at: string | null
  status: 'planned' | 'partial'
  source: 'schedule' | 'project'
}

function client() {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

export async function listProjectFinanceRows(): Promise<ProjectFinanceRow[]> {
  const { data, error } = await client()
    .from('project_finance_summary')
    .select('project_id,workspace_id,name,client_name,status,currency,contract_value_minor,received_minor,restricted_minor,earned_minor,outstanding_minor,actual_cost_minor,project_cash_remaining_minor,realized_profit_minor,projected_profit_minor,owner_funded_minor,owner_advance_taken_minor,owner_advance_repaid_minor,owner_advance_outstanding_minor,production_due_at,ship_due_at,acceptance_due_at,accepted_at')
    .order('ship_due_at', { ascending: true, nullsFirst: false })

  if (error) throw error

  return (data ?? []).map(row => ({
    ...row,
    contract_value_minor: Number(row.contract_value_minor ?? 0),
    received_minor: Number(row.received_minor ?? 0),
    restricted_minor: Number(row.restricted_minor ?? 0),
    earned_minor: Number(row.earned_minor ?? 0),
    outstanding_minor: Number(row.outstanding_minor ?? 0),
    actual_cost_minor: Number(row.actual_cost_minor ?? 0),
    project_cash_remaining_minor: Number(row.project_cash_remaining_minor ?? 0),
    realized_profit_minor: Number(row.realized_profit_minor ?? 0),
    projected_profit_minor: Number(row.projected_profit_minor ?? 0),
    owner_funded_minor: Number(row.owner_funded_minor ?? 0),
    owner_advance_taken_minor: Number(row.owner_advance_taken_minor ?? 0),
    owner_advance_repaid_minor: Number(row.owner_advance_repaid_minor ?? 0),
    owner_advance_outstanding_minor: Number(row.owner_advance_outstanding_minor ?? 0),
  })) as ProjectFinanceRow[]
}

export async function listProjectOwnerAdvances(): Promise<ProjectOwnerAdvance[]> {
  const { data, error } = await client()
    .from('project_owner_advances')
    .select('id,project_id,source_account_id,destination_account_id,amount_minor,repaid_minor,status,taken_at,settled_at,note')
    .order('taken_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map(row => ({
    ...row,
    amount_minor: Number(row.amount_minor ?? 0),
    repaid_minor: Number(row.repaid_minor ?? 0),
  })) as ProjectOwnerAdvance[]
}

export async function listPlannedProjectReceipts(limit = 8): Promise<PlannedProjectReceipt[]> {
  const { data, error } = await client()
    .from('planned_project_receipts')
    .select('*')
    .order('due_at', { ascending: true, nullsFirst: false })
    .limit(limit)

  if (error) throw error
  return (data ?? []).map(row => ({
    ...row,
    amount_minor: Number(row.amount_minor ?? 0),
  })) as PlannedProjectReceipt[]
}

export async function recordProjectExpense(input: {
  projectId: string
  accountId: string
  amountMinor: number
  expenseType: ProjectExpenseType
  occurredAt?: string
  counterparty?: string
  note?: string
}) {
  const { data, error } = await client().rpc('record_project_expense', {
    p_project_id: input.projectId,
    p_account_id: input.accountId,
    p_amount_minor: input.amountMinor,
    p_expense_type: input.expenseType,
    p_occurred_at: input.occurredAt ?? new Date().toISOString(),
    p_counterparty: input.counterparty?.trim() || null,
    p_note: input.note?.trim() || null,
  })
  if (error) throw error
  return data as string
}

export async function takeProjectOwnerAdvance(input: {
  projectId: string
  sourceAccountId: string
  destinationAccountId: string
  amountMinor: number
  takenAt?: string
  note?: string
}) {
  const { data, error } = await client().rpc('take_project_owner_advance', {
    p_project_id: input.projectId,
    p_source_account_id: input.sourceAccountId,
    p_destination_account_id: input.destinationAccountId,
    p_amount_minor: input.amountMinor,
    p_taken_at: input.takenAt ?? new Date().toISOString(),
    p_note: input.note?.trim() || null,
  })
  if (error) throw error
  return data as string
}

export async function repayProjectOwnerAdvance(input: {
  advanceId: string
  sourceAccountId: string
  destinationAccountId: string
  amountMinor: number
  repaidAt?: string
  note?: string
}) {
  const { data, error } = await client().rpc('repay_project_owner_advance', {
    p_advance_id: input.advanceId,
    p_source_account_id: input.sourceAccountId,
    p_destination_account_id: input.destinationAccountId,
    p_amount_minor: input.amountMinor,
    p_repaid_at: input.repaidAt ?? new Date().toISOString(),
    p_note: input.note?.trim() || null,
  })
  if (error) throw error
  return data as string
}

export async function addExpectedProjectPayment(input: {
  projectId: string
  amountMinor: number
  dueAt?: string
  paymentType: ExpectedPaymentType
  label?: string
  note?: string
}) {
  const { data, error } = await client().rpc('add_project_expected_payment', {
    p_project_id: input.projectId,
    p_amount_minor: input.amountMinor,
    p_due_at: input.dueAt ?? null,
    p_payment_type: input.paymentType,
    p_label: input.label?.trim() || null,
    p_note: input.note?.trim() || null,
  })
  if (error) throw error
  return data as string
}
