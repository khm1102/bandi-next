/**
 * 기존 bandi(MySQL) → bandi-next(PostgreSQL) 데이터 이전.
 *
 * - MySQL은 읽기만 한다. PostgreSQL은 비어 있는 새 스키마(마이그레이션 직후)를 기대한다.
 * - ID를 그대로 보존하고(OVERRIDING SYSTEM VALUE) 시퀀스를 맞춘다. 전체를 한 트랜잭션으로 처리해 실패 시 롤백한다.
 * - 이전 후 테이블별 행 수를 비교해 불일치하면 롤백한다.
 * - 파일 바이너리는 옮기지 않는다: 기존 FILE_STORAGE_ROOT 디렉터리(private/, public/)를 새 서버의
 *   FILE_STORAGE_ROOT로 그대로 복사하면 저장 키가 같아 바로 동작한다.
 * - MySQL DATETIME은 Asia/Seoul 로컬 시각으로 저장되어 있으므로 KST로 해석해 timestamptz로 변환한다.
 * - 세션·로그인 실패 제한은 일시 데이터라 이전하지 않는다(모든 사용자가 다시 로그인한다).
 *
 * 사용: MYSQL_URL=mysql://bandi:pw@localhost:3307/bandi DATABASE_URL=postgres://... pnpm tsx scripts/migrate-from-mysql.ts
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import { Pool, type PoolClient } from "pg";

const mysqlUrl = process.env.MYSQL_URL;
const pgUrl = process.env.DATABASE_URL;
if (!mysqlUrl || !pgUrl) {
  throw new Error("MYSQL_URL과 DATABASE_URL이 필요합니다.");
}
if (process.env.NODE_ENV === "production" && process.env.CONFIRM_PRODUCTION_IMPORT !== "yes") {
  throw new Error("운영 DB로 이전하려면 CONFIRM_PRODUCTION_IMPORT=yes 가 필요합니다.");
}

type Row = Record<string, unknown>;

/** 이전 대상 한 줄: 대상 컬럼 → 값을 만드는 함수. */
interface TablePlan {
  /** PostgreSQL 대상 테이블 */
  table: string;
  /** MySQL 원본 SELECT */
  select: string;
  /** 원본 행 → 대상 행 (null이면 건너뜀) */
  map: (row: Row) => Row | null;
  /** 대상에서 id를 직접 지정하는지(기본 true) */
  keepId?: boolean;
  /** 충돌 시 갱신(시드된 team 등) */
  upsert?: boolean;
}

const d = (value: unknown): Date | null => (value instanceof Date ? value : value == null ? null : new Date(String(value)));
const b = (value: unknown): boolean => value === 1 || value === true || value === "1";

