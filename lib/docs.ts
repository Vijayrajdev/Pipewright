/** Sections of the /docs page. The page and the command palette both read this list. */
export const DOC_SECTIONS = [
  { id: "start", title: "Getting started", summary: "What Pipewright does and a five-minute tour." },
  { id: "privacy", title: "Your data stays with you", summary: "Files are read in your browser and never uploaded." },
  { id: "account", title: "Accounts and cloud sync", summary: "Optional: sign in with Google to keep your work on every device." },
  { id: "data-model", title: "Data Model workspace", summary: "Load files, find keys and relationships, diagram, join, export." },
  { id: "schema", title: "Schema Builder", summary: "Infer or convert a schema to BigQuery, Snowflake, Postgres, Spark, Avro and more." },
  { id: "templates", title: "SQL Templates", summary: "Dedupe, MERGE, SCD Type 2, quality query and dbt schema.yml." },
  { id: "quality", title: "Data Quality Checks", summary: "Great Expectations, Soda and SQL assertions from your data." },
  { id: "pipelines", title: "Pipeline Drafts", summary: "Airflow 3 DAGs and Dagster assets, with a cron explainer." },
  { id: "diff", title: "Schema Diff", summary: "Breaking changes and ALTER statements between two versions." },
  { id: "mock", title: "Mock Data", summary: "Seeded fake rows as CSV, JSON or INSERTs." },
  { id: "assistant", title: "AI: your key, or no key", summary: "Use your own Claude, GPT, Gemini or other key safely, run a free model, or copy a prompt." },
  { id: "large-files", title: "Working with large files", summary: "How big files stay fast, and the limits." },
  { id: "shortcuts", title: "Shortcuts and themes", summary: "⌘K search, light and dark mode." },
  { id: "faq", title: "FAQ and troubleshooting", summary: "Common questions and fixes." },
] as const;

export type DocSectionId = (typeof DOC_SECTIONS)[number]["id"];
