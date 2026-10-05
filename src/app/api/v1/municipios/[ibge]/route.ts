import { handleMunicipio } from "@/lib/api/routes";

export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: RouteContext<"/api/v1/municipios/[ibge]">) {
  const { ibge } = await ctx.params;
  return handleMunicipio(request, ibge);
}
