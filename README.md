<p align="center">
  <img src=".github/readme/banner.svg" alt="Pipewright: your junior data engineer" width="100%">
</p>

<p align="center">
  <img alt="Runs in your browser" src="https://img.shields.io/badge/runs_in-your_browser-226192?style=flat-square">
  <img alt="Account optional" src="https://img.shields.io/badge/account-optional_·_Google_sign--in-EF8557?style=flat-square">
  <img alt="AI optional" src="https://img.shields.io/badge/AI-your_key_or_no_key-1f2a36?style=flat-square">
  <img alt="Warehouses" src="https://img.shields.io/badge/BigQuery_·_Snowflake_·_Postgres_·_Databricks-EAE6DE?style=flat-square&labelColor=EAE6DE&color=EAE6DE">
  <img alt="MIT" src="https://img.shields.io/badge/license-MIT-226192?style=flat-square">
</p>

<h3 align="center"><i>Rules for the routine, AI for the rest, and you for the final call.</i></h3>

Pipewright does the groundwork that eats a data engineer's day. Drop in your files and it works out the schema,
the keys and how the tables relate, then drafts the DDL, SQL, tests, docs and pipelines that come next. You review and ship.

<br>

## 01 &nbsp;·&nbsp; What it does for you

| | Tool | Hand it… | Get back… |
|:-:|---|---|---|
| ⬡ | **Data Model** | Several CSV / TSV / JSON / NDJSON files, of any size | Primary and foreign keys, an ER diagram, orphan-key warnings, a join builder, model DDL, Mermaid, DBML, **dbt sources with tests** and a **data dictionary** |
| ▦ | **Schema Builder** | A data sample, or a BigQuery / Avro / `CREATE TABLE` schema | BigQuery JSON & DDL, Snowflake, Postgres, PySpark, Delta, Avro and JSON Schema, with drafted descriptions and PII flags |
| ⌘ | **SQL Templates** | The table you're working on | Dedupe, MERGE upsert, SCD Type 2, a quality query and dbt `schema.yml` in four dialects |
| ✓ | **Quality Checks** | Any table, ideally a profiled one | Checks for keys, nulls, ranges, allowed values, formats and freshness as **Great Expectations**, **Soda** or **SQL** |
| ⇢ | **Pipeline Drafts** | Source, warehouse, load mode and schedule | An **Airflow 3 DAG** or **Dagster assets**, with the cron schedule explained in plain English |
| ≠ | **Schema Diff** | Old and new versions of a schema | Breaking changes flagged, plus the `ALTER TABLE` statements |
| ⁂ | **Mock Data** | A schema and a seed | Realistic, repeatable rows as CSV, JSON, NDJSON or `INSERT`s |
| ✦ | **Ask Pipewright** | A question about your table | SQL, partitioning advice and dbt tests from an AI that knows your columns |

<br>

## 02 &nbsp;·&nbsp; A five-minute tour

1. Open **Data Model** and click **Load demo shop**. Four related tables appear with their keys and an ER diagram.
2. Hover a table in the diagram to trace its keys, and drag a header to rearrange it.
3. Open **Join Builder**, click **Auto-join related tables**, and copy the SQL or download the preview.
4. Open **Export** → **dbt sources + tests**. The tests come from what's really in the data, and the orphan key in `orders` is set to *warn*.
5. Visit **Quality Checks** and **Pipeline Drafts**. Both pick up the tables you just loaded.

> [!TIP]
> Press <kbd>⌘</kbd> <kbd>K</kbd> (or <kbd>Ctrl</kbd> <kbd>K</kbd>) anywhere to jump to any tool, docs section or action.

<br>

## 03 &nbsp;·&nbsp; Your data stays yours

- Files are read **by your browser** and never uploaded anywhere.
- Your work (schemas, the data model, recent items) is saved **on this device only**, so it's there when you come back.
- The only thing that ever leaves the page is an AI chat question with your table's *column names and types*. With a local model, not even that.
- Remove saved data with **Clear all** in the Data Model or the **×** next to each recent item.

**Want it on every device?** Sign in with Google (optional) and turn on **cloud sync**. Your schemas, recent work and data-model
structure follow you, while file rows, personal-data example values and AI keys still never leave your browser. Pause sync,
download everything or delete your account any time from the **Account** page.

<br>

## 04 &nbsp;·&nbsp; Big files, still fast

Pipewright is built for real-world exports, from kilobytes to many gigabytes:

