import { handleFeriados } from "@/lib/api/routes";

export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: RouteContext<"/api/v1/feriados/[ano]">) {
  const { ano } = await ctx.params;
  return handleFeriados(request, ano);
}
