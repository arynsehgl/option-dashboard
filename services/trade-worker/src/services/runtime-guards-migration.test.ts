/**
 * Static regression checks for forward-only database runtime guards.
 * @module services/runtime-guards-migration.test
 */

import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('worker runtime guard migration', () => {
  it('enforces active-run leases, atomic AI side effects, and the central IST paper-fill window', async () => {
    const migrationUrl = new URL('../../../../supabase/migrations/202609120001_worker_runtime_guards.sql', import.meta.url)
    const migration = await readFile(migrationUrl, 'utf8')
    expect(migration).toContain('create unique index if not exists ai_runs_one_active_per_user_idx')
    expect(migration).toContain("where status in ('queued', 'running')")
    expect(migration).toContain("v_market_now::time < time '09:15:00'")
    expect(migration).toContain("v_market_now::time >= time '15:20:00'")
    expect(migration).toContain("v_order_source = 'system'")
    expect(migration).toContain("v_market_now::time < time '15:20:00'")
    expect(migration).toContain("v_market_now::time >= time '15:30:00'")
    expect(migration).toContain('from public.paper_orders')
    expect(migration).toContain('new.quote_timestamp < v_now')
    expect(migration).toContain('lease_token_hash')
    expect(migration).toContain("and ai_run.lease_token_hash = encode(digest(p_ai_run_lease, 'sha256'), 'hex')")
    expect(migration).toContain('for update')
    expect(migration).toContain('drop function if exists public.record_paper_fill(uuid,text,text,text,integer,numeric,numeric,timestamptz,text,text,text)')
    expect(migration).toContain('create function public.record_ai_risk_rejection')
    expect(migration).toContain('create function public.finalize_ai_run')
    expect(migration).toContain('System paper fills may only flatten an existing position')
    expect(migration).toContain("if p_source = 'ai' and v_utilised > greatest(v_capital_ceiling, 0)")
    expect(migration).toContain("'PAPER_POSITION_FLATTENED'")
    expect(migration).toContain('create or replace function public.verify_stride_v2_runtime_guards()')
    expect(migration).toContain("tgfoid = to_regprocedure('public.enforce_paper_fill_market_session()')")
    expect(migration).toContain('index_state.indisunique')
    expect(migration).toContain("pg_get_expr(index_state.indpred, index_state.indrelid) = '(status = ANY")
    expect(migration.trimEnd().endsWith('grant execute on function public.verify_stride_v2_runtime_guards() to service_role;')).toBe(true)
  })
})
