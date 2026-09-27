/* Cloudflare Worker: OpenAI 키를 서버에 두고 사주 페이지의 요청만 전달한다.
 * 설정: Worker > Settings > Variables and Secrets 에 Secret 이름 OPENAI_API_KEY 로 키 등록.
 */
const ALLOWED_ORIGINS = ["https://enggruop.github.io"];
const ALLOWED_MODEL = "gpt-5-mini";
const MAX_BODY_BYTES = 20000;
const MAX_OUTPUT_TOKENS = 12000;
// 같은 IP에서 10분에 20회까지 (Worker 인스턴스 단위의 간단한 제한)
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 20;
const hits = new Map();

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}

function json(status, message, origin) {
  return new Response(JSON.stringify({ error: { message } }), {
    status, headers: { ...cors(origin), "Content-Type": "application/json" }
  });
}

function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  return list.length > MAX_PER_WINDOW;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (!ALLOWED_ORIGINS.includes(origin)) return new Response("Forbidden", { status: 403 });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
    if (request.method !== "POST") return json(405, "method not allowed", origin);
    if (!env.OPENAI_API_KEY) return json(500, "서버에 API 키가 아직 등록되지 않았어요.", origin);

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (limited(ip)) return json(429, "요청이 너무 많아요. 잠시 뒤에 다시 시도해 주세요.", origin);

    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return json(413, "request too large", origin);
    let body;
    try { body = JSON.parse(raw); } catch (e) { return json(400, "bad json", origin); }
    if (body.model !== ALLOWED_MODEL) return json(400, "model not allowed", origin);
    body.store = false;
    body.max_output_tokens = Math.min(Number(body.max_output_tokens) || MAX_OUTPUT_TOKENS, MAX_OUTPUT_TOKENS);

    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + env.OPENAI_API_KEY },
      body: JSON.stringify(body)
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { ...cors(origin), "Content-Type": "application/json" }
    });
  }
};
