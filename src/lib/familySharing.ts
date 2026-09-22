import { supabase } from './supabase'
import { listAccountsForWorkspaces, listWorkspaces, type MoneyAccount, type Workspace } from './moneycrm'

export type FamilyShareVisibility = 'balance_only' | 'family_activity'

export type FamilyAccountShare = {
  id: string
  family_workspace_id: string
  personal_account_id: string
  owner_user_id: string
  account_alias: string
  visibility: FamilyShareVisibility
  include_in_family_resources: boolean
  balance_minor: number
  currency: string
}

export type FamilyMember = {
  user_id: string
  role: 'owner' | 'admin' | 'member' | 'viewer'
}

export type FamilyInvite = {
  id: string
  family_workspace_id: string
  code: string
  expires_at: string
  max_uses: number
  uses: number
}

export type FamilySharingState = {
  activeFamily: Workspace | null
  familyWorkspaces: Workspace[]
  personalAccounts: MoneyAccount[]
  familyAccounts: MoneyAccount[]
  shares: FamilyAccountShare[]
  members: FamilyMember[]
  invites: FamilyInvite[]
  currentUserId: string
  currentRole: FamilyMember['role'] | null
}

function client() {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

export async function getActiveFamilyWorkspaceId(): Promise<string | null> {
  const auth = client()
  const { data: userData, error: userError } = await auth.auth.getUser()
  if (userError) throw userError
  if (!userData.user) return null
  const { data, error } = await auth
    .from('profiles')
    .select('active_family_workspace_id')
    .eq('id', userData.user.id)
    .maybeSingle()
  if (error) throw error
  return data?.active_family_workspace_id ?? null
}

export async function loadFamilySharingState(): Promise<FamilySharingState> {
  const auth = client()
  const [{ data: userData, error: userError }, workspaces] = await Promise.all([
    auth.auth.getUser(),
    listWorkspaces(),
  ])
  if (userError) throw userError
  if (!userData.user) throw new Error('Not authenticated')

  const familyWorkspaces = workspaces.filter(workspace => workspace.kind === 'family')
  const personalWorkspaces = workspaces.filter(workspace => workspace.kind === 'personal')
  const activeFamilyId = await getActiveFamilyWorkspaceId()
  const activeFamily = familyWorkspaces.find(workspace => workspace.id === activeFamilyId) ?? familyWorkspaces[0] ?? null

  const [personalAccounts, familyAccounts] = await Promise.all([
    listAccountsForWorkspaces(personalWorkspaces.map(workspace => workspace.id)),
    activeFamily ? listAccountsForWorkspaces([activeFamily.id]) : Promise.resolve([]),
  ])

  if (!activeFamily) {
    return {
      activeFamily: null,
      familyWorkspaces,
      personalAccounts,
      familyAccounts: [],
      shares: [],
      members: [],
      invites: [],
      currentUserId: userData.user.id,
      currentRole: null,
    }
  }

  const [{ data: shareRows, error: sharesError }, { data: memberRows, error: membersError }, { data: inviteRows, error: invitesError }] = await Promise.all([
    auth
      .from('family_account_shares')
      .select('id,family_workspace_id,personal_account_id,owner_user_id,account_alias,visibility,include_in_family_resources,balance_minor,currency')
      .eq('family_workspace_id', activeFamily.id)
      .order('created_at', { ascending: true }),
    auth
      .from('workspace_members')
      .select('user_id,role')
      .eq('workspace_id', activeFamily.id)
      .order('created_at', { ascending: true }),
    auth
      .from('family_invites')
      .select('id,family_workspace_id,code,expires_at,max_uses,uses')
      .eq('family_workspace_id', activeFamily.id)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false }),
  ])

  if (sharesError) throw sharesError
  if (membersError) throw membersError
  // Non-admin family members legitimately see zero invites through RLS.
  const members = (memberRows ?? []) as FamilyMember[]

  return {
    activeFamily,
    familyWorkspaces,
    personalAccounts,
    familyAccounts,
    shares: (shareRows ?? []).map(row => ({ ...row, balance_minor: Number(row.balance_minor ?? 0) })) as FamilyAccountShare[],
    members,
    invites: invitesError ? [] : (inviteRows ?? []).map(row => ({ ...row, max_uses: Number(row.max_uses), uses: Number(row.uses) })) as FamilyInvite[],
    currentUserId: userData.user.id,
    currentRole: members.find(member => member.user_id === userData.user.id)?.role ?? null,
  }
}

export async function createFamilyInvite(familyWorkspaceId: string) {
  const auth = client()
  const { data: userData, error: userError } = await auth.auth.getUser()
  if (userError) throw userError
  if (!userData.user) throw new Error('Not authenticated')
  const { data, error } = await auth
    .from('family_invites')
    .insert({ family_workspace_id: familyWorkspaceId, created_by: userData.user.id, max_uses: 1 })
    .select('id,family_workspace_id,code,expires_at,max_uses,uses')
    .single()
  if (error) throw error
  return data as FamilyInvite
}

export async function joinFamilyByCode(code: string) {
  const auth = client()
  const { data: userData, error: userError } = await auth.auth.getUser()
  if (userError) throw userError
  if (!userData.user) throw new Error('Not authenticated')
  const { data, error } = await auth
    .from('family_join_requests')
    .insert({ user_id: userData.user.id, invite_code: code.trim().toUpperCase() })
    .select('family_workspace_id,status')
    .single()
  if (error) throw error
  return data as { family_workspace_id: string; status: 'joined' }
}

export async function setActiveFamilyWorkspace(familyWorkspaceId: string) {
  const auth = client()
  const { data: userData, error: userError } = await auth.auth.getUser()
  if (userError) throw userError
  if (!userData.user) throw new Error('Not authenticated')
  const { error } = await auth
    .from('profiles')
    .update({ active_family_workspace_id: familyWorkspaceId, updated_at: new Date().toISOString() })
    .eq('id', userData.user.id)
  if (error) throw error
}

export async function sharePersonalAccount(input: {
  familyWorkspaceId: string
  personalAccountId: string
  alias: string
  visibility: FamilyShareVisibility
  includeInResources?: boolean
}) {
  const auth = client()
  const { data: userData, error: userError } = await auth.auth.getUser()
  if (userError) throw userError
  if (!userData.user) throw new Error('Not authenticated')
  const { data, error } = await auth
    .from('family_account_shares')
    .upsert({
      family_workspace_id: input.familyWorkspaceId,
      personal_account_id: input.personalAccountId,
      owner_user_id: userData.user.id,
      account_alias: input.alias.trim() || 'Личный вклад',
      visibility: input.visibility,
      include_in_family_resources: input.includeInResources ?? true,
    }, { onConflict: 'family_workspace_id,personal_account_id' })
    .select('id')
    .single()
  if (error) throw error
  return data
}

export async function stopSharingPersonalAccount(shareId: string) {
  const { error } = await client().from('family_account_shares').delete().eq('id', shareId)
  if (error) throw error
}
