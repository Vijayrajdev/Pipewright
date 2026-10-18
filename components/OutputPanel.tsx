"use client";

import { useMemo, useState } from "react";
import type { TableSchema } from "@/lib/schema/types";
import { OUTPUT_FORMATS } from "@/lib/schema/emitters";
import { CodeView } from "./CodeView";
import { Card, SectionTitle, Tabs } from "./ui";

export function OutputPanel({ schema }: { schema: TableSchema }) {
  const [activeId, setActiveId] = useState(OUTPUT_FORMATS[0].id);
  const format = OUTPUT_FORMATS.find((f) => f.id === activeId) ?? OUTPUT_FORMATS[0];

  const output = useMemo(() => {
    try {
      return format.emit(schema);
    } catch (err) {
      return `-- Could not generate: ${(err as Error).message}`;
    }
  }, [format, schema]);

  return (
    <Card>
      <SectionTitle index="03">Output</SectionTitle>
      <Tabs items={OUTPUT_FORMATS.map((f) => ({ id: f.id, label: f.label }))} value={activeId} onChange={setActiveId} />
      <CodeView code={output} filename={format.filename(schema)} />
    </Card>
  );
}
