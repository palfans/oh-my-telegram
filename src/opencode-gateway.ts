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

  async sendMessage(message: string): Promise<string> {
    if (!this.sessionId) {
      await this.initialize();
      if (!this.sessionId) {
        throw new Error('Gateway not initialized. Call initialize() first.');
      }
    }

    console.log(`[OpencodeGateway] Sending message to session ${this.sessionId}...`);

    const result = await this.clientV1.session.prompt({
      path: { id: this.sessionId },
      body: {
        parts: [{ type: 'text', text: message }],
      },
    });

    if (result.error) {
      throw new Error(`Prompt failed: ${String(result.error)}`);
    }

    if (!result.data) {
      throw new Error('No data in response');
    }

    const response = result.data as any;

    const textParts = response.parts
      .filter((part: OpencodeMessage) => part.type === 'text' && part.text)
      .map((part: OpencodeMessage) => part.text!);

    if (textParts.length === 0) {
      return '[No text response from agent]';
    }

    const fullResponse = textParts.join('\n');
    console.log(`[OpencodeGateway] Received response (${fullResponse.length} chars)`);

    return fullResponse;
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
}
