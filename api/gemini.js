export const config = { runtime: "edge" };

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export default async function handler(req) {
  if (req.method !== "POST") return json({ error: { message: "Method not allowed" } }, 405);

  try {
    const geminiKey = globalThis.process?.env?.GEMINI_KEY;
    if (!geminiKey) {
      return json({ error: { message: "Server is missing GEMINI_KEY." } }, 500);
    }

    const body = await req.json();
    const { modelId, ...rest } = body;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rest),
      }
    );

    const text = await response.text();
    if (!text) {
      return json(
        { error: { message: response.ok ? "Gemini returned an empty response." : `Gemini request failed (${response.status}).` } },
        response.ok ? 502 : response.status,
      );
    }

    return new Response(text, {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return json({ error: { message: error?.message || "Gemini proxy failed." } }, 500);
  }
}
