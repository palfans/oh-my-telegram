import axios, { type AxiosInstance } from 'axios';
import https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';

import { OpencodeGateway, type PendingPermission, type PendingQuestionRequest } from './opencode-gateway.js';

/**
 * Telegram update structure
 */
interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      username?: string;
      first_name?: string;
    };
    chat: {
      id: number;
      type: string;
    };
    text?: string;
    date: number;
  };
  callback_query?: {
    id: string;
    from: {
      id: number;
    };
    message?: {
      message_id: number;
      chat: {
        id: number;
      };
    };
    data: string;
  };
}

/**
 * Telegram to OpenCode session mapping
 */
interface TelegramSession {
  chatId: number;
  sessionKey: string;
  opencodeSessionId: string | null;
  currentAgent: string;
  workingDirectory: string;
  gateway: OpencodeGateway;
  lastUserMessage?: string;
  createdAt: Date;
  lastActivity: Date;
}

/**
 * Keyboard button definition
 */
interface KeyboardButton {
  text: string;
  callback_data: string;
}

/**
 * Keyboard row definition
 */
type KeyboardRow = KeyboardButton[];

/**
 * Configuration for oh-my-telegram
 */
export interface OhMyTelegramConfig {
  telegram: {
    botToken: string;
    allowedUsers: string[];
    webhookUrl?: string;
    polling?: boolean;
  };
  opencode: {
    defaultAgent: string;
    workingDirectory: string;
    sessionPrefix: string;
    webUrl?: string;
  };
  keyboard?: {
    enabled: boolean;
    rows: KeyboardRow[];
  };
}

/**
 * Telegram bot for oh-my-opencode
 * Using direct API calls (no Telegraf) - clawdbot-compatible architecture
 */
export class TelegramBot {
  private config: OhMyTelegramConfig;
  private sessions: Map<number, TelegramSession>;
  private serverUrl: string;
  private botToken: string;
  private apiUrl: string;
  private httpClient: AxiosInstance;
  private seenPermissionRequestIds: Set<string> = new Set();
  private seenQuestionRequestIds: Set<string> = new Set();
  private questionAnswerState: Map<string, { answers: Array<Array<string>>; total: number }> = new Map();

  private inFlightByChatId: Map<number, boolean> = new Map();
  private isRunning: boolean = false;
  private pollingInterval: number = 1000; // ms between polling attempts
  private longPollTimeout: number = 30; // seconds for long polling
  private lastUpdateId: number = 0;

  constructor(config: OhMyTelegramConfig) {
    this.config = config;
    this.botToken = config.telegram.botToken;
    this.apiUrl = `https://api.telegram.org/bot${this.botToken}`;
    this.serverUrl = 'http://localhost:4096';
    this.sessions = new Map();
    this.httpClient = this.createTelegramHttpClient();
  }

  async initialize(): Promise<void> {
    
  }

  /**
   * Make API call to Telegram
   */
  private async apiCall(method: string, payload: any = {}): Promise<any> {
    const requestTimeoutMs = method === 'getUpdates'
      ? (this.longPollTimeout * 1000 + 5000)
      : 30000;

    const response = await this.httpClient.post(`/${method}`, payload, {
      timeout: requestTimeoutMs,
    });
    return response.data;
  }

  private createTelegramHttpClient(): AxiosInstance {
    const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy;
    const httpProxy = process.env.HTTP_PROXY || process.env.http_proxy;
    const proxyUrl = httpsProxy || httpProxy;

    const agentOptions: https.AgentOptions = {
      keepAlive: true,
      keepAliveMsecs: 1000,
      maxSockets: 64,
      maxFreeSockets: 32,
      scheduling: 'lifo',
    };

    const axiosConfig: any = {
      baseURL: this.apiUrl,
    };

    if (proxyUrl) {
      axiosConfig.httpsAgent = new HttpsProxyAgent(proxyUrl, agentOptions);
      axiosConfig.proxy = false; // Disable axios built-in proxy when using custom agent
    } else {
      axiosConfig.httpsAgent = new https.Agent(agentOptions);
    }

    return axios.create(axiosConfig);
  }

  private getOpencodeWebUrl(): string {
    const raw = this.config.opencode.webUrl || 'http://127.0.0.1:4096';
    return raw.replace(/\/+$/, '');
  }

  private buildOpencodeSessionWebUrl(sessionId: string, projectID?: string): string {
    const base = this.getOpencodeWebUrl();
    const project = encodeURIComponent(projectID || 'global');
    const id = encodeURIComponent(sessionId);
    return `${base}/${project}/session/${id}`;
  }

  /**
   * Send message to Telegram chat
   */
  async sendMessage(chatId: number, text: string, options: any = {}): Promise<void> {
    const timestamp = new Date().toISOString();
    try {
      const payload: any = {
        chat_id: chatId,
        text,
        ...options,
      };

      if (payload.parse_mode == null) {
        delete payload.parse_mode;
      }

      await this.apiCall('sendMessage', payload);
      console.log(`[${timestamp}] [bot] sent message to ${chatId} (${text.length} chars)`);
    } catch (error: any) {
      console.error(`[${timestamp}] [bot] failed to send message:`, error.response?.data || error.message);
      throw error;
    }
  }

  private async sendMarkdownMessage(chatId: number, text: string, options: any = {}): Promise<void> {
    const { parse_mode, ...rest } = options;
    return this.sendMessage(chatId, text, {
      ...rest,
      parse_mode: parse_mode ?? 'Markdown',
    });
  }