| | |
|---|---|
| **Never freezes** | Files are read in the background in chunks, with progress per file and a Cancel button. Up to four load at once, and each table appears as soon as it's ready. |
| **Exact where it matters** | Row counts, empty values, min/max and key uniqueness cover **every row**. Key columns track up to **1,000,000** distinct values exactly. |
| **Light on memory** | A random **20,000-row** sample per table feeds top values and the join preview. Anything estimated is marked with ≈. |
| **Quick to come back** | Keys and relationships restore first when you reopen the page; sample rows follow in the background. |

> [!NOTE]
> A single JSON array has to be read whole (up to 300 MB). For bigger files use **NDJSON**, one object per line, which streams at any size.

<br>

## 05 &nbsp;·&nbsp; AI: your key, or no key at all

Everything above works with **no AI**. The chat and the ✨ descriptions button can run any of these ways. Pick one in **AI settings** in the app:

| | Needs | Where your question goes |
|---|---|---|
| 🔑 **Your own API key** | A key from Anthropic, OpenAI, Google, Mistral, Groq, DeepSeek, xAI, Together or OpenRouter | Straight from your browser to that provider, **never** to Pipewright's server |
| 🖥 **In-browser model** | Desktop Chrome or Edge (WebGPU), ≈1 GB download once | Nowhere: it runs on your device |
| 🦙 **[Ollama](https://ollama.com) on your computer** | Ollama + `ollama pull llama3.2` | Nowhere: it stays on your computer |
| 📋 **Copy a prompt** | Nothing | Into any AI chat you already use. Only column names and types, never rows |

**Keeping your key safe**
- Works with **Claude, GPT, Gemini, Mistral, Llama (via Groq or Together), DeepSeek, Grok**, or hundreds of models through one **OpenRouter** key. Save several and switch.
- It's checked with a free test call (listing your models), then kept **for this tab only** unless you tick *Remember on this device*.
- It's never sent to Pipewright's server, never put in links, never logged. **Forget key** removes it.
- The site's security policy only allows the page to talk to itself, those AI providers, your own computer and the model download hosts. Each key goes only to its own provider.
- Best practice: create a dedicated key with a **monthly spend limit**, and delete it when you're done.

> [!NOTE]
> Hosting Pipewright for a team? You can also give everyone AI by putting `ANTHROPIC_API_KEY` in `.env.local` on the server (see [`.env.example`](.env.example)).

<br>

## 06 &nbsp;·&nbsp; Run it yourself

You need [Node.js](https://nodejs.org) 20.9 or newer.

```bash
git clone https://github.com/Vijayrajdev/Pipewright.git
cd Pipewright
npm install
npm run dev        # then open http://localhost:3000
```

To serve it for a team, run `npm run build` then `npm start`, or deploy the folder to any Next.js host such as Vercel.
To switch on Google sign-in and cloud sync for your copy, follow [docs/cloud-setup.md](docs/cloud-setup.md).

<br>

## 07 &nbsp;·&nbsp; Questions

<details>
<summary><b>A relationship wasn't detected.</b></summary>
<br>
The referenced table needs a primary key and the names need to line up (<code>customer_id</code> ↔ <code>customers.customer_id</code> or <code>customers.id</code>). Set the key in <b>Tables &amp; Profile</b>, or add the relationship by hand in <b>Relationships</b>.
</details>

<details>
<summary><b>A column type was guessed wrong.</b></summary>
<br>
Open the table in the Schema Builder and change it in the grid. Dates are recognised in ISO format (<code>2024-01-31</code>).
</details>

<details>
<summary><b>The join preview is missing some matches.</b></summary>
<br>
For big files the preview joins the 20,000-row samples. The generated SQL is complete; run it in your warehouse for the full result.
</details>

<details>
<summary><b>My work disappeared.</b></summary>
<br>
Work is saved per browser and per device. Private windows and clearing site data remove it.
</details>

<details>
<summary><b>Is my API key safe?</b></summary>
<br>
It stays in your browser and is only ever sent to its own provider. Use a key with a spend limit, keep <i>Remember on this device</i> off on shared computers, and click <b>Forget key</b> when you're done.
</details>

<details>
<summary><b>Light or dark?</b></summary>
<br>
Pipewright opens in light mode. Use the sun/moon button in the top bar to switch; your choice is remembered.
</details>

For step-by-step guides to every tool, open **Docs** in the app.

<br>

---

<p align="center">
  <img src="app/icon.svg" width="44" alt=""><br>
  <b>PIPEWRIGHT</b><br>
  <sub>Built by <a href="https://vijayraj.vercel.app">Vijay Raj C K</a>, Senior Data Engineer · MIT licensed</sub>
</p>
