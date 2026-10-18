import type { Metadata } from "next";
import { SchemaDiff } from "@/components/SchemaDiff";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Schema Diff" };

export default function DiffPage() {
  return (
    <>
      <PageHeader eyebrow="Know what breaks before it ships" title="Schema" accent="Diff">
        Paste two versions of a table. Pipewright lists every change, flags the breaking ones and writes the ALTER
        statements for your warehouse.
      </PageHeader>
      <SchemaDiff />
    </>
  );
}
