import { handleList } from "@/lib/api/routes";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handleList(request);
}
