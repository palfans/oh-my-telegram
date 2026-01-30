import { Context, NarrowedContext, session } from 'telegraf';
import { message } from 'telegraf/filters';

import { OpenCodeBridge, OpenCodeOptions } from './opencode-bridge.js';

/**
 * Telegram to OpenCode session mapping
 */
interface TelegramSession {
  chatId: number;
  opencodeSessionId: string;
  currentAgent: string;
  createdAt: Date;
  lastActivity: Date;
}

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
    opencodePath?: string;
  };
}

/**
 * Telegram bot for oh-my-opencode
 */
export class TelegramBot {
  private bridge: OpenCodeBridge;
  private config: OhMyTelegramConfig;
  private sessions: Map<number, TelegramSession>;

  constructor(config: OhMyTelegramConfig) {
    this.config = config;
    this.bridge = new OpenCodeBridge({
      opencodePath: config.opencode.opencodePath,
      defaultOptions: {
        cwd: config.opencode.workingDirectory,
        agent: config.opencode.defaultAgent,
      },
    });
    this.sessions = new Map();
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
        createdAt: new Date(),
        lastActivity: new Date(),
      };
      this.sessions.set(chatId, session);
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
    const options: OpenCodeOptions = {
      session: session.opencodeSessionId,
      agent: agent || session.currentAgent,
    };

    const result = await this.bridge.run(message, options);

    if (result.exitCode !== 0) {
      return `❌ Error: ${result.stderr || 'Unknown error'}`;
    }

    return result.stdout;
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
   * Setup Telegram bot handlers
   */
  setupHandlers(bot: any): void {
    const allowedUsers = new Set(this.config.telegram.allowedUsers);

    bot.use((ctx: Context, next: () => Promise<void>) => {
      if (allowedUsers.has('*')) {
        return next();
      }
      
      const userId = ctx.from?.id.toString();
      if (!userId || !allowedUsers.has(userId)) {
        return ctx.reply('⛔ You are not authorized to use this bot.');
      }
      
      return next();
    });

    // Handle /start command
    bot.start((ctx: Context) => ctx.reply(
      '🤖 *oh-my-telegram* - OpenCode Sisyphus on Telegram\n\n' +
      'Commands:\n' +
      '/sisyphus \\[message\\] - Use sisyphus agent\n' +
      '/oracle \\[message\\] - Use oracle agent\n' +
      '/prometheus \\[message\\] - Use prometheus agent\n' +
      '/librarian \\[message\\] - Use librarian agent\n' +
      '/metis \\[message\\] - Use metis agent\n\n' +
      'Or just send a message to use the default agent.',
      { parse_mode: 'Markdown' }
    ));

    // Handle /help command
    bot.help((ctx: Context) => ctx.reply(
      '📖 *Help*\n\n' +
      'Send any message to execute OpenCode agents.\n\n' +
      'Available agents:\n' +
      '• sisyphus - Coding agent\n' +
      '• oracle - Debugging/architecture\n' +
      '• prometheus - Planning\n' +
      '• librarian - Documentation\n' +
      '• metis - Pre-planning consultant\n\n' +
      'Example:\n' +
      '/oracle explain this code\n' +
      'refactor this function',
      { parse_mode: 'Markdown' }
    ));

    // Handle text messages
    bot.on(message('text'), async (ctx: NarrowedContext<Context, any>) => {
      const text = ctx.message?.text;
      if (!text || !ctx.chat) return;

      const chatId = ctx.chat.id;
      const session = this.getSession(chatId);

      const agent = this.parseAgentCommand(text);
      const messageContent = this.extractMessage(text, agent);

      if (!messageContent.trim()) {
        return ctx.reply('⚠️ Please provide a message.');
      }

      if (agent) {
        session.currentAgent = agent;
      }

      await ctx.sendChatAction('typing');

      try {
        const response = await this.executeOpenCode(
          messageContent,
          session,
          agent || undefined
        );

        // Split response into chunks if needed
        const chunks = this.chunkMessage(response);

        for (const chunk of chunks) {
          await ctx.reply(chunk);
        }
      } catch (error) {
        await ctx.reply(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    });
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
      }
    }
  }
}

export type { TelegramSession };
