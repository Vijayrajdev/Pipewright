import type { Metadata } from "next";
import { QualityChecks } from "@/components/QualityChecks";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Data Quality Checks" };

export default function QualityPage() {
  return (
    <>
      <PageHeader eyebrow="Tests your data should pass" title="Quality" accent="Checks">
        Pick a table and Pipewright proposes checks from its columns: keys, nulls, ranges, allowed values, formats and
        freshness. Turn off what you don&apos;t want and take them as Great Expectations, Soda or SQL.
      </PageHeader>
      <QualityChecks />
    </>
  );
}
