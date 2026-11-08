export function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = (
    Deno.env.get("APP_ORIGINS") || "https://lol5892.github.io"
  ).split(",");
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin)
      ? origin
      : allowed[0],
    Vary: "Origin",
    "Access-Control-Allow-Headers":
      "authorization,x-client-info,apikey,content-type",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
  };
}
export function json(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...cors(req),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
