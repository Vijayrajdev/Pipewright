import type { Metadata } from "next";
import { Templates } from "@/components/Templates";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "SQL Templates" };

export default function TemplatesPage() {
  return (
    <>
      <PageHeader eyebrow="The boilerplate, already written" title="SQL" accent="Templates">
        Dedupe queries, MERGE upserts, SCD Type 2 loads, data quality checks and dbt tests, generated from your
        table&apos;s real columns. Runs locally and is free.
      </PageHeader>
      <Templates />
    </>
  );
}
