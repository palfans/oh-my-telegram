#!/usr/bin/env node

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

  if (!config.telegram.botToken) {
    console.error('❌ Error: TELEGRAM_BOT_TOKEN is required');
    console.error('Set it in oh-my-telegram.json or .env file');
    process.exit(1);
  }

  if (!config.telegram.allowedUsers.length) {
    console.warn('⚠️  Warning: No allowed users configured. Anyone can use this bot!');
  }

  const bot = new TelegramBot(config);

  await bot.initialize();

  setInterval(() => {
    bot.clearInactiveSessions();
  }, 60 * 60 * 1000);

  await bot.deleteWebhook();

  await bot.start();

  const shutdown = async (signal: string) => {
    await bot.stop(signal);
    process.exit(0);
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch(error => {
  const errorTime = new Date().toISOString();
  console.error(`[${errorTime}] [bot] fatal error:`, error);
  process.exit(1);
});
