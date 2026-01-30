import { config } from 'dotenv';
import { readFileSync } from 'fs';
config();

const botConfig = {
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    allowedUsers: (process.env.ALLOWED_USERS || '').split(',').filter(Boolean),
  },
  opencode: {
    defaultAgent: process.env.DEFAULT_AGENT || 'sisyphus',
    workingDirectory: process.env.WORKING_DIRECTORY || process.cwd(),
    sessionPrefix: process.env.SESSION_PREFIX || 'telegram',
  },
};

console.log('[1] Bot config loaded');

// Import bot dynamically
import('./dist/telegram-bot.js').then(module => {
  const { TelegramBot } = module;
  console.log('[2] TelegramBot imported');
  
  const bot = new TelegramBot(botConfig);
  console.log('[3] Bot instance created');
  
  bot.deleteWebhook().then(() => {
    console.log('[4] Webhook deleted');
    
    bot.start().then(() => {
      console.log('[5] Bot started (this should never print)');
    }).catch(err => {
      console.error('[ERROR] start() failed:', err);
    });
  });
}).catch(err => {
  console.error('[ERROR] Import failed:', err);
});
