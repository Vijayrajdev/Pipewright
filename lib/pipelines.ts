import type { TableSchema } from "@/lib/schema/types";
import { TEMPLATES, tableRef, type SqlDialect } from "@/lib/templates";

/*
 * Pipeline drafts: an Airflow 3 DAG or Dagster assets for a
 * land → stage → load → check → dbt flow, plus a cron explainer.
 * Everything is a reviewed starting point, not a deployable artefact.
 */

export type SourceKind = "files" | "database" | "api";
export type LoadMode = "append" | "merge" | "replace";

export interface PipelineSpec {
  /** target table name */
  name: string;
  dataset: string;
  source: SourceKind;
  /** files: a path with {ds}; database: schema.table; api: a URL */
  sourcePath: string;
  target: SqlDialect;
  mode: LoadMode;
  keys: string[];
  schedule: string;
  owner: string;
  retries: number;
  alertEmail?: string;
  dbt: boolean;
  checks: boolean;
  /** when known, the MERGE comes from the Upsert template with real columns */
  schema?: TableSchema;
}

export const SCHEDULE_PRESETS = [
  { label: "Hourly", cron: "0 * * * *" },
  { label: "Daily 06:00", cron: "0 6 * * *" },
  { label: "Weekdays 07:30", cron: "30 7 * * 1-5" },
  { label: "Weekly, Monday", cron: "0 5 * * 1" },
  { label: "Monthly, 1st", cron: "0 3 1 * *" },
];

const CONN: Record<SqlDialect, string> = {
  bigquery: "google_cloud_default",
  snowflake: "snowflake_default",
  postgres: "postgres_default",
  databricks: "databricks_default",
};

const ident = (s: string) => s.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^(\d)/, "_$1").toLowerCase() || "pipeline";
const schemaFor = (spec: PipelineSpec): TableSchema => ({ name: spec.name, dataset: spec.dataset || undefined, fields: spec.schema?.fields ?? [] });

/** Where the extract step lands files for the load step. */
function landingPath(spec: PipelineSpec): string {
  if (spec.source === "files") return spec.sourcePath.replace("{ds}", "{{ ds }}");
  const bucket = spec.target === "bigquery" ? "gs://my-landing-bucket" : spec.target === "snowflake" ? "@landing_stage" : "s3://my-landing-bucket";
  return `${bucket}/${spec.name}/{{ ds }}/`;
}

/** SQL that loads landed CSV files into the staging table. */
export function loadSql(spec: PipelineSpec): string {
  const staging = tableRef(schemaFor(spec), spec.target, "_staging");
  const path = landingPath(spec);
  switch (spec.target) {
    case "bigquery":
      return `LOAD DATA OVERWRITE ${staging}\nFROM FILES (format = 'CSV', skip_leading_rows = 1, uris = ['${path.replace(/\/$/, "")}${/\*|\.\w+$/.test(path) ? "" : "/*.csv"}'])`;
    case "snowflake":
      return `TRUNCATE TABLE IF EXISTS ${staging};\nCOPY INTO ${staging}\nFROM ${path.startsWith("@") ? path : `'${path}'`}\nFILE_FORMAT = (TYPE = CSV SKIP_HEADER = 1 FIELD_OPTIONALLY_ENCLOSED_BY = '"')`;
    case "databricks":
      return `COPY INTO ${staging}\nFROM '${path}'\nFILEFORMAT = CSV\nFORMAT_OPTIONS ('header' = 'true', 'inferSchema' = 'true')\nCOPY_OPTIONS ('force' = 'true')`;
    case "postgres":
      return `-- Postgres loads from the worker with COPY ... FROM STDIN (see load_staging)`;
  }
}

