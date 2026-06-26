import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { createClient } from "@supabase/supabase-js";

import {
  buildIngredientIndex,
  resolveIngredientId,
} from "../normalization/canonical-ingredient.js";
import type { Json, PubMedSeedDatabase } from "../pubmed/supabase-types.js";

type NodeInsert =
  PubMedSeedDatabase["public"]["Tables"]["kg_node"]["Insert"] & {
    id: string;
  };
type SynonymInsert =
  PubMedSeedDatabase["public"]["Tables"]["kg_node_synonym"]["Insert"];
type EdgeInsert =
  PubMedSeedDatabase["public"]["Tables"]["kg_edge"]["Insert"] & {
    id: string;
  };
type ChunkInsert =
  PubMedSeedDatabase["public"]["Tables"]["kg_chunk"]["Insert"] & {
    id: string;
  };

type RawRecord = Record<string, unknown>;

interface HealthCanadaDpdDataset {
  activeIngredients: RawRecord[];
  companies: RawRecord[];
  dosageForms: RawRecord[];
  drugProducts: RawRecord[];
  pharmaceuticalStandards: RawRecord[];
  routes: RawRecord[];
  schedules: RawRecord[];
  statuses: RawRecord[];
  therapeuticClasses: RawRecord[];
}

export interface HealthCanadaDpdIngestResult {
  chunkCount: number;
  dryRun: boolean;
  edgeCount: number;
  nodeCount: number;
  productCount: number;
  snapshotPath?: string;
  synonymCount: number;
}

const apiBaseUrl = "https://health-products.canada.ca/api/drug";
const sourceName = "HEALTH_CANADA_DPD";

const endpoints = {
  activeIngredients: "activeingredient",
  companies: "company",
  dosageForms: "form",
  drugProducts: "drugproduct",
  pharmaceuticalStandards: "pharmaceuticalstd",
  routes: "route",
  schedules: "schedule",
  statuses: "status",
  therapeuticClasses: "therapeuticclass",
} as const;

export async function fetchHealthCanadaDpdDataset(): Promise<HealthCanadaDpdDataset> {
  const entries = await Promise.all(
    Object.entries(endpoints).map(async ([key, endpoint]) => {
      const url = `${apiBaseUrl}/${endpoint}/?lang=en&type=json`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(
          `Health Canada DPD ${endpoint} request failed: ${response.status} ${response.statusText}`,
        );
      }

      const payload = (await response.json()) as unknown;

      if (!Array.isArray(payload)) {
        throw new Error(
          `Health Canada DPD ${endpoint} returned an unsupported JSON shape.`,
        );
      }

      return [key, payload.filter(isRecord)] as const;
    }),
  );

  return Object.fromEntries(entries) as unknown as HealthCanadaDpdDataset;
}

export async function ingestHealthCanadaDpdDataset(
  dataset: HealthCanadaDpdDataset,
  options: {
    dryRun: boolean;
    serviceRoleKey: string;
    snapshotPath?: string;
    supabaseUrl: string;
  },
): Promise<HealthCanadaDpdIngestResult> {
  if (options.snapshotPath) {
    await mkdir(dirname(options.snapshotPath), { recursive: true });
    await writeFile(options.snapshotPath, JSON.stringify(dataset, null, 2));
  }

  const client = options.dryRun
    ? null
    : createClient<PubMedSeedDatabase>(options.supabaseUrl, options.serviceRoleKey, {
        auth: { persistSession: false },
      });

  // Resolve ingredient ids to the already-consolidated canonical nodes (reuse
  // them) instead of minting source-prefixed duplicates. Empty index on dry-run.
  const ingredientIndex = client
    ? await buildIngredientIndex(
        client as unknown as Parameters<typeof buildIngredientIndex>[0],
      )
    : new Map<string, string>();

  const graph = buildGraph(dataset, ingredientIndex);

  if (options.dryRun || !client) {
    return {
      chunkCount: graph.chunks.length,
      dryRun: true,
      edgeCount: graph.edges.length,
      nodeCount: graph.nodes.length,
      productCount: dataset.drugProducts.length,
      ...(options.snapshotPath ? { snapshotPath: options.snapshotPath } : {}),
      synonymCount: graph.synonyms.length,
    };
  }

  for (const nodeBatch of chunk(graph.nodes, 500)) {
    const { error } = await client.from("kg_node").upsert(nodeBatch, {
      onConflict: "id",
    });

    if (error) {
      throw error;
    }
  }

  for (const synonymBatch of chunk(graph.synonyms, 500)) {
    const { error } = await client
      .from("kg_node_synonym")
      .upsert(synonymBatch, { onConflict: "node_id,synonym" });

    if (error) {
      throw error;
    }
  }

  for (const edgeBatch of chunk(graph.edges, 500)) {
    const { error } = await client.from("kg_edge").upsert(edgeBatch, {
      onConflict: "id",
    });

    if (error) {
      throw error;
    }
  }

  for (const chunkBatch of chunk(graph.chunks, 250)) {
    const { error } = await client.from("kg_chunk").upsert(chunkBatch, {
      onConflict: "id",
    });

    if (error) {
      throw error;
    }
  }

  return {
    chunkCount: graph.chunks.length,
    dryRun: false,
    edgeCount: graph.edges.length,
    nodeCount: graph.nodes.length,
    productCount: dataset.drugProducts.length,
    ...(options.snapshotPath ? { snapshotPath: options.snapshotPath } : {}),
    synonymCount: graph.synonyms.length,
  };
}

