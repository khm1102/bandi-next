/** 학교 포털 자격증명 실패 제한의 순수 규칙 (Java SchoolLoginAttempt 이식). */
export interface LoginAttemptState {
  failureCount: number;
  firstFailureAt: Date | null;
  blockedUntil: Date | null;
}

export interface LoginAttemptLimits {
  maxFailures: number;
  failureWindowMs: number;
  cooldownMs: number;
}

export function isBlockedAt(state: LoginAttemptState, now: Date): boolean {
  return state.blockedUntil !== null && now.getTime() < state.blockedUntil.getTime();
}

/** 차단 중이 아니고, 첫 실패로부터 실패 창이 지났으면 만료. */
export function isExpiredAt(state: LoginAttemptState, now: Date, limits: LoginAttemptLimits): boolean {
  if (isBlockedAt(state, now) || state.firstFailureAt === null) {
    return false;
  }
  return now.getTime() >= state.firstFailureAt.getTime() + limits.failureWindowMs;
}

export function recordFailure(
  state: LoginAttemptState,
  now: Date,
  limits: LoginAttemptLimits,
): LoginAttemptState {
  if (isBlockedAt(state, now)) {
    return state;
  }
  if (state.firstFailureAt === null || isExpiredAt(state, now, limits)) {
    return { failureCount: 1, firstFailureAt: now, blockedUntil: null };
  }
  const failureCount = state.failureCount + 1;
  const blockedUntil =
    failureCount >= limits.maxFailures ? new Date(now.getTime() + limits.cooldownMs) : null;
  return { failureCount, firstFailureAt: state.firstFailureAt, blockedUntil };
}
