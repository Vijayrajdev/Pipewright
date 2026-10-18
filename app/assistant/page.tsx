import type { Metadata } from "next";
import { Assistant } from "@/components/Assistant";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Ask Pipewright" };

export default function AssistantPage() {
  return (
    <div>
      <PageHeader eyebrow="Hand off the groundwork" title="Ask" accent="Pipewright">
        Ask for SQL, merges, tests or pipeline code. Pipewright uses the table from the Schema Builder as context, so
        answers use your real column names.
      </PageHeader>
      <div className="max-w-4xl">
        <Assistant />
      </div>
    </div>
  );
}
