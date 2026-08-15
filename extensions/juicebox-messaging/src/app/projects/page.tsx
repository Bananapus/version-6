import type { Metadata } from "next";
import { ProjectPreviewApp } from "@/projects/ProjectPreviewApp";

export const metadata: Metadata = {
  title: "Juicebox v6 project preview · Juicebox Messaging",
  description:
    "Inspect candidate Juicebox v6 project metadata without granting messaging access.",
};

export default function ProjectsPage() {
  return <ProjectPreviewApp />;
}
