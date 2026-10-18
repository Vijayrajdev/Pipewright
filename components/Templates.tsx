"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useCurrentSchema } from "@/lib/store";
import { DIALECTS, guessKeys, guessOrderBy, TEMPLATES, type SqlDialect } from "@/lib/templates";
import { CodeView } from "./CodeView";
import { Card, Tabs } from "./ui";

const select =
  "mt-1 block w-full border border-line bg-paper px-2.5 py-1.5 font-mono text-sm text-text focus:border-ink focus:outline-none";

export function Templates() {
  const [schema] = useCurrentSchema();
  const [templateId, setTemplateId] = useState(TEMPLATES[0].id);
  const [dialect, setDialect] = useState<SqlDialect>("bigquery");
  // null = "use the guess for the current schema"; set once the user picks
  const [keysChoice, setKeys] = useState<string[] | null>(null);
  const [orderChoice, setOrderBy] = useState<string | null>(null);

  const template = TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[0];
  const names = schema?.fields.map((f) => f.name) ?? [];
  const keys = (keysChoice ?? (schema ? guessKeys(schema) : [])).filter((k) => names.includes(k));
  const orderBy = orderChoice ?? (schema ? guessOrderBy(schema) : undefined);
  const orderOptions = schema?.fields.filter((f) => ["timestamp", "date", "int"].includes(f.type) && !f.repeated) ?? [];

  const code = useMemo(
    () => (schema ? template.render(schema, { dialect, keys, orderBy: orderBy || undefined }) : ""),
    [schema, template, dialect, keys, orderBy],
  );

  if (!schema) {
    return (
      <Card>
        <p className="text-sm text-muted">
          Templates are generated from a table schema.{" "}
          <Link href="/schema" className="text-ink underline">
            Build or load one in the Schema Builder
          </Link>{" "}
          first, then come back.
        </p>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <Card className="h-fit">
        <p className="mb-4 text-sm">
          Table <span className="font-mono text-ink">{schema.dataset ? `${schema.dataset}.` : ""}{schema.name}</span>
        </p>

        <label className="block text-xs text-muted">
          Dialect
          <select value={dialect} onChange={(e) => setDialect(e.target.value as SqlDialect)} className={select}>
            {DIALECTS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </label>

        {template.needs.orderBy && (
          <label className="mt-4 block text-xs text-muted">
            Version / freshness column
            <select value={orderBy ?? ""} onChange={(e) => setOrderBy(e.target.value)} className={select}>
              <option value="">None</option>
              {orderOptions.map((f) => (
                <option key={f.name}>{f.name}</option>
              ))}
            </select>
          </label>
        )}

        {template.needs.keys && (
          <fieldset className="mt-4">
            <legend className="text-xs text-muted">Key column(s)</legend>
            <div className="mt-1 max-h-64 space-y-0.5 overflow-y-auto rounded-md border border-line bg-paper p-2">
              {schema.fields
                .filter((f) => f.type !== "record" && !f.repeated)
                .map((f) => (
                  <label key={f.name} className="flex items-center gap-2 font-mono text-sm">
                    <input
                      type="checkbox"
                      className="accent-ink"
                      checked={keys.includes(f.name)}
                      onChange={(e) => setKeys(e.target.checked ? [...keys, f.name] : keys.filter((k) => k !== f.name))}
                    />
                    {f.name}
                  </label>
                ))}
            </div>
          </fieldset>
        )}
      </Card>

      <Card>
        <Tabs items={TEMPLATES.map((t) => ({ id: t.id, label: t.label }))} value={templateId} onChange={setTemplateId} />
        <p className="mb-3 text-sm text-muted">{template.blurb}</p>
        <CodeView code={code} filename={template.filename(schema, { dialect, keys, orderBy })} />
      </Card>
    </div>
  );
}
