import type { Metadata } from "next";
import { MockData } from "@/components/MockData";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Mock Data" };

export default function MockPage() {
  return (
    <>
      <PageHeader eyebrow="Realistic rows for tests and demos" title="Mock" accent="Data">
        Fake but believable rows that match your schema, as CSV, JSON, NDJSON or SQL INSERTs. Seeded, so the same seed
        always gives the same data.
      </PageHeader>
      <MockData />
    </>
  );
}
