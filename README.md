# Pipewright

**Your junior data engineer.** Pipewright handles the repetitive groundwork so you can review and ship: table schema files, DDL in every dialect, boilerplate SQL, tests and docs.

- **Rules for the predictable work.** Type inference and format conversion run locally. No API calls, and the same input always gives the same output.
- **Claude for the open-ended work.** Column descriptions, PII flags, SQL, merges and pipeline code.

## Quick start

```bash
npm install
npm run dev                  # http://localhost:3000
```

**AI is optional.** Everything except the chat runs locally with no AI at all. For AI features:

- **Free and local:** install [Ollama](https://ollama.com), run `ollama pull llama3.2`, and reload. Pipewright detects it automatically.
- **Claude:** `cp .env.example .env.local` and set `ANTHROPIC_API_KEY`. When a key is set, Claude is used instead of Ollama.

## Tools

| Tool | What it does |
|---|---|
| **Data Model** (`/workspace`) | Load several CSV/TSV/JSON files at once. It detects primary and foreign keys (from names plus actual value overlap, and flags orphan keys), draws a draggable **ER diagram** (SVG download), and has a **join builder** that writes SQL in four dialects with a live in-browser preview and CSV download. It also profiles every column (nulls, distinct values, min/max, top values) and exports model DDL with PK/FK constraints, **Mermaid** or **DBML**. Use **Load demo shop** to try it. |
| **Schema Builder** (`/schema`) | Infers a schema from CSV/JSON samples, or converts BigQuery, Avro or DDL schemas. Exports BigQuery JSON and DDL, Snowflake, Postgres, Delta, PySpark, Avro and JSON Schema. Free auto-filled descriptions and PII flags. |
| **SQL Templates** (`/templates`) | Dedupe, MERGE upsert, SCD Type 2, data quality checks and dbt `schema.yml`. |
| **Schema Diff** (`/diff`) | Compares two schema versions, flags breaking changes, spots likely renames, and writes the `ALTER` statements for each dialect. |
| **Mock Data** (`/mock`) | Seeded, realistic rows from a schema as CSV, JSON, NDJSON or SQL INSERTs. |
| **Ask Pipewright** (`/assistant`) | Streaming chat with the current table as context, using Claude or a local Ollama model. |
| **Author** (`/author`) | About the author. Edit [lib/author.ts](lib/author.ts) to add your bio, focus areas, stack and links. |

## How it's built

Every input and output passes through one canonical model ([lib/schema/types.ts](lib/schema/types.ts)):

```
input text ──parsers──▶ TableSchema ──emitters──▶ BigQuery / Snowflake / Postgres / Spark / Delta / Avro / JSON Schema
```

- [lib/schema/infer.ts](lib/schema/infer.ts): type inference from sample rows. It widens types where needed (int→float, date→timestamp) and keeps values with leading zeros as strings.
- [lib/schema/parsers/](lib/schema/parsers/): auto-detects and parses each input format.
- [lib/schema/emitters/](lib/schema/emitters/): one file per output format; they're registered in `emitters/index.ts`.
- [lib/schema/typeMap.ts](lib/schema/typeMap.ts): maps canonical types to and from each dialect.
- [lib/rules/](lib/rules/): free, rule-based PII detection and description drafts.
- [lib/templates/](lib/templates/): the SQL and dbt template generators.
- [lib/workspace/](lib/workspace/): multi-file loading, profiling, key/relationship detection, the join engine and the ERD/DDL/Mermaid/DBML exports.
- [lib/diff.ts](lib/diff.ts) and [lib/mock.ts](lib/mock.ts): schema diff and migrations, and seeded mock data.
- [lib/ai/](lib/ai/): AI providers. Claude via the Anthropic SDK, or Ollama locally; `provider.ts` picks one. The routes are in [app/api/ai/](app/api/ai/).

**Adding an output format** means writing an `emit(schema): string` function and adding it to `OUTPUT_FORMATS`. The UI tab and download button come from that list automatically.

## Scripts

```bash
npm run dev     # dev server
npm test        # unit + snapshot tests for inference, parsers and emitters
npm run build   # production build
npm run lint
```

## Roadmap

Data Quality Suites (Great Expectations / Soda) · Pipeline Drafts (Airflow / Dagster) · dbt Scaffolder. Each of these already has a "coming soon" card in [lib/tools.ts](lib/tools.ts).

## Design

Editorial "paper" look: warm ivory `#EAE6DE`, deep editorial blue `#226192`, and coral orange `#EF8557`. It has crumpled-paper panels, extra-wide Archivo display type with outline lines, Instrument Serif italic accents, Geist for UI and JetBrains Mono for code.

- **Logo:** a pipe elbow with data flowing through it and a coral rose blooming from the outlet ([components/Logo.tsx](components/Logo.tsx)). The same artwork is the favicon ([app/icon.svg](app/icon.svg)).
- **Light / dark mode:** the toggle in the top bar switches themes with a circular View Transition reveal. Colours are role tokens in [app/globals.css](app/globals.css) (`ivory`, `ink`, `panel`, `cream`…) with dark values under `[data-theme="dark"]`. An inline script applies the saved or system theme before first paint, so there's no flash.
- **Motion:** masked text reveals, a self-drawing rose bouquet, route view transitions, scroll reveals, tilt cards, a custom cursor and a scroll progress bar. All motion is disabled for visitors who set `prefers-reduced-motion`.
