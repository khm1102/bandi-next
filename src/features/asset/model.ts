import { DomainError } from "@/features/member/errors";
import { ASSET_OWNER_TYPES, ASSET_STATUSES, type AssetStatus } from "./schema";

export class InvalidAssetError extends DomainError {
  constructor(message = "소품·장비 입력값이 올바르지 않습니다.") {
    super("INVALID_ASSET", message);
  }
}
export class AssetAccessDeniedError extends DomainError {
  override readonly kind = "forbidden" as const;
  constructor() {
    super("ASSET_ACCESS_DENIED", "소품·장비를 관리할 권한이 없습니다.");
  }
}
export class AssetNotFoundError extends DomainError {
  override readonly kind = "not-found" as const;
  constructor() {
    super("ASSET_NOT_FOUND", "소품·장비를 찾을 수 없습니다.");
  }
}

export interface AssetItemFields {
  name: string;
  category: string;
  ownerType: (typeof ASSET_OWNER_TYPES)[number];
  ownerMemberId: number | null;
  externalOwnerName: string | null;
  totalQuantity: number;
  storageLocation: string;
  note: string | null;
}

const text = (value: string | null | undefined) => value?.trim() ?? "";

/** 품목 입력 검증. 소유 정보는 소유 유형과 정확히 맞아야 한다(DB 제약과 동일). */
export function validateItemFields(input: AssetItemFields): AssetItemFields {
  const name = text(input.name);
  const category = text(input.category);
  const storageLocation = text(input.storageLocation);
  const external = text(input.externalOwnerName) || null;
  if (!name || name.length > 100) throw new InvalidAssetError("품목명은 1~100자로 입력해 주세요.");
  if (!category || category.length > 50) throw new InvalidAssetError("분류는 1~50자로 입력해 주세요.");
  if (!storageLocation || storageLocation.length > 200) throw new InvalidAssetError("보관 위치는 1~200자로 입력해 주세요.");
  if (!Number.isInteger(input.totalQuantity) || input.totalQuantity < 1) throw new InvalidAssetError("수량은 1 이상이어야 합니다.");
  const validOwner =
    (input.ownerType === "CLUB" && input.ownerMemberId === null && external === null) ||
    (input.ownerType === "MEMBER" && input.ownerMemberId !== null && external === null) ||
    (input.ownerType === "EXTERNAL" && input.ownerMemberId === null && external !== null && external.length <= 100);
  if (!validOwner) throw new InvalidAssetError("소유 정보가 소유 유형과 맞지 않습니다.");
  return { ...input, name, category, storageLocation, externalOwnerName: external, note: text(input.note) || null };
}

export function validateUnitFields(input: { managementNo: string; storageLocation: string }) {
  const managementNo = text(input.managementNo);
  const storageLocation = text(input.storageLocation);
  if (!managementNo || managementNo.length > 50) throw new InvalidAssetError("관리번호는 1~50자로 입력해 주세요.");
  if (!storageLocation || storageLocation.length > 200) throw new InvalidAssetError("보관 위치는 1~200자로 입력해 주세요.");
  return { managementNo, storageLocation };
}

export function assertStatus(value: string): AssetStatus {
  if (!ASSET_STATUSES.includes(value as AssetStatus)) throw new InvalidAssetError("상태 값이 올바르지 않습니다.");
  return value as AssetStatus;
}

export type HistoryAction = "REPAIR" | "LOST" | "DISPOSE" | "RETURN" | "LOAN" | "DAMAGE";

/** 상태 변화에 대응하는 이력 행위 (Java actionForStatus 이식). */
export function actionForStatus(previous: AssetStatus, next: AssetStatus): HistoryAction {
  if (next === "REPAIR") return "REPAIR";
  if (next === "LOST") return "LOST";
  if (next === "DISPOSED") return "DISPOSE";
  if (next === "AVAILABLE" && (previous === "IN_USE" || previous === "LOANED")) return "RETURN";
  if (next === "IN_USE" || next === "LOANED") return "LOAN";
  return "DAMAGE";
}