const plans: TablePlan[] = [
  { table: "team", upsert: true, select: "select * from team", map: (r) => ({ id: r.team_id, name: r.name, display_order: r.display_order, is_active: b(r.is_active), created_at: d(r.created_dttm), updated_at: d(r.updated_dttm) }) },
  { table: "cohort", select: "select * from cohort", map: (r) => ({ id: r.cohort_id, name: r.name, is_active: b(r.is_active), created_at: d(r.created_dttm), updated_at: d(r.updated_dttm) }) },
  // 순환 참조(member ↔ stored_file) 때문에 FK 일부는 나중에 채운다.
  { table: "member", select: "select * from member", map: (r) => ({ id: r.member_id, student_no: r.student_no, name: r.name, department: r.department, phone_number: r.phone_number, academic_status: r.academic_status_code, academic_status_verified_at: d(r.academic_status_verified_dttm), team_id: r.team_id, cohort_id: r.cohort_id, role: r.role_code, status: r.member_status_code, sso_link_status: r.sso_link_status_code, sso_linked_at: d(r.sso_linked_dttm), last_login_at: d(r.last_login_dttm), registered_by_member_id: null, profile_photo_file_id: null, created_at: d(r.created_dttm), updated_at: d(r.updated_dttm) }) },
  { table: "stored_file", select: "select * from stored_file", map: (r) => ({ id: r.stored_file_id, original_name: r.original_name, storage_scope: r.storage_scope_code, storage_key: r.storage_key, content_type: r.content_type, size_bytes: r.size_bytes, sha256: r.sha256_hash, upload_status: r.upload_status_code, purpose: r.file_purpose_code, uploaded_by_member_id: r.uploaded_by_member_id, created_at: d(r.created_dttm), updated_at: d(r.updated_dttm), deleted_at: d(r.deleted_dttm) }) },
  { table: "club_officer", select: "select * from club_officer", map: (r) => ({ id: r.club_officer_id, position: r.position_code, member_id: r.member_id, appointed_at: d(r.appointed_dttm), created_at: d(r.created_dttm), updated_at: d(r.updated_dttm) }) },
  // 이력 4종 → member_change_history
  { table: "member_change_history", keepId: false, select: "select member_team_history_id as hid, member_id, 'TEAM' as field, previous_team_id as old_value, new_team_id as new_value, reason, changed_by_member_id, changed_dttm from member_team_history", map: (r) => historyRow(r) },
  { table: "member_change_history", keepId: false, select: "select member_cohort_history_id as hid, member_id, 'COHORT' as field, previous_cohort_id as old_value, new_cohort_id as new_value, reason, changed_by_member_id, changed_dttm from member_cohort_history", map: (r) => historyRow(r) },
  { table: "member_change_history", keepId: false, select: "select member_role_history_id as hid, member_id, 'ROLE' as field, previous_role_code as old_value, new_role_code as new_value, reason, changed_by_member_id, changed_dttm from member_role_history", map: (r) => historyRow(r) },
  { table: "member_change_history", keepId: false, select: "select member_status_history_id as hid, member_id, 'STATUS' as field, previous_status_code as old_value, new_status_code as new_value, reason, changed_by_member_id, changed_dttm from member_status_history", map: (r) => historyRow(r) },
  // 파기 대기열 2종 → file_retirement_queue
  { table: "file_retirement_queue", keepId: false, select: "select stored_file_id, 'PROFILE_PHOTO' as reason, storage_scope_code, storage_key, retirement_status_code, attempt_count, failure_reason, completed_dttm, created_dttm, updated_dttm from member_profile_photo_retirement_manifest", map: (r) => retireRow(r) },
  { table: "file_retirement_queue", keepId: false, select: "select stored_file_id, 'LINK_PREVIEW_IMAGE' as reason, storage_scope_code, storage_key, retirement_status_code, attempt_count, failure_reason, completed_dttm, created_dttm, updated_dttm from resource_link_preview_retirement_manifest", map: (r) => retireRow(r) },
  { table: "calendar_event", select: "select * from calendar_event", map: (r) => ({ id: r.calendar_event_id, team_id: r.team_id, title: r.title, description: r.description, start_at: d(r.start_dttm), end_at: d(r.end_dttm), is_all_day: b(r.is_all_day), place: r.place, color: r.color_code, created_by_member_id: r.created_by_member_id, updated_by_member_id: r.updated_by_member_id, created_at: d(r.created_dttm), updated_at: d(r.updated_dttm), deleted_at: d(r.deleted_dttm) }) },
  { table: "internal_notice", select: "select * from internal_notice", map: (r) => ({ id: r.internal_notice_id, target_scope: r.target_scope_code, team_id: r.team_id, title: r.title, body: r.body, status: r.status_code, is_important: b(r.is_important), publish_start_at: d(r.publish_start_dttm), publish_end_at: d(r.publish_end_dttm), created_by_member_id: r.created_by_member_id, updated_by_member_id: r.updated_by_member_id, published_by_member_id: r.published_by_member_id, share_token: r.share_token, created_at: d(r.created_dttm), updated_at: d(r.updated_dttm), deleted_at: d(r.deleted_dttm) }) },
  { table: "internal_notice_attachment", select: "select * from internal_notice_attachment", map: (r) => ({ id: r.internal_notice_attachment_id, internal_notice_id: r.internal_notice_id, stored_file_id: r.stored_file_id, display_order: r.display_order, created_at: d(r.created_dttm) }) },
  { table: "internal_notice_read", select: "select * from internal_notice_read", map: (r) => ({ id: r.internal_notice_read_id, internal_notice_id: r.internal_notice_id, member_id: r.member_id, first_read_at: d(r.first_read_dttm), last_read_at: d(r.last_read_dttm) }) },
  { table: "resource", select: "select * from resource", map: (r) => ({ id: r.resource_id, title: r.title, body_markdown: r.body_markdown, created_by_member_id: r.created_by_member_id, updated_by_member_id: r.updated_by_member_id, share_token: r.share_token, created_at: d(r.created_dttm), updated_at: d(r.updated_dttm), deleted_at: d(r.deleted_dttm) }) },
  { table: "resource_file", select: "select * from resource_file", map: (r) => ({ id: r.resource_file_id, resource_id: r.resource_id, stored_file_id: r.stored_file_id, display_order: r.display_order, uploaded_by_member_id: r.uploaded_by_member_id, created_at: d(r.created_dttm) }) },
  { table: "resource_link_preview", select: "select * from resource_link_preview", map: (r) => ({ id: r.resource_link_preview_id, resource_id: r.resource_id, normalized_url: r.normalized_url, url_hash: r.url_hash, domain: r.domain, title: r.title, description: r.description, preview_image_file_id: r.preview_image_file_id, fetched_at: d(r.fetched_dttm), created_at: d(r.created_dttm), updated_at: d(r.updated_dttm) }) },
  { table: "activity_record", select: "select * from activity_record", map: (r) => ({ id: r.activity_record_id, team_id: r.team_id, activity_at: d(r.activity_dttm), title: r.title, body: r.body, participant_count: r.participant_count, status: r.status_code, created_by_member_id: r.created_by_member_id, updated_by_member_id: r.updated_by_member_id, submitted_at: d(r.submitted_dttm), reviewed_at: d(r.reviewed_dttm), reviewed_by_member_id: r.reviewed_by_member_id, created_at: d(r.created_dttm), updated_at: d(r.updated_dttm), deleted_at: d(r.deleted_dttm) }) },
  // 교체 체인 FK는 자기 참조라 일단 NULL로 넣고 뒤에서 채운다.
  { table: "activity_record_file", select: "select * from activity_record_file", map: (r) => ({ id: r.activity_record_file_id, activity_record_id: r.activity_record_id, stored_file_id: r.stored_file_id, file_role: r.file_role_code, display_order: r.display_order, uploaded_by_member_id: r.uploaded_by_member_id, replaced_by_file_id: null, replaced_at: d(r.replaced_dttm), replaced_by_member_id: r.replaced_by_member_id, created_at: d(r.created_dttm) }) },
  { table: "activity_record_revision", select: "select * from activity_record_revision", map: (r) => ({ id: r.activity_record_revision_id, activity_record_id: r.activity_record_id, revision_no: r.revision_no, activity_at: d(r.activity_dttm), title: r.title, body: r.body, participant_count: r.participant_count, changed_by_member_id: r.changed_by_member_id, changed_at: d(r.changed_dttm), change_reason: r.change_reason, created_at: d(r.created_dttm) }) },
  { table: "activity_review_history", select: "select * from activity_review_history", map: (r) => ({ id: r.activity_review_history_id, activity_record_id: r.activity_record_id, previous_status: r.previous_status_code, new_status: r.new_status_code, comment: r.comment, reviewed_by_member_id: r.reviewed_by_member_id, reviewed_at: d(r.reviewed_dttm), created_at: d(r.created_dttm) }) },
  { table: "asset_item", select: "select * from asset_item", map: (r) => ({ id: r.asset_item_id, name: r.name, category: r.category_code, tracking_type: r.tracking_type_code, owner_type: r.owner_type_code, owner_member_id: r.owner_member_id, external_owner_name: r.external_owner_name, total_quantity: r.total_quantity, storage_location: r.storage_location, status: r.status_code, photo_file_id: r.photo_file_id, note: r.note, created_at: d(r.created_dttm), updated_at: d(r.updated_dttm), deleted_at: d(r.deleted_dttm) }) },
  { table: "asset_unit", select: "select * from asset_unit", map: (r) => ({ id: r.asset_unit_id, asset_item_id: r.asset_item_id, management_no: r.management_no, status: r.status_code, storage_location: r.storage_location, created_at: d(r.created_dttm), updated_at: d(r.updated_dttm) }) },
  { table: "asset_history", select: "select * from asset_history", map: (r) => ({ id: r.asset_history_id, asset_item_id: r.asset_item_id, asset_unit_id: r.asset_unit_id, action: r.action_code, quantity: r.quantity, previous_status: r.previous_status_code, new_status: r.new_status_code, note: r.note, changed_by_member_id: r.changed_by_member_id, changed_at: d(r.changed_dttm), created_at: d(r.created_dttm) }) },
  { table: "audit_log", select: "select * from audit_log", map: (r) => ({ id: r.audit_log_id, actor_member_id: r.actor_member_id, action: r.action_code, target_type: r.target_type_code, target_id: r.target_id, summary: r.summary, detail: r.metadata_json == null ? null : JSON.stringify(typeof r.metadata_json === "string" ? JSON.parse(r.metadata_json) : r.metadata_json), occurred_at: d(r.occurred_dttm), created_at: d(r.created_dttm) }) },
];

