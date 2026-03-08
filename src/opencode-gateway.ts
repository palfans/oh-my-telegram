import { createOpencodeClient as createOpencodeClientV1 } from '@opencode-ai/sdk';
import { createOpencodeClient as createOpencodeClientV2 } from '@opencode-ai/sdk/v2';

export type PendingPermission = {
  id: string;
  sessionID: string;
  permission: string;
  patterns: string[];
  always: string[];
  metadata: Record<string, unknown>;
  tool?: {
    messageID: string;
    callID: string;
  };
};

export type PendingQuestionRequest = {
  id: string;
  sessionID: string;
  questions: Array<{
    header: string;
    question: string;
    options: Array<{
      label: string;
      description?: string;
    }>;
    multiple: boolean;
  }>;
  tool?: {
    messageID: string;
    callID: string;
  };
};

export type OpencodeStreamOptions = {
  agent?: string;
  onText?: (text: string) => void | Promise<void>;
  pollIntervalMs?: number;
  timeoutMs?: number;
};

interface OpencodeMessage {
  type: string;
  text?: string;
}

interface OpencodeResponse {
  info: {
    id: string;
    sessionID: string;
    role: string;
  };
  parts: OpencodeMessage[];
}

type GatewayMessageInfo = {
  id?: string;
  error?: unknown;
  role?: string;
  parentID?: string;
  time?: {
    created?: number;
    completed?: number;
  };
};