/** SQL that moves staging into the target table. */
export function transformSql(spec: PipelineSpec): string {
  const s = schemaFor(spec);
  const target = tableRef(s, spec.target);
  const staging = tableRef(s, spec.target, "_staging");
  if (spec.mode === "append") return `INSERT INTO ${target}\nSELECT * FROM ${staging}`;
  if (spec.mode === "replace") {
    return spec.target === "postgres"
      ? `BEGIN;\nTRUNCATE TABLE ${target};\nINSERT INTO ${target} SELECT * FROM ${staging};\nCOMMIT;`
      : `CREATE OR REPLACE TABLE ${target} AS\nSELECT * FROM ${staging}`;
  }
  if (spec.schema?.fields.length && spec.keys.length) {
    const upsert = TEMPLATES.find((t) => t.id === "upsert")!;
    return upsert.render(s, { dialect: spec.target, keys: spec.keys }).trim().replace(/;$/, "");
  }
  const on = (spec.keys.length ? spec.keys : ["id"]).map((k) => `t.${k} = s.${k}`).join(" AND ");
  return `-- Load a schema in the Schema Builder to get the full column list here.\nMERGE INTO ${target} AS t\nUSING ${staging} AS s\n  ON ${on}\nWHEN MATCHED THEN UPDATE SET /* col = s.col, ... */\nWHEN NOT MATCHED THEN INSERT ROW`;
}

const py = (sql: string, indent: string) => `"""\n${sql.split("\n").map((l) => (l ? indent + l : l)).join("\n")}\n${indent}"""`;

function extractBody(spec: PipelineSpec, indent: string): string {
  const i = indent;
  if (spec.source === "database") {
    return [
      `${i}# Incremental pull: rows changed during this run's data interval.`,
      `${i}from airflow.providers.postgres.hooks.postgres import PostgresHook`,
      `${i}hook = PostgresHook(postgres_conn_id="source_db")`,
      `${i}sql = f"""COPY (SELECT * FROM ${spec.sourcePath || "public.source_table"}`,
      `${i}          WHERE updated_at >= '{context["data_interval_start"]}'`,
      `${i}            AND updated_at <  '{context["data_interval_end"]}') TO STDOUT WITH CSV HEADER"""`,
      `${i}local = f"/tmp/${spec.name}_{context['ds']}.csv"`,
      `${i}hook.copy_expert(sql, local)`,
      `${i}# TODO: upload \`local\` to the landing path below (or skip if Postgres is the target)`,
      `${i}return local`,
    ].join("\n");
  }
  if (spec.source === "api") {
    return [
      `${i}# Page through the API and write one CSV for this run.`,
      `${i}import csv, requests`,
      `${i}rows, url = [], "${spec.sourcePath || "https://api.example.com/v1/items"}"`,
      `${i}params = {"updated_since": context["data_interval_start"].isoformat()}`,
      `${i}while url:`,
      `${i}    resp = requests.get(url, params=params, timeout=30)`,
      `${i}    resp.raise_for_status()`,
      `${i}    body = resp.json()`,
      `${i}    rows += body["data"]  # TODO: match the API's envelope`,
      `${i}    url, params = body.get("next"), None`,
      `${i}local = f"/tmp/${spec.name}_{context['ds']}.csv"`,
      `${i}if rows:`,
      `${i}    with open(local, "w", newline="") as fh:`,
      `${i}        writer = csv.DictWriter(fh, fieldnames=list(rows[0]))`,
      `${i}        writer.writeheader()`,
      `${i}        writer.writerows(rows)`,
      `${i}# TODO: upload \`local\` to the landing path below`,
      `${i}return local`,
    ].join("\n");
  }
  return `${i}# Files arrive at the landing path on their own; nothing to fetch.\n${i}return "${landingPath(spec)}"`;
}

/** Table-level checks for SQLTableCheckOperator (each statement must be true). */
function tableChecks(spec: PipelineSpec): [string, string][] {
  const checks: [string, string][] = [["has_rows", "COUNT(*) > 0"]];
  if (spec.keys.length === 1) checks.push(["unique_key", `COUNT(DISTINCT ${spec.keys[0]}) = COUNT(*)`]);
  for (const k of spec.keys) checks.push([`${k}_not_null`, `SUM(CASE WHEN ${k} IS NULL THEN 1 ELSE 0 END) = 0`]);
  return checks;
}

