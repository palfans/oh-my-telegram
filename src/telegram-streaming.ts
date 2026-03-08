type DraftSupportState = {
  status: 'unknown' | 'supported' | 'unsupported';
};

export type TelegramStreamingMessenger = {
  sendMessage: (chatId: number, text: string, options?: any) => Promise<number | null>;
  editMessageText: (chatId: number, messageId: number, text: string, options?: any) => Promise<void>;
  sendMessageDraft: (chatId: number, draftId: number, text: string, options?: any) => Promise<void>;
  deleteMessage: (chatId: number, messageId: number) => Promise<void>;
  log?: (message: string, error?: unknown) => void;
};

export type TelegramStreamingReplyOptions = {
  chatId: number;
  messenger: TelegramStreamingMessenger;
  draftSupport: DraftSupportState;
  throttleMs?: number;
  minUpdateChars?: number;
  maxPreviewChars?: number;
  simulatedChunkChars?: number;
  simulatedChunkDelayMs?: number;
};

const DEFAULT_THROTTLE_MS = 800;
const DEFAULT_MIN_UPDATE_CHARS = 24;
const DEFAULT_MAX_PREVIEW_CHARS = 3500;
const DEFAULT_SIMULATED_CHUNK_CHARS = 96;
const DEFAULT_SIMULATED_CHUNK_DELAY_MS = 80;
const STREAMING_HEADER = '💬 正在生成回复…\n\n';
const STREAMING_TRUNCATED_SUFFIX = '\n\n…（回复较长，完整内容将在生成结束后发送）';
export class TelegramStreamingReply {
  private readonly chatId: number;
  private readonly messenger: TelegramStreamingMessenger;
  private readonly draftSupport: DraftSupportState;
  private readonly throttleMs: number;
  private readonly minUpdateChars: number;
  private readonly maxPreviewChars: number;
  private readonly simulatedChunkChars: number;
  private readonly simulatedChunkDelayMs: number;

  private latestSourceText = '';
  private lastObservedSourceText = '';
  private lastRenderedText = '';
  private lastFlushedAt = 0;
  private lastFlushedSourceLength = 0;
  private flushTimer: NodeJS.Timeout | null = null;
  private flushInFlight = false;
  private flushPending = false;
  private editPreviewMessageId: number | null = null;
  private closed = false;
  private disabled = false;
  private renderedUpdateCount = 0;
  private observedUpdateCount = 0;

  constructor(options: TelegramStreamingReplyOptions) {
    this.chatId = options.chatId;
    this.messenger = options.messenger;
    this.draftSupport = options.draftSupport;
    this.throttleMs = options.throttleMs ?? DEFAULT_THROTTLE_MS;
    this.minUpdateChars = options.minUpdateChars ?? DEFAULT_MIN_UPDATE_CHARS;
    this.maxPreviewChars = options.maxPreviewChars ?? DEFAULT_MAX_PREVIEW_CHARS;
    this.simulatedChunkChars = options.simulatedChunkChars ?? DEFAULT_SIMULATED_CHUNK_CHARS;
    this.simulatedChunkDelayMs = options.simulatedChunkDelayMs ?? DEFAULT_SIMULATED_CHUNK_DELAY_MS;
    this.draftSupport.status = 'unsupported';
  }

  update(text: string): void {
    if (this.closed || this.disabled) {
      return;
    }

    if (text === this.lastObservedSourceText) {
      return;
    }

    this.lastObservedSourceText = text;
    this.observedUpdateCount += 1;

    this.latestSourceText = text;

    if (this.observedUpdateCount < 2) {
      return;
    }

    const lengthDelta = Math.abs(this.latestSourceText.length - this.lastFlushedSourceLength);
    const elapsed = Date.now() - this.lastFlushedAt;
    const shouldFlushSoon = lengthDelta >= this.minUpdateChars || elapsed >= this.throttleMs;

    if (shouldFlushSoon) {
      this.scheduleFlush(0);
      return;
    }

    this.scheduleFlush(this.throttleMs - elapsed);
  }

