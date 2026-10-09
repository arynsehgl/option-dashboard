/**
 * Runs constrained Copilot research that can only propose paper-trading intents.
 * @module services/agent
 */
import { CopilotClient, defineTool, type PermissionRequest, type PermissionRequestResult } from '@github/copilot-sdk'
import { z } from 'zod'
import type { WorkerConfig } from '../config.js'
import type { SupabaseAdmin } from '../lib/supabase.js'
import { instrumentKeySchema, tradeInvalidationSchema, tradeThesisSchema } from '../request-contracts.js'
import type { TradeIntent } from '../types.js'
import { writeAuditEvent } from './audit.js'
import { finalizeActiveAiRun, updateActiveAiRun } from './ai-runs.js'
import { resolveBrokerQuote } from './broker-quote.js'
import { processPaperIntent } from './paper.js'
import { collectKiteResearchEvidence } from './research.js'
import { getAuthenticatedMarketDataClient } from './market-data.js'
import { isIndiaPaperFillWindow } from './trading-session.js'

const intentParameters = z.object({
  instrumentKey: instrumentKeySchema,
  side: z.enum(['BUY', 'SELL']),
  quantity: z.number().int().positive(),
  entryPrice: z.number().positive(),
  stopLossPrice: z.number().positive(),
  targetPrice: z.number().positive().optional(),
  confidence: z.number().min(0).max(100),
  thesis: tradeThesisSchema,
  invalidation: tradeInvalidationSchema,
})

/**
 * Rejects every runtime capability except custom tools explicitly marked permission-free.
 */
function rejectAmbientPermission(request: PermissionRequest): PermissionRequestResult {
  return { kind: 'reject', feedback: `${request.kind} capabilities are not available to the trading research agent.` }
}

/**
 * Builds an allowlisted child-process environment that excludes broker and database secrets.
 */
function copilotRuntimeEnvironment() {
  return {
    PATH: process.env.PATH,
    LANG: process.env.LANG,
    LC_ALL: process.env.LC_ALL,
    TMPDIR: process.env.TMPDIR,
    HTTPS_PROXY: process.env.HTTPS_PROXY,
    HTTP_PROXY: process.env.HTTP_PROXY,
    NO_PROXY: process.env.NO_PROXY,
    NODE_EXTRA_CA_CERTS: process.env.NODE_EXTRA_CA_CERTS,
  }
}

/**
 * Allows an agent tool to request a paper fill only during open revalidation
 * inside the central India-market session window.
 */
export function canExecutePaperIntent(
  phase: 'morning_research' | 'open_revalidation',
  now = new Date(),
) {
  return phase === 'open_revalidation' && isIndiaPaperFillWindow(now)
}

/**
 * Creates a failure-tolerant serial executor so concurrent custom-tool calls
 * cannot race risk-state loading or paper-fill persistence.
 */
export function createSerialExecutor() {
  let tail: Promise<void> = Promise.resolve()
  return function executeSerially<Result>(task: () => Promise<Result>) {
    const result = tail.then(task)
    tail = result.then(() => undefined, () => undefined)
    return result
  }
}

/**
 * Records a safe no-trade result when open revalidation has no fresh Kite feed.
 */
async function recordFeedBlockedRun(supabase: SupabaseAdmin, userId: string, runId: string, runLeaseToken: string) {
  const summary = 'No paper trade was attempted because today’s Kite market-data session was not connected for open revalidation.'
  await finalizeActiveAiRun(supabase, userId, { id: runId, leaseToken: runLeaseToken }, {
    status: 'no_trade',
    summary,
    intentCount: 0,
    confidence: 0,
    invalidation: 'A fresh authenticated quote is mandatory before any paper intent can pass validation.',
    evidenceIds: [],
  })
  await writeAuditEvent(supabase, userId, 'AI_WAITING_FOR_LIVE_DATA', summary, { runId })
  return { summary, processedIntents: [] }
}

/**
 * Runs one isolated Copilot research session with no direct broker execution capability.
 */
