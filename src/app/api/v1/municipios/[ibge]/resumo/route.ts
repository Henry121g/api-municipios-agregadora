import { handleResumo } from "@/lib/api/routes";

export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: RouteContext<"/api/v1/municipios/[ibge]/resumo">) {
  const { ibge } = await ctx.params;
  return handleResumo(request, ibge);
}