export function airflowDag(spec: PipelineSpec): string {
  const dagId = `${ident(spec.name)}_pipeline`;
  const conn = CONN[spec.target];
  const target = tableRef(schemaFor(spec), spec.target).replaceAll('"', '\\"');
  const imports = [
    "from datetime import timedelta",
    "",
    "import pendulum",
    "from airflow.sdk import dag, task",
    "from airflow.providers.common.sql.operators.sql import SQLExecuteQueryOperator",
  ];
  if (spec.checks) imports.push("from airflow.providers.common.sql.operators.sql import SQLTableCheckOperator");
  if (spec.dbt) imports.push("from airflow.providers.standard.operators.bash import BashOperator");
  if (spec.target === "postgres") imports.push("from airflow.providers.postgres.hooks.postgres import PostgresHook");

  const defaults = [
    `"owner": "${spec.owner || "data-eng"}"`,
    `"retries": ${spec.retries}`,
    `"retry_delay": timedelta(minutes=5)`,
    ...(spec.alertEmail ? [`"email": ["${spec.alertEmail}"]`, `"email_on_failure": True`] : []),
  ];

  const load =
    spec.target === "postgres"
      ? [
          "    @task",
          "    def load_staging(path: str) -> None:",
          `        hook = PostgresHook(postgres_conn_id="${conn}")`,
          `        hook.copy_expert("COPY ${tableRef(schemaFor(spec), "postgres", "_staging").replaceAll('"', '\\"')} FROM STDIN WITH CSV HEADER", path)`,
          "",
          "    staged = load_staging(landed)",
        ]
      : [
          "    staged = SQLExecuteQueryOperator(",
          `        task_id="load_staging",`,
          `        conn_id="${conn}",`,
          `        sql=${py(loadSql(spec), "            ")},`,
          "    )",
          "    landed >> staged",
        ];

  const body = [
    "    @task",
    "    def extract(**context) -> str:",
    `        """Land this run's data and return where it is."""`,
    extractBody(spec, "        "),
    "",
    "    landed = extract()",
    "",
    ...load,
    "",
    "    publish = SQLExecuteQueryOperator(",
    `        task_id="${spec.mode === "merge" ? "merge_into_target" : spec.mode === "append" ? "append_to_target" : "replace_target"}",`,
    `        conn_id="${conn}",`,
    `        sql=${py(transformSql(spec), "            ")},`,
    "    )",
    "    staged >> publish",
  ];
  let last = "publish";
  if (spec.checks) {
    body.push(
      "",
      "    checks = SQLTableCheckOperator(",
      `        task_id="quality_checks",`,
      `        conn_id="${conn}",`,
      `        table="${target}",`,
      "        checks={",
      ...tableChecks(spec).map(([k, v]) => `            "${k}": {"check_statement": "${v}"},`),
      "        },",
      "    )",
      `    ${last} >> checks`,
    );
    last = "checks";
  }
  if (spec.dbt) {
    body.push(
      "",
      "    dbt_build = BashOperator(",
      `        task_id="dbt_build",`,
      `        bash_command="cd /opt/dbt && dbt build --select ${ident(spec.name)}+",`,
      "    )",
      `    ${last} >> dbt_build`,
    );
  }

  return [
    `"""`,
    `${spec.name}: ${spec.source} → ${spec.target}, ${spec.mode}.`,
    `Drafted by Pipewright for Airflow 3. Review connections, paths and SQL before deploying.`,
    `"""`,
    ...imports,
    "",
    "",
    "@dag(",
    `    dag_id="${dagId}",`,
    `    schedule="${spec.schedule}",  # ${explainCron(spec.schedule)}`,
    `    start_date=pendulum.datetime(2026, 1, 1, tz="UTC"),`,
    "    catchup=False,",
    "    max_active_runs=1,",
    `    default_args={${defaults.join(", ")}},`,
    `    tags=["pipewright", "${ident(spec.name)}"],`,
    ")",
    `def ${dagId}():`,
    ...body,
    "",
    "",
    `${dagId}()`,
    "",
  ].join("\n");
}

