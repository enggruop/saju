/* Cloudflare Worker: OpenAI 키를 서버에 두고 사주 페이지의 요청만 전달한다.
 * 설정: Workers 대시보드 > Settings > Variables and Secrets 에서
 *   OPENAI_API_KEY (Secret) 를 추가한다.
 * 배포 후 받은 주소를 llm.js 의 CONFIG.WORKER_URL 에 넣는다.
 */
const ALLOWED_ORIGINS = ["https://enggruop.github.io"];
const ALLOWED_MODEL = "gpt-5-mini";
const MAX_BODY_BYTES = 20000;

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (!ALLOWED_ORIGINS.includes(origin)) {
      return new Response("Forbidden", { status: 403 });
    }
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(origin) });
    }
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: cors(origin) });
    }
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return new Response("Request too large", { status: 413, headers: cors(origin) });
    }
    let body;
    try { body = JSON.parse(raw); } catch (e) {
      return new Response("Bad JSON", { status: 400, headers: cors(origin) });
    }
    if (body.model !== ALLOWED_MODEL) {
      return new Response("Model not allowed", { status: 400, headers: cors(origin) });
    }
    body.store = false;
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
