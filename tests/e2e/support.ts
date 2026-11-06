import { expect, type Browser, type Page } from "@playwright/test";
import { Pool } from "pg";

const DB_URL = process.env.DATABASE_URL ?? "postgres://bandi:bandi1234@localhost:5433/bandi";

export const ACCOUNTS = {
  memberA: "9000000001",
  memberB: "9000000002",
  leaderA: "9000000003",
  leaderB: "9000000004",
  admin: "9000000005",
} as const;

/** 가짜 SSO 시드 멤버를 초기 상태로 되돌리고 이력·감사·세션을 비운다. */
export async function resetSeed(): Promise<void> {
  const pool = new Pool({ connectionString: DB_URL });
  const [{ id: cohortId }] = (await pool.query("select id from cohort where name = '1-1'")).rows;
  await pool.query("delete from session");
  await pool.query("delete from school_login_attempt");
  await pool.query("delete from member_change_history");
  await pool.query("delete from audit_log");
  await pool.query("delete from calendar_event");
  await pool.query("delete from internal_notice_read");
  await pool.query("delete from internal_notice_attachment");
  await pool.query("delete from internal_notice");
  await pool.query("delete from asset_history");
  await pool.query("delete from asset_unit");
  await pool.query("delete from asset_item");
  await pool.query("delete from activity_review_history");
  await pool.query("delete from activity_record_revision");
  await pool.query("delete from activity_record_file");
  await pool.query("delete from activity_report_document");
  await pool.query("delete from activity_record");
  await pool.query("delete from club_officer");
  await pool.query("delete from resource_link_preview");
  await pool.query("delete from resource_file");
  await pool.query("delete from resource");
  await pool.query("update member set profile_photo_file_id = null");
  await pool.query("delete from file_retirement_queue");
  await pool.query("delete from stored_file");
  await pool.query("delete from member where student_no like '91%'");
  const defs: [string, string, number][] = [
    [ACCOUNTS.memberA, "MEMBER", 3],
    [ACCOUNTS.memberB, "MEMBER", 4],
    [ACCOUNTS.leaderA, "LEADER", 3],
    [ACCOUNTS.leaderB, "LEADER", 4],
    [ACCOUNTS.admin, "ADMIN", 3],
  ];
  for (const [studentNo, role, teamId] of defs) {
    await pool.query(
      `update member set role = $2, team_id = $3, cohort_id = $4, status = 'ACTIVE',
         sso_link_status = 'LINKED', sso_linked_at = now() where student_no = $1`,
      [studentNo, role, teamId, cohortId],
    );
  }
  // 활동 내역서 생성에는 현재 회장이 필요하다: AdminX를 회장으로 지정한다.
  await pool.query(
    "insert into club_officer (position, member_id, appointed_at) select 'PRESIDENT', id, now() from member where student_no = $1",
    [ACCOUNTS.admin],
  );
  await pool.end();
}

export async function loginAs(page: Page, studentNo: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("학번").fill(studentNo);
  await page.getByLabel("학교 포털 비밀번호").fill("pw");
  await page.getByRole("button", { name: "학교 계정으로 로그인" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

export async function newSession(browser: Browser, studentNo: string): Promise<Page> {
  const context = await browser.newContext({ locale: "ko-KR" });
  const page = await context.newPage();
  await loginAs(page, studentNo);
  return page;
}
