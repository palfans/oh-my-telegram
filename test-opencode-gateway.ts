/**
 * Proof of concept: Connect to opencode server and test async messaging
 *
 * This demonstrates:
 * 1. Connecting to persistent opencode server
 * 2. Sending messages via promptAsync (non-blocking)
 * 3. Receiving responses via Server-Sent Events
 */

import { createOpencodeClient } from '@opencode-ai/sdk';

interface MessageEvent {
  type: string;
  properties: {
    info: {
      id: string;
      sessionID: string;
      role: string;
      parts: Array<{
        type: string;
        text?: string;
      }>;
    };
  };
}

async function testOpencodeGateway() {
  console.log('🔌 Connecting to opencode server at http://localhost:4096...');

  // Create client connected to opencode server
  const client = createOpencodeClient({
    baseUrl: 'http://localhost:4096',
    // directory: '/Users/eunoo/projects/oh-my-telegram', // Optional: set working directory
  });

  try {
    // Test 1: Check server connection
    console.log('\n📊 Testing server connection...');
    const configResult = await client.config.get();
    if (configResult.error) {
      throw new Error(`Server error: ${configResult.error.message}`);
    }
    console.log('✅ Server connected successfully');

    // Test 2: List existing sessions
    console.log('\n📋 Listing sessions...');
    const sessionsResult = await client.session.list();
    if (sessionsResult.error) {
      throw new Error(`List error: ${sessionsResult.error.message}`);
    }
    const sessions = sessionsResult.data?.data || [];
    console.log(`✅ Found ${sessions.length} sessions`);

    // Get or create session for our bot
    let sessionId: string;
    if (sessions.length > 0) {
      sessionId = sessions[0].id;
      console.log(`🔄 Using existing session: ${sessionId}`);
    } else {
      console.log('🆕 Creating new session...');
      const createResult = await client.session.create({
        body: {
          agent: 'build', // default agent
        },
      });
      if (createResult.error) {
        throw new Error(`Create error: ${createResult.error.message}`);
      }
      sessionId = createResult.data?.id || '';
      console.log(`✅ Created session: ${sessionId}`);
    }

    // Test 3: Subscribe to events via SSE
    console.log('\n📡 Subscribing to event stream...');

    let responseReceived = false;
    let resolveResponse: (value: string) => void;
    const responsePromise = new Promise<string>((resolve) => {
      resolveResponse = resolve;
    });

    const eventStream = await client.event.subscribe({
      onSseError: (error) => {
        console.error('❌ SSE Error:', error);
      },
      onSseEvent: (event) => {
        console.log('📨 Raw event received:', JSON.stringify(event).substring(0, 200));

        try {
          const parsed = event as MessageEvent;
          console.log('📨 Event type:', parsed.type);

          if (parsed.type === 'message.updated' && parsed.properties?.info?.role === 'assistant') {
            const textParts = parsed.properties.info.parts.filter((p: any) => p.type === 'text');
            if (textParts.length > 0 && !responseReceived) {
              responseReceived = true;
              const responseText = textParts.map((p: any) => p.text).join('\n');
              console.log('\n🤖 Assistant response:');
              console.log(responseText);
              resolveResponse(responseText);
            }
          }
        } catch (err) {
          console.error('❌ Error parsing event:', err);
        }
      },
    });

    if (eventStream.error) {
      throw new Error(`Event stream error: ${eventStream.error.message}`);
    }

    console.log('✅ Event stream connected via callback');
    console.log('✅ Waiting for events...\n');

    console.log('\n💬 Sending test message via prompt()...');
    const promptResult = await client.session.prompt({
      path: { id: sessionId },
      body: {
        parts: [{
          type: 'text',
          text: 'Hello! Please respond briefly to confirm the session works.',
        }],
      },
    });

    if (promptResult.error) {
      console.error('❌ Prompt error:', promptResult.error);
      throw new Error(`Prompt error: ${promptResult.error.message}`);
    }

    console.log('✅ Message sent successfully');
    console.log('📦 Response structure:', JSON.stringify(promptResult, null, 2));

    if (promptResult.data) {
      console.log('\n🤖 Response received!');
      console.log('📝 Response keys:', Object.keys(promptResult.data));
      process.exit(0);
    }

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run the test
testOpencodeGateway().catch(console.error);
