import { SchoolSsoResponseChangedError } from "../errors";
import {
  academicStatusFromPortalLabel,
  createSchoolIdentity,
  type SchoolIdentity,
} from "./identity";

const KEY = /keyHex\s*=\s*"([0-9A-Fa-f]{32})"/;
const ALERT = /alert\(\s*["']([^"']*)["']\s*\)/;
const STUDENT_NO = /var\s+loginId\s*=\s*"(\d+)"/;
const NAME = /var\s+name\s*=\s*"([^"]+)"/;
const PROFILE_NAME = /<h3[^>]*>\s*([가-힣]{2,20})\s*님/;
const ACADEMIC_STATUS = /var\s+groupName\s*=\s*"([^"]+)"/;
const DEPARTMENT = /class="profile_02"[^>]*>\s*<p>\s*([^<]+?)\s*<\/p>/s;
const SCRIPT = /<script\b[^>]*>(.*?)<\/script>/gis;
const WRITE_INFORMATION = /id\s*=\s*["']writeinfor["']/i;
const MOBILE_PHONE = /(?<!\d)(01[016789][\s-]?\d{3,4}[\s-]?\d{4})(?!\d)/;

function find(pattern: RegExp, html: string | null | undefined): string | null {
  const match = pattern.exec(html ?? "");
  return match ? match[1].trim() : null;
}

export function extractEncryptionKey(html: string): string {
  const key = find(KEY, html);
  if (!key) {
    throw new SchoolSsoResponseChangedError();
  }
  return key;
}

export function extractAlert(html: string): string | null {
  return find(ALERT, html);
}

export function looksLikeLoginPage(html: string): boolean {
  return (
    html.includes('id="loginForm"') ||
    html.includes("login_stand.jsp") ||
    html.includes("internalPw")
  );
}

function findNameInIdentityScript(html: string): string | null {
  for (const match of html.matchAll(SCRIPT)) {
    const script = match[1];
    if (find(STUDENT_NO, script) === null || find(ACADEMIC_STATUS, script) === null) {
      continue;
    }
    return find(NAME, script);
  }
  return null;
}

function findPhoneNumber(html: string): string | null {
  const section = WRITE_INFORMATION.exec(html);
  if (!section) {
    return null;
  }
  const end = Math.min(html.length, section.index + 12_000);
  const phone = MOBILE_PHONE.exec(html.substring(section.index, end));
  return phone ? phone[1] : null;
}

function normalizeDepartment(raw: string): string {
  return raw.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

export function extractIdentity(html: string): SchoolIdentity {
  const studentNo = find(STUDENT_NO, html);
  const name = find(PROFILE_NAME, html) ?? findNameInIdentityScript(html);
  const academicLabel = find(ACADEMIC_STATUS, html);
  if (!studentNo || !name || !academicLabel) {
    throw new SchoolSsoResponseChangedError();
  }
  const rawDepartment = find(DEPARTMENT, html);
  return createSchoolIdentity({
    studentNo,
    name,
    department: rawDepartment ? normalizeDepartment(rawDepartment) : null,
    academicStatus: academicStatusFromPortalLabel(academicLabel),
    phoneNumber: findPhoneNumber(html),
  });
}
