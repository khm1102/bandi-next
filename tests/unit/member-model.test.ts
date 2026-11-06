import { describe, expect, it } from "vitest";
import {
  canTransitionByAdmin,
  validateCohortChange,
  validateReason,
  validateRoleChange,
  validateStatusChange,
  validateTeamChange,
} from "@/features/member/model";

describe("멤버 변경 규칙", () => {
  it("사유가 비어 있으면 거부한다", () => {
    expect(() => validateReason("  ")).toThrow(/사유/);
    expect(() => validateReason(null)).toThrow(/사유/);
    expect(validateReason(" 이동 요청 ")).toBe("이동 요청");
  });

  it("사유가 500자를 넘으면 거부한다", () => {
    expect(() => validateReason("가".repeat(501))).toThrow(/500/);
  });

  it("같은 팀·기수로의 변경은 변경 없음으로 거부한다", () => {
    expect(() => validateTeamChange(3, 3)).toThrow();
    expect(() => validateTeamChange(3, 4)).not.toThrow();
    expect(() => validateCohortChange(1, 1)).toThrow();
    expect(() => validateCohortChange(1, 2)).not.toThrow();
  });

  it("같은 역할로의 변경은 거부한다", () => {
    expect(() => validateRoleChange({ memberId: 1, role: "MEMBER" }, "MEMBER", 9)).toThrow();
  });

  it("ADMIN이 본인의 ADMIN 권한을 내리는 것은 거부한다 (다른 ADMIN만 가능)", () => {
    expect(() => validateRoleChange({ memberId: 1, role: "ADMIN" }, "LEADER", 1)).toThrow(/본인/);
    expect(() => validateRoleChange({ memberId: 1, role: "ADMIN" }, "LEADER", 2)).not.toThrow();
  });

  it("일반 멤버를 ADMIN으로 올리는 것은 허용한다", () => {
    expect(() => validateRoleChange({ memberId: 1, role: "MEMBER" }, "ADMIN", 2)).not.toThrow();
  });

  it.each([
    ["PRE_REGISTERED", "REGISTRATION_CANCELLED", true],
    ["PRE_REGISTERED", "ACTIVE", false],
    ["ACTIVE", "SUSPENDED", true],
    ["ACTIVE", "WITHDRAWN", true],
    ["ACTIVE", "REGISTRATION_CANCELLED", false],
    ["SUSPENDED", "ACTIVE", true],
    ["SUSPENDED", "WITHDRAWN", true],
    ["WITHDRAWN", "ACTIVE", true],
    ["WITHDRAWN", "SUSPENDED", false],
    ["REGISTRATION_CANCELLED", "ACTIVE", false],
  ] as const)("운영진 상태 전이 %s → %s 는 %s", (from, to, allowed) => {
    expect(canTransitionByAdmin(from, to)).toBe(allowed);
  });

  it("같은 상태로의 변경과 허용되지 않은 전이는 거부한다", () => {
    expect(() => validateStatusChange("ACTIVE", "ACTIVE")).toThrow();
    expect(() => validateStatusChange("REGISTRATION_CANCELLED", "ACTIVE")).toThrow();
    expect(() => validateStatusChange("ACTIVE", "SUSPENDED")).not.toThrow();
  });
});