function buildGraph(
  dataset: HealthCanadaDpdDataset,
  ingredientIndex: Map<string, string>,
) {
  const ingredientsByDrugCode = groupByDrugCode(dataset.activeIngredients);
  const companiesByDrugCode = groupByDrugCode(dataset.companies);
  const dosageFormsByDrugCode = groupByDrugCode(dataset.dosageForms);
  const pharmaceuticalStandardsByDrugCode = groupByDrugCode(
    dataset.pharmaceuticalStandards,
  );
  const routesByDrugCode = groupByDrugCode(dataset.routes);
  const schedulesByDrugCode = groupByDrugCode(dataset.schedules);
  const statusesByDrugCode = groupByDrugCode(dataset.statuses);
  const therapeuticClassesByDrugCode = groupByDrugCode(
    dataset.therapeuticClasses,
  );
  const ingredientAtcByName = buildIngredientAtcByName({
    ingredientsByDrugCode,
    therapeuticClassesByDrugCode,
  });

  const nodes: NodeInsert[] = [];
  const synonyms: SynonymInsert[] = [];
  const edges: EdgeInsert[] = [];
  const chunks: ChunkInsert[] = [];

  for (const product of dataset.drugProducts) {
    const drugCode = readString(product, "drug_code");
    const brandName = readString(product, "brand_name");

    if (!drugCode || !brandName) {
      continue;
    }

    const din = normalizeDin(readString(product, "drug_identification_number"));
    const productId = deterministicUuid(`health-canada-dpd:drug:${drugCode}`);
    const productIngredients = ingredientsByDrugCode.get(drugCode) ?? [];
    const productCompanies = companiesByDrugCode.get(drugCode) ?? [];
    const productDosageForms = dosageFormsByDrugCode.get(drugCode) ?? [];
    const productRoutes = routesByDrugCode.get(drugCode) ?? [];
    const productSchedules = schedulesByDrugCode.get(drugCode) ?? [];
    const productStatuses = statusesByDrugCode.get(drugCode) ?? [];
    const productTherapeuticClasses =
      therapeuticClassesByDrugCode.get(drugCode) ?? [];
    const productStandards =
      pharmaceuticalStandardsByDrugCode.get(drugCode) ?? [];

    const ingredientNames = dedupe(
      productIngredients
        .map((ingredient) => readString(ingredient, "ingredient_name"))
        .filter((value): value is string => Boolean(value)),
    );
    const companyNames = dedupe(
      [
        readString(product, "company_name"),
        ...productCompanies.map((company) =>
          readString(company, "company_name"),
        ),
      ].filter((value): value is string => Boolean(value)),
    );
    const dosageFormNames = dedupe(
      productDosageForms
        .map((form) => readString(form, "pharmaceutical_form_name"))
        .filter((value): value is string => Boolean(value)),
    );
    const routeNames = dedupe(
      productRoutes
        .map((route) => readString(route, "route_of_administration_name"))
        .filter((value): value is string => Boolean(value)),
    );
    const scheduleNames = dedupe(
      productSchedules
        .map((schedule) => readString(schedule, "schedule_name"))
        .filter((value): value is string => Boolean(value)),
    );
    const statusNames = dedupe(
      productStatuses
        .map((status) => readString(status, "status"))
        .filter((value): value is string => Boolean(value)),
    );
    const atcCodes = dedupe(
      productTherapeuticClasses
        .map((therapeuticClass) =>
          readString(therapeuticClass, "tc_atc_number"),
        )
        .filter((value): value is string => Boolean(value)),
    );
    const therapeuticClassNames = dedupe(
      productTherapeuticClasses
        .map((therapeuticClass) => readString(therapeuticClass, "tc_atc"))
        .filter((value): value is string => Boolean(value)),
    );
    const ingredientNameSet = new Set(ingredientNames.map(normalize));
    const pharmaceuticalStandards = dedupe(
      productStandards
        .map((standard) => readString(standard, "pharmaceutical_std"))
        .filter((value): value is string => Boolean(value)),
    );
    const summary = buildProductSummary({
      atcCodes,
      brandName,
      companyNames,
      dosageFormNames,
      ingredientNames,
      routeNames,
      scheduleNames,
      statusNames,
      therapeuticClassNames,
      ...(din ? { din } : {}),
    });

    nodes.push({
      canonical_name: brandName,
      id: productId,
      identifiers: {
        ai_group_no: readString(product, "ai_group_no"),
        atc: atcCodes,
        brand_name: brandName,
        company_name: companyNames,
        descriptor: readString(product, "descriptor"),
        din: din ? [din] : [],
        dosage_form: dosageFormNames,
        drug_code: drugCode,
        drug_identification_number: din,
        health_canada_source: "DPD_API",
        ingredient_name: ingredientNames,
        number_of_ais: readString(product, "number_of_ais"),
        pharmaceutical_std: pharmaceuticalStandards,
        product_class_name: readString(product, "class_name"),
        route: routeNames,
        schedule: scheduleNames,
        source_coverage: "HEALTH_CANADA_ONLY_PENDING_CPS_MATCH",
        status: statusNames,
        status_history_date: productStatuses
          .map((status) => readString(status, "history_date"))
          .filter(Boolean),
        therapeutic_class: therapeuticClassNames,
      } as Json,
      source: sourceName,
      summary,
      type: "drug",
    });

    for (const synonym of dedupe([
      stripProductStrength(brandName),
      din,
      ...ingredientNames,
      ...companyNames,
    ])) {
      if (synonym && normalize(synonym) !== normalize(brandName)) {
        synonyms.push({
          node_id: productId,
          source: sourceName,
          synonym,
        });
      }
    }

    for (const ingredientName of ingredientNames) {
      const ingredientKey = normalize(ingredientName);
      // Resolve to the canonical (consolidated) node when one exists; otherwise a
      // source-agnostic, salt/ester-normalized id so the same moiety from any
      // source/run converges instead of duplicating.
      const ingredientId = resolveIngredientId(ingredientIndex, ingredientName);
      const ingredientAtc = ingredientAtcByName.get(ingredientKey);

      nodes.push({
        canonical_name: ingredientName,
        id: ingredientId,
        identifiers: {
          atc: ingredientAtc?.atcCodes ?? [],
          derived_from: "HEALTH_CANADA_DPD_ACTIVE_INGREDIENT",
          health_canada_atc_ingredient_name: ingredientAtc?.classNames ?? [],
          health_canada_ingredient_name: ingredientName,
        } as Json,
        source: sourceName,
        summary: null,
        type: "ingredient",
      });
      edges.push({
        id: deterministicUuid(
          `health-canada-dpd:edge:${productId}:has_ingredient:${ingredientId}`,
        ),
        relation: "has_ingredient",
        review_status: "published",
        source: sourceName,
        source_id: productId,
        target_id: ingredientId,
      });
    }

    productTherapeuticClasses.forEach((therapeuticClass, index) => {
      const atcCode = readString(therapeuticClass, "tc_atc_number");
      const className = readString(therapeuticClass, "tc_atc");

      if (!atcCode && !className) {
        return;
      }

      if (className && ingredientNameSet.has(normalize(className))) {
        return;
      }

      const classKey = atcCode ? `atc:${atcCode}` : normalize(className ?? "");
      const classId = deterministicUuid(`health-canada-dpd:class:${classKey}`);

      nodes.push({
        canonical_name: className ?? atcCode ?? "Unknown therapeutic class",
        id: classId,
        identifiers: {
          atc_code: atcCode,
          health_canada_therapeutic_class: className,
        } as Json,
        source: sourceName,
        summary: null,
        type: "drug_class",
      });
      edges.push({
        id: deterministicUuid(
          `health-canada-dpd:edge:${productId}:subclass_of:${classId}:${index}`,
        ),
        relation: "subclass_of",
        review_status: "published",
        source: sourceName,
        source_id: productId,
        target_id: classId,
      });
    });

    chunks.push({
      content: summary,
      id: deterministicUuid(`health-canada-dpd:chunk:${drugCode}:facts`),
      node_id: productId,
      section: "health_canada_dpd_product_listing",
      source: sourceName,
    });
  }

  return {
    chunks: dedupeById(chunks),
    edges: dedupeById(edges),
    nodes: dedupeById(nodes),
    synonyms: dedupeSynonyms(synonyms),
  };
}

