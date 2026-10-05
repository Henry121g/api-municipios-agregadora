import { openapi } from "@/lib/api/openapi";

export function GET() {
  return Response.json(openapi, { headers: { "Cache-Control": "public, max-age=3600", "Access-Control-Allow-Origin": "*" } });
}
