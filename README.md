# bandi-next

연극 동아리 반디의 내부 운영 서비스. 기존 Spring Boot(JSP, MySQL) 앱을 **Next.js 단독 + PostgreSQL**로 이전한 프로젝트다.
기능·권한의 정본은 기존 저장소(`../bandi`)의 `docs/feature-spec.md`와 `USER_FLOW.md`이며, 이전 진행 현황은 [`MIGRATION.md`](./MIGRATION.md)에 있다.

## 스택

Next.js 16 (App Router, `proxy.ts`) · TypeScript strict · PostgreSQL 16 + Drizzle ORM · 자체 세션(DB) · 학교 SSO(스크래핑 이식) ·
Markdown(unified + rehype-sanitize) · HWPX 생성(fflate + @xmldom/xmldom + sharp) · Tailwind 4 · Vitest · Playwright

## 로컬 실행

```bash
docker compose up -d                  # Postgres (호스트 5433)
cp .env.example .env                  # 로컬에서는 SCHOOL_SSO_MODE=fake 로 바꾼다
pnpm install
pnpm db:migrate && pnpm db:seed       # 스키마 + 가짜 SSO 계정(MemberA/B, LeaderA/B, AdminX / 비밀번호 pw)
PORT=3100 pnpm dev
```

`SCHOOL_SSO_MODE=fake`는 로컬·E2E 전용이며 `NODE_ENV=production`에서는 시작 시 거부된다.

## 검증

```bash
pnpm typecheck && pnpm lint
pnpm test        # 단위 + 통합(실제 Postgres bandi_test) — 파일 단위 순차 실행
pnpm e2e         # Playwright (서버가 3100에서 fake SSO로 떠 있어야 한다)
```

권한 매트릭스(`tests/e2e/authz-matrix.spec.ts`), IDOR·SSRF·XSS·CSRF 회귀 테스트가 포함되어 있다.

## 구조

```
src/app/            라우트 (URL은 기존 JSP 앱과 동일: /dashboard /calendar /notices /resources /activity /props ...)
src/features/<x>/   schema.ts · model.ts(순수 규칙) · service.ts(권한+DB) · actions.ts · instance.ts
src/lib/            policy(인가 정본) · session · csrf · csp · rate-limit · kst ...
drizzle/            SQL 마이그레이션
scripts/            seed-dev · migrate-from-mysql · migrate-prod
```

모든 서비스 진입에서 `lib/policy.ts`로 권한을 검사한다. `proxy.ts`의 로그인 리다이렉트는 UX 보조일 뿐 인가의 근거가 아니다.
서버 액션과 Route Handler는 공개 엔드포인트로 취급한다(Origin 검증, 입력 검증, 서비스 단 권한 검사).

## 배포

파일은 **로컬 영구 볼륨(`FILE_STORAGE_ROOT`)** 에 저장하므로 Node 상시 호스트(Docker/VPS)에 배포한다. 서버리스 플랫폼은 대상이 아니다.
DB는 로컬 Postgres 또는 Neon 같은 외부 Postgres 모두 가능하다.

```bash
cp .env.example .env.production       # 실제 값으로 채운다 (SCHOOL_SSO_MODE=real, LOGIN_ATTEMPT_HASH_SECRET 필수, TRUST_PROXY는 프록시 뒤에서만 true)
docker compose -f docker-compose.prod.yml up -d --build
```

컨테이너는 시작할 때 `drizzle/` 마이그레이션을 먼저 적용한 뒤 서버를 띄운다. 리버스 프록시에서 TLS를 종료하고 HSTS는 앱이 설정한다.

## 기존 데이터 이전 (MySQL → PostgreSQL)

```bash
# 1) 새 DB에 스키마 적용
DATABASE_URL=postgres://... pnpm db:migrate
# 2) 데이터 이전 (MySQL은 읽기 전용, 한 트랜잭션, 행 수 불일치 시 롤백)
MYSQL_URL=mysql://user:pw@host:3306/bandi DATABASE_URL=postgres://... pnpm exec tsx scripts/migrate-from-mysql.ts
# 3) 파일 바이너리: 기존 FILE_STORAGE_ROOT(private/, public/)를 새 서버의 FILE_STORAGE_ROOT로 그대로 복사한다.
```

세션과 로그인 실패 제한은 이전하지 않으므로 모든 사용자가 다시 로그인한다.

## 확정된 정책 결정

- `/team-members`는 현행 Spring 동작을 정본으로 **팀장(LEADER) 전용**으로 확정한다(운영진은 `/members`에서 전체 멤버를 관리). 바꾸려면 `src/app/(app)/team-members/page.tsx`의 `requireRole`, `member/service.ts`의 `searchTeamMembers`, `authz-matrix.spec.ts`를 함께 수정한다.

## 알려진 한계

- 파일 업로드 API는 busboy 스트리밍으로 임시 파일에 바로 쓴다(메모리에 전체를 올리지 않음). 서버 액션의 활동 내역서 사진(최대 10MiB)만 `formData`를 쓴다.
- 속도 제한은 DB(`rate_limit_bucket`) 기반이라 인스턴스 간에 공유된다. 만료 버킷·만료 세션·파일 파기 대기열은 `runMaintenanceIfDue()`가 인스턴스당 10분에 한 번 백그라운드로 정리한다(로그인 요청 시 점검).
- 디자인: 토큰·와인 셸·기본 컴포넌트는 이식했지만 가이드의 컴포넌트(dataTable·사이드바 아이콘·캘린더 강조)를 이식했다. dataTable은 공지 읽음 현황에 적용했고 나머지 목록은 모바일 친화적인 ul 목록을 유지한다.
- HWPX는 Java 생성기 출력과 동일함을 골든 테스트(`tests/unit/hwpx-golden.test.ts`)로 고정했다(섹션 DOM 동일, 나머지 항목 바이트 동일).
- 링크 카드 수집은 DNS 확인 시점에 공인 주소만 허용하지만, 실제 외부 사이트 대상 수동 검증은 하지 않았다.
