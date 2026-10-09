/**
 * Validated process configuration for the persistent trade worker.
 * @module config
 */

import 'dotenv/config'
import { z } from 'zod'

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3002),
  FRONTEND_ORIGIN: z.string().url().default('http://localhost:5173'),
  FRONTEND_ORIGINS: z.string().optional(),
  NETLIFY_PREVIEW_SITE_NAME: z.string().regex(/^[a-z0-9-]+$/).optional(),
  PUBLIC_WORKER_URL: z.string().url().default('http://localhost:3002'),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
  MAX_STREAM_CLIENTS_PER_USER: z.coerce.number().int().min(1).max(10).default(5),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  APP_ENCRYPTION_KEY: z.string().refine((value) => Buffer.from(value, 'base64').length === 32, 'must be a base64-encoded 32-byte key'),
  FIREBASE_PROJECT_ID: z.string().min(3).max(128),
  FIREBASE_CLIENT_EMAIL: z.string().email().optional(),
  FIREBASE_PRIVATE_KEY: z.string().min(64).optional(),
  FIREBASE_ALLOW_APPLICATION_DEFAULT: z.enum(['true', 'false']).default('false'),
  FIREBASE_SUPERADMIN_EMAIL: z.string().email().optional(),
  GITHUB_TOKEN: z.string().min(1).optional(),
  COPILOT_MODEL: z.string().default('gpt-5'),
  LIVE_ORDERING_ENABLED: z.literal('false').default('false'),
})

/**
 * Converts a configured URL into an exact browser origin and rejects paths,
 * queries, or credentials that would make CORS matching ambiguous.
 */
function parseExactOrigin(value: string, fieldName: string) {
  const parsed = new URL(value)
  if (value.replace(/\/$/, '') !== parsed.origin) {
    throw new Error(`Invalid worker configuration: ${fieldName} must be an exact origin without a path, query, or credentials`)
  }
  return parsed.origin
}

/**
 * Validates an environment object and derives runtime-safe worker settings.
 */
export function parseWorkerConfig(environment: NodeJS.ProcessEnv) {
  const parsed = environmentSchema.safeParse(environment)
  if (!parsed.success) {
    throw new Error(`Invalid worker configuration: ${parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`)
  }
  if (Boolean(parsed.data.FIREBASE_CLIENT_EMAIL) !== Boolean(parsed.data.FIREBASE_PRIVATE_KEY)) {
    throw new Error('Invalid worker configuration: FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY must be configured together')
  }
  const hasExplicitFirebaseCredentials = Boolean(parsed.data.FIREBASE_CLIENT_EMAIL && parsed.data.FIREBASE_PRIVATE_KEY)
  if (parsed.data.NODE_ENV === 'production' && !hasExplicitFirebaseCredentials && parsed.data.FIREBASE_ALLOW_APPLICATION_DEFAULT !== 'true') {
    throw new Error('Invalid worker configuration: production requires explicit Firebase credentials or FIREBASE_ALLOW_APPLICATION_DEFAULT=true')
  }
  const frontendOrigins = Array.from(new Set([
    parseExactOrigin(parsed.data.FRONTEND_ORIGIN, 'FRONTEND_ORIGIN'),
    ...(parsed.data.FRONTEND_ORIGINS || '').split(',').map((origin) => origin.trim()).filter(Boolean)
      .map((origin) => parseExactOrigin(origin, 'FRONTEND_ORIGINS')),
  ]))
  if (parsed.data.NODE_ENV === 'production') {
    const secureUrls = [parsed.data.PUBLIC_WORKER_URL, parsed.data.SUPABASE_URL, ...frontendOrigins]
    if (secureUrls.some((value) => new URL(value).protocol !== 'https:')) {
      throw new Error('Invalid worker configuration: production origins and service URLs must use HTTPS')
    }
  }
  return {
    ...parsed.data,
    frontendOrigins,
    trustProxyHops: parsed.data.TRUST_PROXY_HOPS,
    maxStreamClientsPerUser: parsed.data.MAX_STREAM_CLIENTS_PER_USER,
    firebaseAllowApplicationDefault: parsed.data.NODE_ENV !== 'production' || parsed.data.FIREBASE_ALLOW_APPLICATION_DEFAULT === 'true',
    liveOrderingEnabled: false,
  }
}

/**
 * Accepts exact configured origins plus this site's numeric Netlify deploy
 * preview hosts when preview testing is deliberately enabled.
 */
export function isAllowedFrontendOrigin(origin: string, config: Pick<WorkerConfig, 'frontendOrigins' | 'NETLIFY_PREVIEW_SITE_NAME'>) {
  if (config.frontendOrigins.includes(origin)) return true
  if (!config.NETLIFY_PREVIEW_SITE_NAME) return false
  const escapedSiteName = config.NETLIFY_PREVIEW_SITE_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^https://deploy-preview-\\d+--${escapedSiteName}\\.netlify\\.app$`).test(origin)
}

/**
 * Validates process configuration before any network listener starts.
 */
export function loadConfig() {
  return parseWorkerConfig(process.env)
}

export type WorkerConfig = ReturnType<typeof loadConfig>