  async complete(): Promise<void> {
    this.closed = true;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    await this.flush();

    if (this.editPreviewMessageId != null) {
      try {
        await this.messenger.deleteMessage(this.chatId, this.editPreviewMessageId);
      } catch (error) {
        this.messenger.log?.('[stream] failed to delete preview message', error);
      }
    }
  }

  async fail(): Promise<void> {
    this.closed = true;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  hasMeaningfulStreaming(): boolean {
    return this.observedUpdateCount >= 2 || this.renderedUpdateCount >= 2;
  }

  getPersistentMessageId(): number | null {
    return this.editPreviewMessageId;
  }

  async ensurePlaceholder(): Promise<void> {
    if (this.disabled || this.editPreviewMessageId != null) {
      return;
    }

    this.editPreviewMessageId = await this.messenger.sendMessage(this.chatId, `${STREAMING_HEADER}…`);
    this.lastRenderedText = `${STREAMING_HEADER}…`;
    this.lastFlushedAt = Date.now();
    this.lastFlushedSourceLength = 0;
  }

  async revealFinalText(text: string): Promise<void> {
    if (this.disabled || !text) {
      return;
    }

    let cursor = Math.max(0, this.lastFlushedSourceLength);

    if (cursor === 0) {
      this.latestSourceText = '';
      this.lastRenderedText = '';
    }

    while (cursor < text.length) {
      cursor = Math.min(text.length, cursor + this.simulatedChunkChars);
      this.update(text.slice(0, cursor));
      await this.flush();
      if (cursor < text.length) {
        await this.sleep(this.simulatedChunkDelayMs);
      }
    }
  }

  async stopKeepingPreview(): Promise<void> {
    this.closed = true;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  private scheduleFlush(delayMs: number): void {
    if (this.flushTimer) {
      return;
    }

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, Math.max(0, delayMs));
  }

  private async flush(): Promise<void> {
    if (this.disabled) {
      return;
    }

    if (this.flushInFlight) {
      this.flushPending = true;
      return;
    }

    const rendered = this.buildPreviewText(this.latestSourceText);
    if (!rendered || rendered === this.lastRenderedText) {
      return;
    }

    this.flushInFlight = true;
    try {
      await this.deliver(rendered);
      this.renderedUpdateCount += 1;
      this.lastRenderedText = rendered;
      this.lastFlushedAt = Date.now();
      this.lastFlushedSourceLength = this.latestSourceText.length;
    } catch (error) {
      this.disabled = true;
      this.messenger.log?.('[stream] disabling preview updates after delivery failure', error);
    } finally {
      this.flushInFlight = false;
      if (this.flushPending) {
        this.flushPending = false;
        await this.flush();
      }
    }
  }

  private async deliver(rendered: string): Promise<void> {
    await this.deliverByEdit(rendered);
  }

  private async deliverByEdit(rendered: string): Promise<void> {
    if (this.editPreviewMessageId == null) {
      await this.ensurePlaceholder();
    }

    if (this.editPreviewMessageId == null) {
      return;
    }

    await this.messenger.editMessageText(this.chatId, this.editPreviewMessageId, rendered);
  }

  private buildPreviewText(text: string): string {
    if (!text) {
      return `${STREAMING_HEADER}…`;
    }

    const maxBodyChars = Math.max(1, this.maxPreviewChars - STREAMING_HEADER.length);
    if (text.length <= maxBodyChars) {
      return `${STREAMING_HEADER}${text}`;
    }

    const truncatedBodyChars = Math.max(1, maxBodyChars - STREAMING_TRUNCATED_SUFFIX.length);
    return `${STREAMING_HEADER}${text.slice(0, truncatedBodyChars)}${STREAMING_TRUNCATED_SUFFIX}`;
  }
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
