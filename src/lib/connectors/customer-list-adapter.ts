import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { isProxy } from "node:util/types";

import {
  CUSTOMER_LIST_FIXTURE_ADAPTER,
  type ConnectorFixtureObservation,
} from "./adapter-contract";

const MAX_COLUMNS = 256;
const MAX_ROWS = 100_000;
const MAX_PAGE_SIZE = 250;
const MAX_LOCATOR_ROW = 1_000_000;
const CURSOR_PREFIX = "cl1";
const ABORTED_GETTER = Object.getOwnPropertyDescriptor(AbortSignal.prototype, "aborted")?.get;

export const CUSTOMER_LIST_PERMITTED_PURPOSES = Object.freeze([
  "account_identity",
  "dedupe",
  "link_candidate",
  "historical_outcome_learning",
] as const);

export type CustomerListPermittedPurpose = (typeof CUSTOMER_LIST_PERMITTED_PURPOSES)[number];

export type ApprovedCustomerListTableSnapshot = Readonly<{
  schemaVersion: 1;
  approvalState: "approved";
  tenantId: string;
  workspaceId: string | null;
  documentId: string;
  documentVersionId: string;
  snapshotVersion: string;
  sheet: string;
  headerRow: number;
  columns: readonly string[];
  rows: readonly (readonly unknown[])[];
  permittedPurposes: readonly CustomerListPermittedPurpose[];
}>;

export type CustomerListColumnConfiguration = Readonly<{
  schemaVersion: 1;
  columns: Readonly<{
    accountName: string;
    website: string | null;
    industry: string | null;
    tag: string | null;
  }>;
  maxPageSize: number;
}>;

export type CustomerListPageRequest = Readonly<{
  version: 1;
  runId: string;
  authorizedTenantId: string;
  authorizedWorkspaceId: string | null;
  tenantId: string;
  workspaceId: string | null;
  documentId: string;
  documentVersionId: string;
  snapshotVersion: string;
  permittedPurpose: CustomerListPermittedPurpose;
  operation: "normalize";
  cursor: string | null;
  pageSize: number;
  observedAt: string;
}>;

export type CustomerListRowLocator = Readonly<{
  kind: "row";
  sheet: string;
  row: number;
}>;

export type CustomerListCellLocator = Readonly<{
  kind: "cell";
  sheet: string;
  row: number;
  column: string;
  header: string;
}>;

type CustomerListCellField = "account_name" | "website" | "industry" | "tag";

export type CustomerListObservationEnvelope = Readonly<{
  recordType: "source_observation";
  canonicalAccount: false;
  origin: "tenant_upload";
  suppliedBy: "customer_provided";
  observation: ConnectorFixtureObservation;
  provenance: Readonly<{
    sourceCardId: "customer_list_csv_upload";
    tenantId: string;
    workspaceId: string | null;
    documentId: string;
    documentVersionId: string;
    snapshotVersion: string;
    permittedPurpose: CustomerListPermittedPurpose;
    row: CustomerListRowLocator;
    cells: Readonly<Partial<Record<CustomerListCellField, CustomerListCellLocator>>>;
  }>;
}>;

export type CustomerListIssue = Readonly<{
  field?: CustomerListCellField;
  row?: CustomerListRowLocator;
  cell?: CustomerListCellLocator;
}>;

export type CustomerListFailureReason =
  | "malformed_snapshot"
  | "snapshot_not_approved"
  | "malformed_config"
  | "missing_column"
  | "duplicate_column"
  | "empty_table"
  | "malformed_row"
  | "malformed_request"
  | "tenant_scope_mismatch"
  | "workspace_scope_mismatch"
  | "document_binding_mismatch"
  | "purpose_not_permitted"
  | "operation_not_permitted"
  | "page_bound_exceeded"
  | "malformed_cursor"
  | "cancelled";

export type CustomerListAdapterFailure = Readonly<{
  ok: false;
  status: "blocked" | "review_required" | "cancelled";
  code: "D015_MALFORMED" | "D015_SOURCE_POLICY_FAIL" | "D015_REVIEW_REQUIRED" | "D015_CANCELLED";
  reason: CustomerListFailureReason;
  issues: readonly CustomerListIssue[];
}>;

