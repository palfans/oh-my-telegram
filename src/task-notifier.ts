export type TelegramMessenger = {
  sendMessage: (chatId: number, text: string, options?: any) => Promise<number | null>;
  editMessageText: (chatId: number, messageId: number, text: string, options?: any) => Promise<void>;
};

export type TaskNotifierConfig = {
  enabled: boolean;
};

export class TaskNotifier {
  private messenger: TelegramMessenger;
  private config: TaskNotifierConfig;

  constructor(messenger: TelegramMessenger, config: TaskNotifierConfig) {
    this.messenger = messenger;
    this.config = config;
  }

  createTask(chatId: number, initialText: string): TaskHandle {
    return new TaskHandle(this.messenger, this.config, chatId, initialText);
  }
}

export class TaskHandle {
  private messenger: TelegramMessenger;
  private config: TaskNotifierConfig;
  private chatId: number;
  private messageId: number | null = null;
  private lastText: string | null = null;

  constructor(messenger: TelegramMessenger, config: TaskNotifierConfig, chatId: number, initialText: string) {
    this.messenger = messenger;
    this.config = config;
    this.chatId = chatId;
    void this.set(initialText);
  }

  async set(text: string): Promise<void> {
    if (!this.config.enabled) return;
    if (this.lastText === text) return;
    this.lastText = text;

    if (this.messageId == null) {
      this.messageId = await this.messenger.sendMessage(this.chatId, text);
      return;
    }

    await this.messenger.editMessageText(this.chatId, this.messageId, text);
  }

  async complete(text: string): Promise<void> {
    await this.set(text);
  }

  async fail(text: string): Promise<void> {
    await this.set(text);
  }
}
