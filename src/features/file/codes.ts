export const STORAGE_SCOPES = ["PRIVATE", "PUBLIC"] as const;
export type StorageScope = (typeof STORAGE_SCOPES)[number];

export const UPLOAD_STATUSES = ["PENDING", "READY", "FAILED", "QUARANTINED"] as const;
export type UploadStatus = (typeof UPLOAD_STATUSES)[number];

export const FILE_PURPOSES = ["GENERAL", "PROFILE_IMAGE"] as const;
export type FilePurpose = (typeof FILE_PURPOSES)[number];

export const RETIREMENT_REASONS = ["PROFILE_PHOTO", "LINK_PREVIEW_IMAGE", "ACTIVITY_PHOTO"] as const;
export type RetirementReason = (typeof RETIREMENT_REASONS)[number];

export const RETIREMENT_STATUSES = ["PENDING", "DELETED", "FAILED"] as const;
export type RetirementStatus = (typeof RETIREMENT_STATUSES)[number];