export type CustomerListPageSuccess = Readonly<{
  ok: true;
  code: "D015_PASS";
  status: "page_complete" | "complete";
  binding: Readonly<{
    tenantId: string;
    workspaceId: string | null;
    documentId: string;
    documentVersionId: string;
    snapshotVersion: string;
    permittedPurpose: CustomerListPermittedPurpose;
  }>;
  observations: readonly CustomerListObservationEnvelope[];
  nextCursor: string | null;
  complete: boolean;
  usage: Readonly<{
    providerRequests: 0;
    providerUnits: 0;
    providerCostMicros: 0;
  }>;
}>;

export type CustomerListPageResult = CustomerListPageSuccess | CustomerListAdapterFailure;

export interface CustomerListFixtureAdapter {
  readonly descriptor: typeof CUSTOMER_LIST_FIXTURE_ADAPTER;
  readonly capability: Readonly<{
    sourceCardId: "customer_list_csv_upload";
    executionMode: "fixture";
    transport: "none";
    storageAccess: "none";
    providerAccess: "none";
    maxPageSize: number;
  }>;
  readPage(request: unknown, options?: unknown): Promise<CustomerListPageResult>;
}

export type CustomerListFixtureAdapterCreationResult = Readonly<
  | { ok: true; code: "D015_PASS"; adapter: CustomerListFixtureAdapter }
  | CustomerListAdapterFailure
>;

type PlainRecord = Record<string, unknown>;
type ColumnConfig = Readonly<{
  accountName: string;
  website: string | null;
  industry: string | null;
  tag: string | null;
  maxPageSize: number;
}>;
type SnapshotMetadata = Readonly<{
  tenantId: string;
  workspaceId: string | null;
  documentId: string;
  documentVersionId: string;
  snapshotVersion: string;
  sheet: string;
  headerRow: number;
  columns: readonly string[];
  rawRows: readonly unknown[];
  permittedPurposes: readonly CustomerListPermittedPurpose[];
}>;
type MappedColumn = Readonly<{
  field: CustomerListCellField;
  header: string;
  index: number;
  column: string;
}>;
type SafeCell = string | typeof INVALID_CELL;
type SnapshotRow = readonly SafeCell[];

const INVALID_CELL = Symbol("invalid customer-list cell");
const PURPOSE_SET = new Set<string>(CUSTOMER_LIST_PERMITTED_PURPOSES);
const SNAPSHOT_FIELDS = [
  "schemaVersion",
  "approvalState",
  "tenantId",
  "workspaceId",
  "documentId",
  "documentVersionId",
  "snapshotVersion",
  "sheet",
  "headerRow",
  "columns",
  "rows",
  "permittedPurposes",
] as const;
const CONFIG_FIELDS = ["schemaVersion", "columns", "maxPageSize"] as const;
const CONFIG_COLUMN_FIELDS = ["accountName", "website", "industry", "tag"] as const;
const PAGE_REQUEST_FIELDS = [
  "version",
  "runId",
  "authorizedTenantId",
  "authorizedWorkspaceId",
  "tenantId",
  "workspaceId",
  "documentId",
  "documentVersionId",
  "snapshotVersion",
  "permittedPurpose",
  "operation",
  "cursor",
  "pageSize",
  "observedAt",
] as const;
const CURSOR_PAYLOAD_FIELDS = ["version", "fingerprint", "run", "permittedPurpose", "offset"] as const;

