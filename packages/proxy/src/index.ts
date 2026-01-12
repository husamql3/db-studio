import { Hono } from 'hono'
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { createGeminiChat } from "@tanstack/ai-gemini";
import { env } from "cloudflare:workers";

import { createProxyLimiter } from './limit';

const app = new Hono()

app.use('/*', cors({
  origin: '*',
  allowMethods: ['POST', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
}));

//* Log requests
app.use('/*', logger());

//* Apply rate limiters
app.use('/*', createProxyLimiter(24 * 60 * 60 * 1000, 10)); // 10 req / day

/**
 * POST /chat - Proxy chat requests to Gemini API
 */
app.post(
  '/chat',
  async (c) => {
    try {
      const body = await c.req.json();
      const { messages, systemPrompt, conversationId } = body;
      if (!messages || !Array.isArray(messages)) {
        return c.json(
          { error: 'Invalid request: messages array required' },
          400
        );
      }

      const stream = chat({
        adapter: createGeminiChat(
          "gemini-3-flash-preview",
          env.GEMINI_API_KEY,
          {
            temperature: 0.1, // Very low - we want deterministic, accurate SQL
            topP: 0.9, // Very low - we want deterministic, accurate SQL
            maxOutputTokens: 1024, // Short responses - SQL + brief explanation
          },
        ),
        messages,
        conversationId,
        systemPrompts: [systemPrompt],
      });


      return toServerSentEventsResponse(stream);
    } catch (error) {
      console.error('Proxy error:', error);
      const errorMessage = error instanceof Error ? error.message : 'An error occurred';
      return c.json({ error: errorMessage }, 500);
    }
  });

app.get('/', (c) => {
  return c.json({
    status: 'ok',
    service: 'db-studio-proxy',
    endpoints: ['/chat']
  });
});

app.get('/favicon.ico', (c) => {
  return c.body(null, 204);
});

export default app;