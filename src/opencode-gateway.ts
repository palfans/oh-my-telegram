import { createOpencodeClient } from '@opencode-ai/sdk';

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
  private client: ReturnType<typeof createOpencodeClient>;
  private serverUrl: string;
  private sessionId: string | null = null;

  constructor(serverUrl: string = 'http://localhost:4096') {
    this.serverUrl = serverUrl;
    this.client = createOpencodeClient({ baseUrl: serverUrl });
  }

  async initialize(sessionId?: string): Promise<void> {
    console.log(`[OpencodeGateway] Connecting to ${this.serverUrl}...`);

    const configResult = await this.client.config.get();
    if (configResult.error) {
      throw new Error(`Server connection failed: ${String(configResult.error)}`);
    }

    console.log('[OpencodeGateway] Server connected');

    if (sessionId) {
      this.sessionId = sessionId;
      console.log(`[OpencodeGateway] Using existing session: ${sessionId}`);
      return;
    }

    const sessionsResult = await this.client.session.list();
    if (sessionsResult.error) {
      throw new Error(`Session list failed: ${String(sessionsResult.error)}`);
    }

    const sessions = sessionsResult.data || [];

    if (sessions.length > 0) {
      this.sessionId = sessions[0].id;
      console.log(`[OpencodeGateway] Reusing session: ${this.sessionId}`);
    } else {
      const createResult = await this.client.session.create({
        body: {},
      });

      if (createResult.error || !createResult.data?.id) {
        throw new Error(`Session creation failed: ${createResult.error ? String(createResult.error) : 'unknown error'}`);
      }

      this.sessionId = createResult.data.id;
      console.log(`[OpencodeGateway] Created new session: ${this.sessionId}`);
    }
  }

  async sendMessage(message: string): Promise<string> {
    if (!this.sessionId) {
      throw new Error('Gateway not initialized. Call initialize() first.');
    }

    console.log(`[OpencodeGateway] Sending message to session ${this.sessionId}...`);

    const result = await this.client.session.prompt({
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
    if (this.sessionId) {
      console.log(`[OpencodeGateway] Deleting session ${this.sessionId}...`);
      await this.client.session.delete({
        path: { id: this.sessionId },
      });
    }

    await this.initialize();
  }

  async createNewSession(): Promise<string> {
    console.log('[OpencodeGateway] Creating new session...');

    const createResult = await this.client.session.create({
      body: {},
    });

    if (createResult.error || !createResult.data?.id) {
      throw new Error(`Session creation failed: ${createResult.error ? String(createResult.error) : 'unknown error'}`);
    }

    this.sessionId = createResult.data.id;
    console.log(`[OpencodeGateway] Created new session: ${this.sessionId}`);

    return this.sessionId;
  }

  async listSessions(): Promise<Array<{ id: string; title?: string; updated?: number }>> {
    console.log('[OpencodeGateway] Listing sessions...');

    const sessionsResult = await this.client.session.list();
    if (sessionsResult.error) {
      throw new Error(`Session list failed: ${String(sessionsResult.error)}`);
    }

    const sessions = sessionsResult.data || [];
    console.log(`[OpencodeGateway] Found ${sessions.length} sessions`);

    return sessions.map((s: any) => ({
      id: s.id,
      title: s.title,
      updated: s.updated,
    }));
  }

  async switchSession(sessionId: string): Promise<void> {
    console.log(`[OpencodeGateway] Switching to session: ${sessionId}`);

    // Verify session exists
    const sessionsResult = await this.client.session.list();
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
}
