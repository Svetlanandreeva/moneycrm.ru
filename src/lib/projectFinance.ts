import { supabase } from './supabase'

export type ProjectExpenseType = 'materials' | 'labor' | 'contractor' | 'logistics' | 'packaging' | 'fees' | 'taxes' | 'other'
export type ExpectedPaymentType = 'prepayment' | 'final' | 'full' | 'other'

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
  production_due_at: string | null
  ship_due_at: string | null
  acceptance_due_at: string | null
  accepted_at: string | null
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
    .select('project_id,workspace_id,name,client_name,status,currency,contract_value_minor,received_minor,restricted_minor,earned_minor,outstanding_minor,actual_cost_minor,project_cash_remaining_minor,realized_profit_minor,projected_profit_minor,owner_funded_minor,production_due_at,ship_due_at,acceptance_due_at,accepted_at')
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
  })) as ProjectFinanceRow[]
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