function historyRow(r: Row): Row {
  return { member_id: r.member_id, field: r.field, old_value: String(r.old_value), new_value: String(r.new_value), reason: r.reason, changed_by_member_id: r.changed_by_member_id, changed_at: d(r.changed_dttm), created_at: d(r.changed_dttm) };
}
function retireRow(r: Row): Row {
  return { stored_file_id: r.stored_file_id, reason: r.reason, storage_scope: r.storage_scope_code, storage_key: r.storage_key, status: r.retirement_status_code, attempt_count: r.attempt_count, failure_reason: r.failure_reason, completed_at: d(r.completed_dttm), created_at: d(r.created_dttm), updated_at: d(r.updated_dttm) };
}

async function insert(client: PoolClient, plan: TablePlan, rows: Row[]): Promise<number> {
  let count = 0;
  for (const row of rows) {
    const mapped = plan.map(row);
    if (!mapped) continue;
    const columns = Object.keys(mapped);
    const values = columns.map((c) => mapped[c]);
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
    const cols = columns.map((c) => `"${c}"`).join(", ");
    const overriding = plan.keepId === false ? "" : "OVERRIDING SYSTEM VALUE ";
    const conflict = plan.upsert
      ? ` ON CONFLICT (id) DO UPDATE SET ${columns.filter((c) => c !== "id").map((c) => `"${c}" = EXCLUDED."${c}"`).join(", ")}`
      : "";
    await client.query(`INSERT INTO "${plan.table}" (${cols}) ${overriding}VALUES (${placeholders})${conflict}`, values);
    count += 1;
  }
  return count;
}

