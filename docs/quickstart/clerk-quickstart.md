# Clerk 인증 퀵스타트 — 신규 프로젝트 구현 순서 가이드

> **기준**: `@clerk/nextjs` v7+ (Core 3) / Next.js 15·16 App Router  
> **작성일**: 2026-05-16  
>
> 이 문서는 신규 프로젝트에서 Clerk 인증을 **처음부터 올바른 순서로** 구현하기 위한 단계별 워크플로우다.  
> 각 단계의 코드·API 상세는 [`docs/tech/clerk.md`](../tech/clerk.md)에서 관리한다.

---

## 문서 생성 흐름 (SSOT)

```
실제 구현 경험
      │
      ├──▶ docs/tech/clerk.md          (기술 레퍼런스 — API·코드·함정)
      │
      └──▶ docs/quickstart/clerk-quickstart.md  (구현 순서 가이드)
                    │
                    └──▶ docs/usecase/02-usecase-회원.md  (비즈니스 명세 — 파생 문서)
```

| 문서 | 역할 | 생성 기준 |
|------|------|---------|
| `docs/tech/clerk.md` | 기술 레퍼런스 (원본) | 구현 경험에서 직접 도출 |
| **이 문서** | 구현 순서 가이드 (원본) | 구현 경험에서 직접 도출 |
| `docs/usecase/02-usecase-회원.md` | 비즈니스 명세 (파생) | 이 문서와 `clerk.md`를 참고하여 작성 |

---

## 구현 순서

### STEP 1 — 패키지 설치 및 환경변수

```bash
pnpm add @clerk/nextjs
```

`.env.local`에 아래 변수 추가. 커스텀 플로우는 `AFTER_*` URL도 설정해야 Clerk 자동 리다이렉트와 충돌하지 않는다.

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
CLERK_WEBHOOK_SECRET=whsec_...

NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard
```

→ 전체 환경변수 목록: `clerk.md > Environment Variables`

---

### STEP 2 — ClerkProvider 설정

`src/app/layout.tsx` 루트 레이아웃을 `<ClerkProvider>`로 감싼다.

> ⚠️ `localization` prop(`unstable__errors`)은 prebuilt 컴포넌트 전용. 커스텀 플로우 에러에는 효과 없음 → STEP 4의 유틸리티 사용.

→ 코드: `clerk.md > ClerkProvider 설정` (clerk-quickstart에서 중복 없이 참조)

---

### STEP 3 — Proxy(Middleware) 설정

> ⚠️ **Next.js 16+**: `middleware.ts` → `src/proxy.ts`로 파일명 변경 필수.  
> `middleware.ts`를 그대로 쓰면 `"middleware" file convention is deprecated` 경고 발생.

public 경로 화이트리스트에 반드시 포함해야 할 경로:

| 경로 | 이유 |
|------|------|
| `/` | 랜딩 (공개) |
| `/sign-in(.*)` | 로그인 페이지 |
| `/sign-up(.*)` | 회원가입 페이지 |
| `/api/webhooks(.*)` | Clerk Webhook 수신 |

→ 코드: `clerk.md > Proxy Setup (Next.js 16+)`

---

### STEP 4 — 에러 메시지 한글 변환 유틸리티 생성 (가장 먼저 만들 것)

`src/lib/clerk-errors.ts`를 **다른 파일보다 먼저** 작성한다. 이후 모든 Clerk API 에러는 이 유틸리티를 통해 한글로 변환한다.

Clerk API 에러는 두 가지 패턴으로 반환된다:

| 패턴 | 대상 메서드 | 처리 방식 |
|------|-----------|---------|
| `{ error }` 반환 | `signIn.password()`, `signUp.verifications.*` 등 | `if (error) clerkErrorToKorean(error.code)` |
| `throw ClerkAPIResponseError` | `user.update()`, `user.updatePassword()`, `user.delete()` 등 | `try-catch` + `errors?.[0]?.code` |

→ 코드·에러코드 목록: `clerk.md > 에러 메시지 한글화`

---

### STEP 5 — 회원가입 페이지

`src/app/(public)/sign-up/[[...sign-up]]/page.tsx`

구현 순서:
1. `useAuth` + `useEffect`로 이미 로그인 상태이면 `/dashboard` 리다이렉트
2. `signUp.password({ emailAddress, password })` 호출
3. 성공 시 `signUp.verifications.sendEmailCode()` 별도 호출로 OTP 발송
4. OTP 입력 폼으로 step 전환
5. `signUp.verifications.verifyEmailCode({ code })` 호출
6. `signUp.status === "complete"` 확인 후 `/dashboard` 이동

> ⚠️ **CAPTCHA 필수**: 폼 안에 `<div id="clerk-captcha" />`가 없으면  
> `"Cannot initialize Smart CAPTCHA widget"` 오류 발생. 버튼 바로 아래에 위치.

```tsx
<button type="submit">회원가입</button>
<div id="clerk-captcha" />   {/* ← 폼 안에 반드시 포함 */}
```

→ 전체 코드: `clerk.md > useSignUp() — 커스텀 회원가입`

---

### STEP 6 — 로그인 페이지

`src/app/(public)/sign-in/[[...sign-in]]/page.tsx`

구현 순서:
1. `useAuth` + `useEffect`로 이미 로그인 상태이면 `/dashboard` 리다이렉트 (없으면 "You're already signed in." 영어 노출)
2. `signIn.password({ identifier: email, password })` 호출
3. 에러 시 `clerkErrorToKorean(error.code)` 변환 표시
4. 성공 시 `/dashboard` 이동

→ 전체 코드: `clerk.md > useSignIn() — 커스텀 로그인`

---

### STEP 7 — 비밀번호 찾기 (로그인 페이지 내 단계 전환)

별도 페이지 없이 로그인 페이지에서 `step` state로 전환.  
단계: `login` → `forgot` → `code-entry` → `reset-done`

> ⚠️ **`signIn.create({ identifier })` 필수 선행 호출**:  
> 이를 생략하고 `sendCode()`만 호출하면 OTP가 발송되지 않고 세션 터치만 발생한다.

```typescript
// OTP 발송 전 반드시 먼저 호출
await signIn.create({ identifier: resetEmail })
// 그다음 OTP 발송
await signIn.resetPasswordEmailCode.sendCode()
```

→ 전체 코드: `clerk.md > 비밀번호 재설정 (Core 3) — 비인증 사용자`

---

### STEP 8 — 아바타 드롭다운 (헤더)

shadcn `DropdownMenu` + `Avatar` 조합. `useUser()` + `useClerk()`로 구현.

> ⚠️ **아바타 판별**: `user.imageUrl` URL 패턴 검사 금지.  
> Clerk는 기본 이미지(gravatar 포함)도 `img.clerk.com`으로 프록시하므로 URL 기반 판별이 불가능하다.  
> `user.hasImage` boolean 사용.

```typescript
// ✅
{user.hasImage && <AvatarImage src={user.imageUrl} />}
// ❌
{user.imageUrl.includes("img.clerk.com") && ...}  // 항상 true
```

→ 코드: `clerk.md > useUser() — 사용자 정보 & 아바타`

---

### STEP 9 — 계정 관리 모달 (프로필 수정 탭)

shadcn `Dialog` + 좌우 분할 레이아웃. 탭: 프로필 수정 / 계정 정보.

**아바타 업로드**:
- 업로드 성공 후 `setPreview(null)` 호출 필수
- 없으면 이후 모달을 열어도 구 미리보기 이미지가 계속 표시됨

**비밀번호 변경**:
> ⚠️ 인증된 사용자 비밀번호 변경은 `user.updatePassword()` 사용.  
> `signIn.resetPasswordEmailCode.*`는 비인증 사용자 전용 — 로그인 상태에서 호출하면 session touch만 발생하고 비밀번호가 바뀌지 않는다.

```typescript
// ✅ 인증된 사용자
await user.updatePassword({ currentPassword, newPassword })
// ❌ 인증된 사용자에서는 동작 안 함
await signIn.resetPasswordEmailCode.submitPassword(...)
```

변경 성공 후: `signOut()` → 루트(`/`)로 이동 (세션 무효화 필수).

→ 코드: `clerk.md > 비밀번호 변경 — 인증된 사용자`, `계정 관리 UI 구현 — 핵심 패턴 요약`

---

### STEP 10 — 계정 정보 탭 (세션 관리·계정 삭제)

**활성 세션 목록**:
> ⚠️ `useSessionList()`는 `SessionResource[]`를 반환하며 `latestActivity`(브라우저·OS·IP)가 없다.  
> `user.getSessions()`를 `useEffect` 안에서 호출해야 `latestActivity`를 얻을 수 있다.

```typescript
// ✅
useEffect(() => {
  user.getSessions().then(setSessions)
}, [user])
// ❌
const { sessions } = useSessionList()  // latestActivity 없음
```

> ⚠️ `SessionWithActivitiesResource` 타입은 `@clerk/nextjs`에서 export되지 않음.  
> 인라인 타입 직접 정의 필요.

**현재 접속 기기 정보**: `/api/user/session-info` API Route + `useSessionInfo` 커스텀 훅 조합.

→ 코드: `clerk.md > 세션 목록`, `현재 접속 기기 정보 (useSessionInfo + API Route)`

---

### STEP 11 — Clerk Webhook (users 테이블 동기화)

`src/app/api/webhooks/clerk/route.ts` 구현.

필수 확인 사항:
- `svix` 라이브러리로 서명 검증
- `user.created` 이벤트 → `users` 테이블 INSERT
- proxy의 public 경로에 `/api/webhooks(.*)` 포함

→ 코드: `clerk.md > Clerk Webhook`

---

## 핵심 함정 요약 (12가지)

> 전체 "자주 하는 실수 체크리스트"는 `clerk.md` 맨 아래 섹션 참조.

| 순위 | 함정 | 증상 | 해결 |
|------|------|------|------|
| 🔴 | CAPTCHA div 누락 | Smart CAPTCHA 오류 | `<div id="clerk-captcha" />` 폼 내부 |
| 🔴 | `signIn.create()` 없이 `sendCode()` | OTP 미발송 | `create()` 먼저 호출 |
| 🔴 | 인증된 사용자에게 `resetPasswordEmailCode` 사용 | 비밀번호 미변경 | `user.updatePassword()` 사용 |
| 🟡 | 이미 로그인 상태 미처리 | 영어 오류 메시지 노출 | `useEffect` + `isSignedIn` 리다이렉트 |
| 🟡 | `useSessionList()`로 세션 정보 표시 | 브라우저·OS 항상 "알 수 없음" | `user.getSessions()` + `useEffect` |
| 🟡 | URL 패턴으로 아바타 판별 | 항상 기본 아바타 표시 | `user.hasImage` boolean |
| 🟡 | 아바타 업로드 후 `setPreview(null)` 누락 | 구 미리보기 지속 | 업로드 성공 후 `setPreview(null)` |
| 🟡 | `localization`으로 에러 한글화 시도 | 효과 없음 | `clerkErrorToKorean(error.code)` |
| 🟠 | throw 패턴 에러에 구조분해 시도 | 에러 미처리 | `try-catch` + `errors?.[0]?.code` |
| 🟠 | `SessionWithActivitiesResource` import | 타입 없음 | 인라인 타입 직접 정의 |
| 🟠 | Next.js 16에서 `middleware.ts` 사용 | 미들웨어 미동작 | `proxy.ts`로 변경 |
| 🟠 | `useSignIn()`에서 `isLoading` 사용 | 타입 에러 | `fetchStatus === "fetching"` |

---

## 구현 완료 체크리스트

### 환경 설정
- [ ] `@clerk/nextjs` 설치
- [ ] `.env.local` 환경변수 6개 설정 (`PUBLISHABLE_KEY`, `SECRET_KEY`, `WEBHOOK_SECRET`, URL 3개)
- [ ] `ClerkProvider` 루트 레이아웃 래핑
- [ ] `src/proxy.ts` 설정 (Next.js 16) 또는 `src/middleware.ts` (15 이하)
- [ ] public 경로 화이트리스트 4개 포함
- [ ] `src/lib/clerk-errors.ts` 유틸리티 생성

### 인증 페이지
- [ ] 회원가입: `<div id="clerk-captcha" />` 폼 내부 포함
- [ ] 회원가입: `signUp.password()` → `sendEmailCode()` → `verifyEmailCode()` 순서
- [ ] 로그인·회원가입: 이미 로그인 상태 `useEffect` 리다이렉트
- [ ] 비밀번호 찾기: `signIn.create()` → `sendCode()` → `verifyCode()` → `submitPassword()` 순서
- [ ] 모든 에러: `clerkErrorToKorean(error.code)` 한글 변환

### 계정 관리
- [ ] 아바타: `user.hasImage`로 판별, 업로드 성공 후 `setPreview(null)`
- [ ] 비밀번호 변경: `user.updatePassword()` + 성공 시 `signOut()` + 루트 이동
- [ ] 세션 목록: `user.getSessions()` + `useEffect` + 인라인 타입 정의
- [ ] 계정 삭제: `user.delete()` + `signOut()` + 루트 이동

### Webhook
- [ ] `svix` 서명 검증 구현
- [ ] `user.created` → `users` 테이블 INSERT
- [ ] public 경로에 `/api/webhooks(.*)` 포함

---

## 참조 문서

| 문서 | 경로 | 내용 |
|------|------|------|
| Clerk 기술 레퍼런스 | `docs/tech/clerk.md` | API·코드·훅·함정 |
| 회원 유스케이스 | `docs/usecase/02-usecase-회원.md` | UC 흐름·에러 메시지·완료 조건 |
