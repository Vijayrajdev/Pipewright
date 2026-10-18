import type { Metadata } from "next";
import { Workspace } from "@/components/workspace/Workspace";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Data Model Workspace" };

export default function WorkspacePage() {
  return (
    <>
      <PageHeader eyebrow="Many files, one data model" title="Data" accent="Model">
        Load several files. Pipewright finds the primary and foreign keys, draws the ER diagram, builds joins you can
        preview, and profiles every column. Everything runs in your browser.
      </PageHeader>
      <Workspace />
    </>
  );
}
