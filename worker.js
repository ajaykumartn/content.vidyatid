const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const JSON_HEADERS = {
  ...CORS_HEADERS,
  'Content-Type': 'application/json; charset=utf-8',
};

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 30;
const ipRequestLog = new Map();

const ENDPOINT_CONFIG = {
  '/generate-reel': {
    schema: {
      hook: 'string',
      script: 'string',
      caption: 'string',
      hashtags: ['string'],
      thumbnail_text: 'string',
      subtitle_text: 'string',
      srt_text: 'string',
    },
    builder: buildReelPrompt,
  },
  '/generate-carousel': {
    schema: {
      slides: ['string'],
      cta: 'string',
    },
    builder: buildCarouselPrompt,
  },
  '/generate-ad': {
    schema: {
      instagram_headlines: ['string'],
      instagram_primary_texts: ['string'],
      google_headlines: ['string'],
      google_descriptions: ['string'],
      cta_options: ['string'],
    },
    builder: buildAdPrompt,
  },
  '/generate-social': {
    schema: {
      twitter_thread: ['string'],
      linkedin_post: 'string',
      youtube_description: 'string',
      telegram_post: 'string',
    },
    builder: buildSocialPrompt,
  },
  '/generate-calendar': {
    schema: {
      '30_day_plan': [
        {
          day: 'number',
          focus: 'string',
          content_type: 'string',
          idea: 'string',
          cta: 'string',
        },
      ],
      platform_suggestion: 'string',
      daily_themes: ['string'],
    },
    builder: buildCalendarPrompt,
  },
  '/generate-study-notes': {
    schema: {
      summary: 'string',
      key_points: ['string'],
      highlighted_lines: ['string'],
      formatted_references: ['string'],
    },
    builder: buildStudyNotesPrompt,
  },
  '/generate-thumbnail': {
    schema: {
      text: 'string',
      suggested_color_palette: ['string'],
      suggested_layout_hint: 'string',
    },
    builder: buildThumbnailPrompt,
  },
  '/generate-campaign-plan': {
    schema: {
      weekly_breakdown: [
        {
          week: 'number',
          objective: 'string',
          channels: ['string'],
          deliverables: ['string'],
        },
      ],
      posts_per_week: 'number',
      themes_per_week: ['string'],
    },
    builder: buildCampaignPlanPrompt,
  },
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return jsonResponse({ ok: true, service: 'Vidyatid Content Engine Worker' });
    }

    if (request.method === 'GET') {
      return env.ASSETS.fetch(request);
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed. Use POST for generation endpoints.' }, 405);
    }

    const routeConfig = ENDPOINT_CONFIG[url.pathname];
    if (!routeConfig) {
      return jsonResponse({ error: `Unknown endpoint: ${url.pathname}` }, 404);
    }

    const ipAddress = request.headers.get('CF-Connecting-IP') || 'unknown-ip';
    const rateLimit = checkRateLimit(ipAddress);
    if (!rateLimit.allowed) {
      return jsonResponse(
        {
          error: 'Rate limit exceeded. Please retry in a minute.',
          retry_after_seconds: rateLimit.retryAfterSeconds,
        },
        429,
      );
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON body.' }, 400);
    }

    if (!payload || typeof payload !== 'object') {
      return jsonResponse({ error: 'JSON body must be an object.' }, 400);
    }

    const userPrompt = routeConfig.builder(payload);

    try {
      const aiResponse = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
        messages: [
          {
            role: 'system',
            content:
              'You are Vidyatid Content Engine. Produce highly practical, audience-aware content. Always respond with valid JSON only, no markdown fences.',
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        max_tokens: 1800,
        temperature: 0.7,
      });

      const parsed = parseAiJson(aiResponse);
      const normalized = normalizeToSchema(parsed, routeConfig.schema);

      return jsonResponse({
        endpoint: url.pathname,
        generated_at: new Date().toISOString(),
        output: normalized,
      });
    } catch (error) {
      return jsonResponse(
        {
          error: 'AI generation failed.',
          details: error?.message || 'Unknown Worker AI error.',
        },
        500,
      );
    }
  },
};

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: JSON_HEADERS,
  });
}

