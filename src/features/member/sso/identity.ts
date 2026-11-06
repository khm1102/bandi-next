import type { AcademicStatus } from "../codes";

/** 학교 포털 원문에서 서비스에 필요한 최소 신원만 정규화한 값. */
export interface SchoolIdentity {
  studentNo: string;
  name: string;
  department: string | null;
  academicStatus: AcademicStatus;
  phoneNumber: string | null;
}

export function academicStatusFromPortalLabel(label: string | null | undefined): AcademicStatus {
  switch (label?.trim()) {
    case "재학생":
      return "ENROLLED";
    case "휴학생":
      return "LEAVE_OF_ABSENCE";
    case "졸업생":
      return "GRADUATED";
    default:
      return "UNKNOWN";
  }
}

export function isLoginAllowed(status: AcademicStatus): boolean {
  return status === "ENROLLED";
}

function requireText(value: string | null | undefined, field: string): string {
  if (value === null || value === undefined || value.trim() === "") {
    throw new Error(`${field} must not be blank`);
  }
  return value.trim();
}

export function normalizeName(value: string): string {
  return value.trim().normalize("NFC");
}

/** 한국 휴대폰 번호(01[016789] + 7~8자리)만 숫자로 정규화하고 나머지는 null. */
export function normalizePhoneNumber(value: string | null | undefined): string | null {
  if (!value || value.trim() === "") {
    return null;
  }
  const digits = value.replace(/\D/g, "");
  return /^01[016789]\d{7,8}$/.test(digits) ? digits : null;
}

export function createSchoolIdentity(input: {
  studentNo: string;
  name: string;
  department?: string | null;
  academicStatus: AcademicStatus;
  phoneNumber?: string | null;
}): SchoolIdentity {
  const department = input.department?.trim();
  return {
    studentNo: requireText(input.studentNo, "studentNo"),
    name: normalizeName(requireText(input.name, "name")),
    department: department ? department : null,
    academicStatus: input.academicStatus,
    phoneNumber: normalizePhoneNumber(input.phoneNumber),
  };
}

export function hasSameName(identity: SchoolIdentity, registeredName: string): boolean {
  return identity.name === normalizeName(registeredName);
}
