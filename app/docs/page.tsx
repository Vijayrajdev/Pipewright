import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { DocsNav } from "@/components/DocsNav";
import { PageHeader, RuleLabel } from "@/components/ui";
import { DOC_SECTIONS, type DocSectionId } from "@/lib/docs";

export const metadata: Metadata = {
  title: "Docs",
  description: "How to use Pipewright: the Data Model workspace, Schema Builder, templates, quality checks, pipeline drafts and the AI assistant.",
};

function Section({ id, children }: { id: DocSectionId; children: ReactNode }) {
  const i = DOC_SECTIONS.findIndex((s) => s.id === id);
  const s = DOC_SECTIONS[i];
  return (
    <section id={id} className="scroll-mt-28 border-t border-line pt-10 pb-4">
      <p className="label text-coral-deep">{String(i + 1).padStart(2, "0")}</p>
      <h2 className="font-wide mt-1 text-3xl leading-none font-black text-ink uppercase md:text-4xl">{s.title}</h2>
      <p className="mt-3 font-serif text-xl text-muted italic">{s.summary}</p>
      <div className="docs-body mt-6 space-y-4">{children}</div>
    </section>
  );
}

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="space-y-3">
      {items.map((item, i) => (
        <li key={i} className="flex gap-4">
          <span className="font-wide grid h-7 w-7 shrink-0 place-items-center bg-ink text-xs font-black text-ivory">{i + 1}</span>
          <span className="pt-0.5">{item}</span>
        </li>
      ))}
    </ol>
  );
}

function Tip({ children, title = "Tip" }: { children: ReactNode; title?: string }) {
  return (
    <aside className="border-l-4 border-coral bg-coral-soft/40 px-4 py-3 text-sm">
      <span className="label mr-2 text-coral-deep">{title}</span>
      {children}
    </aside>
  );
}

const Kbd = ({ children }: { children: ReactNode }) => (
  <kbd className="border border-b-2 border-line bg-paper px-1.5 py-0.5 font-mono text-xs text-ink">{children}</kbd>
);

const Code = ({ children }: { children: ReactNode }) => <code className="bg-ink-soft/60 px-1 py-0.5 font-mono text-[0.85em] text-ink">{children}</code>;

