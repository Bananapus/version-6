import { BendystrawProjectPreviewAdapter } from "@/integrations/juicebox/bendystraw.server";
import { loadBendystrawPreviewConfig } from "@/integrations/juicebox/config.server";
import { createProjectResolveHandler } from "@/integrations/juicebox/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = createProjectResolveHandler({
  getAdapter: () =>
    new BendystrawProjectPreviewAdapter({
      config: loadBendystrawPreviewConfig(),
      fetchImpl: globalThis.fetch,
    }),
});

export const GET = handler;
export const POST = handler;
