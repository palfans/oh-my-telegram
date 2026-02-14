import axios, { type AxiosInstance } from 'axios';
import https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';

import { OpencodeGateway } from './opencode-gateway.js';

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
  opencodeSessionId: string;
  currentAgent: string;
  workingDirectory: string;
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
  private gateway: OpencodeGateway;
  private config: OhMyTelegramConfig;
  private sessions: Map<number, TelegramSession>;
  private botToken: string;
  private apiUrl: string;
  private httpClient: AxiosInstance;
  private isRunning: boolean = false;
  private pollingInterval: number = 1000; // ms between polling attempts
  private longPollTimeout: number = 30; // seconds for long polling
  private lastUpdateId: number = 0;

  constructor(config: OhMyTelegramConfig) {
    this.config = config;
    this.botToken = config.telegram.botToken;
    this.apiUrl = `https://api.telegram.org/bot${this.botToken}`;
    this.gateway = new OpencodeGateway('http://localhost:4096', config.opencode.workingDirectory);
    this.sessions = new Map();
    this.httpClient = this.createTelegramHttpClient();
  }

  async initialize(): Promise<void> {
    await this.gateway.initialize();
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
      const opencodeSessionId = `${this.config.opencode.sessionPrefix}-${chatId}`;
      session = {
        chatId,
        opencodeSessionId,
        currentAgent: this.config.opencode.defaultAgent,
        workingDirectory: this.config.opencode.workingDirectory,
        createdAt: new Date(),
        lastActivity: new Date(),
      };
      this.sessions.set(chatId, session);
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [bot] created session for ${chatId} (${opencodeSessionId})`);
    }

    session.lastActivity = new Date();
    return session;
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
    
    return this.gateway.sendMessage(contextMessage);
  }

  /**
   * Split long message into chunks (Telegram limit: 4096 chars)
   */
  private chunkMessage(text: string, maxLength = 4000): string[] {
    const chunks: string[] = [];
    let current = '';

    for (const line of text.split('\n')) {
      if ((current + line + '\n').length > maxLength) {
        if (current) chunks.push(current);
        current = line + '\n';
      } else {
        current += line + '\n';
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
      '/list - List all sessions\n' +
      '/switch <number> - Switch to session by number\n' +
      '/cd [path] - Show/change working directory\n' +
      '/reset - Clear conversation history\n\n' +
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
      '/list - List all sessions\n' +
      '/switch <number> - Switch to session by number\n' +
      '/cd [path] - Show/change working directory\n' +
      '/reset - Clear conversation history\n\n' +
      'Web UI:\n' +
      `opencode web: ${this.getOpencodeWebUrl()}/\n\n` +
      'Example:\n' +
      '/oracle explain this code\n' +
      'refactor this function'
    );
  }

  private async handleReset(chatId: number): Promise<void> {
    const oldSessionId = this.gateway.getSessionId();
    await this.gateway.resetSession();
    const newSessionId = this.gateway.getSessionId();

    await this.sendMarkdownMessage(
      chatId,
      `✅ *Conversation history cleared*\n\n` +
      `Old session: \`${oldSessionId || 'none'}\`\n` +
      `New session: \`${newSessionId}\`\n\n` +
      `Starting fresh conversation.`
    );
  }

  private async handleStatus(chatId: number): Promise<void> {
    const session = this.getSession(chatId);
    const sessionId = this.gateway.getSessionId();
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
      const newSessionId = await this.gateway.createNewSession();
      let projectID: string | undefined;
      try {
        const info = await this.gateway.getSessionInfo(newSessionId);
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
      const sessions = await this.gateway.listSessions();
      const currentSessionId = this.gateway.getSessionId();

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
      await this.sendMessage(
        chatId,
        `Sessions (${sessions.length} total)\n\n${sessionList}\n\n` +
        `Use /switch <number> to switch sessions\n` +
        `View in opencode web: ${webUrl}/`
      );
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
      const sessions = await this.gateway.listSessions();

      if (num < 1 || num > sessions.length) {
        await this.sendMessage(
          chatId,
          `⚠️ Invalid session number: ${num}\n\nAvailable sessions: 1-${sessions.length}\nUse /list to see all sessions.`
        );
        return;
      }

      const targetSession = sessions[num - 1];
      await this.gateway.switchSession(targetSession.id);

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
    this.gateway.setDirectory(newPath);

    await this.sendMarkdownMessage(
      chatId,
      `✅ *Working directory changed*\n\n` +
      `New path: \`${newPath}\`\n\n` +
      `All subsequent operations will use this directory.`
    );
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

    try {
      const response = await this.executeOpenCode(
        messageContent,
        session,
        agent || undefined
      );

      const chunks = this.chunkMessage(response);

      for (const chunk of chunks) {
        await this.sendMessage(chatId, chunk);
      }

      console.log(`[${timestamp}] [bot] response sent (${chunks.length} chunks, ${response.length} chars)`);
    } catch (error: any) {
      const errorMsg = `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(`[${timestamp}] [bot] execution error:`, error);
      await this.sendMessage(chatId, errorMsg);
    }
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
