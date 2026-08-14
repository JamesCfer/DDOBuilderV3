// Bug-report helpers: message formatting, rate limiting, and Discord delivery.
// Kept out of server.ts so they can be unit-tested without booting express.

/** Longest report body accepted. Discord's message cap is 2000 characters and
 *  the report is wrapped in a short header, so leave room for it. */
export const MAX_REPORT_LENGTH = 1500

/** Reports accepted per IP per hour — enough for a genuine reporting session,
 *  low enough that an open instance can't be used to spam the DM channel. */
export const REPORT_RATE_LIMIT = 10
export const REPORT_RATE_WINDOW_MS = 60 * 60 * 1000

export interface BugReportContext {
  version?: string
  page?: string
}

/**
 * Build the Discord message for a report.
 *
 * The body is fenced so it cannot break out of the code block or ping anyone:
 * Discord does not resolve @everyone/@here or role mentions inside a fence,
 * and the reporter's own backticks are neutralised first.
 */
export function formatBugReport(text: string, context?: BugReportContext): string {
  const safe = text.replace(/```/g, "'''").trim()
  const bits = [
    context?.page ? `page: ${context.page}` : '',
    context?.version ? `build: ${context.version}` : '',
  ].filter(Boolean)
  const header = bits.length > 0 ? `🐞 **Bug report** (${bits.join(', ')})` : '🐞 **Bug report**'
  return `${header}\n\`\`\`\n${safe}\n\`\`\``
}

/** Per-IP sliding-window limiter for report submissions. */
export class ReportRateLimiter {
  private readonly times = new Map<string, number[]>()

  constructor(
    private readonly limit = REPORT_RATE_LIMIT,
    private readonly windowMs = REPORT_RATE_WINDOW_MS,
  ) {}

  /** Records an attempt; returns true when it should be rejected. */
  limited(ip: string, now: number = Date.now()): boolean {
    const recent = (this.times.get(ip) ?? []).filter(t => now - t < this.windowMs)
    if (recent.length >= this.limit) {
      this.times.set(ip, recent)
      return true
    }
    recent.push(now)
    this.times.set(ip, recent)
    return false
  }
}

/**
 * DM `content` to a Discord user as the bot identified by `token`.
 *
 * Discord only lets a bot open a DM with a user who shares a server with it;
 * when they don't, the channel request fails and this throws.
 */
export const DISCORD_API_BASE = 'https://discord.com/api/v10'

export async function sendDiscordDm(
  token: string,
  userId: string,
  content: string,
  /** Overridable so delivery can be exercised against a stub (DISCORD_API_BASE). */
  apiBase: string = DISCORD_API_BASE,
): Promise<void> {
  const headers = {
    Authorization: `Bot ${token}`,
    'Content-Type': 'application/json',
  }
  // Opening a DM channel is idempotent — Discord returns the existing one.
  const channelResp = await fetch(`${apiBase}/users/@me/channels`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ recipient_id: userId }),
  })
  if (!channelResp.ok) {
    throw new Error(`Discord refused to open a DM channel (${channelResp.status})`)
  }
  const channel = await channelResp.json() as { id?: string }
  if (!channel.id) throw new Error('Discord returned no DM channel id')

  const messageResp = await fetch(`${apiBase}/channels/${channel.id}/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ content }),
  })
  if (!messageResp.ok) {
    throw new Error(`Discord rejected the message (${messageResp.status})`)
  }
}
