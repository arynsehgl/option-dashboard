/**
 * Fault-isolated India-market schedules for research, reporting, and paper safety jobs.
 * @module services/scheduler
 */

import cron from 'node-cron'
import type { Logger } from 'pino'
import type { WorkerConfig } from '../config.js'
import type { FirebaseIdentitySource } from '../lib/firebase.js'
import type { SupabaseAdmin } from '../lib/supabase.js'
import { buildAuthoritativeFirebaseProfile, resolveSupabaseProfile } from '../middleware/auth.js'
import { runCopilotResearch } from './agent.js'
import { createActiveAiRun, type ActiveAiRunLease, updateActiveAiRun } from './ai-runs.js'
import { writeAuditEvent } from './audit.js'
import { resolveBrokerQuote } from './broker-quote.js'
import { synchronizeInstrumentMaster } from './instruments.js'
import { getAuthenticatedMarketDataClient } from './market-data.js'
import { getBrokerStatus } from './broker.js'
import { getIndiaTradingDate, getIndiaTradingDayStart, isIndiaPaperFlattenWindow, resolveDailyRealisedPnl } from './trading-session.js'

export const PAPER_FLATTEN_CRON_EXPRESSION = '20-29 15 * * 1-5'

interface OpenPaperPosition {
  id: string
  user_id: string
  instrument_key: string
  quantity: number
  updated_at: string
}

/**
 * Binds close idempotency to the exact persisted position state so a later
 * same-day reopen cannot collide with an earlier successful close order.
 */
export function createPaperFlattenIntentKey(position: OpenPaperPosition, tradingDate = getIndiaTradingDate()) {
  return `close:${tradingDate}:${position.id}:${position.updated_at}:${position.quantity}`
}

/**
 * Contains a scheduled promise rejection so one failed tick cannot terminate the worker.
 */
export async function runScheduledTask(logger: Logger, taskName: string, task: () => Promise<unknown>) {
  try {
    await task()
  } catch (error) {
    logger.error({ err: error, scheduledTask: taskName }, 'Scheduled task failed safely')
  }
}

/**
 * Revalidates every scheduled user against Firebase rather than trusting a
 * cached Supabase entitlement mirror after a cancellation or revocation.
 */
export async function loadEntitledProfiles(
  supabase: SupabaseAdmin,
  firebaseIdentity: FirebaseIdentitySource,
  config: WorkerConfig,
  logger: Logger,
) {
  const { data: profiles, error } = await supabase.from('profiles').select('id,firebase_uid')
  if (error) throw error
  const entitledProfiles: Array<{ id: string; firebaseUid: string }> = []
  for (const profile of profiles || []) {
    if (!profile.firebase_uid) {
      logger.warn({ userId: profile.id }, 'Skipping a legacy profile without a linked Firebase UID')
      continue
    }
    try {
      const [identity, sourceProfile] = await Promise.all([
        firebaseIdentity.getUserIdentity(profile.firebase_uid),
        firebaseIdentity.getUserProfile(profile.firebase_uid),
      ])
      if (!sourceProfile) continue
      const authoritativeProfile = buildAuthoritativeFirebaseProfile(identity, sourceProfile, {
        superadminEmails: config.firebaseSuperadminEmails,
      })
      const profileId = await resolveSupabaseProfile(supabase, authoritativeProfile)
      if (authoritativeProfile.access.entitled) entitledProfiles.push({ id: profileId, firebaseUid: profile.firebase_uid })
    } catch (error) {
      logger.error({ err: error, userId: profile.id, firebaseUid: profile.firebase_uid }, 'Firebase entitlement revalidation failed for one scheduled user')
    }
  }
  return entitledProfiles
}

/**
 * Adds an in-app audit reminder for users who still need today's Kite login.
 */
async function recordDailyKiteConnectionReminders(
  supabase: SupabaseAdmin,
  firebaseIdentity: FirebaseIdentitySource,
  config: WorkerConfig,
  logger: Logger,
) {
  const activeProfiles = await loadEntitledProfiles(supabase, firebaseIdentity, config, logger)
  for (const profile of activeProfiles) {
    try {
      const status = await getBrokerStatus(supabase, profile.id)
      if (status.status !== 'connected') {
        await writeAuditEvent(supabase, profile.id, 'KITE_LOGIN_REQUIRED', 'Connect Kite for today’s live market data. Paper research remains paused until the feed is ready.')
      }
    } catch (error) {
      logger.error({ err: error, userId: profile.id }, 'Kite connection reminder failed for one user')
    }
  }
}

/**
 * Queues and processes one agent phase serially for all currently entitled users.
 */
