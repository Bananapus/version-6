import type { Metadata } from "next";
import { headers } from "next/headers";
import { EmbedClientPreview } from "@/embed/EmbedClientPreview";
import { parseOwnedStylesheetNonce } from "@/theme/ownedStylesheet";

export const metadata: Metadata = {
  title: "Messaging embed frame preview",
  description:
    "A local-only frame document for testing the messaging embed protocol.",
};

export default async function EmbedPreviewFramePage() {
  const nonce = parseOwnedStylesheetNonce((await headers()).get("x-nonce"));
  return <EmbedClientPreview stylesheetNonce={nonce ?? undefined} />;
}