function buildIngredientAtcByName({
  ingredientsByDrugCode,
  therapeuticClassesByDrugCode,
}: {
  ingredientsByDrugCode: Map<string, RawRecord[]>;
  therapeuticClassesByDrugCode: Map<string, RawRecord[]>;
}): Map<string, { atcCodes: string[]; classNames: string[] }> {
  const atcByIngredientName = new Map<
    string,
    { atcCodes: string[]; classNames: string[] }
  >();

  for (const [drugCode, ingredients] of ingredientsByDrugCode.entries()) {
    const therapeuticClasses = therapeuticClassesByDrugCode.get(drugCode) ?? [];
    const ingredientNames = dedupe(
      ingredients
        .map((ingredient) => readString(ingredient, "ingredient_name"))
        .filter((value): value is string => Boolean(value)),
    );
    const ingredientNameSet = new Set(ingredientNames.map(normalize));

    for (const therapeuticClass of therapeuticClasses) {
      const atcCode = readString(therapeuticClass, "tc_atc_number");
      const className = readString(therapeuticClass, "tc_atc");

      if (!className || !ingredientNameSet.has(normalize(className))) {
        continue;
      }

      const ingredientKey = normalize(className);
      const current = atcByIngredientName.get(ingredientKey) ?? {
        atcCodes: [],
        classNames: [],
      };

      if (atcCode) {
        current.atcCodes.push(atcCode);
      }

      current.classNames.push(className);
      atcByIngredientName.set(ingredientKey, current);
    }
  }

  return new Map(
    [...atcByIngredientName.entries()].map(([ingredientKey, value]) => [
      ingredientKey,
      {
        atcCodes: dedupe(value.atcCodes),
        classNames: dedupe(value.classNames),
      },
    ]),
  );
}