async function runPhaseForActiveUsers(
  supabase: SupabaseAdmin,
  config: WorkerConfig,
  firebaseIdentity: FirebaseIdentitySource,
  phase: 'morning_research' | 'open_revalidation',
  logger: Logger,
) {
  const activeProfiles = await loadEntitledProfiles(supabase, firebaseIdentity, config, logger)
  for (const profile of activeProfiles) {
    let activeRun: ActiveAiRunLease | null = null
    try {
      const run = await createActiveAiRun(supabase, {
        userId: profile.id,
        phase,
        status: 'running',
      })
      if (!run) {
        logger.info({ userId: profile.id, phase }, 'Scheduled AI phase skipped because another run is active')
        continue
      }
      activeRun = run
      await runCopilotResearch(supabase, config, profile.id, run.id, run.leaseToken, phase)
    } catch (error) {
      if (activeRun) {
        try {
          await updateActiveAiRun(supabase, profile.id, activeRun, { status: 'failed', completed_at: new Date().toISOString(), error: error instanceof Error ? error.message : 'Unknown agent failure' })
        } catch (updateError) {
          logger.error({ err: updateError, userId: profile.id, runId: activeRun.id }, 'Failed to persist one scheduled AI run failure')
        }
      }
      logger.error({ err: error, userId: profile.id, phase }, 'Scheduled AI phase failed for one user')
    }
  }
}

/**
 * Closes all open simulated positions at the intraday safety boundary.
 */
export async function flattenPaperPositions(supabase: SupabaseAdmin, config: WorkerConfig, logger: Logger) {
  if (!isIndiaPaperFlattenWindow()) throw new Error('Paper-position flattening is outside the weekday 15:20–15:29 IST close runway.')
  const { data: positions, error } = await supabase.from('paper_positions').select('id,user_id,instrument_key,quantity,updated_at').neq('quantity', 0)
  if (error) throw error
  const openPositions = (positions || []) as OpenPaperPosition[]
  const userIds = Array.from(new Set(openPositions.map((position) => position.user_id)))
  for (const userId of userIds) {
    const userPositions = openPositions.filter((position) => position.user_id === userId)
    let market: Awaited<ReturnType<typeof getAuthenticatedMarketDataClient>>['market']
    try {
      market = (await getAuthenticatedMarketDataClient(supabase, config, userId)).market
    } catch (marketError) {
      for (const position of userPositions) {
        try {
          await writeAuditEvent(supabase, userId, 'PAPER_FLATTEN_FAILED', 'Intraday paper flatten failed safely; the position remains visible and requires review.', { positionId: position.id, instrumentKey: position.instrument_key, error: marketError instanceof Error ? marketError.message : 'Market-data connection failed' })
        } catch (auditError) {
          logger.error({ err: auditError, userId, positionId: position.id }, 'Failed to persist one paper flatten failure audit')
        }
        logger.error({ err: marketError, userId, positionId: position.id }, 'Paper flatten failed for one position')
      }
      continue
    }
    for (const position of userPositions) {
      try {
        const quotes = await market.getQuote([position.instrument_key])
        const { lastPrice: fillPrice, quoteTimestamp } = resolveBrokerQuote(quotes[position.instrument_key], position.instrument_key)
        const fees = Number(Math.max(0.01, fillPrice * Math.abs(position.quantity) * 0.00035).toFixed(2))
        const { error: flattenError } = await supabase.rpc('record_paper_fill', {
          p_user_id: userId,
          p_intent_key: createPaperFlattenIntentKey(position),
          p_instrument_key: position.instrument_key,
          p_side: position.quantity > 0 ? 'SELL' : 'BUY',
          p_quantity: Math.abs(position.quantity),
          p_fill_price: fillPrice,
          p_fees: fees,
          p_quote_timestamp: quoteTimestamp,
          p_thesis: 'Mandatory intraday paper-position close.',
          p_invalidation: 'This safety exit is not optional.',
          p_source: 'system',
          p_ai_run_id: null,
          p_ai_run_lease: null,
          p_risk_decision: null,
        })
        if (flattenError) throw flattenError
      } catch (flattenError) {
        try {
          await writeAuditEvent(supabase, userId, 'PAPER_FLATTEN_FAILED', 'Intraday paper flatten failed safely; the position remains visible and requires review.', { positionId: position.id, instrumentKey: position.instrument_key, error: flattenError instanceof Error ? flattenError.message : 'Unknown flatten failure' })
        } catch (auditError) {
          logger.error({ err: auditError, userId, positionId: position.id }, 'Failed to persist one paper flatten failure audit')
        }
        logger.error({ err: flattenError, userId, positionId: position.id }, 'Paper flatten failed for one position')
      }
    }
  }
}

/**
 * Creates a deterministic close-of-day report and queues its email notification.
 */