function checkRateLimit(ipAddress) {
  const now = Date.now();
  const entry = ipRequestLog.get(ipAddress) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };

  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + RATE_LIMIT_WINDOW_MS;
  }

  entry.count += 1;
  ipRequestLog.set(ipAddress, entry);

  if (entry.count > RATE_LIMIT_MAX_REQUESTS) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

function parseAiJson(aiResponse) {
  const candidate = aiResponse?.response || aiResponse?.result || aiResponse?.output || aiResponse;
  if (typeof candidate === 'object' && candidate !== null) {
    return candidate;
  }

  if (typeof candidate !== 'string') {
    throw new Error('AI response did not contain text or JSON object.');
  }

  const withoutFences = candidate
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  try {
    return JSON.parse(withoutFences);
  } catch {
    throw new Error('AI response was not valid JSON.');
  }
}

function normalizeToSchema(data, schema) {
  if (typeof schema === 'string') {
    if (schema === 'number') return Number(data || 0);
    return String(data || '');
  }

  if (Array.isArray(schema)) {
    const itemSchema = schema[0] || 'string';
    const src = Array.isArray(data) ? data : [];
    return src.map((item) => normalizeToSchema(item, itemSchema));
  }

  const obj = {};
  for (const [key, fieldSchema] of Object.entries(schema)) {
    obj[key] = normalizeToSchema(data?.[key], fieldSchema);
  }
  return obj;
}

function buildCommonContext(payload) {
  return [
    `Brand: ${payload.brand || 'Vidyatid'}`,
    `Topic: ${payload.topic || 'General content strategy'}`,
    `Audience: ${payload.audience || 'Students and professionals'}`,
    `Tone: ${payload.tone || 'Clear, engaging, practical'}`,
    `Goal: ${payload.goal || 'Improve reach and engagement'}`,
  ].join('\n');
}

function buildReelPrompt(payload) {
  return `${buildCommonContext(payload)}
Length: ${payload.length || '30-45 seconds'}
Language: ${payload.language || 'English'}
Return JSON with keys: hook, script, caption, hashtags, thumbnail_text, subtitle_text, srt_text.
Hashtags should be 8-12 items.
script should be short spoken format with scene suggestions.`;
}

function buildCarouselPrompt(payload) {
  return `${buildCommonContext(payload)}
Create a 6-slide carousel narrative.
Return JSON with keys: slides (exactly 6 text strings), cta.`;
}

function buildAdPrompt(payload) {
  return `${buildCommonContext(payload)}
Offer: ${payload.offer || 'Primary service offer'}
Return JSON with keys: instagram_headlines (5), instagram_primary_texts (3), google_headlines (8), google_descriptions (4), cta_options (5).
Keep copy concise and conversion-focused.`;
}

function buildSocialPrompt(payload) {
  return `${buildCommonContext(payload)}
Return JSON with keys: twitter_thread (6-8 posts), linkedin_post, youtube_description, telegram_post.
Include strong hooks and clear CTA.`;
}

function buildCalendarPrompt(payload) {
  return `${buildCommonContext(payload)}
Planning month: ${payload.month || 'Upcoming 30 days'}
Return JSON with keys: 30_day_plan (array of 30 objects with day, focus, content_type, idea, cta), platform_suggestion, daily_themes.`;
}

function buildStudyNotesPrompt(payload) {
  return `Subject: ${payload.subject || 'General topic'}
Source text:\n${payload.source_text || 'No source text provided'}
Return JSON with keys: summary, key_points, highlighted_lines, formatted_references.
formatted_references should use short citation style.`;
}

function buildThumbnailPrompt(payload) {
  return `${buildCommonContext(payload)}
Platform: ${payload.platform || 'YouTube'}
Return JSON with keys: text, suggested_color_palette, suggested_layout_hint.
Text should be short and high impact.`;
}

function buildCampaignPlanPrompt(payload) {
  return `${buildCommonContext(payload)}
Campaign duration weeks: ${payload.duration_weeks || 4}
Budget note: ${payload.budget || 'Lean budget'}
Return JSON with keys: weekly_breakdown, posts_per_week, themes_per_week.
weekly_breakdown should contain week, objective, channels, deliverables.`;
}
