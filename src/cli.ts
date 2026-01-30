#!/usr/bin/env node

import { Telegraf } from 'telegraf';
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { TelegramBot } from './telegram-bot.js';

// Load .env file
config();

/**
 * Load configuration from file
 */
function loadConfig(configPath: string): any {
  try {
    // Try to load as JSON first
    return JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch {
    // If JSON fails, assume it's already loaded via .env
    return {
      telegram: {
        botToken: process.env.TELEGRAM_BOT_TOKEN || '',
        allowedUsers: (process.env.ALLOWED_USERS || '').split(',').filter(Boolean),
        polling: true,
      },
      opencode: {
        defaultAgent: process.env.DEFAULT_AGENT || 'sisyphus',
        workingDirectory: process.env.WORKING_DIRECTORY || process.cwd(),
        sessionPrefix: process.env.SESSION_PREFIX || 'telegram',
        opencodePath: process.env.OPENCODE_PATH || 'opencode',
      },
    };
  }
}

/**
 * Main CLI entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const configPath = args.find(arg => arg.startsWith('--config='))?.split('=')[1] ||
                    args[0] && !args[0].startsWith('--') ? args[0] :
                    'oh-my-telegram.json';

  const config = loadConfig(resolve(configPath));

  // Validate configuration
  if (!config.telegram.botToken) {
    console.error('❌ Error: TELEGRAM_BOT_TOKEN is required');
    console.error('Set it in oh-my-telegram.json or .env file');
    process.exit(1);
  }

  if (!config.telegram.allowedUsers.length) {
    console.warn('⚠️  Warning: No allowed users configured. Anyone can use this bot!');
  }

  // Create Telegram bot
  const bot = new Telegraf(config.telegram.botToken);
  const telegramBot = new TelegramBot(config);

  // Setup handlers
  telegramBot.setupHandlers(bot);

  // Start bot (polling mode)
  console.log('🚀 Starting oh-my-telegram...');
  console.log(`📱 Default agent: ${config.opencode.defaultAgent}`);
  console.log(`📁 Working directory: ${config.opencode.workingDirectory}`);

  // Clear inactive sessions every hour
  setInterval(() => {
    telegramBot.clearInactiveSessions();
  }, 60 * 60 * 1000);

  // Launch bot
  if (config.telegram.polling !== false) {
    await bot.launch();
    console.log('✅ Bot started (polling mode)');
  } else {
    console.log('📡 Webhook mode configured');
    console.log(`Webhook URL: ${config.telegram.webhookUrl}`);
  }

  // Graceful shutdown
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