function exactRecord(value: unknown, fields: readonly string[]): PlainRecord | null {
  try {
    if (typeof value !== "object" || value === null || isProxy(value) || Array.isArray(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    const expected = new Set(fields);
    if (keys.length !== fields.length || keys.some((key) => typeof key !== "string" || !expected.has(key))) return null;
    const record: PlainRecord = {};
    for (const field of fields) {
      const descriptor = descriptors[field];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return null;
      record[field] = descriptor.value;
    }
    return record;
  } catch {
    return null;
  }
}

function exactArray(value: unknown, maximum: number): readonly unknown[] | null {
  try {
    if (!Array.isArray(value) || isProxy(value)) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const lengthDescriptor: PropertyDescriptor | undefined = Object.getOwnPropertyDescriptor(value, "length");
    const length = lengthDescriptor && "value" in lengthDescriptor ? lengthDescriptor.value : null;
    if (!Number.isSafeInteger(length) || (length as number) < 0 || (length as number) > maximum) return null;
    const keys = Reflect.ownKeys(descriptors);
    if (keys.length !== (length as number) + 1 || keys.some((key) => {
      if (key === "length") return false;
      if (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/u.test(key)) return true;
      const index = Number(key);
      return index < 0 || index >= (length as number) || String(index) !== key;
    })) return null;
    const result: unknown[] = [];
    for (let index = 0; index < (length as number); index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return null;
      result.push(descriptor.value);
    }
    return result;
  } catch {
    return null;
  }
}

function optionalHeader(value: unknown): string | null | undefined {
  if (value === null) return null;
  return boundedString(value, 255) ?? undefined;
}

function boundedString(value: unknown, maximum: number): string | null {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maximum
    && value.trim() === value
    && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)
    ? value
    : null;
}

function workspaceId(value: unknown): string | null | undefined {
  if (value === null) return null;
  return boundedString(value, 512) ?? undefined;
}

function safeInteger(value: unknown, minimum: number, maximum: number): number | null {
  return Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum
    ? value as number
    : null;
}

function canonicalTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value ? value : null;
}

function issue(
  input: Readonly<{
    field?: CustomerListCellField;
    row?: CustomerListRowLocator;
    cell?: CustomerListCellLocator;
  }> = {},
): CustomerListIssue {
  return Object.freeze({
    ...(input.field ? { field: input.field } : {}),
    ...(input.row ? { row: Object.freeze({ ...input.row }) } : {}),
    ...(input.cell ? { cell: Object.freeze({ ...input.cell }) } : {}),
  });
}

function failed(
  status: CustomerListAdapterFailure["status"],
  code: CustomerListAdapterFailure["code"],
  reason: CustomerListFailureReason,
  issues: readonly CustomerListIssue[] = [],
): CustomerListAdapterFailure {
  return Object.freeze({ ok: false, status, code, reason, issues: Object.freeze([...issues]) });
}

function parseConfig(value: unknown): ColumnConfig | null {
  const config = exactRecord(value, CONFIG_FIELDS);
  const columns = config && exactRecord(config.columns, CONFIG_COLUMN_FIELDS);
  const maxPageSize = config && safeInteger(config.maxPageSize, 1, MAX_PAGE_SIZE);
  if (!config || !columns || config.schemaVersion !== 1 || maxPageSize === null) return null;
  const accountName = boundedString(columns.accountName, 255);
  const website = optionalHeader(columns.website);
  const industry = optionalHeader(columns.industry);
  const tag = optionalHeader(columns.tag);
  if (!accountName || website === undefined || industry === undefined || tag === undefined) return null;
  return Object.freeze({ accountName, website, industry, tag, maxPageSize });
}

