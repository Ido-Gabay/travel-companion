import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  ExtractPlacesRequest,
  ExtractPlacesResponse,
  InterpretResponse,
  TripAssistantRequest,
  TripAssistantResponse,
} from '@travel-companion/shared';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { UsageGuardService } from '../usage/usage-guard.service.js';
import { buildExtractPlacesSystemPrompt, buildExtractPlacesUserMessage, EXTRACT_PLACES_OUTPUT_SCHEMA } from './extract-places-prompt.js';
import { parseExtractPlacesOutput } from './extract-places-result.js';
import {
  buildSystemPrompt,
  buildUserMessage,
  INTERPRET_OUTPUT_SCHEMA,
  type InterpretContext,
} from './interpret-prompt.js';
import { directInterpretation, parseInterpretOutput } from './interpret-result.js';
import {
  buildTripAssistantSystemPrompt,
  buildTripAssistantUserMessage,
  TRIP_ASSISTANT_OUTPUT_SCHEMA,
} from './trip-assistant-prompt.js';
import { parseTripAssistantOutput } from './trip-assistant-result.js';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const TIMEOUT_MS = 20_000;

interface AnthropicResponse {
  content?: { type: string; text?: string }[];
  stop_reason?: string;
}

/**
 * Claude turns a natural-language request into a structured Google search, or
 * asks one clarification question. It sees only the user's own words and trip
 * details, never Google Places content, and it never produces places itself.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly usage: UsageGuardService,
  ) { }

  async interpret(query: string, context: InterpretContext): Promise<InterpretResponse> {
    const fallback = () =>
      directInterpretation(query, context.trip?.destination ?? null, context.clarifications);

    const key = this.config.anthropicApiKey;
    if (!key) return fallback();

    // Over the AI cap: still let the user search, just without interpretation.
    try {
      await this.usage.consume('ai_interpret');
    } catch {
      return fallback();
    }

    let response: Response;
    try {
      response = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.aiModel,
          max_tokens: 2000,
          system: buildSystemPrompt(),
          messages: [{ role: 'user', content: buildUserMessage(query, context) }],
          output_config: { format: { type: 'json_schema', schema: INTERPRET_OUTPUT_SCHEMA } },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.error(`Claude request failed: ${String(error)}`);
      return fallback();
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      this.logger.error(`Claude returned HTTP ${response.status}: ${body.slice(0, 500)}`);
      return fallback();
    }

    const data = (await response.json().catch(() => ({}))) as AnthropicResponse;
    const text = data.content?.find((block) => block.type === 'text')?.text ?? '';
    const result = parseInterpretOutput(text, context.clarifications.length > 0);
    if (!result) {
      this.logger.warn(`Claude output did not validate (stop_reason=${data.stop_reason ?? '?'}).`);
      return fallback();
    }
    return result;
  }

  /**
   * D1 trip assistant: the user's words → planning instructions (or one
   * question). Counted against the same daily AI cap as search. Without AI
   * (no key, over the cap, an error) the answer is "unavailable" and the app
   * keeps manual planning. Sees refs, categories and the user's own labels only.
   */
  async tripAssistant(body: TripAssistantRequest): Promise<TripAssistantResponse> {
    const unavailable: TripAssistantResponse = { action: 'unavailable' };
    const key = this.config.anthropicApiKey;
    if (!key) return unavailable;
    try {
      await this.usage.consume('ai_interpret');
    } catch {
      return unavailable;
    }
    let response: Response;
    try {
      response = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.config.aiModel,
          max_tokens: 1200,
          system: buildTripAssistantSystemPrompt(),
          messages: [{ role: 'user', content: buildTripAssistantUserMessage(body) }],
          output_config: { format: { type: 'json_schema', schema: TRIP_ASSISTANT_OUTPUT_SCHEMA } },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.error(`Claude request failed (trip assistant): ${String(error)}`);
      return unavailable;
    }
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      this.logger.error(`Claude returned HTTP ${response.status} (trip assistant): ${text.slice(0, 500)}`);
      return unavailable;
    }
    const data = (await response.json().catch(() => ({}))) as AnthropicResponse;
    const text = data.content?.find((block) => block.type === 'text')?.text ?? '';
    const result = parseTripAssistantOutput(text, body);
    if (!result) this.logger.warn(`Trip assistant output did not validate (stop_reason=${data.stop_reason ?? '?'}).`);
    return result ?? unavailable;
  }

  /**
   * Import: place names (and notes or areas the text gives) from text the user
   * pasted. Same AI cap as the assistant. Never looks anything up; names not
   * found in the text are dropped.
   */
  async extractPlaces(body: ExtractPlacesRequest): Promise<ExtractPlacesResponse> {
    const unavailable: ExtractPlacesResponse = { action: 'unavailable' };
    const key = this.config.anthropicApiKey;
    if (!key) return unavailable;
    try {
      await this.usage.consume('ai_interpret');
    } catch {
      return unavailable;
    }
    let response: Response;
    try {
      response = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.config.aiModel,
          max_tokens: 4000,
          system: buildExtractPlacesSystemPrompt(),
          messages: [{ role: 'user', content: buildExtractPlacesUserMessage(body) }],
          output_config: { format: { type: 'json_schema', schema: EXTRACT_PLACES_OUTPUT_SCHEMA } },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.error(`Claude request failed (extract places): ${String(error)}`);
      return unavailable;
    }
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      this.logger.error(`Claude returned HTTP ${response.status} (extract places): ${text.slice(0, 500)}`);
      return unavailable;
    }
    const data = (await response.json().catch(() => ({}))) as AnthropicResponse;
    const text = data.content?.find((block) => block.type === 'text')?.text ?? '';
    const places = parseExtractPlacesOutput(text, body.text);
    if (!places) {
      this.logger.warn(`Extract places output did not validate (stop_reason=${data.stop_reason ?? '?'}).`);
      return unavailable;
    }
    return { action: 'places', places };
  }
}
