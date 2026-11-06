export const ROLES = ["ADMIN", "LEADER", "MEMBER"] as const;
export type Role = (typeof ROLES)[number];

export const MEMBER_STATUSES = [
  "PRE_REGISTERED",
  "ACTIVE",
  "SUSPENDED",
  "WITHDRAWN",
  "REGISTRATION_CANCELLED",
] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export const SSO_LINK_STATUSES = ["WAITING", "LINKED", "REVIEW_REQUIRED"] as const;
export type SsoLinkStatus = (typeof SSO_LINK_STATUSES)[number];

export const ACADEMIC_STATUSES = ["ENROLLED", "LEAVE_OF_ABSENCE", "GRADUATED", "UNKNOWN"] as const;
export type AcademicStatus = (typeof ACADEMIC_STATUSES)[number];

/** member_change_history.field */
export const MEMBER_CHANGE_FIELDS = ["TEAM", "COHORT", "ROLE", "STATUS"] as const;
export type MemberChangeField = (typeof MEMBER_CHANGE_FIELDS)[number];

export const OFFICER_POSITIONS = ["PRESIDENT"] as const;