function parseSnapshot(value: unknown):
  | Readonly<{ ok: true; snapshot: SnapshotMetadata }>
  | Readonly<{ ok: false; failure: CustomerListAdapterFailure }> {
  const record = exactRecord(value, SNAPSHOT_FIELDS);
  if (!record || record.schemaVersion !== 1) {
    return { ok: false, failure: failed("blocked", "D015_MALFORMED", "malformed_snapshot") };
  }
  const tenantId = boundedString(record.tenantId, 512);
  const parsedWorkspaceId = workspaceId(record.workspaceId);
  const documentId = boundedString(record.documentId, 512);
  const documentVersionId = boundedString(record.documentVersionId, 512);
  const snapshotVersion = boundedString(record.snapshotVersion, 128);
  const sheet = boundedString(record.sheet, 255);
  const headerRow = safeInteger(record.headerRow, 1, MAX_LOCATOR_ROW);
  const rawColumns = exactArray(record.columns, MAX_COLUMNS);
  const rawRows = exactArray(record.rows, MAX_ROWS);
  const rawPurposes = exactArray(record.permittedPurposes, CUSTOMER_LIST_PERMITTED_PURPOSES.length);
  if (!tenantId || parsedWorkspaceId === undefined || !documentId || !documentVersionId || !snapshotVersion
    || !sheet || headerRow === null || !rawColumns?.length || !rawRows || !rawPurposes) {
    return { ok: false, failure: failed("blocked", "D015_MALFORMED", "malformed_snapshot") };
  }
  if (record.approvalState !== "approved") {
    return { ok: false, failure: failed("blocked", "D015_SOURCE_POLICY_FAIL", "snapshot_not_approved") };
  }

  const columns: string[] = [];
  for (const rawColumn of rawColumns) {
    const column = boundedString(rawColumn, 255);
    if (!column) return { ok: false, failure: failed("blocked", "D015_MALFORMED", "malformed_snapshot") };
    columns.push(column);
  }
  if (new Set(columns).size !== columns.length) {
    return { ok: false, failure: failed("review_required", "D015_REVIEW_REQUIRED", "duplicate_column") };
  }

  const purposes: CustomerListPermittedPurpose[] = [];
  for (const rawPurpose of rawPurposes) {
    if (typeof rawPurpose !== "string" || !PURPOSE_SET.has(rawPurpose) || purposes.includes(rawPurpose as CustomerListPermittedPurpose)) {
      return { ok: false, failure: failed("blocked", "D015_SOURCE_POLICY_FAIL", "purpose_not_permitted") };
    }
    purposes.push(rawPurpose as CustomerListPermittedPurpose);
  }
  if (purposes.length === 0) {
    return { ok: false, failure: failed("blocked", "D015_SOURCE_POLICY_FAIL", "purpose_not_permitted") };
  }
  if (headerRow + rawRows.length > MAX_LOCATOR_ROW) {
    return { ok: false, failure: failed("blocked", "D015_MALFORMED", "malformed_snapshot") };
  }
  return {
    ok: true,
    snapshot: Object.freeze({
      tenantId,
      workspaceId: parsedWorkspaceId,
      documentId,
      documentVersionId,
      snapshotVersion,
      sheet,
      headerRow,
      columns: Object.freeze(columns),
      rawRows: Object.freeze([...rawRows]),
      permittedPurposes: Object.freeze(purposes),
    }),
  };
}

