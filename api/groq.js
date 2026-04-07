export const config = { runtime: "edge" };

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export default async function handler(req) {
  if (req.method !== "POST") return json({ error: { message: "Method not allowed" } }, 405);

  try {
    const groqKey = globalThis.process?.env?.GROQ_KEY;
    if (!groqKey) {
      return json({ error: { message: "Server is missing GROQ_KEY." } }, 500);
    }

    const body = await req.json();
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${groqKey}`,
      },
      body: JSON.stringify(body),
    });

    const contentType = response.headers.get("Content-Type") || "application/json";

    if (body.stream && response.ok && response.body) {
      return new Response(response.body, {
        status: response.status,
        headers: { "Content-Type": contentType },
      });
    }

    const text = await response.text();
    if (!text) {
      return json(
        { error: { message: response.ok ? "Groq returned an empty response." : `Groq request failed (${response.status}).` } },
        response.ok ? 502 : response.status,
      );
    }

    return new Response(text, {
      status: response.status,
      headers: { "Content-Type": contentType.includes("application/json") ? contentType : "application/json" },
    });
  } catch (error) {
    return json({ error: { message: error?.message || "Groq proxy failed." } }, 500);
  }
}