function buildProductSummary({
  atcCodes,
  brandName,
  companyNames,
  din,
  dosageFormNames,
  ingredientNames,
  routeNames,
  scheduleNames,
  statusNames,
  therapeuticClassNames,
}: {
  atcCodes: string[];
  brandName: string;
  companyNames: string[];
  din?: string;
  dosageFormNames: string[];
  ingredientNames: string[];
  routeNames: string[];
  scheduleNames: string[];
  statusNames: string[];
  therapeuticClassNames: string[];
}): string {
  return [
    `Health Canada DPD product listing: ${brandName}.`,
    din ? `DIN: ${din}.` : null,
    ingredientNames.length
      ? `Active ingredient(s): ${ingredientNames.join("; ")}.`
      : null,
    companyNames.length ? `Company: ${companyNames.join("; ")}.` : null,
    dosageFormNames.length
      ? `Dosage form: ${dosageFormNames.join("; ")}.`
      : null,
    routeNames.length ? `Route: ${routeNames.join("; ")}.` : null,
    scheduleNames.length ? `Schedule: ${scheduleNames.join("; ")}.` : null,
    statusNames.length ? `Status: ${statusNames.join("; ")}.` : null,
    atcCodes.length ? `ATC: ${atcCodes.join("; ")}.` : null,
    therapeuticClassNames.length
      ? `Therapeutic class: ${therapeuticClassNames.join("; ")}.`
      : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

function groupByDrugCode(records: RawRecord[]): Map<string, RawRecord[]> {
  const groups = new Map<string, RawRecord[]>();

  for (const record of records) {
    const drugCode = readString(record, "drug_code");

    if (!drugCode) {
      continue;
    }

    const group = groups.get(drugCode) ?? [];
    group.push(record);
    groups.set(drugCode, group);
  }

  return groups;
}

function readString(record: RawRecord, key: string): string | undefined {
  const value = record[key];

  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number") {
    return String(value);
  }

  return undefined;
}

function normalizeDin(value?: string): string | undefined {
  const digits = value?.replace(/\D/g, "");

  if (!digits) {
    return undefined;
  }

  return digits.padStart(8, "0");
}

function stripProductStrength(value: string): string {
  return value
    .replace(/\b\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|iu|unit|units|%)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function deterministicUuid(input: string): string {
  const hash = createHash("sha256").update(input).digest("hex");
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `5${hash.slice(13, 16)}`,
    `${((Number.parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80)
      .toString(16)
      .padStart(2, "0")}${hash.slice(18, 20)}`,
    hash.slice(20, 32),
  ].join("-");
}

function dedupe(values: Array<string | undefined>): string[] {
  return [
    ...new Map(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
        .map((value) => [normalize(value), value]),
    ).values(),
  ];
}

function dedupeById<T extends { id: string }>(values: readonly T[]): T[] {
  return [...new Map(values.map((value) => [value.id, value])).values()];
}

function dedupeSynonyms<T extends { node_id: string; synonym: string }>(
  values: readonly T[],
): T[] {
  return [
    ...new Map(
      values.map((value) => [
        `${value.node_id}:${normalize(value.synonym)}`,
        value,
      ]),
    ).values(),
  ];
}

function chunk<T>(values: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isRecord(value: unknown): value is RawRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
