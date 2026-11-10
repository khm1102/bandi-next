import { describe, expect, it } from "vitest";
import { accessFor, type AccessContext } from "@/lib/policy";

const ctx = (role: "ADMIN" | "LEADER" | "MEMBER", teamId = 3, status = "ACTIVE"): AccessContext =>
  accessFor({ memberId: 1, teamId, role, status } as never);

describe("접근 정책 (Java MemberAccessContext 이식)", () => {
  it("활성 멤버만 내부 자료를 읽을 수 있다", () => {
    expect(ctx("MEMBER").canReadInternal()).toBe(true);
    expect(ctx("MEMBER", 3, "SUSPENDED").canReadInternal()).toBe(false);
    expect(ctx("ADMIN", 3, "WITHDRAWN").canReadInternal()).toBe(false);
  });

  it("전역 관리는 활성 ADMIN만 가능하다", () => {
    expect(ctx("ADMIN").canManageGlobal()).toBe(true);
    expect(ctx("LEADER").canManageGlobal()).toBe(false);
    expect(ctx("MEMBER").canManageGlobal()).toBe(false);
    expect(ctx("ADMIN", 3, "SUSPENDED").canManageGlobal()).toBe(false);
  });

  it("팀 관리는 ADMIN 전체, LEADER는 소속 팀만 가능하다", () => {
    expect(ctx("ADMIN", 3).canManageTeam(9)).toBe(true);
    expect(ctx("LEADER", 3).canManageTeam(3)).toBe(true);
    expect(ctx("LEADER", 3).canManageTeam(4)).toBe(false);
    expect(ctx("MEMBER", 3).canManageTeam(3)).toBe(false);
  });

  it("대상 팀이 없으면(null) 팀 관리는 거부한다", () => {
    expect(ctx("ADMIN").canManageTeam(null)).toBe(false);
  });

  it("비활성 LEADER는 소속 팀도 관리할 수 없다", () => {
    expect(ctx("LEADER", 3, "SUSPENDED").canManageTeam(3)).toBe(false);
  });

  it("팀 기여는 ADMIN 전체, 그 외는 소속 팀만 가능하다", () => {
    expect(ctx("ADMIN", 3).canContributeToTeam(9)).toBe(true);
    expect(ctx("MEMBER", 3).canContributeToTeam(3)).toBe(true);
    expect(ctx("MEMBER", 3).canContributeToTeam(4)).toBe(false);
    expect(ctx("MEMBER", 3).canContributeToTeam(null)).toBe(false);
  });

  it("본인 팀 변경은 활성 상태의 본인만 가능하다", () => {
    expect(ctx("MEMBER").canChangeOwnTeam(1)).toBe(true);
    expect(ctx("MEMBER").canChangeOwnTeam(2)).toBe(false);
    expect(ctx("MEMBER", 3, "SUSPENDED").canChangeOwnTeam(1)).toBe(false);
  });

  it("본인 기수 변경도 활성 상태의 본인만 가능하다", () => {
    expect(ctx("MEMBER").canChangeOwnCohort(1)).toBe(true);
    expect(ctx("MEMBER").canChangeOwnCohort(2)).toBe(false);
    expect(ctx("MEMBER", 3, "SUSPENDED").canChangeOwnCohort(1)).toBe(false);
  });
});
