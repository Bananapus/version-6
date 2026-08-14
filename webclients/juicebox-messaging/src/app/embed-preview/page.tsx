import type { Metadata } from "next";
import { EmbedPreviewHarness } from "@/embed/EmbedPreviewHarness";

export const metadata: Metadata = {
  title: "Cross-origin embed protocol lab",
  description:
    "A local-only cross-origin harness for the messaging embed protocol and bounded semantic themes.",
};

export default function EmbedPreviewPage() {
  return <EmbedPreviewHarness />;
}