export function dagsterAssets(spec: PipelineSpec): string {
  const n = ident(spec.name);
  const kind = { bigquery: "bigquery", snowflake: "snowflake", postgres: "postgres", databricks: "databricks" }[spec.target];
  const lines = [
    `"""`,
    `${spec.name}: ${spec.source} → ${spec.target}, ${spec.mode}. Drafted by Pipewright for Dagster.`,
    `"""`,
    "from datetime import datetime, timezone",
    "",
    "import dagster as dg",
    "",
    "",
    "class Warehouse(dg.ConfigurableResource):",
    `    """Thin wrapper over your ${spec.target} client. TODO: swap for the official dagster-${kind} resource."""`,
    "",
    "    def execute(self, sql: str) -> list[tuple]:",
    "        raise NotImplementedError",
    "",
    "",
    `@dg.asset(group_name="${n}", kinds={"${kind}"})`,
    `def ${n}_staging(context: dg.AssetExecutionContext, warehouse: Warehouse) -> None:`,
    `    """Land the source data and load it into ${n}_staging."""`,
    `    ds = datetime.now(timezone.utc).strftime("%Y-%m-%d")`,
    ...(spec.source === "files"
      ? ["    # files arrive at the landing path on their own"]
      : [`    # TODO: pull from ${spec.source === "api" ? spec.sourcePath || "the API" : spec.sourcePath || "the source database"} and write CSV files to ${landingPath(spec).replace("{{ ds }}", "{ds}")}`]),
    `    context.log.info(f"loading ${n} for {ds}")`,
    `    warehouse.execute(f${py(loadSql(spec).replaceAll("{{ ds }}", "{ds}"), "        ")})`,
    "",
    "",
    `@dg.asset(group_name="${n}", kinds={"${kind}"}, deps=[${n}_staging])`,
    `def ${n}(warehouse: Warehouse) -> None:`,
    `    """${spec.mode === "merge" ? "Merge" : spec.mode === "append" ? "Append" : "Replace"} the target from staging."""`,
    `    warehouse.execute(${py(transformSql(spec), "        ")})`,
  ];
  const checks: string[] = [];
  if (spec.checks) {
    for (const [k, v] of tableChecks(spec)) {
      checks.push(`${n}_${k}`);
      lines.push(
        "",
        "",
        `@dg.asset_check(asset=${n})`,
        `def ${n}_${k}(warehouse: Warehouse) -> dg.AssetCheckResult:`,
        `    [(ok,)] = warehouse.execute("SELECT ${v.replaceAll('"', '\\"')} FROM ${tableRef(schemaFor(spec), spec.target).replaceAll('"', '\\"')}")`,
        "    return dg.AssetCheckResult(passed=bool(ok))",
      );
    }
  }
  lines.push(
    "",
    "",
    `${n}_job = dg.define_asset_job("${n}_job", selection=[${n}_staging, ${n}])`,
    `${n}_schedule = dg.ScheduleDefinition(job=${n}_job, cron_schedule="${spec.schedule}", execution_timezone="UTC")  # ${explainCron(spec.schedule)}`,
    "",
    "defs = dg.Definitions(",
    `    assets=[${n}_staging, ${n}],`,
    ...(checks.length ? [`    asset_checks=[${checks.join(", ")}],`] : []),
    `    jobs=[${n}_job],`,
    `    schedules=[${n}_schedule],`,
    `    resources={"warehouse": Warehouse()},`,
    ")",
    "",
  );
  return lines.join("\n");
}

// ── cron ─────────────────────────────────────────────────────────────────

const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const RANGES: [number, number][] = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 6],
];

