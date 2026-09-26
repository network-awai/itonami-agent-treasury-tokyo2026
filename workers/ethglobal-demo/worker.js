import { preflightEnsV2Name, planEnsV2Registration } from "../grok-bots/ensv2_preflight.js";
import { inspectAquaPosition } from "../grok-bots/aqua_position.js";
import { planTreasuryTopup } from "../grok-bots/uniswap_quote.js";
const DEMO_URL = "https://2af8cdf7.itonami-agent-treasury-tokyo2026.pages.dev/";
const DEMO_PATH = "/";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/ens-preflight") {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return new Response("Method not allowed", { status: 405,
          headers: { allow: "GET, HEAD" } });
      }
      const label = url.searchParams.get("label") ?? "itonami-agent-treasury-2026";
      const result = await preflightEnsV2Name(label);
      const response = Response.json(result, {
        status: result.status === "held" ? 503 : 200,
        headers: { "cache-control": result.status === "held" ? "no-store" : "public, max-age=60",
          "x-itonami-demo-route": "ethglobal-tokyo-2026" },
      });
      return request.method === "HEAD" ? new Response(null, response) : response;
    }
    if (url.pathname === "/ens-registration-plan") {
      if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
      if (Number(request.headers.get("content-length") ?? 0) > 2048) {
        return new Response("Request too large", { status: 413 });
      }
      let input;
      try { input = await request.json(); } catch (_) {
        return Response.json({ status: "held", reason: "invalid-json" }, { status: 400 });
      }
      const result = await planEnsV2Registration(input ?? {});
      return Response.json(result, { status: result.status === "unsigned-plan" ? 200 : 409,
        headers: { "cache-control": "no-store", "x-itonami-demo-route": "ethglobal-tokyo-2026" } });
    }
    if (url.pathname === "/aqua-position") {
      if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
      const result = await inspectAquaPosition({
        maker: url.searchParams.get("maker"), app: url.searchParams.get("app") ?? undefined,
        strategyHash: url.searchParams.get("strategyHash"), token: url.searchParams.get("token"),
      });
      return Response.json(result, { status: result.status === "read-only" ? 200 : 400,
        headers: { "cache-control": "no-store", "x-itonami-demo-route": "ethglobal-tokyo-2026" } });
    }
    if (url.pathname === "/swap-plan") {
      if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
      if (Number(request.headers.get("content-length") ?? 0) > 512) {
        return new Response("Request too large", { status: 413 });
      }
      let input;
      try { input = await request.json(); } catch (_) {
        return Response.json({ status: "held", reason: "invalid-json" }, { status: 400 });
      }
      const result = await planTreasuryTopup(input?.recipient);
      return Response.json(result, { status: result.status === "unsigned-plan" ? 200 : 409,
        headers: { "cache-control": "no-store", "x-itonami-demo-route": "ethglobal-tokyo-2026" } });
    }
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