  private async sendHtmlMessage(chatId: number, text: string, options: any = {}): Promise<void> {
    const { parse_mode, ...rest } = options;
    return this.sendMessage(chatId, text, {
      ...rest,
      parse_mode: parse_mode ?? 'HTML',
    });
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private escapeHtmlAttribute(text: string): string {
    return this.escapeHtml(text);
  }

  private chunkRawForHtmlWrapper(
    raw: string,
    wrapPrefix: string,
    wrapSuffix: string,
    maxPayloadLength = 4000
  ): string[] {
    const chunks: string[] = [];
    let remaining = raw;

    while (remaining.length > 0) {
      let lo = 1;
      let hi = remaining.length;
      let best = 0;

      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        const candidate = remaining.slice(0, mid);
        const formatted = wrapPrefix + this.escapeHtml(candidate) + wrapSuffix;
        if (formatted.length <= maxPayloadLength) {
          best = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }

      if (best <= 0) best = 1;

      let cut = best;
      const nl = remaining.lastIndexOf('\n', best - 1);
      if (nl !== -1) {
        const candidateNl = remaining.slice(0, nl + 1);
        const formattedNl = wrapPrefix + this.escapeHtml(candidateNl) + wrapSuffix;
        if (formattedNl.length <= maxPayloadLength) {
          cut = nl + 1;
        }
      }

      chunks.push(remaining.slice(0, cut));
      remaining = remaining.slice(cut);
    }

    return chunks;
  }

  private formatPreHtml(raw: string): string {
    return `<pre>${this.escapeHtml(raw)}</pre>`;
  }

  private chunkRawForHtmlPre(raw: string, maxPayloadLength = 4000): string[] {
    return this.chunkRawForHtmlWrapper(raw, '<pre>', '</pre>', maxPayloadLength);
  }

  private async sendPreMessage(chatId: number, raw: string, options: any = {}): Promise<number> {
    const chunks = this.chunkRawForHtmlPre(raw);
    for (const chunk of chunks) {
      await this.sendHtmlMessage(chatId, this.formatPreHtml(chunk), options);
    }

    return chunks.length;
  }

  private parseMarkdownCodeBlocks(markdown: string): Array<
    | { kind: 'code'; lang?: string; raw: string }
    | { kind: 'text'; raw: string }
  > {
    const lines = markdown.split('\n');
    const blocks: Array<{ kind: 'code'; lang?: string; raw: string } | { kind: 'text'; raw: string }> = [];

    let inCode = false;
    let codeLang: string | undefined;
    let buf: string[] = [];

    const flushText = () => {
      const raw = buf.join('\n');
      buf = [];
      if (raw !== '') blocks.push({ kind: 'text', raw });
    };

    const flushCode = () => {
      const raw = buf.join('\n');
      buf = [];
      blocks.push({ kind: 'code', lang: codeLang, raw });
    };

    for (const line of lines) {
      const fence = line.match(/^```\s*(\S+)?\s*$/);
      if (fence) {
        if (!inCode) {
          flushText();
          inCode = true;
          codeLang = fence[1] || undefined;
        } else {
          inCode = false;
          flushCode();
          codeLang = undefined;
        }
        continue;
      }

      buf.push(line);
    }

    if (buf.length > 0) {
      if (inCode) flushCode();
      else flushText();
    }

    return blocks;
  }

  private formatInlineMarkdownToHtml(text: string): string {
    let out = '';
    let i = 0;

    while (i < text.length) {
      if (text[i] === '`') {
        const end = text.indexOf('`', i + 1);
        if (end !== -1) {
          const raw = text.slice(i + 1, end);
          out += `<code>${this.escapeHtml(raw)}</code>`;
          i = end + 1;
          continue;
        }
      }

      if (text.startsWith('**', i)) {
        const end = text.indexOf('**', i + 2);
        if (end !== -1) {
          const raw = text.slice(i + 2, end);
          out += `<b>${this.formatInlineMarkdownToHtml(raw)}</b>`;
          i = end + 2;
          continue;
        }
      }

      if (text[i] === '[') {
        const mid = text.indexOf('](', i + 1);
        if (mid !== -1) {
          const end = text.indexOf(')', mid + 2);
          if (end !== -1) {
            const labelRaw = text.slice(i + 1, mid);
            const urlRaw = text.slice(mid + 2, end);
            const label = this.formatInlineMarkdownToHtml(labelRaw);
            const url = this.escapeHtmlAttribute(urlRaw);
            out += `<a href="${url}">${label}</a>`;
            i = end + 1;
            continue;
          }
        }
      }

      out += this.escapeHtml(text[i]);
      i += 1;
    }

    return out;
  }

  private formatTextBlockMarkdownToHtml(raw: string): string {
    const lines = raw.split('\n');
    const rendered = lines.map(line => {
      const m = line.match(/^(\s*)[-*]\s+(.*)$/);
      if (m) {
        const indent = m[1] || '';
        const body = m[2] || '';
        return `${this.escapeHtml(indent)}• ${this.formatInlineMarkdownToHtml(body)}`;
      }
      return this.formatInlineMarkdownToHtml(line);
    });
    return rendered.join('\n');
  }

  private async sendMarkdownAsTelegramHtml(chatId: number, markdown: string, options: any = {}): Promise<number> {
    const maxPayloadLength = 4000;
    const blocks = this.parseMarkdownCodeBlocks(markdown);
    let pending = '';
    let sentCount = 0;

    const flushPending = async () => {
      if (!pending) return;
      await this.sendHtmlMessage(chatId, pending, options);
      sentCount += 1;
      pending = '';
    };

    for (const b of blocks) {
      if (b.kind === 'code') {
        await flushPending();

        const safeLang = (b.lang || '').match(/^[a-zA-Z0-9_+-]{1,32}$/) ? b.lang : undefined;
        const classAttr = safeLang ? ` class="language-${this.escapeHtmlAttribute(safeLang)}"` : '';
        const wrapPrefix = `<pre><code${classAttr}>`;
        const wrapSuffix = '</code></pre>';

        const codeChunks = this.chunkRawForHtmlWrapper(b.raw, wrapPrefix, wrapSuffix, maxPayloadLength);
        for (const c of codeChunks) {
          await this.sendHtmlMessage(chatId, wrapPrefix + this.escapeHtml(c) + wrapSuffix, options);
          sentCount += 1;
        }
        continue;
      }

      const html = this.formatTextBlockMarkdownToHtml(b.raw);
      const piece = pending ? `${pending}\n\n${html}` : html;
      if (piece.length <= maxPayloadLength) {
        pending = piece;
        continue;
      }

      await flushPending();
      if (html.length <= maxPayloadLength) {
        pending = html;
        continue;
      }

      const count = await this.sendPreMessage(chatId, b.raw, options);
      sentCount += count;
    }

    await flushPending();
    return sentCount;
  }

  /**
   * Answer callback query
   */
  private async answerCallbackQuery(callbackQueryId: string): Promise<void> {
    try {
      await this.apiCall('answerCallbackQuery', {
        callback_query_id: callbackQueryId,
      });
    } catch (error) {
      // Non-critical, log and continue
      console.warn('[bot] failed to answer callback query:', error);
    }
  }

  /**
   * Delete message
   */
  private async deleteMessage(chatId: number, messageId: number): Promise<void> {
    try {
      await this.apiCall('deleteMessage', {
        chat_id: chatId,
        message_id: messageId,
      });
    } catch (error) {
      // Non-critical, log and continue
      console.warn('[bot] failed to delete message:', error);
    }
  }

  /**
   * Delete webhook
   */
  async deleteWebhook(): Promise<void> {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [bot] attempting to delete webhook...`);
    try {
      await this.apiCall('deleteWebhook', { drop_pending_updates: true });
      console.log(`[${timestamp}] [bot] webhook deleted`);
    } catch (error: any) {
      console.warn(`[${timestamp}] [bot] webhook deletion warning:`, error.response?.data?.description || error.message);
    }
  }

  /**
   * Get or create OpenCode session for Telegram chat
   */
  private getSession(chatId: number): TelegramSession {
    let session = this.sessions.get(chatId);

    if (!session) {
      const sessionKey = `${this.config.opencode.sessionPrefix}-${chatId}`;
      session = {
        chatId,
        sessionKey,
        opencodeSessionId: null,
        currentAgent: this.config.opencode.defaultAgent,
        workingDirectory: this.config.opencode.workingDirectory,
        gateway: new OpencodeGateway(this.serverUrl, this.config.opencode.workingDirectory),
        createdAt: new Date(),
        lastActivity: new Date(),
      };
      this.sessions.set(chatId, session);
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [bot] created session for ${chatId} (${sessionKey})`);
    }

