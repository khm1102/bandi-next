# bandi → Next.js 이전 진행 현황

계획 정본: `~/.claude/plans/mutable-kindling-creek.md` (승인됨). 기존 Spring 저장소(`../bandi`)는 읽기 전용 참조.
명세: `../bandi/docs/feature-spec.md`, `../bandi/USER_FLOW.md`, 기존 Java 테스트 98개.

## 실행 방법 (로컬)

```bash
docker compose up -d                 # Postgres 5433 (bandi, bandi_test)
cp .env.example .env                 # SCHOOL_SSO_MODE=fake 로 바꿔야 가짜 로그인 가능
pnpm db:migrate && pnpm db:seed      # 마이그레이션 + 가짜 SSO 계정 5명 (MemberA/B, LeaderA/B, AdminX, 비밀번호 pw)
PORT=3100 pnpm dev                   # 8080·5000은 타 프로세스가 점유
pnpm test                            # 단위+통합 (실제 Postgres bandi_test)
pnpm e2e                             # Playwright (서버가 3100에서 fake SSO로 떠 있어야 함)
```

## 완료

- [x] 0단계 부트스트랩: Next 16.4.5(App Router, proxy.ts), TS strict, Drizzle, Vitest, Playwright, env zod 검증.
      `cacheComponents` 는 **끔** (인증 앱, 사용자 데이터 캐시 혼입 방지). `experimental.authInterrupts` 로 `forbidden()` 사용.
- [x] 1단계 스키마: 25개 테이블 (`src/features/*/schema.ts`), 마이그레이션 `drizzle/0000_*.sql`
      (pg_trgm, updated_at 트리거, 팀 11개 시드 포함). 제약 통합 테스트 21건.
      통합: 이력 4→`member_change_history`, 파기 manifest 2→`file_retirement_queue`, 참여자→jsonb.
- [x] 2단계(부분) 인증 기반:
  - SSO: AES(Java 골든값과 일치), 파서, 신원 정규화, 연결 판정, 실패 제한(HMAC 해시), fetch 기반 HTTP 세션(출처 허용목록·리다이렉트 제한), 가짜 SSO(`SCHOOL_SSO_MODE=fake`, 운영 거부)
  - 세션: 토큰 해시 저장, 슬라이딩 만료, 요청마다 DB의 현재 역할·상태 재조회(비활성이면 폐기)
  - 정책: `src/lib/policy.ts` (Java MemberAccessContext 이식)
  - 오픈 리다이렉트 방지 `safeRedirectPath`
  - 화면: `/`, `/login`(서버 액션), `/dashboard`(임시), `forbidden.tsx`, `proxy.ts`(낙관적 리다이렉트만)

## 단계별 현황 (3~11단계)

- [x] 2단계 잔여: 디자인 가이드의 색상 토큰·Noto Sans KR·와인 사이드바 셸(탑바, lg 미만 서랍)·버튼/카드/입력 규격 이식 (`src/app/globals.css`, `src/components/app-shell.tsx`, `src/components/ui.tsx`). 분할 로그인 셸 이식(아이콘 세트·캘린더/표 세부 규격은 미이식)
- [x] 3 member (서비스·화면·E2E 완료. 프로필 사진은 4단계와 함께 완료): `/profile`, `/members`, `/team-members`(현행은 LEADER 전용·ADMIN 제외 — 유지 여부 확인 필요), 팀/기수/역할/상태 변경+이력+감사, 마지막 ADMIN 보호, 프로필 사진
- [x] 4 file (업로드·검사·로컬 저장·접근 통제·공개 승격·파기 큐·프로필 사진 API 완료): 업로드(임시→원자 이동), 매직바이트 검사(`FileContentInspector` 이식), 권한 후 스트리밍, 공개 승격(ADMIN), 파기 큐
- [x] 5 calendar (대시보드 요약은 마지막에 통합)
- [x] 6 notice (서비스·화면·API·공유·E2E 36건 통과): 상태 머신, 읽음, 첨부/본문 이미지, 공유 토큰, Markdown(remark+rehype-sanitize, `MarkdownRendererTest` 이식)
- [x] 7 resource (서비스·화면·링크 카드 SSRF 가드·공유·E2E 통과): 자료실 + OG 링크 카드(SSRF 가드) + 공유
- [x] 8 activity (기록·2단계 승인·긴급 승인·CSV·HWPX 생성/수정/제출·E2E 통과. 주의: 기능정의서 정본에 따라 /activity/archive는 모든 로그인 멤버가 열람 — 기존 Spring SecurityConfig는 LEADER/ADMIN 전용이어서 불일치였음. 사진 제거는 서버에서 연결 삭제 + 파기 대기열 처리): 기록·2단계 승인·CSV·HWPX 생성(템플릿 `../bandi/src/main/resources/templates/hwpx/`, 골든 비교)
- [x] 9 asset(props) (서비스·화면·사진 API·E2E 통과, 관리 화면은 라우트 단계 ADMIN 가드, 한글 정렬은 COLLATE "C" 명시): 관리 화면은 **라우트 단계에서 ADMIN 가드**
- [x] 10 onboarding/privacy/support, PWA(manifest·네트워크 전용 서비스 워커), 홈 요약 (E2E 통과)
- [x] 11 하드닝 (nonce CSP·보안 헤더·HSTS, 속도 제한, 권한 매트릭스 E2E, Docker 이미지·compose, MySQL→PG 이전 스크립트 실데이터 검증 완료): CSP(nonce)+보안 헤더, 요청 속도 제한, 권한 매트릭스 E2E(IDOR 84건 시나리오 이식: `../bandi` 세션 scratchpad의 idor_run*.py), 배포 문서, (선택) MySQL→PG 이전 스크립트

## 규칙 메모

- 모든 서비스 진입에서 `principal.access`(policy)로 검사. 서버 액션/Route Handler는 공개 엔드포인트.
- 로그에 사용자 입력·파일명·학번·비밀번호 금지. 파일 저장은 로컬 볼륨만(MinIO/S3 금지).
- 통합 테스트는 `fileParallelism: false` (하나의 DB 공유).
- vitest 3.x 고정 (4.x 는 레지스트리에 postcss@^8.5.32 가 없어 설치 실패했음).
- 커밋은 아직 하지 않음 (사용자 요청 시).

## 최종 상태 (이 세션 종료 시점)

- 단위·통합 405건, E2E 75건 통과. typecheck·lint·`next build`·Docker 이미지 빌드/기동 확인.
- 남은 후속 과제: 다중 인스턴스용 분산 속도 제한,
  실제 학교 SSO 대상 수동 검증(자격증명 필요), 다른 팀 `/team-members` ADMIN 허용 여부 결정.