export async function runCopilotResearch(
  supabase: SupabaseAdmin,
  config: WorkerConfig,
  userId: string,
  runId: string,
  runLeaseToken: string,
  phase: 'morning_research' | 'open_revalidation' = 'morning_research',
) {
  if (!config.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN is not configured for Copilot SDK.')
  let liveEvidenceAvailable = true
  try {
    await collectKiteResearchEvidence(supabase, config, userId)
  } catch (error) {
    liveEvidenceAvailable = false
    if (phase === 'open_revalidation') return recordFeedBlockedRun(supabase, userId, runId, runLeaseToken)
  }
  const { data: evidence, error: evidenceError } = await supabase
    .from('research_evidence')
    .select('id,source_type,source_name,instrument_key,title,summary,observed_at,source_url')
    .eq('user_id', userId)
    .order('observed_at', { ascending: false })
    .limit(100)
  if (evidenceError) throw evidenceError

  const client = new CopilotClient({
    mode: 'empty',
    gitHubToken: config.GITHUB_TOKEN,
    useLoggedInUser: false,
    baseDirectory: '/tmp/stride-copilot',
    env: copilotRuntimeEnvironment(),
    sessionIdleTimeoutSeconds: 300,
    logLevel: 'error',
  })
  const processedIntents: Array<{ approved: boolean }> = []
  const submittedIntents: TradeIntent[] = []
  const paperIntentExecutionAllowed = canExecutePaperIntent(phase)
  const executePaperIntentSerially = createSerialExecutor()
  try {
    await client.start()
    const session = await client.createSession({
      model: config.COPILOT_MODEL,
      reasoningEffort: 'high',
      enableSessionStore: false,
      infiniteSessions: { enabled: false },
      onPermissionRequest: rejectAmbientPermission,
      systemMessage: {
        content: `You are Stride's paper-trading research agent. Work only from supplied evidence. Never claim certainty, never request a broker action, and never imply that a paper result is real. Every proposed trade must include a measurable invalidation. If evidence is weak, propose no trade and explain why. Fresh Kite evidence available: ${liveEvidenceAvailable}. Paper intent execution allowed: ${paperIntentExecutionAllowed}. Never try to submit an intent when either value is false. Current phase: ${phase}. Morning research is always plan-only.`,
      },
      tools: [
        defineTool('read_research_evidence', {
          description: 'Return the normalized, user-scoped market research evidence available for this run.',
          parameters: z.object({}),
          skipPermission: true,
          defer: 'never',
          handler: async () => evidence || [],
        }),
        ...(paperIntentExecutionAllowed ? [defineTool('submit_trade_intent', {
          description: 'Submit one paper-only trade hypothesis to deterministic risk validation. The worker replaces the proposed entry with a timestamped Kite quote and can never place a real broker order.',
          parameters: intentParameters,
          skipPermission: true,
          defer: 'never',
          handler: async (parameters) => executePaperIntentSerially(async () => {
            if (!liveEvidenceAvailable || !canExecutePaperIntent(phase)) {
              throw new Error('Paper intents require fresh Kite data during the weekday 09:15–15:19 IST execution window.')
            }
            const { market } = await getAuthenticatedMarketDataClient(supabase, config, userId)
            const quotes = await market.getQuote(parameters.instrumentKey)
            const { lastPrice: entryPrice, quoteTimestamp } = resolveBrokerQuote(quotes[parameters.instrumentKey], parameters.instrumentKey)
            const intent: TradeIntent = { ...parameters, entryPrice, userId, environment: 'paper', quoteTimestamp }
            submittedIntents.push(intent)
            const result = await processPaperIntent(supabase, intent, { runId, leaseToken: runLeaseToken })
            processedIntents.push(result)
            return result
          }),
        })] : []),
      ],
    })
    const response = await session.sendAndWait({
      prompt: phase === 'morning_research'
        ? 'Use available evidence to prepare a provisional intraday research plan. Do not submit any trade intent during morning research. Clearly state what must be revalidated against a fresh timestamped Kite quote after 09:15 IST.'
        : paperIntentExecutionAllowed
          ? 'Revalidate the morning hypothesis against the latest evidence. Withdraw stale ideas, submit only still-valid paper intents, and explain every change.'
          : 'Revalidate the morning hypothesis, but do not submit any trade intent because the weekday 09:15–15:19 IST paper execution window is closed.',
    }, 240000)
    const content = response?.data.content || 'Agent completed without a narrative response.'
    const runStatus = processedIntents.some((intent) => intent.approved) ? 'completed' : 'no_trade'
    const confidence = submittedIntents.length
      ? submittedIntents.reduce((total, intent) => total + intent.confidence, 0) / submittedIntents.length
      : 0
    await finalizeActiveAiRun(supabase, userId, { id: runId, leaseToken: runLeaseToken }, {
      status: runStatus,
      summary: content,
      intentCount: processedIntents.length,
      confidence,
      invalidation: submittedIntents.length ? submittedIntents.map((intent) => intent.invalidation).join(' | ') : 'No trade was authorized because the evidence did not support a qualifying hypothesis.',
      evidenceIds: (evidence || []).map((item) => item.id),
    })
    await writeAuditEvent(supabase, userId, runStatus === 'no_trade' ? 'AI_RUN_NO_TRADE' : 'AI_RUN_COMPLETED', `Copilot ${phase} run completed.`, { runId, intentCount: processedIntents.length, confidence })
    await session.disconnect()
    return { summary: content, processedIntents }
  } catch (error) {
    let failureRecorded = false
    try {
      failureRecorded = await updateActiveAiRun(supabase, userId, { id: runId, leaseToken: runLeaseToken }, {
        status: 'failed', completed_at: new Date().toISOString(), error: error instanceof Error ? error.message : 'Unknown agent failure',
      })
      if (failureRecorded) {
        await writeAuditEvent(supabase, userId, 'AI_RUN_FAILED', `Copilot ${phase} run failed safely; no live order path was available.`, { runId })
      }
    } catch (failureUpdateError) {
      throw new AggregateError([error, failureUpdateError], 'The AI run and its failure status could not be persisted.')
    }
    throw error
  } finally {
    await client.stop().catch(() => [])
  }
}