async function generateDailyReports(supabase: SupabaseAdmin, logger: Logger) {
  const reportDate = getIndiaTradingDate()
  const dayStart = getIndiaTradingDayStart(reportDate)
  const [accountsResult, ordersResult, decisionsResult, runsResult, fillsResult, plansResult] = await Promise.all([
    supabase.from('paper_accounts').select('user_id,realised_daily_pnl,pnl_session_date'),
    supabase.from('paper_orders').select('user_id,status').gte('created_at', dayStart),
    supabase.from('risk_decisions').select('user_id,approved,reason_codes').gte('created_at', dayStart),
    supabase.from('ai_runs').select('user_id,summary,started_at').in('status', ['completed', 'no_trade']).gte('started_at', dayStart).order('started_at', { ascending: true }),
    supabase.from('paper_fills').select('user_id,fees').gte('created_at', dayStart),
    supabase.from('ai_plans').select('user_id,confidence,created_at').gte('created_at', dayStart).order('created_at', { ascending: true }),
  ])
  const queryError = accountsResult.error || ordersResult.error || decisionsResult.error || runsResult.error || fillsResult.error || plansResult.error
  if (queryError) throw queryError
  for (const account of accountsResult.data || []) {
    try {
      const userOrders = (ordersResult.data || []).filter((order) => order.user_id === account.user_id)
      const userDecisions = (decisionsResult.data || []).filter((decision) => decision.user_id === account.user_id)
      const latestSummary = (runsResult.data || []).filter((run) => run.user_id === account.user_id).at(-1)?.summary
      const latestConfidence = (plansResult.data || []).filter((plan) => plan.user_id === account.user_id).at(-1)?.confidence
      const observedGuards = Array.from(new Set(userDecisions.flatMap((decision) => decision.reason_codes || [])))
      const report = {
        user_id: account.user_id,
        report_date: reportDate,
        summary: latestSummary || 'No qualifying AI plan was executed. The system remained safely in no-trade mode.',
        planned_trades: userDecisions.length,
        accepted_trades: userDecisions.filter((decision) => decision.approved).length,
        rejected_trades: userDecisions.filter((decision) => !decision.approved).length,
        realised_pnl: resolveDailyRealisedPnl(account, reportDate),
        fees: (fillsResult.data || []).filter((fill) => fill.user_id === account.user_id).reduce((total, fill) => total + Number(fill.fees || 0), 0),
        confidence: Number(latestConfidence || 0),
        lessons: observedGuards.slice(0, 5).map((reason) => `Risk guard observed: ${String(reason).replaceAll('_', ' ').toLowerCase()}.`),
      }
      const { data: savedReport, error } = await supabase.from('daily_reports').upsert(report, { onConflict: 'user_id,report_date' }).select('id').single()
      if (error) throw error
      const { error: deliveryError } = await supabase.from('notification_deliveries').upsert({ user_id: account.user_id, channel: 'email', status: 'queued', daily_report_id: savedReport.id }, { onConflict: 'daily_report_id,channel' })
      if (deliveryError) throw deliveryError
      await writeAuditEvent(supabase, account.user_id, 'DAILY_REPORT_CREATED', 'Close-of-day paper report generated and email delivery queued.', { reportDate, filledOrders: userOrders.filter((order) => order.status === 'filled').length })
    } catch (error) {
      logger.error({ err: error, userId: account.user_id, reportDate }, 'Daily report failed for one user')
    }
  }
}

/**
 * Registers the weekday India-market automation schedule for the persistent worker.
 */
export function registerSchedules(
  supabase: SupabaseAdmin,
  config: WorkerConfig,
  firebaseIdentity: FirebaseIdentitySource,
  logger: Logger,
) {
  const options = { timezone: 'Asia/Kolkata' }
  const tasks = [
    cron.schedule('0 7 * * 1-5', () => void runScheduledTask(logger, 'morning-research', () => runPhaseForActiveUsers(supabase, config, firebaseIdentity, 'morning_research', logger)), options),
    cron.schedule('30 8 * * 1-5', () => void runScheduledTask(logger, 'instrument-master-refresh', () => synchronizeInstrumentMaster(supabase, config)), options),
    cron.schedule('45 8 * * 1-5', () => void runScheduledTask(logger, 'kite-connection-reminders', () => recordDailyKiteConnectionReminders(supabase, firebaseIdentity, config, logger)), options),
    cron.schedule('15 9 * * 1-5', () => void runScheduledTask(logger, 'open-revalidation', () => runPhaseForActiveUsers(supabase, config, firebaseIdentity, 'open_revalidation', logger)), options),
    cron.schedule('0 15 * * 1-5', () => void runScheduledTask(logger, 'pre-close-daily-reports', () => generateDailyReports(supabase, logger)), options),
    cron.schedule(PAPER_FLATTEN_CRON_EXPRESSION, () => void runScheduledTask(logger, 'paper-position-flatten', () => flattenPaperPositions(supabase, config, logger)), options),
    cron.schedule('40 15 * * 1-5', () => void runScheduledTask(logger, 'final-daily-reports', () => generateDailyReports(supabase, logger)), options),
  ]
  return {
    /** Stops all registered schedules during graceful shutdown. */
    stop() { tasks.forEach((task) => task.stop()) },
  }
}
