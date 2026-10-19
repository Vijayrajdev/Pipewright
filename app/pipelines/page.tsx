import type { Metadata } from "next";
import { PipelineDrafts } from "@/components/PipelineDrafts";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Pipeline Drafts" };

export default function PipelinesPage() {
  return (
    <>
      <PageHeader eyebrow="Orchestration, scaffolded" title="Pipeline" accent="Drafts">
        Describe the load in a few fields and get an Airflow 3 DAG or Dagster assets that land, stage, merge, check and
        hand off to dbt. Your current schema fills in the MERGE.
      </PageHeader>
      <PipelineDrafts />
    </>
  );
}
