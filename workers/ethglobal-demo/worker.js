const DEMO_URL = "https://itonami-agent-treasury-tokyo2026.pages.dev/";
const DEMO_PATH = "/";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== DEMO_PATH) return new Response("Not found", { status: 404 });
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405,
        headers: { allow: "GET, HEAD" } });
    }
    // Create a fresh upstream request. Never forward visitor cookies, tokens,
    // query parameters, or identifying headers to the evidence Pages project.
    const upstream = await fetch(DEMO_URL, { method: "GET", redirect: "manual" });
    if (!upstream.ok) return new Response("Demo temporarily unavailable", { status: 503 });
    return new Response(request.method === "HEAD" ? null : upstream.body, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=60",
        "x-itonami-demo-route": "ethglobal-tokyo-2026",
        "x-content-type-options": "nosniff",
      },
    });
  },
};