async function main() {
  const source = await mysql.createConnection({ uri: mysqlUrl, timezone: "+09:00", dateStrings: false });
  await source.query("SET SESSION TRANSACTION READ ONLY");
  const pool = new Pool({ connectionString: pgUrl, max: 1 });
  const client = await pool.connect();
  const expected = new Map<string, number>();
  const imported = new Map<string, number>();
  try {
    await client.query("BEGIN");
    // 시드된 team 외에는 비어 있어야 한다.
    const { rows: busy } = await client.query("select (select count(*) from member)::int as m, (select count(*) from stored_file)::int as f");
    if (busy[0].m > 0 || busy[0].f > 0) throw new Error("대상 DB가 비어 있지 않습니다.");

    for (const plan of plans) {
      const [rows] = await source.query(plan.select);
      const list = rows as Row[];
      expected.set(plan.table, (expected.get(plan.table) ?? 0) + list.length);
      const count = await insert(client, plan, list);
      imported.set(plan.table, (imported.get(plan.table) ?? 0) + count);
      console.log(`${plan.table}: ${count}건`);
    }

    // 활동 내역서: 참여자 행들을 문서의 jsonb 배열로 합친다.
    const [docs] = await source.query("select * from activity_report_document");
    const [people] = await source.query("select * from activity_report_participant order by activity_report_document_id, display_order");
    const byDoc = new Map<number, Row[]>();
    for (const p of people as Row[]) {
      const key = Number(p.activity_report_document_id);
      byDoc.set(key, [...(byDoc.get(key) ?? []), { name: p.name, department: p.department, studentNo: p.student_no, note: p.note }]);
    }
    for (const doc of docs as Row[]) {
      await client.query(
        `INSERT INTO activity_report_document (id, activity_record_id, representative, location, participants, created_at, updated_at) OVERRIDING SYSTEM VALUE VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)`,
        [doc.activity_report_document_id, doc.activity_record_id, doc.representative, doc.location, JSON.stringify(byDoc.get(Number(doc.activity_report_document_id)) ?? []), d(doc.created_dttm), d(doc.updated_dttm)],
      );
    }
    expected.set("activity_report_document", (docs as Row[]).length);
    imported.set("activity_report_document", (docs as Row[]).length);
    console.log(`activity_report_document: ${(docs as Row[]).length}건 (참여자 ${(people as Row[]).length}명 → jsonb)`);

    // 순환·자기 참조 FK 채우기
    const [fixups] = await source.query("select member_id, registered_by_member_id, profile_photo_file_id from member where registered_by_member_id is not null or profile_photo_file_id is not null");
    for (const f of fixups as Row[]) {
      await client.query("update member set registered_by_member_id = $2, profile_photo_file_id = $3 where id = $1", [f.member_id, f.registered_by_member_id, f.profile_photo_file_id]);
    }
    const [chains] = await source.query("select activity_record_file_id, replaced_by_activity_record_file_id from activity_record_file where replaced_by_activity_record_file_id is not null");
    for (const c of chains as Row[]) {
      await client.query("update activity_record_file set replaced_by_file_id = $2 where id = $1", [c.activity_record_file_id, c.replaced_by_activity_record_file_id]);
    }

    // 시퀀스 보정
    const { rows: seqs } = await client.query(
      `select c.relname as table_name from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'
         and exists (select 1 from information_schema.columns k where k.table_name = c.relname and k.column_name = 'id' and k.is_identity = 'YES')`,
    );
    for (const { table_name } of seqs) {
      await client.query(`select setval(pg_get_serial_sequence('"${table_name}"', 'id'), greatest(coalesce((select max(id) from "${table_name}"), 0), 1), (select count(*) > 0 from "${table_name}"))`);
    }

    // 행 수 검증: 하나라도 다르면 전체 롤백
    const mismatches: string[] = [];
    for (const [table, want] of expected) {
      const { rows } = await client.query(`select count(*)::int as n from "${table}"`);
      if (rows[0].n !== want) mismatches.push(`${table}: 원본 ${want} / 대상 ${rows[0].n}`);
    }
    if (mismatches.length > 0) throw new Error(`행 수 불일치\n${mismatches.join("\n")}`);

    await client.query("COMMIT");
    console.log("이전 완료. 파일 바이너리는 기존 FILE_STORAGE_ROOT를 새 서버의 FILE_STORAGE_ROOT로 복사하세요.");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("이전 실패 — 롤백했습니다:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
    await source.end();
  }
}

void main();