/** Expand one cron field into the sorted values it allows; null when invalid. */
function expand(field: string, [lo, hi]: [number, number]): number[] | null {
  const out = new Set<number>();
  for (const part of field.split(",")) {
    const m = /^(\*|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/.exec(part);
    if (!m) return null;
    const step = m[4] ? Number(m[4]) : 1;
    let a = lo;
    let b = hi;
    if (m[1] !== "*") {
      a = Number(m[2]);
      b = m[3] !== undefined ? Number(m[3]) : m[4] ? hi : a;
    }
    if (hi === 6 && b === 7) b = 6; // 7 = Sunday too
    if (step < 1 || a < lo || b > hi + (hi === 6 ? 1 : 0) || a > b) return null;
    for (let v = a; v <= b; v += step) out.add(hi === 6 && v === 7 ? 0 : v);
  }
  return [...out].sort((x, y) => x - y);
}

export interface ParsedCron {
  minutes: number[];
  hours: number[];
  days: number[];
  months: number[];
  weekdays: number[];
  /** day-of-month and day-of-week both restricted: cron matches either */
  dayOr: boolean;
}

export function parseCron(expr: string): ParsedCron | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const f = parts.map((p, i) => expand(p, RANGES[i]));
  if (f.some((x) => !x)) return null;
  const [minutes, hours, days, months, weekdays] = f as number[][];
  return { minutes, hours, days, months, weekdays, dayOr: parts[2] !== "*" && parts[4] !== "*" };
}

const pad = (n: number) => String(n).padStart(2, "0");
const list = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}` : xs[0]);

/** Plain-English reading of a cron expression (UTC). */
export function explainCron(expr: string): string {
  const c = parseCron(expr);
  if (!c) return "not a valid 5-field cron expression";
  const parts = expr.trim().split(/\s+/);
  let time: string;
  if (parts[0] === "*" && parts[1] === "*") time = "every minute";
  else if (parts[1] === "*") time = c.minutes.length === 1 ? `every hour at :${pad(c.minutes[0])}` : `every hour at minutes ${list(c.minutes.map((m) => `:${pad(m)}`))}`;
  else if (c.minutes.length * c.hours.length <= 6) time = `at ${list(c.hours.flatMap((h) => c.minutes.map((m) => `${pad(h)}:${pad(m)}`)))}`;
  else time = `${c.minutes.length} times an hour during ${c.hours.length} hours`;
  if (/^\*\/\d+$/.test(parts[0]) && parts[1] === "*") time = `every ${parts[0].slice(2)} minutes`;

  const day: string[] = [];
  if (parts[4] !== "*") day.push(parts[4] === "1-5" ? "on weekdays" : `on ${list(c.weekdays.map((d) => DOW[d]))}`);
  if (parts[2] !== "*") day.push(`on day ${list(c.days.map(String))} of the month`);
  const month = parts[3] !== "*" ? ` in ${list(c.months.map((m) => MONTHS[m - 1]))}` : "";
  return `${time}${day.length ? ` ${day.join(c.dayOr ? " or " : " ")}` : ""}${month} (UTC)`.replace(/^./, (x) => x.toUpperCase());
}

/** The next `n` run times after `from`, in UTC. */
export function nextRuns(expr: string, from: Date, n = 5): Date[] {
  const c = parseCron(expr);
  if (!c) return [];
  const runs: Date[] = [];
  const d = new Date(from.getTime());
  d.setUTCSeconds(0, 0);
  d.setUTCMinutes(d.getUTCMinutes() + 1);
  const dayOk = () => {
    const dom = c.days.includes(d.getUTCDate());
    const dow = c.weekdays.includes(d.getUTCDay());
    return c.dayOr ? dom || dow : dom && dow;
  };
  // jump month → day → hour → minute; bounded so impossible dates (Feb 30) end quickly
  for (let guard = 0; runs.length < n && guard < 100_000; guard++) {
    if (!c.months.includes(d.getUTCMonth() + 1)) {
      d.setUTCMonth(d.getUTCMonth() + 1, 1);
      d.setUTCHours(0, 0);
    } else if (!dayOk()) {
      d.setUTCDate(d.getUTCDate() + 1);
      d.setUTCHours(0, 0);
    } else if (!c.hours.includes(d.getUTCHours())) {
      d.setUTCHours(d.getUTCHours() + 1, 0);
    } else if (!c.minutes.includes(d.getUTCMinutes())) {
      d.setUTCMinutes(d.getUTCMinutes() + 1);
    } else {
      runs.push(new Date(d.getTime()));
      d.setUTCMinutes(d.getUTCMinutes() + 1);
    }
  }
  return runs;
}