function columnLabel(index: number): string {
  let value = index + 1;
  let label = "";
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

function mappedColumns(
  headers: readonly string[],
  config: ColumnConfig,
): readonly MappedColumn[] | CustomerListAdapterFailure {
  const requested = [
    ["account_name", config.accountName],
    ["website", config.website],
    ["industry", config.industry],
    ["tag", config.tag],
  ] as const;
  const selected = requested.filter((entry): entry is readonly [CustomerListCellField, string] => entry[1] !== null);
  if (new Set(selected.map(([, header]) => header)).size !== selected.length) {
    return failed("review_required", "D015_REVIEW_REQUIRED", "duplicate_column");
  }

  const result: MappedColumn[] = [];
  const missing: CustomerListIssue[] = [];
  for (const [field, header] of selected) {
    const index = headers.indexOf(header);
    if (index < 0) {
      missing.push(issue({ field }));
      continue;
    }
    result.push(Object.freeze({ field, header, index, column: columnLabel(index) }));
  }
  return missing.length
    ? failed("review_required", "D015_REVIEW_REQUIRED", "missing_column", missing)
    : Object.freeze(result);
}

function snapshotRows(
  rawRows: readonly unknown[],
  columnCount: number,
  selectedColumns: readonly MappedColumn[],
  sheet: string,
  headerRow: number,
): readonly SnapshotRow[] | CustomerListAdapterFailure {
  if (rawRows.length === 0) {
    return failed("review_required", "D015_REVIEW_REQUIRED", "empty_table");
  }
  const rows: SnapshotRow[] = [];
  for (let index = 0; index < rawRows.length; index += 1) {
    const rawRow = exactArray(rawRows[index], MAX_COLUMNS);
    if (!rawRow || rawRow.length !== columnCount) {
      return failed("review_required", "D015_REVIEW_REQUIRED", "malformed_row", [
        issue({ row: Object.freeze({ kind: "row", sheet, row: headerRow + index + 1 }) }),
      ]);
    }
    const selected: SafeCell[] = [];
    for (const column of selectedColumns) {
      const value = rawRow[column.index];
      selected.push(typeof value === "string" ? value : INVALID_CELL);
    }
    rows.push(Object.freeze(selected));
  }
  return Object.freeze(rows);
}

function isAdapterFailure(
  value: CustomerListAdapterFailure | readonly unknown[],
): value is CustomerListAdapterFailure {
  return !Array.isArray(value);
}

function fingerprint(
  snapshot: SnapshotMetadata,
  config: ColumnConfig,
  selectedColumns: readonly MappedColumn[],
  rows: readonly SnapshotRow[],
): string {
  const hash = createHash("sha256");
  const parts = [
    snapshot.tenantId,
    snapshot.workspaceId ?? "<tenant-wide>",
    snapshot.documentId,
    snapshot.documentVersionId,
    snapshot.snapshotVersion,
    snapshot.sheet,
    String(snapshot.headerRow),
    String(config.maxPageSize),
  ];
  for (const part of parts) hash.update(`${part.length}:${part}|`, "utf8");
  for (const purpose of snapshot.permittedPurposes) hash.update(`p${purpose.length}:${purpose}|`, "utf8");
  for (const column of selectedColumns) {
    hash.update(`c${column.field.length}:${column.field}${column.header.length}:${column.header}${column.index}|`, "utf8");
  }
  for (const row of rows) {
    hash.update("r|", "utf8");
    for (const cell of row) {
      if (cell === INVALID_CELL) hash.update("invalid|", "utf8");
      else hash.update(`s${cell.length}:${cell}|`, "utf8");
    }
  }
  return hash.digest("hex");
}

function parsePageRequest(value: unknown): CustomerListPageRequest | null {
  const record = exactRecord(value, PAGE_REQUEST_FIELDS);
  if (!record || record.version !== 1) return null;
  const runId = boundedString(record.runId, 512);
  const authorizedTenantId = boundedString(record.authorizedTenantId, 512);
  const authorizedWorkspaceId = workspaceId(record.authorizedWorkspaceId);
  const tenantId = boundedString(record.tenantId, 512);
  const parsedWorkspaceId = workspaceId(record.workspaceId);
  const documentId = boundedString(record.documentId, 512);
  const documentVersionId = boundedString(record.documentVersionId, 512);
  const snapshotVersion = boundedString(record.snapshotVersion, 128);
  const purpose = boundedString(record.permittedPurpose, 128);
  const operation = boundedString(record.operation, 128);
  const cursor = record.cursor === null ? null : boundedString(record.cursor, 512);
  const pageSize = safeInteger(record.pageSize, 1, MAX_PAGE_SIZE);
  const observedAt = canonicalTimestamp(record.observedAt);
  if (!runId || !authorizedTenantId || authorizedWorkspaceId === undefined || !tenantId
    || parsedWorkspaceId === undefined || !documentId || !documentVersionId || !snapshotVersion
    || !purpose || !operation || cursor === undefined || pageSize === null || !observedAt) return null;
  return Object.freeze({
    version: 1,
    runId,
    authorizedTenantId,
    authorizedWorkspaceId,
    tenantId,
    workspaceId: parsedWorkspaceId,
    documentId,
    documentVersionId,
    snapshotVersion,
    permittedPurpose: purpose as CustomerListPermittedPurpose,
    operation: operation as "normalize",
    cursor,
    pageSize,
    observedAt,
  });
}

function safeAbortSignal(value: unknown): AbortSignal | null {
  try {
    if (typeof value !== "object" || value === null || isProxy(value)) return null;
    if (!(value instanceof AbortSignal) || Object.getPrototypeOf(value) !== AbortSignal.prototype
      || Reflect.ownKeys(Object.getOwnPropertyDescriptors(value)).some((key) => typeof key === "string")
      || !ABORTED_GETTER) return null;
    ABORTED_GETTER.call(value);
    return value;
  } catch {
    return null;
  }
}

function parseSignal(options: unknown): AbortSignal | null | undefined {
  if (options === undefined) return undefined;
  const record = exactRecord(options, ["signal"]);
  return record ? safeAbortSignal(record.signal) : null;
}

function isAborted(signal: AbortSignal): boolean {
  try {
    return ABORTED_GETTER?.call(signal) === true;
  } catch {
    return true;
  }
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function runFingerprint(adapterFingerprint: string, runId: string): string {
  return createHash("sha256").update(`${adapterFingerprint}:${runId}`, "utf8").digest("hex").slice(0, 16);
}

function cursorMac(adapterFingerprint: string, encodedPayload: string): Buffer {
  return createHmac("sha256", Buffer.from(adapterFingerprint, "hex"))
    .update(`${CURSOR_PREFIX}.${encodedPayload}`, "utf8")
    .digest();
}

function encodeCursor(
  adapterFingerprint: string,
  runId: string,
  permittedPurpose: CustomerListPermittedPurpose,
  offset: number,
): string {
  const encodedPayload = Buffer.from(JSON.stringify({
    version: 1,
    fingerprint: adapterFingerprint.slice(0, 32),
    run: runFingerprint(adapterFingerprint, runId),
    permittedPurpose,
    offset,
  }), "utf8").toString("base64url");
  return `${CURSOR_PREFIX}.${encodedPayload}.${cursorMac(adapterFingerprint, encodedPayload).toString("base64url")}`;
}

function decodeCursor(
  cursor: string | null,
  adapterFingerprint: string,
  runId: string,
  permittedPurpose: CustomerListPermittedPurpose,
  rowCount: number,
): number | null {
  if (cursor === null) return 0;
  const parts = cursor.split(".");
  if (parts.length !== 3 || parts[0] !== CURSOR_PREFIX
    || !/^[A-Za-z0-9_-]+$/u.test(parts[1]) || !/^[A-Za-z0-9_-]{43}$/u.test(parts[2])) return null;
  try {
    const suppliedMac = Buffer.from(parts[2], "base64url");
    const expectedMac = cursorMac(adapterFingerprint, parts[1]);
    if (suppliedMac.toString("base64url") !== parts[2]
      || suppliedMac.length !== expectedMac.length
      || !timingSafeEqual(suppliedMac, expectedMac)) return null;
    const decodedPayload = Buffer.from(parts[1], "base64url");
    if (decodedPayload.toString("base64url") !== parts[1]) return null;
    const payload = exactRecord(JSON.parse(decodedPayload.toString("utf8")) as unknown, CURSOR_PAYLOAD_FIELDS);
    const offset = payload && safeInteger(payload.offset, 1, rowCount - 1);
    return payload
      && payload.version === 1
      && payload.fingerprint === adapterFingerprint.slice(0, 32)
      && payload.run === runFingerprint(adapterFingerprint, runId)
      && payload.permittedPurpose === permittedPurpose
      && offset !== null
      ? offset
      : null;
  } catch {
    return null;
  }
}

function normalizedText(value: SafeCell, maximum: number, optional: boolean): string | null | undefined {
  if (value === INVALID_CELL) return null;
  const normalized = value.trim().replace(/\s+/gu, " ");
  if (normalized.length === 0) return optional ? undefined : null;
  if (normalized.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(normalized)) return null;
  return normalized;
}

function normalizedWebsite(value: SafeCell): string | null | undefined {
  const normalized = normalizedText(value, 2_048, true);
  if (normalized === null || normalized === undefined) return normalized;
  try {
    const url = new URL(normalized);
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function locatorFor(
  snapshot: SnapshotMetadata,
  column: MappedColumn,
  rowNumber: number,
): CustomerListCellLocator {
  return Object.freeze({
    kind: "cell",
    sheet: snapshot.sheet,
    row: rowNumber,
    column: column.column,
    header: column.header,
  });
}

function normalizeRow(
  row: SnapshotRow,
  rowIndex: number,
  snapshot: SnapshotMetadata,
  columns: readonly MappedColumn[],
  request: CustomerListPageRequest,
): CustomerListObservationEnvelope | CustomerListAdapterFailure {
  const rowNumber = snapshot.headerRow + rowIndex + 1;
  const rowLocator = Object.freeze({ kind: "row", sheet: snapshot.sheet, row: rowNumber }) as CustomerListRowLocator;
  const values = new Map<CustomerListCellField, SafeCell>();
  columns.forEach((column, index) => values.set(column.field, row[index]));
  const fields: Record<string, string> = {};
  const cellLocators: Partial<Record<CustomerListCellField, CustomerListCellLocator>> = {};

  for (const column of columns) {
    const raw = values.get(column.field) ?? INVALID_CELL;
    const normalized = column.field === "website"
      ? normalizedWebsite(raw)
      : normalizedText(raw, column.field === "account_name" ? 512 : 256, column.field !== "account_name");
    if (normalized === null) {
      return failed("review_required", "D015_REVIEW_REQUIRED", "malformed_row", [issue({
        field: column.field,
        row: rowLocator,
        cell: locatorFor(snapshot, column, rowNumber),
      })]);
    }
    if (normalized !== undefined) {
      fields[column.field] = normalized;
      cellLocators[column.field] = locatorFor(snapshot, column, rowNumber);
    }
  }

  const orderedFields: Record<string, string> = { account_name: fields.account_name };
  if (fields.website) orderedFields.website = fields.website;
  if (fields.industry) orderedFields.industry = fields.industry;
  orderedFields.tenant_id = snapshot.tenantId;
  if (fields.tag) orderedFields.tag = fields.tag;
  const observation = Object.freeze({
    sourceCardId: CUSTOMER_LIST_FIXTURE_ADAPTER.sourceCardId,
    operation: "normalize",
    tenantId: snapshot.tenantId,
    runId: request.runId,
    observedAt: request.observedAt,
    fields: Object.freeze(orderedFields),
  }) satisfies ConnectorFixtureObservation;
  const provenance = Object.freeze({
    sourceCardId: CUSTOMER_LIST_FIXTURE_ADAPTER.sourceCardId,
    tenantId: snapshot.tenantId,
    workspaceId: snapshot.workspaceId,
    documentId: snapshot.documentId,
    documentVersionId: snapshot.documentVersionId,
    snapshotVersion: snapshot.snapshotVersion,
    permittedPurpose: request.permittedPurpose,
    row: rowLocator,
    cells: Object.freeze(cellLocators),
  });
  return Object.freeze({
    recordType: "source_observation",
    canonicalAccount: false,
    origin: "tenant_upload",
    suppliedBy: "customer_provided",
    observation,
    provenance,
  });
}

function bindingFailure(
  request: CustomerListPageRequest,
  snapshot: SnapshotMetadata,
): CustomerListAdapterFailure | null {
  if (request.authorizedTenantId !== snapshot.tenantId || request.tenantId !== snapshot.tenantId
    || request.authorizedTenantId !== request.tenantId) {
    return failed("blocked", "D015_SOURCE_POLICY_FAIL", "tenant_scope_mismatch");
  }
  if (request.authorizedWorkspaceId !== snapshot.workspaceId || request.workspaceId !== snapshot.workspaceId
    || request.authorizedWorkspaceId !== request.workspaceId) {
    return failed("blocked", "D015_SOURCE_POLICY_FAIL", "workspace_scope_mismatch");
  }
  if (request.documentId !== snapshot.documentId
    || request.documentVersionId !== snapshot.documentVersionId
    || request.snapshotVersion !== snapshot.snapshotVersion) {
    return failed("blocked", "D015_SOURCE_POLICY_FAIL", "document_binding_mismatch");
  }
  if (!snapshot.permittedPurposes.includes(request.permittedPurpose)) {
    return failed("blocked", "D015_SOURCE_POLICY_FAIL", "purpose_not_permitted");
  }
  if (request.operation !== "normalize") {
    return failed("blocked", "D015_SOURCE_POLICY_FAIL", "operation_not_permitted");
  }
  return null;
}

/**
 * Creates a fixture-only reader from a caller-supplied approved table snapshot.
 * The adapter snapshots selected cells and exposes no storage, provider, or
 * canonical-account mutation capability.
 */
export function createCustomerListFixtureAdapter(
  snapshotValue: unknown,
  configValue: unknown,
): CustomerListFixtureAdapterCreationResult {
  const config = parseConfig(configValue);
  if (!config) return failed("blocked", "D015_MALFORMED", "malformed_config");
  const parsedSnapshot = parseSnapshot(snapshotValue);
  if (!parsedSnapshot.ok) return parsedSnapshot.failure;
  const snapshot = parsedSnapshot.snapshot;
  const selectedColumns = mappedColumns(snapshot.columns, config);
  if (isAdapterFailure(selectedColumns)) return selectedColumns;
  const rows = snapshotRows(snapshot.rawRows, snapshot.columns.length, selectedColumns, snapshot.sheet, snapshot.headerRow);
  if (isAdapterFailure(rows)) return rows;
  const adapterFingerprint = fingerprint(snapshot, config, selectedColumns, rows);
  const capability = Object.freeze({
    sourceCardId: CUSTOMER_LIST_FIXTURE_ADAPTER.sourceCardId,
    executionMode: "fixture" as const,
    transport: "none" as const,
    storageAccess: "none" as const,
    providerAccess: "none" as const,
    maxPageSize: config.maxPageSize,
  });

  const adapter: CustomerListFixtureAdapter = Object.freeze({
    descriptor: CUSTOMER_LIST_FIXTURE_ADAPTER,
    capability,
    async readPage(requestValue: unknown, optionsValue?: unknown): Promise<CustomerListPageResult> {
      const request = parsePageRequest(requestValue);
      if (!request) return failed("blocked", "D015_MALFORMED", "malformed_request");
      const signal = parseSignal(optionsValue);
      if (signal === null) return failed("blocked", "D015_MALFORMED", "malformed_request");
      const scopeFailure = bindingFailure(request, snapshot);
      if (scopeFailure) return scopeFailure;
      if (request.pageSize > config.maxPageSize) {
        return failed("blocked", "D015_MALFORMED", "page_bound_exceeded");
      }
      const offset = decodeCursor(
        request.cursor,
        adapterFingerprint,
        request.runId,
        request.permittedPurpose,
        rows.length,
      );
      if (offset === null) return failed("blocked", "D015_MALFORMED", "malformed_cursor");
      if (signal && isAborted(signal)) return failed("cancelled", "D015_CANCELLED", "cancelled");

      const end = Math.min(offset + request.pageSize, rows.length);
      const observations: CustomerListObservationEnvelope[] = [];
      for (let index = offset; index < end; index += 1) {
        if (signal) {
          await yieldToEventLoop();
          if (isAborted(signal)) return failed("cancelled", "D015_CANCELLED", "cancelled");
        }
        const normalized = normalizeRow(rows[index], index, snapshot, selectedColumns, request);
        if ("ok" in normalized) return normalized;
        observations.push(normalized);
      }
      if (signal && isAborted(signal)) return failed("cancelled", "D015_CANCELLED", "cancelled");

      const complete = end === rows.length;
      return Object.freeze({
        ok: true,
        code: "D015_PASS",
        status: complete ? "complete" : "page_complete",
        binding: Object.freeze({
          tenantId: snapshot.tenantId,
          workspaceId: snapshot.workspaceId,
          documentId: snapshot.documentId,
          documentVersionId: snapshot.documentVersionId,
          snapshotVersion: snapshot.snapshotVersion,
          permittedPurpose: request.permittedPurpose,
        }),
        observations: Object.freeze(observations),
        nextCursor: complete
          ? null
          : encodeCursor(adapterFingerprint, request.runId, request.permittedPurpose, end),
        complete,
        usage: Object.freeze({ providerRequests: 0, providerUnits: 0, providerCostMicros: 0 }),
      });
    },
  });
  return Object.freeze({ ok: true, code: "D015_PASS", adapter });
}