    session.lastActivity = new Date();
    return session;
  }

  private async ensureOpencodeSession(session: TelegramSession): Promise<void> {
    if (session.opencodeSessionId) {
      session.gateway.setSessionId(session.opencodeSessionId);
      return;
    }

    const roots = await session.gateway.listRootSessions(200);
    const candidates = roots
      .filter(s => (s.title || '').startsWith(session.sessionKey))
      .sort((a, b) => (b.updated || 0) - (a.updated || 0));

    if (candidates.length > 0) {
      const id = candidates[0].id;
      session.opencodeSessionId = id;
      session.gateway.setSessionId(id);
      return;
    }

    const created = await session.gateway.createRootSession(session.sessionKey);
    session.opencodeSessionId = created;
    session.gateway.setSessionId(created);
  }

  /**
   * Parse agent command from message
   * Returns agent name if message starts with /agentname, otherwise null
   */
  private parseAgentCommand(text: string): string | null {
    const match = text.match(/^\/(\w+)\s+/);
    if (!match) return null;

    const agent = match[1];
    const validAgents = ['sisyphus', 'oracle', 'prometheus', 'librarian', 'metis'];

    return validAgents.includes(agent) ? agent : null;
  }

  /**
   * Extract message content without agent command
   */
  private extractMessage(text: string, agent: string | null): string {
    if (agent) {
      return text.replace(new RegExp(`^/${agent}\\s+`), '');
    }
    return text;
  }

  /**
   * Execute OpenCode with message
   */
  private async executeOpenCode(
    message: string,
    session: TelegramSession,
    agent?: string
  ): Promise<string> {
    // Prepend working directory context if not default
    const contextMessage = session.workingDirectory !== this.config.opencode.workingDirectory
      ? `[Working in: ${session.workingDirectory}]\n\n${message}`
      : message;
    
    return session.gateway.sendMessage(contextMessage);
  }

  /**
   * Split long message into chunks (Telegram limit: 4096 chars)
   */
  private chunkMessage(text: string, maxLength = 4000): string[] {
    const chunks: string[] = [];
    let current = '';

    for (const line of text.split('\n')) {
      let remaining = line;

      while (remaining.length > 0) {
        const prefix = current;
        const suffixNewline = '\n';

        const spaceLeft = maxLength - (prefix.length + suffixNewline.length);
        if (spaceLeft <= 0) {
          if (current) chunks.push(current);
          current = '';
          continue;
        }

        const take = Math.min(spaceLeft, remaining.length);
        const part = remaining.slice(0, take);
        remaining = remaining.slice(take);

        if ((current + part + '\n').length > maxLength) {
          if (current) chunks.push(current);
          current = '';
          continue;
        }

        current += part;

        if (remaining.length === 0) {
          current += '\n';
        } else {
          chunks.push(current);
          current = '';
        }
      }
    }

    if (current) chunks.push(current);
    return chunks;
  }

  /**
   * Check if user is authorized
   */
  private isAuthorized(userId: number): boolean {
    const allowedUsers = this.config.telegram.allowedUsers;
    return allowedUsers.includes('*') || allowedUsers.includes(userId.toString());
  }

  /**
   * Handle /start command
   */
  private async handleStart(chatId: number): Promise<void> {
    const keyboardEnabled = this.config.keyboard?.enabled ?? true;
    const keyboardRows = this.config.keyboard?.rows ?? [
      [
        { text: '🤖 Sisyphus', callback_data: 'agent:sisyphus' },
        { text: '🔮 Oracle', callback_data: 'agent:oracle' },
        { text: '📋 Prometheus', callback_data: 'agent:prometheus' },
      ],
      [
        { text: '📚 Librarian', callback_data: 'agent:librarian' },
        { text: '🎯 Metis', callback_data: 'agent:metis' },
        { text: 'ℹ️ Help', callback_data: 'action:help' },
      ],
      [
        { text: '📊 Status', callback_data: 'action:status' },
        { text: '🆕 New', callback_data: 'action:new' },
        { text: '📋 List', callback_data: 'action:list' },
      ],
      [
        { text: '🔄 Reset', callback_data: 'action:reset' },
      ],
    ];

    const replyMarkup = keyboardEnabled ? {
      reply_markup: {
        inline_keyboard: keyboardRows,
      },
    } : {};

    await this.sendMarkdownMessage(
      chatId,
      '🤖 *oh-my-telegram* - OpenCode on Telegram\n\n' +
      'Commands:\n' +
      '/sisyphus \\[message\\] - Use sisyphus agent\n' +
      '/oracle \\[message\\] - Use oracle agent\n' +
      '/prometheus \\[message\\] - Use prometheus agent\n' +
      '/librarian \\[message\\] - Use librarian agent\n' +
      '/metis \\[message\\] - Use metis agent\n' +
      '/status - Show session status\n' +
      '/new - Create new session\n' +
      '/list - List sessions for this chat\n' +
      '/switch <number> - Switch session (this chat)\n' +
      '/cd [path] - Show/change working directory\n' +
      '/reset - Delete session group (like TUI ctrl-d)\n' +
      '/reset-agent - Reset current child agent session\n\n' +
      `Web UI: ${this.getOpencodeWebUrl()}/\n\n` +
      'Or just send a message to use the default agent.',
      replyMarkup
    );
  }

  /**
   * Handle /help command
   */
  private async handleHelp(chatId: number): Promise<void> {
    await this.sendMarkdownMessage(
      chatId,
      '📖 *Help*\n\n' +
      'Send any message to execute OpenCode agents.\n\n' +
      'Available agents:\n' +
      '• sisyphus - Coding agent\n' +
      '• oracle - Debugging/architecture\n' +
      '• prometheus - Planning\n' +
      '• librarian - Documentation\n' +
      '• metis - Pre-planning consultant\n\n' +
      'Commands:\n' +
      '/status - Show session status\n' +
      '/new - Create new session\n' +
      '/list - List sessions for this chat\n' +
      '/switch <number> - Switch session (this chat)\n' +
      '/cd [path] - Show/change working directory\n' +
      '/reset - Delete session group (like TUI ctrl-d)\n' +
      '/reset-agent - Reset current child agent session\n\n' +
      'Web UI:\n' +
      `opencode web: ${this.getOpencodeWebUrl()}/\n\n` +
      'Example:\n' +
      '/oracle explain this code\n' +
      'refactor this function'
    );
  }

  private async handleReset(chatId: number): Promise<void> {
    try {
      const session = this.getSession(chatId);
      await this.ensureOpencodeSession(session);

      const before = session.gateway.getSessionId();
      const result = await session.gateway.resetSessionGroup();
      const after = session.gateway.getSessionId();
      session.opencodeSessionId = after || result.newSessionID;

      await this.sendMarkdownMessage(
        chatId,
        `✅ *Session group deleted*\n\n` +
        `Before: \`${before || 'none'}\`\n` +
        `Root: \`${result.rootSessionID || 'unknown'}\`\n` +
        `Deleted: \`${result.deletedCount}\`\n` +
        `New: \`${after || result.newSessionID}\`\n\n` +
        `Starting fresh conversation.`
      );
    } catch (error: any) {
      const msg = `❌ Reset failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      await this.sendMessage(chatId, msg);
    }
  }

  private async handleResetAgent(chatId: number): Promise<void> {
    try {
      const session = this.getSession(chatId);
      await this.ensureOpencodeSession(session);

      const before = session.gateway.getSessionId();
      const result = await session.gateway.resetCurrentChildSession();
      const after = session.gateway.getSessionId();
      session.opencodeSessionId = after;

      await this.sendMarkdownMessage(
        chatId,
        `✅ *Agent session reset*\n\n` +
        `Deleted: \`${result.deletedSessionID}\`\n` +
        `Parent: \`${result.parentSessionID}\`\n` +
        `Current: \`${after || 'unknown'}\`\n\n` +
        `Previous: \`${before || 'none'}\``
      );
    } catch (error: any) {
      const msg = `❌ Reset-agent failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      await this.sendMessage(chatId, msg);
    }
  }

  private async handleStatus(chatId: number): Promise<void> {
    const session = this.getSession(chatId);
    await this.ensureOpencodeSession(session);
    const sessionId = session.gateway.getSessionId();
    const gatewayStatus = '✅ Connected';

    const uptime = process.uptime();
    const uptimeFormatted = formatUptime(uptime);

    await this.sendMarkdownMessage(
      chatId,
      '📊 *Bot Status*\n\n' +
      `*Session:* \`${sessionId}\`\n` +
      `*Agent:* ${session.currentAgent}\n` +
      `*Working Dir:* \`${session.workingDirectory}\`\n` +
      `*Gateway:* ${gatewayStatus}\n` +
      `*Uptime:* ${uptimeFormatted}\n` +
      `*Active chats:* ${this.sessions.size}\n\n` +
      `*Chat created:* ${session.createdAt.toLocaleString()}\n` +
      `*Last activity:* ${session.lastActivity.toLocaleString()}`
    );
  }

  private async handleNew(chatId: number): Promise<void> {
    try {
      const session = this.getSession(chatId);
      const title = `${session.sessionKey}-${Date.now()}`;
      const newSessionId = await session.gateway.createRootSession(title);
      session.opencodeSessionId = newSessionId;
      let projectID: string | undefined;
      try {
        const info = await session.gateway.getSessionInfo(newSessionId);
        projectID = info?.projectID;
      } catch {
        projectID = undefined;
      }

      const sessionUrl = this.buildOpencodeSessionWebUrl(newSessionId, projectID);

      await this.sendMarkdownMessage(
        chatId,
        `✅ *New session created*\n\n` +
        `Session ID: \`${newSessionId}\`\n\n` +
        `View in opencode web:\n` +
        `${sessionUrl}\n\n` +
        `Starting fresh conversation.`
      );
    } catch (error: any) {
      const errorMsg = `❌ Failed to create session: ${error instanceof Error ? error.message : 'Unknown error'}`;
      await this.sendMessage(chatId, errorMsg);
    }
  }

  private async handleList(chatId: number): Promise<void> {
    try {
      const session = this.getSession(chatId);
      await this.ensureOpencodeSession(session);

      const allRoots = await session.gateway.listRootSessions(200);
      const sessions = allRoots.filter(s => (s.title || '').startsWith(session.sessionKey));
      const currentSessionId = session.gateway.getSessionId();

      if (sessions.length === 0) {
        await this.sendMessage(chatId, 'Sessions\n\nNo sessions found. Use /new to create one.');
        return;
      }

      const sessionList = sessions
        .map((s, i) => {
          const isCurrent = s.id === currentSessionId ? ' (current)' : '';
          const title = s.title || 'Untitled';
          const updated = s.updated ? new Date(s.updated).toLocaleString() : 'Unknown';
          return `${i + 1}. ${s.id}${isCurrent}\n   ${title}\n   Updated: ${updated}`;
        })
        .join('\n\n');

      const webUrl = this.getOpencodeWebUrl();

      const message =
        `Sessions (${sessions.length} shown)\n\n${sessionList}\n\n` +
        `Use /switch <number> to switch sessions\n` +
        `View in opencode web: ${webUrl}/`;

      await this.sendPreMessage(chatId, message);
    } catch (error: any) {
      const errorMsg = `❌ Failed to list sessions: ${error instanceof Error ? error.message : 'Unknown error'}`;
      await this.sendMessage(chatId, errorMsg);
    }
  }

  private async handleSwitch(chatId: number, sessionNumber: string): Promise<void> {
    if (!sessionNumber) {
      await this.sendMessage(chatId, '⚠️ Usage: /switch <number>\n\nUse /list to see available sessions.');
      return;
    }

    const num = parseInt(sessionNumber, 10);
    if (isNaN(num)) {
      await this.sendMessage(chatId, '⚠️ Invalid number. Use /switch <number>\n\nExample: /switch 1');
      return;
    }

    try {
      const session = this.getSession(chatId);
      await this.ensureOpencodeSession(session);
      const allRoots = await session.gateway.listRootSessions(200);
      const sessions = allRoots.filter(s => (s.title || '').startsWith(session.sessionKey));

      if (num < 1 || num > sessions.length) {
        await this.sendMessage(
          chatId,
          `⚠️ Invalid session number: ${num}\n\nAvailable sessions: 1-${sessions.length}\nUse /list to see all sessions.`
        );
        return;
      }

      const targetSession = sessions[num - 1];
      await session.gateway.switchSession(targetSession.id);
      session.opencodeSessionId = targetSession.id;

      const sessionUrl = this.buildOpencodeSessionWebUrl(targetSession.id, targetSession.projectID);
      await this.sendMessage(
        chatId,
        `Switched to session\n\n` +
        `Number: ${num}\n` +
        `Title: ${targetSession.title || 'Untitled'}\n` +
        `Session ID: ${targetSession.id}\n\n` +
        `View in opencode web:\n` +
        `${sessionUrl}`
      );
    } catch (error: any) {
      const errorMsg = `❌ Failed to switch session: ${error instanceof Error ? error.message : 'Unknown error'}`;
      await this.sendMessage(chatId, errorMsg);
    }
  }

  private async handleCd(chatId: number, path?: string): Promise<void> {
    const session = this.getSession(chatId);

    if (!path || path.trim() === '') {
      // Show current working directory
      await this.sendMarkdownMessage(
        chatId,
        `📁 *Current Working Directory*\n\n` +
        `\`${session.workingDirectory}\`\n\n` +
        `Use \`/cd <path>\` to change directory.`
      );
      return;
    }

    // Change working directory
    const newPath = path.startsWith('/') ? path : `${session.workingDirectory}/${path}`;
    session.workingDirectory = newPath;
    session.gateway.setDirectory(newPath);

    await this.sendMarkdownMessage(
      chatId,
      `✅ *Working directory changed*\n\n` +
      `New path: \`${newPath}\`\n\n` +
      `All subsequent operations will use this directory.`
    );
  }

  private formatPermissionRequestText(permission: PendingPermission): string {
    const patterns = permission.patterns || [];
    const patternsPreview = patterns.slice(0, 10);
    const remaining = patterns.length - patternsPreview.length;

    const lines: string[] = [];
    lines.push('⚠️ OpenCode 需要你的授权才能继续执行：');
    lines.push('');
    lines.push(`权限类型: ${permission.permission}`);

    if (patternsPreview.length > 0) {
      lines.push('影响范围:');
      for (const p of patternsPreview) lines.push(`- ${p}`);
      if (remaining > 0) lines.push(`- ... 以及另外 ${remaining} 项`);
    }

    return lines.join('\n');
  }

  private buildPermissionInlineKeyboard(requestID: string) {
    return {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ 允许一次', callback_data: `perm:once:${requestID}` },
            { text: '✅ 总是允许', callback_data: `perm:always:${requestID}` },
          ],
          [
            { text: '❌ 拒绝', callback_data: `perm:reject:${requestID}` },
            { text: '🔁 重试上一条', callback_data: `perm:retry:${requestID}` },
          ],
        ],
      },
    };
  }

  private formatQuestionText(req: PendingQuestionRequest, questionIndex: number): string {
    const q = req.questions[questionIndex];
    const lines: string[] = [];
    lines.push('❓ OpenCode 需要你选择后才能继续：');
    lines.push('');
    lines.push(`${q.header}`);
    lines.push(q.question);
    return lines.join('\n');
  }

  private buildQuestionInlineKeyboard(requestID: string, questionIndex: number, options: PendingQuestionRequest['questions'][number]['options']) {
    const rows = options.map((opt, i) => [
      { text: opt.label, callback_data: `q:ans:${requestID}:${questionIndex}:${i}` },
    ]);

    rows.push([
      { text: '❌ 取消', callback_data: `q:reject:${requestID}` },
    ]);

    return {
      reply_markup: {
        inline_keyboard: rows,
      },
    };
  }

  private async maybeSendPendingQuestions(chatId: number): Promise<void> {
    const session = this.getSession(chatId);
    const currentSessionId = session.gateway.getSessionId();
    if (!currentSessionId) return;

    let pending: PendingQuestionRequest[];
    try {
      pending = await session.gateway.listPendingQuestions();
    } catch (error) {
      console.warn('[bot] failed to list pending questions:', error);
      return;
    }

    const relevant = pending
      .filter(q => q.sessionID === currentSessionId)
      .filter(q => !this.seenQuestionRequestIds.has(q.id));

    for (const req of relevant) {
      this.seenQuestionRequestIds.add(req.id);
      if (!req.questions || req.questions.length === 0) continue;
      this.questionAnswerState.set(req.id, {
        answers: Array.from({ length: req.questions.length }, () => [] as string[]),
        total: req.questions.length,
      });

      const text = this.formatQuestionText(req, 0);
      await this.sendMessage(chatId, text, this.buildQuestionInlineKeyboard(req.id, 0, req.questions[0].options || []));
    }
  }

  private async maybeSendPendingInteractions(chatId: number): Promise<void> {
    await this.maybeSendPendingQuestions(chatId);
    await this.maybeSendPendingPermissions(chatId);
  }

  private async maybeSendPendingPermissions(chatId: number): Promise<void> {
    const session = this.getSession(chatId);
    const currentSessionId = session.gateway.getSessionId();
    if (!currentSessionId) return;

    let pending: PendingPermission[];
    try {
      pending = await session.gateway.listPendingPermissions();
    } catch (error) {
      console.warn('[bot] failed to list pending permissions:', error);
      return;
    }

    const relevant = pending
      .filter(p => p.sessionID === currentSessionId)
      .filter(p => !this.seenPermissionRequestIds.has(p.id));

    for (const req of relevant) {
      this.seenPermissionRequestIds.add(req.id);
      const text = this.formatPermissionRequestText(req);
      await this.sendMessage(chatId, text, this.buildPermissionInlineKeyboard(req.id));
    }
  }

  /**
   * Handle callback query (inline keyboard button press)
   */
  private async handleCallbackQuery(update: TelegramUpdate): Promise<void> {
    const callbackQuery = update.callback_query;
    if (!callbackQuery) return;

    const { id, from, data, message } = callbackQuery;
    const userId = from.id;
    const chatId = message?.chat.id || userId;

    if (!this.isAuthorized(userId)) {
      await this.answerCallbackQuery(id);
      await this.sendMessage(chatId, '⛔ You are not authorized to use this bot.');
      return;
    }

    await this.answerCallbackQuery(id);

    const qMatch = data.match(/^q:(ans|reject):([^:]+)(?::(\d+):(\d+))?$/);
    if (qMatch) {
      const [, action, requestID, qIndexRaw, oIndexRaw] = qMatch;
      const timestamp = new Date().toISOString();

      try {
        const session = this.getSession(chatId);
        if (action === 'reject') {
          await session.gateway.rejectQuestion(requestID);
          if (message?.message_id) {
            await this.deleteMessage(chatId, message.message_id);
          }
          await this.sendMessage(chatId, '已取消选择，请重新发送你的请求。');
          return;
        }

        const questionIndex = Number(qIndexRaw);
        const optionIndex = Number(oIndexRaw);
        if (!Number.isFinite(questionIndex) || !Number.isFinite(optionIndex)) {
          await this.sendMessage(chatId, '⚠️ 无效的选择。');
          return;
        }

        const pending = await session.gateway.listPendingQuestions();
        const req = pending.find(r => r.id === requestID);
        if (!req) {
          await this.sendMessage(chatId, '⚠️ 该问题已不存在（可能已超时或已被处理）。请重试你的请求。');
          return;
        }

        const q = req.questions?.[questionIndex];
        const opt = q?.options?.[optionIndex];
        if (!q || !opt) {
          await this.sendMessage(chatId, '⚠️ 该选项无效。');
          return;
        }

        const state = this.questionAnswerState.get(requestID) || {
          answers: Array.from({ length: req.questions.length }, () => [] as string[]),
          total: req.questions.length,
        };

        state.answers[questionIndex] = [opt.label];
        this.questionAnswerState.set(requestID, state);

        if (message?.message_id) {
          await this.deleteMessage(chatId, message.message_id);
        }

        const nextIndex = questionIndex + 1;
        if (nextIndex < state.total) {
          const nextQ = req.questions[nextIndex];
          const nextText = this.formatQuestionText(req, nextIndex);
          await this.sendMessage(chatId, nextText, this.buildQuestionInlineKeyboard(requestID, nextIndex, nextQ.options || []));
          return;
        }

        await session.gateway.replyQuestion(requestID, state.answers);
        this.questionAnswerState.delete(requestID);

        console.log(`[${timestamp}] [bot] question replied: ${requestID}`);
        await this.sendMessage(chatId, '✅ 已提交选择，继续处理中…');
        await this.maybeSendPendingInteractions(chatId);
      } catch (error: any) {
        console.error(`[${timestamp}] [bot] question reply error:`, error);
        await this.sendMessage(chatId, `❌ 提交选择失败：${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      return;
    }

    const permMatch = data.match(/^perm:(once|always|reject|retry):(.+)$/);
    if (permMatch) {
      const [, action, requestID] = permMatch;
      const session = this.getSession(chatId);
      const timestamp = new Date().toISOString();

      if (action === 'retry') {
        if (!session.lastUserMessage) {
          await this.sendMessage(chatId, '⚠️ 没有可重试的上一条消息。请重新发送你的请求。');
          return;
        }

        if (message?.message_id) {
          await this.deleteMessage(chatId, message.message_id);
        }

        this.startOpenCodeExecution(chatId, session.lastUserMessage, session, undefined);

        return;
      }

      const reply = action === 'once' ? 'once' : action === 'always' ? 'always' : 'reject';

      try {
        await session.gateway.replyPermission(requestID, reply, `telegram_user=${userId}`);
        console.log(`[${timestamp}] [bot] permission replied: ${requestID} -> ${reply}`);

        if (message?.message_id) {
          await this.deleteMessage(chatId, message.message_id);
        }

        await this.sendMessage(chatId, `✅ 已提交授权：${reply}。如果操作没有自动继续，请点击“重试上一条”或重新发送请求。`);
      } catch (error: any) {
        console.error(`[${timestamp}] [bot] permission reply error:`, error);
        await this.sendMessage(chatId, `❌ 授权失败：${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      return;
    }

    const match = data.match(/^(agent|action):(.+)$/);
    if (!match) return;

    const [, type, value] = match;
    const session = this.getSession(chatId);
    const timestamp = new Date().toISOString();

    if (message?.message_id) {
      await this.deleteMessage(chatId, message.message_id);
    }

    if (type === 'agent') {
      const agent = value;
      const validAgents = ['sisyphus', 'oracle', 'prometheus', 'librarian', 'metis'];
      if (!validAgents.includes(agent)) {
        await this.sendMessage(chatId, `⚠️ Unknown agent: ${agent}`);
        return;
      }
      session.currentAgent = agent;
      console.log(`[${timestamp}] [bot] user ${userId} switched to agent: ${agent}`);
      await this.sendMessage(
        chatId,
        `✅ Agent switched to: ${agent}\n\nSend me a message to use the ${agent} agent.`
      );
    } else if (type === 'action') {
      if (value === 'help') {
        await this.handleHelp(chatId);
      } else if (value === 'status') {
        await this.handleStatus(chatId);
      } else if (value === 'new') {
        await this.handleNew(chatId);
      } else if (value === 'list') {
        await this.handleList(chatId);
      } else if (value === 'reset') {
        await this.handleReset(chatId);
      }
    }
  }

  /**
   * Handle text message
   */
  private async handleMessage(update: TelegramUpdate): Promise<void> {
    const message = update.message;
    if (!message) return;

    const { from, chat, text, date } = message;
    const userId = from.id;
    const chatId = chat.id;
    const timestamp = new Date().toISOString();

    if (!this.isAuthorized(userId)) {
      await this.sendMessage(chatId, '⛔ You are not authorized to use this bot.');
      return;
    }

    if (!text) return;

    if (text === '/start' || text.startsWith('/start ')) {
      return this.handleStart(chatId);
    }

    if (text === '/help' || text.startsWith('/help ')) {
      return this.handleHelp(chatId);
    }

    if (text === '/reset' || text.startsWith('/reset ')) {
      return this.handleReset(chatId);
    }

    if (text === '/reset-agent' || text.startsWith('/reset-agent ')) {
      return this.handleResetAgent(chatId);
    }

    if (text === '/status' || text.startsWith('/status ')) {
      return this.handleStatus(chatId);
    }

    if (text === '/new' || text.startsWith('/new ')) {
      return this.handleNew(chatId);
    }

    if (text === '/list' || text.startsWith('/list ')) {
      return this.handleList(chatId);
    }

    if (text.startsWith('/switch ')) {
      const sessionId = text.substring(8).trim();
      return this.handleSwitch(chatId, sessionId);
    }

    if (text === '/cd' || text.startsWith('/cd ')) {
      const path = text.substring(3).trim();
      return this.handleCd(chatId, path || undefined);
    }

    const session = this.getSession(chatId);
    const agent = this.parseAgentCommand(text);
    const messageContent = this.extractMessage(text, agent);

    if (!messageContent.trim()) {
      await this.sendMessage(chatId, '⚠️ Please provide a message.');
      return;
    }

    if (agent) {
      session.currentAgent = agent;
      console.log(`[${timestamp}] [bot] user ${userId} switched to agent: ${agent}`);
    }

    console.log(`[${timestamp}] [bot] user ${userId} (agent: ${session.currentAgent}): ${messageContent.substring(0, 50)}...`);
    session.lastUserMessage = messageContent;

    this.startOpenCodeExecution(chatId, messageContent, session, agent || undefined);
  }

  private startOpenCodeExecution(chatId: number, messageContent: string, session: TelegramSession, agent?: string): void {
    if (this.inFlightByChatId.get(chatId)) {
      void this.sendMessage(chatId, '⏳ 正在处理上一条请求，请稍后或等待按钮提示。');
      return;
    }

    this.inFlightByChatId.set(chatId, true);

    const pollIntervalMs = 1000;
    const poller = setInterval(() => {
      void this.maybeSendPendingInteractions(chatId);
    }, pollIntervalMs);

    void (async () => {
      const timestamp = new Date().toISOString();
      try {
        await this.ensureOpencodeSession(session);
        await this.maybeSendPendingInteractions(chatId);
        const response = await this.executeOpenCode(messageContent, session, agent);
        await this.maybeSendPendingInteractions(chatId);
        const msgCount = await this.sendMarkdownAsTelegramHtml(chatId, response);
        console.log(`[${timestamp}] [bot] response sent (${msgCount} messages, ${response.length} chars)`);
      } catch (error: any) {
        const errorMsg = `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error(`[${timestamp}] [bot] execution error:`, error);
        await this.sendMessage(chatId, errorMsg);
        await this.maybeSendPendingInteractions(chatId);
      } finally {
        clearInterval(poller);
        this.inFlightByChatId.delete(chatId);
      }
    })();
  }

  /**
   * Process a single update
   */
  private async processUpdate(update: TelegramUpdate): Promise<void> {
    try {
      if (update.callback_query) {
        await this.handleCallbackQuery(update);
      } else if (update.message) {
        await this.handleMessage(update);
      }

      this.lastUpdateId = update.update_id;
    } catch (error) {
      const timestamp = new Date().toISOString();
      console.error(`[${timestamp}] [bot] error processing update ${update.update_id}:`, error);
    }
  }

  /**
   * Main polling loop - fetch updates and process them
   */
  private async pollingLoop(): Promise<void> {
    while (this.isRunning) {
      const timestamp = new Date().toISOString();

      try {
        const response = await this.apiCall('getUpdates', {
          offset: this.lastUpdateId + 1,
          timeout: this.longPollTimeout,
        });

        if (response.ok && response.result?.length > 0) {
          console.log(`[${timestamp}] [bot] received ${response.result.length} update(s)`);

          for (const update of response.result) {
            if (!this.isRunning) break;
            await this.processUpdate(update);
          }
        }
      } catch (error: any) {
        const isTimeout = error.code === 'ECONNABORTED' || error.message?.includes('timeout');
        if (!isTimeout) {
          console.error(`[${timestamp}] [bot] polling error:`, error.response?.data || error.message);
        }

        // Don't exit on transient errors, just wait and retry
        if (this.isRunning) {
          await new Promise(resolve => setTimeout(resolve, this.pollingInterval));
        }
      }
    }
  }

  /**
   * Start the bot
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn('[bot] already running');
      return;
    }

    const startTime = new Date().toISOString();
    const pid = process.pid;

    console.log(`[${startTime}] [bot] starting (PID ${pid})`);
    console.log(`[${startTime}] [bot] default agent: ${this.config.opencode.defaultAgent}`);
    console.log(`[${startTime}] [bot] working directory: ${this.config.opencode.workingDirectory}`);
    console.log(`[${startTime}] [bot] log file: /tmp/oh-my-telegram/bot.log`);
    console.log(`[${startTime}] [bot] polling interval: ${this.pollingInterval}ms`);
    console.log(`[${startTime}] [bot] long poll timeout: ${this.longPollTimeout}s`);

    this.isRunning = true;

    await this.pollingLoop().catch(error => {
      const errorTime = new Date().toISOString();
      console.error(`[${errorTime}] [bot] polling loop fatal error:`, error);
      this.isRunning = false;
      throw error;
    });
  }

  /**
   * Stop the bot
   */
  async stop(signal?: string): Promise<void> {
    if (!this.isRunning) {
      console.warn('[bot] not running');
      return;
    }

    const stopTime = new Date().toISOString();
    const sig = signal || 'SIGTERM';
    console.log(`[${stopTime}] [bot] stopping (${sig})`);

    this.isRunning = false;

    const gracefulShutdownDelay = 2000;
    await new Promise(resolve => setTimeout(resolve, gracefulShutdownDelay));

    console.log(`[${stopTime}] [bot] stopped`);
  }

  /**
   * Get current sessions
   */
  getSessions(): TelegramSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Clear inactive sessions (older than 1 hour)
   */
  clearInactiveSessions(): void {
    const oneHour = 60 * 60 * 1000;
    const now = new Date();

    for (const [chatId, session] of this.sessions.entries()) {
      if (now.getTime() - session.lastActivity.getTime() > oneHour) {
        this.sessions.delete(chatId);
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] [bot] cleared inactive session for ${chatId}`);
      }
    }
  }
}

function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

export type { TelegramSession };
