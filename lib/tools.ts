export interface Tool {
  href: string;
  title: string;
  /** short label for the top navigation */
  nav?: string;
  blurb: string;
  icon: string;
  ready: boolean;
  /** needs an Anthropic API key */
  ai?: boolean;
}

/** Every tool Pipewright offers; `ready: false` ones show as "coming soon". */
export const TOOLS: Tool[] = [
  { href: "/workspace", nav: "Data Model", title: "Data Model Workspace", blurb: "Drop in several CSV/JSON files. Detect keys and relationships, draw the ER diagram, build joins and profile every column.", icon: "⬡", ready: true },
  { href: "/schema", nav: "Schema", title: "Schema Builder", blurb: "Infer a table schema from a sample or convert one: BigQuery JSON, Snowflake, Postgres, Spark, Delta, Avro.", icon: "▦", ready: true },
  { href: "/templates", nav: "Templates", title: "SQL Templates", blurb: "Dedupe, MERGE upserts, SCD Type 2, data quality checks and dbt schema.yml, generated from your columns.", icon: "⌘", ready: true },
  { href: "/diff", nav: "Diff", title: "Schema Diff", blurb: "Compare two versions of a schema, flag breaking changes and write the ALTER statements.", icon: "≠", ready: true },
  { href: "/mock", nav: "Mock Data", title: "Mock Data", blurb: "Realistic fake rows from a schema, as CSV, JSON or SQL INSERTs, ready for tests and demos.", icon: "⁂", ready: true },
  { href: "/assistant", nav: "Ask", title: "Ask Pipewright", blurb: "Chat about the current table: SQL, merges, partitioning, dbt, pipelines. Free with a local model (Ollama), or use Claude.", icon: "✦", ready: true, ai: true },
  { href: "/quality", nav: "Quality", title: "Data Quality Checks", blurb: "Checks built from your columns and real value ranges, as Great Expectations, Soda or plain SQL assertions.", icon: "✓", ready: true },
  { href: "/pipelines", nav: "Pipelines", title: "Pipeline Drafts", blurb: "An Airflow 3 DAG or Dagster assets for land → load → merge → check → dbt, with a cron explainer.", icon: "⇢", ready: true },
];