type SessionMessageEntry = {
  info?: GatewayMessageInfo;
  parts?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export class OpencodeGateway {
  private clientV1: ReturnType<typeof createOpencodeClientV1>;
  private clientV2: ReturnType<typeof createOpencodeClientV2>;
  private serverUrl: string;
  private sessionId: string | null = null;
  private directory?: string;

  constructor(serverUrl: string = 'http://localhost:4096', directory?: string) {
    this.serverUrl = serverUrl;
    this.directory = directory;
    this.clientV1 = createOpencodeClientV1({ baseUrl: serverUrl, directory });
    this.clientV2 = createOpencodeClientV2({ baseUrl: serverUrl, directory });
  }

  setSessionId(sessionId: string | null): void {
    this.sessionId = sessionId;
  }

  async findRootSessionByTitle(title: string): Promise<string | null> {
    const result = await this.clientV2.session.list({
      directory: this.directory,
      roots: true,
      search: title,
      limit: 50,
    });

    if (result.error) {
      throw new Error(`Session list failed: ${String(result.error)}`);
    }

    const sessions = result.data || [];
    const exact = sessions.find((s: any) => (s?.title || '') === title);
    return exact?.id || null;
  }

  async createRootSession(title?: string): Promise<string> {
    const result = await this.clientV2.session.create({
      directory: this.directory,
      title,
    });

    if (result.error || !result.data?.id) {
      throw new Error(`Session creation failed: ${result.error ? String(result.error) : 'unknown error'}`);
    }

    this.sessionId = result.data.id;
    return this.sessionId;
  }

  setDirectory(directory?: string): void {
    if (this.directory === directory) return;
    this.directory = directory;
    this.clientV1 = createOpencodeClientV1({ baseUrl: this.serverUrl, directory });
    this.clientV2 = createOpencodeClientV2({ baseUrl: this.serverUrl, directory });
  }

  getDirectory(): string | undefined {
    return this.directory;
  }

  async initialize(sessionId?: string): Promise<void> {
    console.log(`[OpencodeGateway] Connecting to ${this.serverUrl}...`);

    const configResult = await this.clientV1.config.get();
    if (configResult.error) {
      throw new Error(`Server connection failed: ${String(configResult.error)}`);
    }

    console.log('[OpencodeGateway] Server connected');

    if (sessionId) {
      this.sessionId = sessionId;
      console.log(`[OpencodeGateway] Using existing session: ${sessionId}`);
      return;
    }

    try {
      const rootsResult = await this.clientV2.session.list({
        directory: this.directory,
        roots: true,
        limit: 1,
      });
      if (!rootsResult.error && rootsResult.data && rootsResult.data.length > 0) {
        this.sessionId = rootsResult.data[0].id;
        console.log(`[OpencodeGateway] Reusing root session: ${this.sessionId}`);
        return;
      }
    } catch {
    }

    const sessionsResult = await this.clientV1.session.list();
    if (sessionsResult.error) {
      throw new Error(`Session list failed: ${String(sessionsResult.error)}`);
    }

    const sessions = sessionsResult.data || [];

    if (sessions.length > 0) {
      this.sessionId = sessions[0].id;
      console.log(`[OpencodeGateway] Reusing session: ${this.sessionId}`);
      return;
    }

    const createResult = await this.clientV1.session.create({
      body: {},
    });

    if (createResult.error || !createResult.data?.id) {
      throw new Error(`Session creation failed: ${createResult.error ? String(createResult.error) : 'unknown error'}`);
    }

    this.sessionId = createResult.data.id;
    console.log(`[OpencodeGateway] Created new session: ${this.sessionId}`);
  }

  async sendMessage(message: string, agent?: string): Promise<string> {
    if (!this.sessionId) {
      await this.initialize();
      if (!this.sessionId) {
        throw new Error('Gateway not initialized. Call initialize() first.');
      }
    }

    console.log(`[OpencodeGateway] Sending message to session ${this.sessionId}...`);

    const result = await this.clientV1.session.prompt({
      path: { id: this.sessionId },
      body: this.buildPromptBody(message, agent),
    });

    if (result.error) {
      throw new Error(`Prompt failed: ${String(result.error)}`);
    }

    if (!result.data) {
      throw new Error('No data in response');
    }

    const response = result.data;

    let textParts = this.extractTextParts(response);

    if (textParts.length === 0) {
      const messageId = this.extractMessageId(response);
      if (messageId) {
        textParts = await this.getMessageTextParts(messageId);
      }
    }

    if (textParts.length === 0) {
      const assistantError = this.extractAssistantError(response);
      if (assistantError) {
        throw new Error(`Prompt failed: ${assistantError}`);
      }

      const responseKeys = isRecord(response) ? Object.keys(response).join(', ') : typeof response;
      throw new Error(`Prompt response contained no text parts (keys: ${responseKeys || 'none'})`);
    }

    if (textParts.length === 0) {
      return '[No text response from agent]';
    }

    const fullResponse = textParts.join('\n');
    console.log(`[OpencodeGateway] Received response (${fullResponse.length} chars)`);

    return fullResponse;
  }

  async streamMessage(message: string, options: OpencodeStreamOptions = {}): Promise<string> {
    if (!this.sessionId) {
      await this.initialize();
      if (!this.sessionId) {
        throw new Error('Gateway not initialized. Call initialize() first.');
      }
    }

    const pollIntervalMs = options.pollIntervalMs ?? 700;
    const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;
    const startedAt = Date.now();

    console.log(`[OpencodeGateway] Streaming message to session ${this.sessionId}...`);

    const accepted = await this.clientV1.session.promptAsync({
      path: { id: this.sessionId },
      body: this.buildPromptBody(message, options.agent),
    });

    if (accepted.error) {
      console.warn(`[OpencodeGateway] promptAsync failed, falling back to prompt(): ${String(accepted.error)}`);
      return this.sendMessage(message, options.agent);
    }

    let lastText = '';
    let userMessageId: string | undefined;
    let consecutiveErrors = 0;
    const deadline = startedAt + timeoutMs;

    while (Date.now() < deadline) {
      let messages: SessionMessageEntry[];
      try {
        messages = await this.listSessionMessages();
        consecutiveErrors = 0;
      } catch (error) {
        consecutiveErrors += 1;
        if (consecutiveErrors >= 5) {
          throw error;
        }

        await this.sleep(pollIntervalMs);
        continue;
      }

      const snapshot = this.selectStreamingSnapshot(messages, startedAt, userMessageId);

      if (snapshot.user?.info?.id) {
        userMessageId = snapshot.user.info.id;
      }

      if (!snapshot.assistant) {
        await this.sleep(pollIntervalMs);
        continue;
      }

      const assistantText = this.extractTextParts(snapshot.assistant).join('\n');
      if (assistantText && assistantText !== lastText) {
        lastText = assistantText;
        await options.onText?.(assistantText);
      }

      const assistantError = this.extractAssistantError(snapshot.assistant);
      if (assistantError) {
        throw new Error(`Prompt failed: ${assistantError}`);
      }

      if (this.isMessageCompleted(snapshot.assistant)) {
        if (assistantText) {
          console.log(`[OpencodeGateway] Stream completed (${assistantText.length} chars)`);
          return assistantText;
        }

        return '[No text response from agent]';
      }

      await this.sleep(pollIntervalMs);
    }

    throw new Error(`Timed out waiting for streamed response after ${timeoutMs}ms`);
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  async resetSession(): Promise<void> {
    const deleting = this.sessionId;
    this.sessionId = null;

    if (deleting) {
      console.log(`[OpencodeGateway] Deleting session ${deleting}...`);
      try {
        await this.clientV1.session.delete({
          path: { id: deleting },
        });
      } catch (error) {
        console.warn(`[OpencodeGateway] Session delete failed (ignored): ${String(error)}`);
      }
    }

    await this.initialize();
  }

  async listRootSessions(limit: number = 50): Promise<Array<{ id: string; title?: string; updated?: number; projectID?: string }>> {
    const result = await this.clientV2.session.list({
      directory: this.directory,
      roots: true,
      limit,
    });

    if (result.error) {
      throw new Error(`Session list failed: ${String(result.error)}`);
    }

    const sessions = result.data || [];
    return sessions.map((s: any) => ({
      id: s.id,
      title: s.title,
      updated: s.time?.updated,
      projectID: s.projectID,
    }));
  }

  private async getSessionV2(sessionID: string): Promise<any> {
    const result = await this.clientV2.session.get({
      sessionID,
      directory: this.directory,
    });

    if (result.error || !result.data) {
      throw new Error(`Session get failed: ${result.error ? String(result.error) : 'unknown error'}`);
    }

    return result.data as any;
  }

  private async listChildrenV2(sessionID: string): Promise<any[]> {
    const result = await this.clientV2.session.children({
      sessionID,
      directory: this.directory,
    });

    if (result.error) {
      throw new Error(`Session children failed: ${String(result.error)}`);
    }

    return (result.data || []) as any[];
  }

  private async deleteSessionV2(sessionID: string): Promise<void> {
    const result = await this.clientV2.session.delete({
      sessionID,
      directory: this.directory,
    });

    if (result.error) {
      throw new Error(`Session delete failed: ${String(result.error)}`);
    }
  }

  private async getRootSessionId(sessionID: string): Promise<string> {
    let current = await this.getSessionV2(sessionID);
    while (current.parentID) {
      current = await this.getSessionV2(current.parentID);
    }
    return current.id;
  }

  private async collectSessionTreeForDeletion(rootSessionID: string): Promise<string[]> {
    const visited = new Set<string>();
    const order: string[] = [];

    const visit = async (id: string): Promise<void> => {
      if (visited.has(id)) return;
      visited.add(id);

      const children = await this.listChildrenV2(id);
      for (const child of children) {
        if (child?.id) await visit(child.id);
      }

      order.push(id);
    };

    await visit(rootSessionID);
    return order;
  }

  async resetSessionGroup(): Promise<{ deletedCount: number; rootSessionID?: string; newSessionID: string }> {
    const current = this.sessionId;
    if (!current) {
      await this.initialize();
    }

    const sessionID = this.sessionId;
    if (!sessionID) {
      const newSessionID = await this.createNewSession();
      return { deletedCount: 0, newSessionID };
    }

    const rootSessionID = await this.getRootSessionId(sessionID);
    const ids = await this.collectSessionTreeForDeletion(rootSessionID);

    const interDeleteDelayMs = 100;
    let deletedCount = 0;
    for (const id of ids) {
      try {
        await this.deleteSessionV2(id);
        deletedCount += 1;
      } catch (error) {
        console.warn(`[OpencodeGateway] Session delete failed (ignored): ${String(error)}`);
      }
      await new Promise(resolve => setTimeout(resolve, interDeleteDelayMs));
    }

    this.sessionId = null;
    const newSessionID = await this.createNewSession();
    return { deletedCount, rootSessionID, newSessionID };
  }

  async resetCurrentChildSession(): Promise<{ deletedSessionID: string; parentSessionID: string }> {
    const sessionID = this.sessionId;
    if (!sessionID) {
      throw new Error('No active session');
    }

    const info = await this.getSessionV2(sessionID);
    const parentSessionID = info.parentID as string | undefined;
    if (!parentSessionID) {
      throw new Error('Current session is a root session; use /reset to delete the entire group.');
    }

    await this.deleteSessionV2(sessionID);
    this.sessionId = parentSessionID;
    return { deletedSessionID: sessionID, parentSessionID };
  }

  async createNewSession(): Promise<string> {
    console.log('[OpencodeGateway] Creating new session...');

    const id = await this.createRootSession();
    console.log(`[OpencodeGateway] Created new session: ${id}`);
    return id;
  }

  async getSessionInfo(sessionId: string): Promise<any> {
    const result = await this.clientV1.session.get({
      path: { id: sessionId },
    });

    if (result.error || !result.data) {
      throw new Error(`Session get failed: ${result.error ? String(result.error) : 'unknown error'}`);
    }

    return result.data as any;
  }

  async listSessions(): Promise<Array<{ id: string; title?: string; updated?: number; projectID?: string }>> {
    console.log('[OpencodeGateway] Listing sessions...');

    const sessionsResult = await this.clientV1.session.list();
    if (sessionsResult.error) {
      throw new Error(`Session list failed: ${String(sessionsResult.error)}`);
    }

    const sessions = sessionsResult.data || [];
    console.log(`[OpencodeGateway] Found ${sessions.length} sessions`);

    return sessions.map((s: any) => ({
      id: s.id,
      title: s.title,
      updated: s.updated,
      projectID: s.projectID,
    }));
  }

  async switchSession(sessionId: string): Promise<void> {
    console.log(`[OpencodeGateway] Switching to session: ${sessionId}`);

    // Verify session exists
    const sessionsResult = await this.clientV1.session.list();
    if (sessionsResult.error) {
      throw new Error(`Session list failed: ${String(sessionsResult.error)}`);
    }

    const sessions = sessionsResult.data || [];
    const exists = sessions.some((s: any) => s.id === sessionId);

    if (!exists) {
      throw new Error(`Session ${sessionId} not found`);
    }

    this.sessionId = sessionId;
    console.log(`[OpencodeGateway] Switched to session: ${this.sessionId}`);
  }

  async listPendingPermissions(): Promise<PendingPermission[]> {
    const result = await this.clientV2.permission.list({
      directory: this.directory,
    });

    if (result.error) {
      throw new Error(`Permission list failed: ${String(result.error)}`);
    }

    return (result.data || []) as unknown as PendingPermission[];
  }

  async getServerHealth(): Promise<{ healthy: boolean; version: string }> {
    const result = await this.clientV2.global.health();
    if (result.error || !result.data) {
      throw new Error(`Global health check failed: ${result.error ? String(result.error) : 'unknown error'}`);
    }

    return result.data as any;
  }

  async replyPermission(requestID: string, reply: 'once' | 'always' | 'reject', message?: string): Promise<void> {
    const result = await this.clientV2.permission.reply({
      requestID,
      directory: this.directory,
      reply,
      message,
    });

    if (result.error) {
      throw new Error(`Permission reply failed: ${String(result.error)}`);
    }
  }

  async listPendingQuestions(): Promise<PendingQuestionRequest[]> {
    const result = await this.clientV2.question.list({
      directory: this.directory,
    });

    if (result.error) {
      throw new Error(`Question list failed: ${String(result.error)}`);
    }

    return (result.data || []) as unknown as PendingQuestionRequest[];
  }

  async replyQuestion(requestID: string, answers: Array<Array<string>>): Promise<void> {
    const result = await this.clientV2.question.reply({
      requestID,
      directory: this.directory,
      answers,
    });

    if (result.error) {
      throw new Error(`Question reply failed: ${String(result.error)}`);
    }
  }

  async rejectQuestion(requestID: string): Promise<void> {
    const result = await this.clientV2.question.reject({
      requestID,
      directory: this.directory,
    });

    if (result.error) {
      throw new Error(`Question reject failed: ${String(result.error)}`);
    }
  }

  private buildPromptBody(message: string, agent?: string): { parts: Array<{ type: 'text'; text: string }>; agent?: string } {
    return {
      ...(agent ? { agent } : {}),
      parts: [{ type: 'text', text: message }],
    };
  }

  private async listSessionMessages(): Promise<SessionMessageEntry[]> {
    if (!this.sessionId) {
      return [];
    }

    const result = await this.clientV1.session.messages({
      path: { id: this.sessionId },
    });

    if (result.error || !Array.isArray(result.data)) {
      throw new Error(`Session messages failed: ${result.error ? String(result.error) : 'unknown error'}`);
    }

    return result.data as SessionMessageEntry[];
  }

  private selectStreamingSnapshot(
    messages: SessionMessageEntry[],
    startedAt: number,
    userMessageId?: string
  ): { user?: SessionMessageEntry; assistant?: SessionMessageEntry } {
    const recentMessages = messages.filter((entry) => {
      const createdAt = this.getMessageCreatedAt(entry);
      return typeof createdAt === 'number' && createdAt >= startedAt - 2000;
    });

    const users = recentMessages
      .filter((entry) => entry.info?.role === 'user')
      .sort((a, b) => (this.getMessageCreatedAt(b) || 0) - (this.getMessageCreatedAt(a) || 0));

    const user = (userMessageId
      ? users.find((entry) => entry.info?.id === userMessageId)
      : undefined) || users[0];

    const assistants = recentMessages
      .filter((entry) => entry.info?.role === 'assistant')
      .sort((a, b) => (this.getMessageCreatedAt(b) || 0) - (this.getMessageCreatedAt(a) || 0));

    const assistant = (user?.info?.id
      ? assistants.find((entry) => entry.info?.parentID === user.info?.id)
      : undefined) || assistants[0];

    return { user, assistant };
  }

  private getMessageCreatedAt(entry: SessionMessageEntry): number | undefined {
    return entry.info?.time?.created;
  }

  private isMessageCompleted(entry: SessionMessageEntry): boolean {
    return typeof entry.info?.time?.completed === 'number';
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private extractTextParts(response: unknown): string[] {
    const parts = this.extractParts(response);
    return parts
      .filter((part) => part.type === 'text' && typeof part.text === 'string' && part.text.length > 0)
      .map((part) => part.text as string);
  }

  private extractParts(response: unknown): OpencodeMessage[] {
    if (!isRecord(response)) {
      return [];
    }

    const directParts = this.normalizeParts(response.parts);
    if (directParts.length > 0) {
      return directParts;
    }

    const nestedData = response.data;
    if (!isRecord(nestedData)) {
      return [];
    }

    return this.normalizeParts(nestedData.parts);
  }

  private normalizeParts(parts: unknown): OpencodeMessage[] {
    if (!Array.isArray(parts)) {
      return [];
    }

    return parts.flatMap((part) => {
      if (!isRecord(part) || typeof part.type !== 'string') {
        return [];
      }

      const text = typeof part.text === 'string' ? part.text : undefined;
      return [{ type: part.type, text } satisfies OpencodeMessage];
    });
  }

  private extractMessageId(response: unknown): string | undefined {
    return this.extractMessageInfo(response)?.id;
  }

  private extractAssistantError(response: unknown): string | undefined {
    const error = this.extractMessageInfo(response)?.error;
    return this.stringifyAssistantError(error);
  }

  private extractMessageInfo(response: unknown): GatewayMessageInfo | undefined {
    if (!isRecord(response)) {
      return undefined;
    }

    const directInfo = response.info;
    if (isRecord(directInfo)) {
      return directInfo;
    }

    const nestedData = response.data;
    if (!isRecord(nestedData)) {
      return undefined;
    }

    return isRecord(nestedData.info) ? nestedData.info : undefined;
  }

  private stringifyAssistantError(error: unknown): string | undefined {
    if (typeof error === 'string' && error.length > 0) {
      return error;
    }

    if (!isRecord(error)) {
      return undefined;
    }

    const message = error.message;
    if (typeof message === 'string' && message.length > 0) {
      return message;
    }

    const responseBody = error.responseBody;
    if (typeof responseBody === 'string' && responseBody.length > 0) {
      return responseBody;
    }

    const errorName = error.name;
    const data = error.data;
    const dataString = isRecord(data) ? JSON.stringify(data) : undefined;

    if (typeof errorName === 'string' && dataString) {
      return `${errorName}: ${dataString}`;
    }

    if (typeof errorName === 'string' && errorName.length > 0) {
      return errorName;
    }

    return JSON.stringify(error);
  }

  private async getMessageTextParts(messageID: string): Promise<string[]> {
    if (!this.sessionId) {
      return [];
    }

    const result = await this.clientV1.session.message({
      path: { id: this.sessionId, messageID },
    });

    if (result.error || !result.data) {
      return [];
    }

    const textParts = this.extractTextParts(result.data);
    if (textParts.length > 0) {
      return textParts;
    }

    const assistantError = this.extractAssistantError(result.data);
    if (assistantError) {
      throw new Error(`Prompt failed: ${assistantError}`);
    }

    return [];
  }
}
