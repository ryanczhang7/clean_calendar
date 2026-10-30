// The owner check every function makes (CAL-018 Contract Block 4). The gateway
// (`verify_jwt = true`) has already verified the token's signature; whether the
// caller is the owner is asked of `public.is_owner()`, the one predicate RLS
// uses, through PostgREST with the caller's own JWT. Nothing here decodes it.

import { CORS_HEADERS } from "./cors.ts";

export type OwnerDeps = {
  fetch: typeof fetch;
  env: (name: string) => string | undefined;
};

export function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}

/** The caller's `Authorization` header when it is a bearer token, else null. */
export function bearer(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (header === null) return null;
  return /^Bearer\s+\S+/i.test(header) ? header : null;
}

/** 401 when there is no bearer token, 403 when is_owner() is false, null when the caller is the owner. */
export async function requireOwner(
  req: Request,
  deps: OwnerDeps,
): Promise<Response | null> {
  const authorization = bearer(req);
  if (authorization === null) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }
  const forbidden = () => jsonResponse({ error: "forbidden" }, 403);
  let res: Response;
  try {
    res = await deps.fetch(`${deps.env("SUPABASE_URL")}/rest/v1/rpc/is_owner`, {
      method: "POST",
      headers: {
        apikey: deps.env("SUPABASE_ANON_KEY") ?? "",
        authorization,
        "content-type": "application/json",
      },
      body: "{}",
    });
  } catch {
    return forbidden();
  }
  if (!res.ok) return forbidden();
  let answer: unknown;
  try {
    answer = await res.json();
  } catch {
    return forbidden();
  }
  return answer === true ? null : forbidden();
}
