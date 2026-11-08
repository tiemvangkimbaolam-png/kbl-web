import { notFound, permanentRedirect } from "next/navigation";
import { legacyRoute } from "@/lib/kbl/legacy-routes.mjs";
export default async function LegacyPage({
  params,
  searchParams,
}: {
  params: Promise<{ legacy: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [p, q] = await Promise.all([params, searchParams]);
  const target = legacyRoute(p.legacy, q);
  if (!target) notFound();
  permanentRedirect(target);
}