const ToolLink = ({ href, children }: { href: string; children: ReactNode }) => (
  <Link href={href} className="font-semibold text-ink underline decoration-coral decoration-2 underline-offset-4 hover:text-coral-deep">
    {children}
  </Link>
);

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-sm">
        <thead>
          <tr className="label text-left text-muted">
            {head.map((h) => (
              <th key={h} className="border-b border-line px-2 py-2 font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line/60 align-top">
              {r.map((c, j) => (
                <td key={j} className={`px-2 py-2 ${j === 0 ? "font-mono text-ink" : ""}`}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DocsPage() {
  return (
    <>
      <PageHeader eyebrow="The manual" title="How to" accent="Use It">
        Everything Pipewright can do, and how to get the most from it. New here? Read <a href="#start" className="text-ink underline">Getting started</a>{" "}
        and you&apos;ll be productive in five minutes.
      </PageHeader>

      <div className="grid gap-10 lg:grid-cols-[230px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <DocsNav />
        </aside>

        <article className="max-w-3xl leading-relaxed">
          <Section id="start">
            <p>
              Pipewright is a junior data engineer in your browser. It does the groundwork that eats a senior engineer&apos;s day:
              working out table schemas, converting them between warehouses, mapping how tables relate, and drafting the SQL,
              tests and pipelines that come after. You review; it drafts.
            </p>
            <p>No account or setup is needed. A good first tour:</p>
            <Steps
              items={[
                <>Open the <ToolLink href="/workspace">Data Model</ToolLink> and click <b>Load demo shop</b>. Four related tables appear with their keys and an ER diagram.</>,
                <>Open the <b>Join Builder</b> tab and click <b>Auto-join related tables</b>. You get the SQL and a live preview of the joined rows.</>,
                <>In <b>Tables &amp; Profile</b>, pick <Code>orders</Code> and click <b>Open in Schema Builder</b> to convert it to BigQuery, Snowflake, Spark and more.</>,
                <>Try <ToolLink href="/quality">Quality Checks</ToolLink> and <ToolLink href="/pipelines">Pipeline Drafts</ToolLink>. Both pick up the tables you just loaded.</>,
              ]}
            />
            <Tip>
              Press <Kbd>⌘</Kbd> <Kbd>K</Kbd> (or <Kbd>Ctrl</Kbd> <Kbd>K</Kbd>) anywhere to jump to any tool or docs section.
            </Tip>
          </Section>

          <Section id="privacy">
            <p>
              Files you drop in are read <b>by your own browser</b> and never uploaded. Everything you build (schemas, the data
              model, recent work) is saved in your browser&apos;s local storage on this device only, so it&apos;s there when you come
              back and nobody else can see it.
            </p>
            <p>
              The one exception is the optional <a href="#assistant" className="text-ink underline">AI assistant</a>: when you
              chat, your question and the current table&apos;s <i>schema</i> (column names and types, not your rows) go to the AI model you
              chose. With your own key they go straight to that AI provider; with an in-browser model or Ollama they never leave your computer.
            </p>
            <Tip title="Clear it">Use <b>Clear all</b> in the Data Model, or the × buttons on Recent work, to remove saved data.</Tip>
          </Section>

          <Section id="account">
            <p>
              You never need an account. Without one, everything is saved in this browser, free. If you&apos;d like your work to follow
              you, click <b>Sign in</b> (the Google logo in the top bar) and turn on <b>cloud sync</b>.
            </p>
            <Table
              head={["", "Without an account", "Signed in with Google"]}
              rows={[
                ["Where work is saved", "This browser, this device", "This browser and your private cloud space"],
                ["Other devices", "No", "Yes: sign in there and it appears"],
                ["Survives clearing browser data", "No", "Yes"],
                ["Cost", "Free", "Free during early access"],
              ]}
            />
            <p>
              <b>What syncs:</b> the table open in the Schema Builder, recent work, and your data model&apos;s structure (tables, columns,
              keys, relationships, profile numbers, diagram layout). <b>What never leaves your browser:</b> the rows of your files, example
              values from personal-data columns such as emails, and your AI keys. On a new device, drop the files in again to preview joins.
            </p>
            <Tip title="Your data, your call">
              The <ToolLink href="/account">Account</ToolLink> page lets you pause sync, download everything as JSON, delete your cloud
              data, or delete your account.
            </Tip>
          </Section>

          <Section id="data-model">
            <p>
              The workspace turns a pile of files into a data model: tables, keys, relationships, a diagram and joins.
              It accepts <b>CSV, TSV, JSON and NDJSON</b>, several at once, of any size.
            </p>
            <Steps
              items={[
                <>Drag files onto the drop zone or click <b>Choose files</b>. Each file becomes a table named after the file (<Code>Order Items.csv</Code> → <Code>order_items</Code>). Tables appear one by one as they finish loading.</>,
                <>Pipewright finds each table&apos;s <b>primary key</b> from the column name and checks it really is unique and never empty, across the whole file.</>,
                <>It finds <b>relationships</b> by matching names like <Code>customer_id</Code> to another table&apos;s key, then checks how many values actually match. Below 100% means there are <i>orphan keys</i>: rows pointing at something that doesn&apos;t exist.</>,
                <>Set the <b>Dataset</b> name (top right of the drop zone) and it&apos;s used in every generated SQL statement.</>,
              ]}
            />
            <RuleLabel className="mt-8 mb-2 max-w-xs">The five tabs</RuleLabel>
            <Table
              head={["Tab", "What you can do"]}
              rows={[
                ["ER Diagram", "Drag tables by their blue header, hover a table to trace its keys, zoom, Auto layout, and Download SVG."],
                ["Tables & Profile", "Per-column nulls, distinct counts, min/max and top values. Rename a table, change its primary key, remove it, or open it in the Schema Builder."],
                ["Relationships", "Every detected link with its match rate. Remove wrong ones (restore them later) or add your own between any two columns."],
                ["Join Builder", "Pick a base table; Auto-join follows relationships outward. Change join types and columns, then copy the SQL in your dialect or download the preview as CSV."],
                ["Export", "The whole model as CREATE TABLE DDL with keys, Mermaid, DBML, a dbt sources file with tests and staging models, or a Markdown data dictionary."],
              ]}
            />
            <Tip>
              A number marked <b>≈</b> in the profile was counted from a sample rather than the whole file. Key columns are
              always counted exactly.
            </Tip>
          </Section>

          <Section id="schema">
            <p>
              Paste or drop a <b>sample</b> (CSV or JSON) and Pipewright infers each column&apos;s type, whether it can be
              empty, and nested records. Or paste an <b>existing schema</b> (BigQuery JSON, Avro <Code>.avsc</Code> or a{" "}
              <Code>CREATE TABLE</Code> statement) to convert it.
            </p>
            <p>
              Edit names, types, nullability and descriptions in the grid. <b>Auto-fill descriptions</b> drafts descriptions and flags
              columns that look like personal data (emails, phone numbers, addresses, birth dates). Every output updates as you
              type:
            </p>
            <Table
              head={["Output", "Use it for"]}
              rows={[
                ["BigQuery schema.json", <>bq mk / bq load <Code>--schema</Code></>],
                ["BigQuery, Snowflake, Postgres DDL", "CREATE TABLE in each dialect"],
                ["PySpark StructType · Delta DDL", "Spark jobs and Databricks tables"],
                ["Avro .avsc", "Kafka and schema registries"],
                ["JSON Schema", "API and event validation"],
              ]}
            />
            <Tip>Click <b>Save to recent</b> to keep the table in Recent work on the home page. The other tools use the table you have open here.</Tip>
          </Section>

          <Section id="templates">
            <p>
              Ready-to-run SQL written from the current table&apos;s real columns, in BigQuery, Snowflake, Postgres or
              Databricks. Pipewright guesses the <b>key</b> (<Code>id</Code>, <Code>&lt;table&gt;_id</Code>…) and the{" "}
              <b>version column</b> (<Code>updated_at</Code> beats <Code>created_at</Code>); change either on the left.
            </p>
            <Table
              head={["Template", "What it does"]}
              rows={[
                ["Deduplicate", "Keeps the latest row per key."],
                ["Upsert (MERGE)", "Loads table_staging into the table: updates changed rows, inserts new ones."],
                ["SCD Type 2", "Keeps full history in table_history: closes changed rows and opens new versions."],
                ["Data quality checks", "One query for row count, NOT NULL violations, duplicate keys and freshness."],
                ["dbt schema.yml", "Model docs and tests, with PII tags."],
              ]}
            />
          </Section>

          <Section id="quality">
            <p>
              Pick a table, from the Schema Builder or any table in the Data Model, and Pipewright proposes checks.
              Data Model tables give the best results because the checks use what&apos;s really in the data:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li><b>Keys</b> are unique and never empty.</li>
              <li>Columns with no empty values today stay that way (<b>not null</b>).</li>
              <li><b>Ranges</b>: amounts and counts can&apos;t be negative; rates sit between 0 and 1.</li>
              <li><b>Allowed values</b> for low-variety columns like <Code>status</Code> or <Code>country</Code>.</li>
              <li><b>Formats</b> such as email addresses.</li>
              <li><b>Time</b>: event dates aren&apos;t in the future, and new rows have landed within a day.</li>
            </ul>
            <p>
              Untick any check you don&apos;t want, then take them as <b>SQL assertions</b> (each query returns rows only when
              something is wrong), a <b>Great Expectations</b> suite, or <b>Soda</b> checks.
            </p>
          </Section>

          <Section id="pipelines">
            <p>Fill in a few fields and get an orchestration draft that lands the data, loads a staging table, publishes it, checks it and runs dbt:</p>
            <Steps
              items={[
                <>Choose a <b>source</b>: files in cloud storage (use <Code>{"{ds}"}</Code> for the run date), a database table, or a REST API.</>,
                <>Choose the <b>warehouse</b> and <b>load mode</b>: merge (upsert), append, or replace.</>,
                <>Set a <b>schedule</b>. Type any cron expression or click a preset; Pipewright explains it in plain English and lists the next five runs (UTC).</>,
                <>Switch between the <b>Airflow 3 DAG</b> and <b>Dagster assets</b> tabs, then copy or download.</>,
              ]}
            />
            <Tip>Open a table in the Schema Builder first and the MERGE will list every real column instead of a placeholder.</Tip>
          </Section>

          <Section id="diff">
            <p>
              Paste the old and the new version of a schema, in any format the Schema Builder reads. Pipewright lists every change and
              marks the <b>breaking</b> ones (removed columns, narrowed types, columns that became required), then writes the{" "}
              <Code>ALTER TABLE</Code> statements, with a warning where a warehouse can&apos;t change something in place.
            </p>
          </Section>

          <Section id="mock">
            <p>
              Generates believable fake rows for the current table: names look like names, emails like emails, IDs line up. Pick
              how many rows and a <b>seed</b>: the same seed always gives the same data, so tests stay repeatable. Download as
              CSV, JSON, NDJSON or SQL <Code>INSERT</Code>s.
            </p>
          </Section>

          <Section id="assistant">
            <p>
              <ToolLink href="/assistant">Ask Pipewright</ToolLink> answers questions about the current table: &ldquo;write a
              dedupe query&rdquo;, &ldquo;how should I partition this?&rdquo;, &ldquo;draft the dbt tests&rdquo;. It and the <b>✨</b> button in the
              Schema Builder are the only parts that use AI; every other tool works without it. Choose how AI runs in{" "}
              <b>AI settings</b> (the badge next to the chat, or <Kbd>⌘</Kbd> <Kbd>K</Kbd> → AI settings).
            </p>
            <Table
              head={["Option", "Needs", "Where your question goes"]}
              rows={[
                ["Your own API key", "A key from Anthropic, OpenAI, Google, Mistral, Groq, DeepSeek, xAI, Together or OpenRouter", "Straight from your browser to that provider. Never to Pipewright's server."],
                ["In-browser model", "A recent desktop Chrome or Edge (WebGPU)", "Nowhere. The model runs on your own device."],
                ["Ollama on your computer", "Ollama installed", "Nowhere. It stays on your computer."],
                ["No AI, copy a prompt", "Nothing", "Wherever you paste it, in an AI chat you already use."],
              ]}
            />
            <RuleLabel className="mt-8 mb-2 max-w-xs">Using your own key safely</RuleLabel>
            <p>
              Pick your provider: <b>Anthropic</b> (Claude), <b>OpenAI</b> (GPT), <b>Google</b> (Gemini), <b>Mistral</b>, <b>Groq</b>, <b>DeepSeek</b>,{" "}
              <b>xAI</b> (Grok), <b>Together AI</b>, or <b>OpenRouter</b>, whose single key reaches hundreds of models. You can save keys for several
              providers and switch between them.
            </p>
            <Steps
              items={[
                <>Click <b>Get a key</b> under your provider in AI settings to open its key page. Create a key with a monthly <b>spend limit</b>, and use it only for Pipewright.</>,
                <>Paste it under <b>Your own API key</b> and click <b>Check &amp; save key</b>. Pipewright makes a free test call (listing your models), then lets you pick a model.</>,
                <>By default the key is kept <b>for this tab only</b> and disappears when you close it. Tick <b>Remember on this device</b> only on your own computer.</>,
                <>Click <b>Forget key</b> at any time, or delete the key at your provider to switch it off everywhere.</>,
              ]}
            />
            <Tip title="Locked down">
              The site&apos;s security policy only lets the page send data to Pipewright itself, the listed AI providers, your own computer and the
              in-browser model&apos;s download hosts. Your key can&apos;t be sent anywhere else, even by mistake.
            </Tip>
            <RuleLabel className="mt-8 mb-2 max-w-xs">No key? Three safe ways</RuleLabel>
            <ul className="list-disc space-y-1 pl-5">
              <li><b>In-browser model:</b> click <b>Download &amp; start</b> (about 1 GB, once). Answers are simpler than Claude&apos;s, but fully private.</li>
              <li><b>Ollama:</b> install it, run <Code>ollama pull llama3.2</Code>, then click <b>Check</b>. On a hosted Pipewright, start it with <Code>OLLAMA_ORIGINS=&quot;https://the-site&quot; ollama serve</Code> so the page may reach it.</li>
              <li><b>Copy a prompt:</b> in the chat, type a question and click <b>Copy prompt</b>; in the Schema Builder, click <b>✨ Describe with any AI</b> and paste the answer back. Prompts contain column names and types, never your rows.</li>
            </ul>
            <p>The badge in the chat always shows which model is answering. Review generated SQL before running it.</p>
          </Section>

          <Section id="large-files">
            <p>Pipewright is built for real-world files, from kilobytes to many gigabytes:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Files are read <b>in the background</b> in small chunks, so the page never freezes. You see progress per file and can cancel.</li>
              <li><b>Counts, empty values, min/max and key checks</b> cover every row, not a sample.</li>
              <li>Up to <b>20,000 rows</b> per table are kept as a random sample for the profile&apos;s top values and the join preview.</li>
              <li>Key columns track up to <b>1,000,000</b> distinct values exactly; beyond that, numbers are marked as estimates.</li>
              <li>Up to four files load at the same time; each table appears as soon as it&apos;s ready.</li>
            </ul>
            <Tip title="Big JSON">
              A single JSON array must be read whole (limit 300 MB). For bigger files use <b>NDJSON</b>, one object per line,
              which streams at any size.
            </Tip>
          </Section>

          <Section id="shortcuts">
            <Table
              head={["Keys", "Action"]}
              rows={[
                [<><Kbd>⌘</Kbd> <Kbd>K</Kbd> / <Kbd>Ctrl</Kbd> <Kbd>K</Kbd></>, "Open search: jump to any tool, docs section or action"],
                [<Kbd key="esc">Esc</Kbd>, "Close search or the mobile menu"],
                [<><Kbd>↑</Kbd> <Kbd>↓</Kbd> <Kbd>Enter</Kbd></>, "Move through search results and open one"],
              ]}
            />
            <p>
              Pipewright opens in <b>light mode</b>. Use the sun/moon button in the top bar to switch to dark mode; your choice
              is remembered on this device.
            </p>
          </Section>

          <Section id="faq">
            <dl className="space-y-5">
              {[
                ["My relationship wasn't detected.", "Pipewright needs the referenced table to have a primary key and the names to line up (customer_id ↔ customers.customer_id or customers.id). Set the key in Tables & Profile, or add the relationship by hand in Relationships."],
                ["The wrong column was picked as the primary key.", "Choose the right one from the Primary key menu in Tables & Profile. Relationships update instantly."],
                ["A type was guessed wrong.", "Open the table in the Schema Builder and change the type in the grid. Dates need ISO format (2024-01-31) to be recognised."],
                ["My data disappeared.", "Data is saved per browser and per device. Private windows and clearing site data remove it."],
                ["The join preview is missing matches.", "For big files the preview joins the 20,000-row samples, so some matches fall outside them. The generated SQL is complete; run it in your warehouse."],
                ["The AI chat says no AI is set up.", "Open AI settings and pick an option: your own key, an in-browser model, or Ollama. Or use Copy prompt with any AI chat you already use."],
                ["Is my API key safe?", "It's kept in your browser (this tab only, unless you choose to remember it) and only ever sent to its own provider. Use a key with a spend limit, and Forget key when you're done."],
                ["The in-browser model won't start.", "It needs WebGPU (recent desktop Chrome or Edge) and a few GB of free graphics memory. Pick the smallest model, or use Ollama."],
              ].map(([q, a]) => (
                <div key={q}>
                  <dt className="font-semibold text-ink">{q}</dt>
                  <dd className="mt-1 text-muted">{a}</dd>
                </div>
              ))}
            </dl>
          </Section>
        </article>
      </div>
    </>
  );
}
