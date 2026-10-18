import { z } from "zod";

export const CANONICAL_TYPES = [
  "string",
  "int",
  "float",
  "decimal",
  "bool",
  "date",
  "timestamp",
  "json",
  "bytes",
  "record",
] as const;

export type CanonicalType = (typeof CANONICAL_TYPES)[number];

export interface Field {
  name: string;
  type: CanonicalType;
  nullable: boolean;
  /** true when the column holds an array of `type` */
  repeated?: boolean;
  description?: string;
  pii?: boolean;
  /** child fields when type === "record" */
  fields?: Field[];
}

export interface TableSchema {
  name: string;
  dataset?: string;
  description?: string;
  fields: Field[];
  partitionBy?: string;
  clusterBy?: string[];
}

export const FieldSchema: z.ZodType<Field> = z.lazy(() =>
  z.object({
    name: z.string().min(1),
    type: z.enum(CANONICAL_TYPES),
    nullable: z.boolean(),
    repeated: z.boolean().optional(),
    description: z.string().optional(),
    pii: z.boolean().optional(),
    fields: z.array(FieldSchema).optional(),
  }),
);

export const TableSchemaSchema = z.object({
  name: z.string().min(1),
  dataset: z.string().optional(),
  description: z.string().optional(),
  fields: z.array(FieldSchema),
  partitionBy: z.string().optional(),
  clusterBy: z.array(z.string()).optional(),
});
