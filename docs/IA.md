# IA — IndiePost AI

> 정보 구조도 (Information Architecture)  
> 작성일: 2026-05-15 | 버전: v1.4 (2026-05-18 QStash·BR-02 정합화)  
> 참조: [PRD.md](PRD.md) · [TRD.md](TRD.md) · [SRS.md](SRS.md) · [BR-구독결제.md](BR-구독결제.md) · [`docs/quickstart/toss-quickstart.md`](quickstart/toss-quickstart.md)
>
> **변경 이력**
>
> - v1.0 (2026-05-15) 최초 작성 — MVP IA
> - v1.1 (2026-05-17) Phase 2 IA 확장 — `/history/[id]`, `/history/[id]/versions`, `/history/[id]/versions/compare` 신규 + 번역 모달 + 플로우 C/D 추가
> - v1.2 (2026-05-17) Phase 3 IA 확장 — `/org/**`, `/billing/**`, `/agents/**` 신규 + 조직 스위처(Sidebar) + 플로우 E/F/G 추가
> - v1.3 (2026-05-17) **Phase 3 최종 확정 (SRS·toss-quickstart 반영)**
>   - 결제 페이지 재구성: `/billing/checkout/*` 3개 → `/billing/checkout/result` 단일 URL + 쿼리 분기 (toss-quickstart §결제 결과 페이지)
>   - Agent 실행 상세 페이지에 **Function Calling 트레이스 영역** 추가 (도구 호출 순서·인자·결과 코드블록)
>   - 조직 삭제 모달에 **30일 grace 정책 안내** 강조 + 복원 가능 안내 (BR-31)
>   - Personal Org 배지·보호 정책 UI 가시화 (목록·설정 페이지)
>   - 지침 카드에 **작성자(`created_by`) 표시** + 조직 공용 안내 배너 (BR-34)
>   - 결제 모달·플로우에 **결제 상태 11종 매핑 표시** 및 가상계좌 입금 대기 UI 추가
> - v1.4 (2026-05-18) **QStash·BR-02 정합화**
>   - **Team 플랜 제거** — 모든 플랜 비교 테이블·뱃지·드롭다운에서 Team 제거 (Free/Pro 2종)
>   - **사이드바 잔여 사용량 위젯 추가** — BR-구독결제.md §5 명세: 현재 플랜·progress bar(예: 8/10)·업그레이드 버튼(Free일 때)
>   - **`/generate` 진입 시 상단에 잔여/한도 표시** — 0회 시 생성 버튼 disabled + 업그레이드 안내
>   - **`/billing` 해지 예약 UI** — 활성 구독에 [구독 취소] → 확인 모달 → "해지 예약" amber 카드로 전환 + [해지 예약 취소] 버튼 (UC-31·38)
>   - **`/system/crons` 신규 페이지** (SystemAdmin 전용) — Schedule 목록·다음 실행 시각·최근 실행 이력 (UC-39)
>   - **결제 실패 분기에 자동 재시도 안내** — 일시적 오류는 메시지 큐가 자동 복구, 영구 실패는 past_due 명확화 (BR-36)

---

## 디자인 설정 요약

| 항목                | 선택값                                                          |
| ------------------- | --------------------------------------------------------------- |
| 컴포넌트 라이브러리 | shadcn/ui + Tailwind v4                                         |
| 브랜드 디자인 방향  | Notion 스타일 (미니멀, 웜 뉴트럴, 콘텐츠 중심)                  |
| 확장 UI             | Magic UI (마이크로 인터랙션) + Aceternity UI (랜딩 히어로 효과) |
| 모션 라이브러리     | Framer Motion                                                   |
| 참조 디자인 가이드  | design_guide-common.md · design_guide-web.md · notion.md        |
| 아이콘              | Lucide React (shadcn/ui 번들)                                   |
| 폰트                | Inter (Notion 스타일 — NotionInter 대체)                        |

---

## 1. 사이트맵

```
IndiePost AI
│
├── [공개 영역 — Topbar 네비게이션]  AuthLayout 적용: /sign-in, /sign-up
│   ├── /                        랜딩 페이지 (SEO)
│   ├── /sign-in                 로그인         AuthLayout
│   └── /sign-up                 회원가입       AuthLayout
│
├── [인증 영역 — Sidebar 네비게이션]
│   ├── /dashboard               대시보드 홈
│   ├── /generate                콘텐츠 생성
│   │   └── /generate/[id]       생성 결과 에디터 (Phase 2: 번역 모달·버전 진입 버튼 추가)
│   ├── /guidelines              AI 지침 목록
│   │   ├── /guidelines/new      지침 생성
│   │   └── /guidelines/[id]     지침 수정
│   ├── /history                 생성 이력 목록 (커서 기반 무한스크롤)
│   │   └── /history/[id]                              이력 상세 (Phase 2)
│   │       └── /history/[id]/versions                  버전 목록 (Phase 2)
│   │           └── /history/[id]/versions/compare      두 버전 비교 Diff (Phase 2)
│   │
│   ├── /agents                  AI Agent 목록 (Phase 3)
│   │   ├── /agents/new                                Agent 생성 (Phase 3, org:admin)
│   │   └── /agents/[id]                                Agent 상세·설정 (Phase 3)
│   │       └── /agents/[id]/runs                       실행 이력 (Phase 3)
│   │           └── /agents/[id]/runs/[runId]           실행 단건 상세 (Phase 3)
│   │
│   ├── /org           조직 목록 (Phase 3)
│   │   ├── /org/new                         조직 생성 (Phase 3)
│   │   └── /org/[id]                         조직 설정 (Phase 3, org:admin)
│   │       └── /org/[id]/members             멤버 관리 (Phase 3, org:admin)
│   │
│   └── /billing                 결제·플랜 (Phase 3, org:admin)
│       ├── /billing/checkout                          결제 진행 — 주문 생성 + 토스 결제창 (Phase 3)
│       ├── /billing/checkout/result                   결제 결과 단일 URL — 쿼리 분기(성공/실패/취소) (Phase 3)
│       ├── /billing/payments                          결제 이력 (Phase 3, org:admin)
│       └── /billing/payments/[paymentKey]             결제 단건 상세 + 환불 요청 (Phase 3, org:admin)
│
├── [시스템 운영 — Phase 3 v1.4]
│   └── /system/crons                Cron 대시보드 (SystemAdmin 전용)
│       └── /system/crons/[code]/runs  Cron 실행 이력
│
├── [시스템 페이지 — 레이아웃 없음]
│   ├── /not-found               404 페이지 (Next.js not-found.tsx)
│   └── /error                   500 페이지 (Next.js error.tsx)
│
└── [개발자 전용 — 인증 불필요, 프로덕션 비공개]
    └── /design-system           디자인 시스템 플레이그라운드
```

### 인증 전/후 접근 가능 페이지

| 페이지                                          | 비로그인                | 로그인 후                                                                              | SEO 대상 |
| ----------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------- | -------- |
| `/` 랜딩                                        | ✅ 접근 가능            | ✅ 접근 가능                                                                           | ✅       |
| `/sign-in` 로그인                               | ✅ 접근 가능            | 리다이렉트 → `/dashboard`                                                              | -        |
| `/sign-up` 회원가입                             | ✅ 접근 가능            | 리다이렉트 → `/dashboard`                                                              | -        |
| `/dashboard`                                    | 리다이렉트 → `/sign-in` | ✅ 접근 가능                                                                           | -        |
| `/generate`                                     | 리다이렉트 → `/sign-in` | ✅ 접근 가능                                                                           | -        |
| `/generate/[id]`                                | 리다이렉트 → `/sign-in` | ✅ 접근 가능                                                                           | -        |
| `/guidelines`                                   | 리다이렉트 → `/sign-in` | ✅ 접근 가능                                                                           | -        |
| `/guidelines/new`                               | 리다이렉트 → `/sign-in` | ✅ 접근 가능                                                                           | -        |
| `/guidelines/[id]`                              | 리다이렉트 → `/sign-in` | ✅ 접근 가능                                                                           | -        |
| `/history`                                      | 리다이렉트 → `/sign-in` | ✅ 접근 가능                                                                           | -        |
| `/history/[id]` **(Phase 2)**                   | 리다이렉트 → `/sign-in` | ✅ 본인 콘텐츠만 (타인 콘텐츠 → 404)                                                   | -        |
| `/history/[id]/versions` **(Phase 2)**          | 리다이렉트 → `/sign-in` | ✅ 본인 콘텐츠만                                                                       | -        |
| `/history/[id]/versions/compare` **(Phase 2)**  | 리다이렉트 → `/sign-in` | ✅ 본인 콘텐츠만                                                                       | -        |
| `/agents` **(Phase 3)**                         | 리다이렉트 → `/sign-in` | ✅ 활성 조직 멤버 이상                                                                 | -        |
| `/agents/new` **(Phase 3)**                     | 리다이렉트 → `/sign-in` | ✅ `org:admin`만 (member는 403)                                                        | -        |
| `/agents/[id]` **(Phase 3)**                    | 리다이렉트 → `/sign-in` | ✅ 활성 조직 멤버 이상 (다른 조직 → 404)                                               | -        |
| `/agents/[id]/runs` **(Phase 3)**               | 리다이렉트 → `/sign-in` | ✅ 활성 조직 멤버 이상                                                                 | -        |
| `/agents/[id]/runs/[runId]` **(Phase 3)**       | 리다이렉트 → `/sign-in` | ✅ 활성 조직 멤버 이상                                                                 | -        |
| `/org` **(Phase 3)**                            | 리다이렉트 → `/sign-in` | ✅ 접근 가능 (내 조직만 노출)                                                          | -        |
| `/org/new` **(Phase 3)**                        | 리다이렉트 → `/sign-in` | ✅ 접근 가능                                                                           | -        |
| `/org/[id]` **(Phase 3)**                       | 리다이렉트 → `/sign-in` | ✅ `org:admin`만 (member는 403)                                                        | -        |
| `/org/[id]/members` **(Phase 3)**               | 리다이렉트 → `/sign-in` | ✅ `org:admin`만 (member는 읽기 전용 — `/agents` 등에서 멤버 뱃지로 확인)              | -        |
| `/billing` **(Phase 3)**                        | 리다이렉트 → `/sign-in` | ✅ `org:admin`만 (member는 403 + 사용량은 `/dashboard`에서 확인)                       | -        |
| `/billing/checkout` **(Phase 3)**               | 리다이렉트 → `/sign-in` | ✅ `org:admin`만                                                                       | -        |
| `/billing/checkout/result` **(Phase 3)**        | 리다이렉트 → `/sign-in` | ✅ `org:admin`만 (토스 successUrl·failUrl 단일 콜백 — `paymentKey`/`code` 쿼리로 분기) | -        |
| `/billing/payments` **(Phase 3)**               | 리다이렉트 → `/sign-in` | ✅ `org:admin`만                                                                       | -        |
| `/billing/payments/[paymentKey]` **(Phase 3)**  | 리다이렉트 → `/sign-in` | ✅ `org:admin`만 (본 조직 결제만 — 다른 조직 → 404)                                    | -        |
| `/system/crons` **(Phase 3, v1.4)**             | 404                     | ✅ `SystemAdmin`만 (일반 사용자에게는 404 — 페이지 존재 노출 방지)                     | -        |
| `/system/crons/[code]/runs` **(Phase 3, v1.4)** | 404                     | ✅ `SystemAdmin`만                                                                     | -        |

---

## 2. 사용자 플로우

### 플로우 A — 신규 사용자 Happy Path (핵심 시나리오)

```
랜딩 페이지(/)
    │  [시작하기 CTA 클릭]
    ▼
회원가입(/sign-up)
    │  [이메일 + 비밀번호 가입 → OTP 이메일 인증]
    ▼
대시보드(/dashboard)
    │  [지침 등록 유도 배너 클릭] ← 최초 진입 시 Empty State
    ▼
지침 생성(/guidelines/new)
    │  [브랜드 톤·문체 지침 입력 후 저장]
    ▼
콘텐츠 생성(/generate)
    │  [주제 입력 + 지침 선택 + 생성 클릭]
    ▼
생성 결과 에디터(/generate/[id])
    │  [초안 검토·수정 후 복사]
    ▼
외부 블로그 플랫폼에 게시
```

### 플로우 B — 재방문 사용자 (지침 등록 완료 후)

```
로그인(/sign-in)
    ▼
대시보드(/dashboard)
    │  [콘텐츠 생성 바로가기 클릭]
    ▼
콘텐츠 생성(/generate)
    │  [주제 입력 → 생성]
    ▼
생성 결과 에디터(/generate/[id])
```

### 플로우 C — 버전 이력 관리·복원 (Phase 2)

```
생성 이력 목록(/history)
    │  [이력 항목 클릭]
    ▼
이력 상세(/history/[id])
    │  [버전 이력 보기 클릭]
    ▼
버전 목록(/history/[id]/versions)
    │  ┌─ [특정 버전 카드 클릭] → 미리보기 Drawer
    │  ├─ [두 버전 선택 + 비교 버튼] → 비교 화면(/history/[id]/versions/compare?from=A&to=B)
    │  └─ [복원 버튼 클릭] → 확인 모달 → POST /restore
    │       ↳ 안전장치: 복원 직전 본문이 새 버전으로 자동 스냅샷
    ▼
이력 상세(/history/[id])  ← 본문이 복원된 상태
    │  [에디터에서 이어서 편집]
```

### 플로우 D — 다국어 번역 생성 (Phase 2)

```
이력 상세(/history/[id])  또는  생성 결과 에디터(/generate/[id])
    │  [번역 버튼 클릭]
    ▼
번역 모달 오픈
    │  ├─ [원문 언어 표시 — Badge]
    │  ├─ [번역 언어 선택 — BR-22: ko/en 중 원문 외만 활성]
    │  └─ [번역 시작 클릭]
    │       ↳ 첫 1회만 quota 안내 모달 (BR-21 — [usecase-common](usecase/usecase-common.md#2-공통-비즈니스-규칙-common-business-rules) 참조)
    ▼
번역 스트리밍 표시 (모달 내부)
    │  ├─ 실시간 마크다운 청크 append
    │  └─ 완료 → 성공 토스트 (메시지 정의: [usecase-common §4-3](usecase/usecase-common.md#4-3-성공-피드백))
    ▼
번역 결과 탭 노출 (이력 상세 페이지에 원문/번역 탭 구성)
    │  ├─ [번역본 복사] / [마크다운 다운로드 — [07-usecase §7](usecase/07-usecase-다국어번역.md#7-uiux-고려사항) 참조]
    │  └─ [다시 번역] → BR-23 (force=true) 재생성
```

> 모달·토스트의 실제 본문 텍스트는 **[07-usecase-다국어번역.md §7](usecase/07-usecase-다국어번역.md#7-uiux-고려사항)** 단일 정의.

### 플로우 E — 조직 생성·멤버 초대 (Phase 3)

> 화면 전환만 정의 — Personal Org 자동 생성 시스템 동작·초대 발송 후 Webhook 흐름·역할 변경 검증은 **[08-usecase-조직관리.md UC-23·24·25](usecase/08-usecase-조직관리.md)** 단일 정의.

```
신규 가입(/sign-up) → Personal Org 자동 생성 (서버 내부, 08-usecase-조직관리 §4-1 참조)
    ▼
대시보드(/dashboard) — Sidebar Personal Org 활성 표시
    │  [OrganizationSwitcher → 조직 만들기]
    ▼
조직 생성(/org/new) — 조직명·slug → [생성]
    ▼
조직 설정(/org/[id]) → [멤버 관리 탭]
    ▼
멤버 관리(/org/[id]/members)
    │  ├─ [+ 멤버 초대] → 초대 모달 → 이메일 발송
    │  ├─ [역할 변경] → admin/member 토글
    │  └─ [멤버 제거] → 확인 모달
    ▼
(초대받은 사용자) 이메일 링크 → Clerk SignIn/SignUp → 조직 자동 가입
    ▼
대시보드(조직 컨텍스트로 진입)
```

### 플로우 E-2 — 조직 삭제·복원 (30일 grace) (Phase 3)

> 화면 전환만 정의 — soft delete 동작·구독 cancel·30일 경과 cron 완전 삭제는 **[08-usecase-조직관리.md UC-26·27](usecase/08-usecase-조직관리.md#uc-26--조직-삭제-soft-delete-30일-grace)** 및 [BR-31](usecase/usecase-common.md#2-공통-비즈니스-규칙-common-business-rules) 단일 정의.

```
/org/[id] → 위험 영역 [조직 삭제] (Personal Org는 disabled)
    ▼
확인 모달 — slug 입력 + 30일 grace 안내 → [삭제하기]
    ▼
"조직이 삭제 예정 상태로 전환되었습니다 · 30일 내 복원 가능" 토스트
    │  (활성 조직이었다면 Personal Org로 자동 전환 + /org 리다이렉트)
    ▼
/org — 해당 카드에 [삭제 예정 N일] amber 뱃지 + [복원]
    │
    ├─ [복원] 클릭 (30일 내) → 확인 모달 → "조직이 복원되었습니다"
    └─ 30일 경과 → 카드 사라짐 (cron이 완전 삭제, 복구 불가)
```

### 플로우 F — 구독 결제 (Free → Pro 신규 구독) (Phase 3)

> 화면 전환만 정의 — 서버 내부 동작(주문 생성·confirm·빌링키 발급·예외 분기)은 **[09-usecase-결제.md UC-28](usecase/09-usecase-결제.md#uc-28--신규-구독-결제-free--pro)** 단일 정의.

```
대시보드(/dashboard) — 사용량 위젯 "한도 임박" 경고
    │  [업그레이드 CTA] 또는 Sidebar [결제·플랜]
    ▼
결제·플랜(/billing) — 플랜 비교 테이블
    │  └─ admin: [Pro로 업그레이드] 클릭   (member는 메뉴 자체 숨김)
    ▼
결제 진행(/billing/checkout?plan=pro)
    │  ├─ Toss 결제창 호출 (호스팅 UI 점유)
    │  ├─ [결제창 닫음] → 토스트 + [다시 시도]
    │  └─ [인증 성공] → Toss가 result URL로 리다이렉트
    ▼
결제 결과(/billing/checkout/result) — 단일 URL, 쿼리 분기
    │  ├─ paymentKey 있음 (인증 성공) → 서버 confirm → 결과 분기:
    │  │     ├─ 성공 → confetti + "{plan} 활성화" + 영수증
    │  │     ├─ 가상계좌 발급 → 플로우 F-2 진입
    │  │     └─ 실패 → 한글 에러 + [다시 결제하기]
    │  └─ code 있음 (취소/실패) → 에러 메시지 + [다시 시도]
    ▼
대시보드(/dashboard) — 플랜 뱃지 갱신
```

> 결제 결과 페이지의 새로고침·이탈 폴백(자동 sync 호출)은 [09-usecase-결제 §4-3](usecase/09-usecase-결제.md#4-3-confirm-누락-폴백-uc-28-단계-9-실패--사용자-새로고침이탈) 참조 — 사용자 화면 흐름은 동일하므로 IA는 표시하지 않음.

### 플로우 F-2 — 가상계좌 입금 대기 → 자동 활성화 (Phase 3)

```
결제 결과(/billing/checkout/result) — PAY_WAITING
    │  ├─ 가상계좌 카드: 은행·계좌·입금자명·마감일
    │  ├─ [복사하기] · [홈으로]
    │  └─ 안내: "입금 확인 시 자동으로 활성화됩니다 · 이메일 안내 발송"
    ▼
(사용자가 외부 은행에서 입금)
    ▼
(서버: Toss Webhook 수신 → 플랜 활성화 — 09-usecase-결제 UC-33 참조)
    ▼
이메일 수신 → 다음 /billing 진입 시 활성 상태 확인
```

### 플로우 F-3 — 환불 요청 (Phase 3)

```
/billing/payments → 결제 행 [상세] 클릭
    ▼
/billing/payments/[paymentKey] — 환불 요청 폼
    │  [사유 입력 + 환불 예상액 실시간 표시]
    │  [환불 요청] → AlertDialog → [요청 제출]
    ▼
"환불 요청이 접수되었습니다" 토스트
    │  → 결제 단건에 "환불 요청 대기 중" 뱃지 노출
    │  → (SystemAdmin 승인 흐름은 09-usecase-결제 UC-32 참조)
    ▼
승인 후 이메일 수신 → 결제 단건에 취소 이력 표시
```

> **정기결제 cron 흐름(매일 02시 자동 청구·일시적 오류 메시지 큐 자동 재시도·past_due grace·자동 free 강등·빌링키 파기)** 은 사용자가 보는 화면이 없으므로 IA에서 제외. 전체 비즈니스 흐름은 [09-usecase-결제 UC-29](usecase/09-usecase-결제.md#uc-29--정기결제-자동-청구-cron) · [BR-36](usecase/usecase-common.md#2-공통-비즈니스-규칙-common-business-rules) · [BR-39 빌링키 파기](usecase/usecase-common.md#2-공통-비즈니스-규칙-common-business-rules) 참조.
>
> **사용자에게 노출되는 결과** (§6 페이지 영역에 단일 정의):
>
> - 일시적 오류 → 메시지 큐 자동 재시도로 자체 복구 → 사용자 인지 없음
> - 영구 실패(카드 거절·잔액 부족·빌링키 만료) → `/dashboard` + `/billing` 빨강 배너 "정기결제 실패 · [지금 결제]" (BR-36 3일 grace)
> - 3일 경과 후 자동 free 강등 → `/billing` 무료 플랜 카드 + canceled 안내

### 플로우 F-4 — 해지 예약 + 해지 취소 (Phase 3, v1.4 신규)

> 화면 전환만 정의 — 서버 동작(cancel_scheduled_at 설정·finalize-canceled cron·빌링키 파기)은 **[09-usecase-결제.md UC-31·38](usecase/09-usecase-결제.md)** · [BR-38·39](usecase/usecase-common.md#2-공통-비즈니스-규칙-common-business-rules) 단일 정의.

```
/billing 활성 구독 → [구독 취소] 클릭
    ▼
AlertDialog: "{current_period_end}까지 Pro 기능 사용 가능 · 결제일 전 언제든 취소 가능"
    [취소 안 함] [구독 취소]
    ▼
"구독 해지가 예약되었습니다 · [해지 예약 취소]" 토스트
    ▼
/billing — 해지 예약 amber 카드 표시 ("{date}까지 사용 가능")
    │
    ├─ [해지 예약 취소] 클릭 (current_period_end 전)
    │     → DELETE /api/billing/subscription/cancel
    │     → "해지 예약이 취소되었습니다" 토스트
    │     → amber 카드 사라짐, 정상 구독 상태로 복귀
    │
    └─ current_period_end 도래 (사용자 인지 없음)
          → finalize-canceled cron 실행 → status='canceled' + 빌링키 파기 + 이메일 안내
          → /billing 무료 플랜 카드로 자동 전환 + canceled 안내 배너
```

### 플로우 G — AI Agent 생성·실행·트레이스 조회 (Phase 3)

> 화면 전환만 정의 — Agent 생성 폼 상세 필드·즉시 실행 동작·Function Calling 루프·실패 분기는 **[10-usecase-에이전트.md UC-34·35·37](usecase/10-usecase-에이전트.md)** 단일 정의.

```
Agent 목록(/agents)
    │  ├─ Free 플랜: Empty State + [업그레이드 →]
    │  └─ Pro 이상 admin: [+ 새 Agent 만들기]
    ▼
Agent 생성(/agents/new) — 폼 작성 후 [생성]
    ▼
Agent 상세(/agents/[id])
    │  ├─ 다음 실행 카운트다운
    │  ├─ [즉시 실행] (member 이상)
    │  └─ [실행 이력 전체보기]
    ▼
실행 이력(/agents/[id]/runs) — 표 + status='running' 5초 polling
    ▼
실행 단건 상세(/agents/[id]/runs/[runId])
    │  ┌─ Function Calling 트레이스 카드 (시간순) ───┐
    │  │  #1 🎯 topic_picker     ✅ success  340ms   │
    │  │  #2 ✍️ content_writer   ✅ success  18.2s   │
    │  │  #3 🚀 platform_publisher 🌫️ skipped (P3.5)│
    │  └────────────────────────────────────────────┘
    │  (status='running'이면 SSE로 새 카드 실시간 append)
    │
    └─ 결과: 생성 콘텐츠 [에디터로 열기] · 실패 시 [재시도]
```

> **Agent 자동 실행(cron) 플로우**는 사용자가 보는 화면이 없으므로 IA에서 제외. 전체 비즈니스 흐름·Function Calling 루프 동작은 [10-usecase-에이전트 UC-36](usecase/10-usecase-에이전트.md#uc-36--agent-자동-실행-cron-function-calling-루프) 참조. 사용자는 실행 결과를 `/agents/[id]/runs`에서 사후 확인.

### 주요 분기점

| 분기 조건                                                 | 이동 경로                                                                                                                                                                                                                        |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 비로그인 상태로 `/generate` 직접 접근                     | → `/sign-in?redirect=/generate`                                                                                                                                                                                                  |
| 로그인 상태로 `/sign-in` 접근                             | → `/dashboard`                                                                                                                                                                                                                   |
| 대시보드 최초 진입 (지침 0개)                             | → Empty State + "지침 등록하기" CTA 강조                                                                                                                                                                                         |
| AI 생성 중 Rate Limit 초과 (429)                          | → 토스트: "잠시 후 다시 시도해주세요" + 재시도 버튼                                                                                                                                                                              |
| 타인 콘텐츠 ID로 `/history/[id]` 직접 접근 **(Phase 2)**  | → 404 (소유자 검증 미들웨어 — BR-04)                                                                                                                                                                                             |
| 원문과 동일 언어로 번역 시도 **(Phase 2)**                | → 언어 선택 Dropdown에서 비활성화 (BR-22)                                                                                                                                                                                        |
| 동일 언어 번역본 존재 시 재번역 시도 **(Phase 2)**        | → 409 응답 → 덮어쓰기 확인 모달 (BR-23, [07-usecase §7](usecase/07-usecase-다국어번역.md#7-uiux-고려사항) 참조)                                                                                                                  |
| 버전 복원 시 직전 본문과 동일 **(Phase 2)**               | → 409 응답 → warning 토스트 (메시지: usecase-common §4-3)                                                                                                                                                                        |
| 본문 100KB 초과 시 버전 스냅샷 시도 **(Phase 2)**         | → 400 응답 → error 토스트 + 본문 분할 안내 (BR-20)                                                                                                                                                                               |
| 번역 스트리밍 중 네트워크 끊김 **(Phase 2)**              | → `status='failed'` + 에러 영역 + [다시 번역] 버튼 ([07-usecase §5-2](usecase/07-usecase-다국어번역.md#5-예외-흐름) 참조)                                                                                                        |
| 활성 조직 없이 `/dashboard` 진입 **(Phase 3)**            | → `users.default_organization_id`로 자동 설정 → 없으면 `/org/new` 강제 이동 (BR-31 personal_org 누락 fallback)                                                                                                                   |
| 다른 조직의 콘텐츠 ID로 접근 **(Phase 3)**                | → 404 (조직 스코프 미들웨어 — BR-31)                                                                                                                                                                                             |
| `org:member`가 `org:admin` 전용 페이지 접근 **(Phase 3)** | → 403 페이지 + "관리자에게 요청하세요" 안내                                                                                                                                                                                      |
| 플랜 한도 초과 (생성/번역/Agent) **(Phase 3)**            | → 402 응답 → 토스트: "이번 달 한도를 모두 사용했습니다" + "플랜 업그레이드" CTA → `/billing` (BR-32)                                                                                                                             |
| Free 플랜에서 `/agents/new` 접근 **(Phase 3)**            | → 페이지 진입 차단 + 업그레이드 안내 모달 (max_agents=0)                                                                                                                                                                         |
| 멤버 초대 시 멤버 한도 초과 **(Phase 3)**                 | → 409 + "플랜 업그레이드" CTA 모달 (BR-30)                                                                                                                                                                                       |
| 마지막 admin을 member로 강등 시도 **(Phase 3)**           | → 400 + 인라인 에러 "마지막 관리자는 강등할 수 없습니다"                                                                                                                                                                         |
| Cron 표현식 최소 간격 미만 입력 **(Phase 3)**             | → 폼 인라인 에러 + react-js-cron 위젯 비활성화 (BR-33)                                                                                                                                                                           |
| 결제 실패 (카드 거절·취소) **(Phase 3)**                  | → `/billing/checkout/fail` + errorCode 표시 + 재시도 CTA                                                                                                                                                                         |
| 정기 결제 실패 (past_due) **(Phase 3)**                   | → 대시보드 상단 영구 배너 "결제 실패 — 3일 내 미해결 시 Free 강등" + [지금 결제] CTA                                                                                                                                             |
| Agent 실행 중 quota 초과 **(Phase 3)**                    | → `agent_runs.status='failed'` + `error_code='QUOTA_EXCEEDED'` 기록, UI에는 다음 결제 주기 안내 뱃지만                                                                                                                           |
| Agent 주제 풀(manual_pool) 소진 **(Phase 3)**             | → Agent 상세 페이지 amber 배너 + [주제 추가] CTA (상세: [10-usecase-에이전트 §5-4](usecase/10-usecase-에이전트.md#5-예외-흐름))                                                                                                  |
| **soft-deleted 조직에서 쓰기 액션** **(Phase 3)**         | → 페이지 상단 amber 배너 + 모든 쓰기 버튼 disabled (상세: [08-usecase-조직관리 §5-4](usecase/08-usecase-조직관리.md#5-예외-흐름))                                                                                                |
| **결제 인증 실패/취소/만료** **(Phase 3)**                | → `/billing/checkout/result`에서 에러 메시지 한글 매핑 + [다시 시도] (상세: [09-usecase-결제 §4·5](usecase/09-usecase-결제.md#4-대안-흐름))                                                                                      |
| **가상계좌 입금 대기** **(Phase 3)**                      | → 결과 페이지에 PAY_WAITING 카드 + 입금 정보 노출 (상세: [09-usecase-결제 UC-33](usecase/09-usecase-결제.md#uc-33--가상계좌-입금-대기확인))                                                                                      |
| **정기결제 실패 → past_due 배너** **(Phase 3)**           | → 대시보드 상단 빨강 영구 배너(admin) + [지금 결제 →] (상세: [09-usecase-결제 UC-29](usecase/09-usecase-결제.md#uc-29--정기결제-자동-청구-cron) · [BR-36](usecase/usecase-common.md#2-공통-비즈니스-규칙-common-business-rules)) |
| **Agent 도구 호출 한도/타임아웃 초과** **(Phase 3)**      | → 트레이스 마지막 카드를 빨강 강조 + [재시도] (상세: [10-usecase-에이전트 §5-3](usecase/10-usecase-에이전트.md#5-예외-흐름))                                                                                                     |

> **그 외 비즈니스 예외**(Personal Org 보호 위반·멤버 한도·마지막 admin·30일 grace 경과·confirm 가드·Webhook 멱등성·Function Calling schema 위반 등)는 본 IA 분기 테이블이 아닌 **각 Usecase 문서의 §5 예외 흐름**에 SSOT 정의되어 있다. IA는 사용자가 보는 페이지 리다이렉트·UI 분기만 표시한다.

**[v1.4 신규 분기]**

| 분기 조건                                               | 이동 경로                                                                                    |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `/generate` 한도 0회로 진입 (Free, BR-구독결제.md §3.1) | → 상단 잔여 표시 + 생성 버튼 disabled + "이번 달 한도 소진" 카드 + [업그레이드 →] `/billing` |
| 활성 구독에서 [구독 취소]                               | → AlertDialog (BR-38 해지 예약) → 확인 → `/billing` 해지 예약 amber 카드로 전환 (UC-31)      |
| 해지 예약 카드에서 [해지 예약 취소]                     | → 토스트 즉시 처리 → amber 카드 사라짐 (UC-38)                                               |
| `current_period_end` 경과 후 해지 예약 취소 시도        | → 409 + "이미 처리되어 취소할 수 없습니다 · 다시 구독해주세요" + [Pro 구독 →] UC-28          |
| SystemAdmin 아닌 사용자가 `/system/crons` 접근          | → 404 (페이지 존재 노출 방지 — 403 대신 404)                                                 |

---

## 3. 네비게이션 구조

### 3-1. Topbar (공개 영역 — `/`, `/sign-in`, `/sign-up`)

```
┌──────────────────────────────────────────────────────────┐
│  [IndiePost AI 로고]   [기능]              [로그인] [시작하기▶] │
│  ← Glass & Floating (backdrop-blur:12px, 하단 whisper border)  │
└──────────────────────────────────────────────────────────┘
```

| 요소         | 비로그인                   | 로그인 후             |
| ------------ | -------------------------- | --------------------- |
| 로고         | `/` 링크                   | `/dashboard` 링크     |
| 기능         | 랜딩 `#features` 앵커 링크 | 표시 유지             |
| 로그인 버튼  | `/sign-in`                 | 미표시                |
| 시작하기 CTA | `/sign-up`                 | `/dashboard` 바로가기 |

### 3-2. Sidebar (인증 영역 — `/dashboard/**`)

```
┌──────────────────────┐
│  [IndiePost AI 로고]  │  w-64 고정 / 모바일: Sheet 드로어
│  ─────────────────── │
│  [OrgSwitcher ▾]     │  Clerk <OrganizationSwitcher> (Phase 3)
│                      │   - 조직 전환·생성·관리 진입점
│  ─────────────────── │
│  [대시보드]           │  /dashboard
│  [콘텐츠 생성]        │  /generate       ← 주요 CTA
│  [AI 지침 관리]       │  /guidelines
│  [생성 이력]          │  /history
│  [AI Agent]          │  /agents         (Phase 3, member 이상)
│  ─────────────────── │
│  [조직 설정]          │  /org/[id]      (Phase 3, org:admin만)
│  [결제·플랜]          │  /billing                  (Phase 3, org:admin만)
│  ─────────────────── │
│  [UserButton]        │  Clerk UserButton (아바타 + 로그아웃)
└──────────────────────┘
```

**Phase 3 메뉴 가시성 규칙**

- `[AI Agent]`: 활성 조직이 있는 모든 멤버에게 노출. Free 플랜은 진입 시 업그레이드 안내 (BR-32 max_agents=0)
- `[조직 설정]`, `[결제·플랜]`: `org:admin` 역할일 때만 메뉴 항목 노출 (member에게는 메뉴 자체가 숨김 — 403 페이지를 보게 되는 일 없도록)
- `[OrgSwitcher]`: 조직이 1개뿐인 사용자도 노출 (조직 생성 진입점 역할 겸함). 현재 조직이 Personal Org면 이름 옆 `[개인]` 회색 뱃지 표시
- **Personal Org 컨텍스트 가시화**: Sidebar 상단 OrganizationSwitcher 아래 1줄 caption — `is_personal=true`이면 "이곳에서 작성한 지침·콘텐츠는 본인만 볼 수 있습니다", 일반 조직이면 "조직 내 모든 멤버가 지침·콘텐츠를 공유합니다" (BR-34 안내)
- **soft-deleted 조직 진입 시**: 30일 grace 진입한 조직(`deleted_at IS NOT NULL`)이 현재 활성 조직이면 Sidebar 상단에 amber 배너 "이 조직은 N일 후 영구 삭제됩니다 · [복원하기]" 영구 표시. 모든 쓰기 액션 disabled + 툴팁
- **[v1.4] 잔여 사용량 위젯 (Sidebar 하단)** — BR-구독결제.md §5 명세 100% 준수:
  - 현재 플랜 이름(Free/Pro 뱃지)
  - 사용량 progress bar: `{generations_used} / {limit}` (예: `8 / 10`) — 80% 초과 시 amber, 100% 시 red
  - Free 플랜 시 [업그레이드] 버튼 (Pro로 즉시 이동 → `/billing`)
  - Pro 플랜 시 [업그레이드 버튼 미표시] — 단 해지 예약 상태면 amber 배너 "예약 해지 진행중 · {date}까지 사용" + [해지 취소] (UC-38)
  - past_due 상태면 빨강 배너 "결제 실패 · [지금 결제]" (admin만 노출)
- **[v1.4] SystemAdmin 진입 시**: Sidebar 하단에 별도 "시스템" 섹션 노출 — [Cron 대시보드 →] 메뉴 활성

**반응형 처리**

- `md` (768px) 이상: 좌측 w-64 Sidebar 고정
- `md` 미만: Sidebar 숨김 → 상단 햄버거 버튼 → shadcn/ui `<Sheet>` 드로어

---

## 4. 페이지 계층 및 URL 구조

| 페이지명         | URL                              | 레이아웃                                      | 접근 권한           | 주요 목적                                                                                                                 |
| ---------------- | -------------------------------- | --------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 랜딩             | `/`                              | Topbar                                        | 공개                | 서비스 소개·전환                                                                                                          |
| 로그인           | `/sign-in`                       | AuthLayout                                    | 공개                | Clerk SignIn (이메일+비밀번호)                                                                                            |
| 회원가입         | `/sign-up`                       | AuthLayout                                    | 공개                | Clerk SignUp (이메일+비밀번호+OTP)                                                                                        |
| 대시보드         | `/dashboard`                     | Sidebar                                       | 로그인 필수         | 최근 생성·요약                                                                                                            |
| 콘텐츠 생성      | `/generate`                      | Sidebar                                       | 로그인 필수         | AI 초안 생성 (F1·F3)                                                                                                      |
| 생성 결과 에디터 | `/generate/[id]`                 | Sidebar                                       | 로그인 필수         | 초안 편집·복사                                                                                                            |
| AI 지침 목록     | `/guidelines`                    | Sidebar                                       | 로그인 필수         | 지침 CRUD (F2)                                                                                                            |
| 지침 생성        | `/guidelines/new`                | Sidebar                                       | 로그인 필수         | 새 지침 작성                                                                                                              |
| 지침 수정        | `/guidelines/[id]`               | Sidebar                                       | 로그인 필수         | 기존 지침 편집                                                                                                            |
| 생성 이력        | `/history`                       | Sidebar                                       | 로그인 필수         | 이력 조회·커서 기반 무한스크롤                                                                                            |
| 이력 상세        | `/history/[id]`                  | Sidebar                                       | 로그인 필수         | 본문 조회·번역 모달 진입·버전 진입 **(Phase 2)**                                                                          |
| 버전 목록        | `/history/[id]/versions`         | Sidebar                                       | 로그인 필수         | 버전 카드 목록·미리보기·복원·비교 선택 **(Phase 2)**                                                                      |
| 버전 비교        | `/history/[id]/versions/compare` | Sidebar                                       | 로그인 필수         | Diff Viewer (`?from=A&to=B`) **(Phase 2)**                                                                                |
| AI Agent 목록    | `/agents`                        | Sidebar                                       | 활성 조직 멤버 이상 | Agent 카드 목록·다음 실행 시각 **(Phase 3)**                                                                              |
| Agent 생성       | `/agents/new`                    | Sidebar                                       | `org:admin`         | Agent 정의 폼 (주제 풀·cron·지침) **(Phase 3)**                                                                           |
| Agent 상세       | `/agents/[id]`                   | Sidebar                                       | 활성 조직 멤버 이상 | 다음 실행 카운트다운·즉시 실행·최근 실행 5건 **(Phase 3)**                                                                |
| Agent 실행 이력  | `/agents/[id]/runs`              | Sidebar                                       | 활성 조직 멤버 이상 | 실행 표·polling **(Phase 3)**                                                                                             |
| Agent 실행 상세  | `/agents/[id]/runs/[runId]`      | Sidebar                                       | 활성 조직 멤버 이상 | selected_topic·error·생성 콘텐츠 미리보기 **(Phase 3)**                                                                   |
| 조직 목록        | `/org`                           | Sidebar                                       | 로그인 필수         | 내 조직 카드 목록·전환·생성 진입 **(Phase 3)**                                                                            |
| 조직 생성        | `/org/new`                       | Sidebar                                       | 로그인 필수         | 조직명·slug 입력 폼 **(Phase 3)**                                                                                         |
| 조직 설정        | `/org/[id]`                      | Sidebar                                       | `org:admin`         | 일반 설정·삭제 위험 영역 **(Phase 3)**                                                                                    |
| 멤버 관리        | `/org/[id]/members`              | Sidebar                                       | `org:admin`         | 멤버 표·초대·역할 변경·제거 **(Phase 3)**                                                                                 |
| 결제·플랜        | `/billing`                       | Sidebar                                       | `org:admin`         | 현재 플랜·사용량 차트·플랜 비교·업그레이드 CTA **(Phase 3)**                                                              |
| 결제 진행        | `/billing/checkout`              | Sidebar                                       | `org:admin`         | 주문 생성(`POST /api/billing/orders`) → `AUTH_READY` 전환 → 토스 결제창 호출 **(Phase 3)**                                |
| 결제 결과        | `/billing/checkout/result`       | Sidebar                                       | `org:admin`         | 단일 URL, 쿼리 분기(`paymentKey`/`code`) — 성공 시 confirm 호출·confetti / 실패 시 errorCode 한글 매핑 표시 **(Phase 3)** |
| 결제 이력        | `/billing/payments`              | Sidebar                                       | `org:admin`         | 11상태 뱃지·결제 표·페이지네이션 **(Phase 3)**                                                                            |
| 결제 단건 상세   | `/billing/payments/[paymentKey]` | Sidebar                                       | `org:admin`         | 영수증 URL·취소 이력·환불 요청 폼 **(Phase 3)**                                                                           |
| Cron 대시보드    | `/system/crons`                  | Sidebar(별도 system 메뉴) 또는 일반 dashboard | `SystemAdmin`       | 등록된 Schedule 목록·다음 실행·최근 cron_runs 요약 **(Phase 3, v1.4 / UC-39)**                                            |
| Cron 실행 이력   | `/system/crons/[code]/runs`      | 동상                                          | `SystemAdmin`       | cron_runs 페이지네이션 조회·status별 필터 **(Phase 3, v1.4)**                                                             |
| 404              | `/not-found`                     | 없음                                          | 공개                | Next.js not-found.tsx — 존재하지 않는 URL                                                                                 |
| 500              | `/error`                         | 없음                                          | 공개                | Next.js error.tsx — 런타임 에러                                                                                           |
| 디자인 시스템    | `/design-system`                 | 없음                                          | 개발 전용           | 컴포넌트 플레이그라운드 (프로덕션 비공개)                                                                                 |

---

## 5. 공통 레이아웃 컴포넌트

### 인증 폼 영역 (`AuthLayout`)

| 항목         | 내용                                            |
| ------------ | ----------------------------------------------- |
| 적용 페이지  | `/sign-in`, `/sign-up`                          |
| 구조         | 화면 중앙 카드 (`max-w-md`, `mx-auto`, `mt-24`) |
| 배경         | Warm White `#f6f5f4`                            |
| PublicHeader | 미표시                                          |
| Footer       | 미표시                                          |

### 공개 영역 공통 (`PublicLayout`)

| 컴포넌트         | 위치   | 역할                               |
| ---------------- | ------ | ---------------------------------- |
| `<PublicHeader>` | 최상단 | Topbar 네비게이션 (Glass floating) |
| `<Footer>`       | 최하단 | 저작권·링크 (랜딩 페이지에만 표시) |

### 인증 영역 공통 (`DashboardLayout`)

| 컴포넌트         | 위치          | 역할                             |
| ---------------- | ------------- | -------------------------------- |
| `<Sidebar>`      | 좌측 w-64     | 메뉴 네비게이션                  |
| `<MobileHeader>` | 모바일 상단   | 햄버거 + 로고                    |
| `<MobileSheet>`  | 모바일 드로어 | Sidebar 내용 동일                |
| `<Toaster>`      | 우하단        | shadcn/ui Toast (성공·오류 알림) |

### 페이지 공통 레이아웃 구조

```
페이지 루트
└── Layout (PublicLayout 또는 DashboardLayout)
    └── <main>
        └── <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            └── 페이지 콘텐츠
```

---

## 6. 콘텐츠 구성 (페이지별 주요 영역)

### `/` 랜딩 페이지

| 섹션             | 컴포넌트                                           | 설명                                                |
| ---------------- | -------------------------------------------------- | --------------------------------------------------- |
| Hero             | Aceternity UI 배경 효과 + Magic UI TypingAnimation | 핵심 가치 한 문장 + CTA 1개 (시작하기 → `/sign-up`) |
| 문제 제기        | 3-column 카드 (Whisper 보더)                       | 인디해커의 3가지 고통                               |
| 기능 소개        | 교대 배경 섹션 (White ↔ Warm White `#f6f5f4`)      | F1·F2·F3 기능별 설명 + 스크린샷                     |
| 유사 서비스 비교 | 비교 테이블                                        | Copy.ai · Jasper · Hashnode vs IndiePost            |
| CTA 섹션         | Magic UI Ripple + 버튼                             | "지금 무료로 시작하기"                              |

### `/dashboard` 대시보드

| 영역                         | 설명                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 빠른 시작                    | "새 콘텐츠 생성" 버튼 (최상단 강조)                                                                                |
| 최근 생성                    | 최근 5개 콘텐츠 카드 (제목·날짜·지침명·생성자 — Phase 3: Agent 생성 시 [🤖 Agent] 뱃지)                            |
| 지침 현황                    | 등록된 지침 수 + "기본 지침" 표시                                                                                  |
| 사용량 위젯 **(Phase 3)**    | 이번 달 생성/번역/Agent 실행 횟수 + 한도 대비 progress bar. 80% 초과 시 amber, 100% 도달 시 red + "업그레이드" CTA |
| Agent 요약 **(Phase 3)**     | 활성 Agent 수·다음 실행 예정 시각 1건·최근 실패 알림                                                               |
| 결제 알림 배너 **(Phase 3)** | `status='past_due'` 시 영구 빨강 배너 (admin에게만)                                                                |
| Empty State                  | 지침 0개 시: "먼저 AI 지침을 등록해보세요" + 등록 CTA                                                              |

### `/generate` 콘텐츠 생성

| 영역                                 | 설명                                                                                                                                                                          |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **잔여 사용량 표시 (Phase 3, v1.4)** | 상단 우측에 `이번 달 생성: {used}/{limit}회` — Free 한도 0회 시 생성 버튼 disabled + "이번 달 한도를 모두 사용했습니다 · [플랜 업그레이드 →]" 안내 카드 (BR-구독결제.md §3.1) |
| 주제 입력                            | Textarea (주제명 필수 / 키워드·방향 선택)                                                                                                                                     |
| 지침 선택                            | Dropdown (등록된 지침 목록 / 없을 시 "기본 SEO 지침" 자동 선택). Phase 3 v1.4: 조직 공용 지침(BR-34)이 노출됨                                                                 |
| 생성 버튼                            | "AI 초안 생성" CTA (Magic UI Ripple 효과). 한도 0회 시 disabled                                                                                                               |
| 생성 결과                            | 스트리밍 텍스트 실시간 표시 → 완료 시 에디터 전환                                                                                                                             |

### `/generate/[id]` 생성 결과 에디터

| 영역            | 설명                                                 |
| --------------- | ---------------------------------------------------- |
| 마크다운 에디터 | 생성된 초안 표시 + 인라인 편집                       |
| 메타 정보       | 사용된 지침명·생성일·키워드 표시                     |
| 액션 버튼       | "저장" (Primary) / "전체 복사" / "마크다운 다운로드" |

### `/guidelines` AI 지침 목록

| 영역                                     | 설명                                                                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 조직 공용 안내 배너 **(Phase 3, BR-34)** | 일반 조직: "이 지침은 조직의 모든 멤버가 공유합니다 · 누가 작성했든 모두 사용 가능". Personal Org: "이 지침은 본인만 볼 수 있습니다". |
| 지침 카드 목록                           | 제목·미리보기·기본 지침 Badge + **작성자 아바타·이름** (`created_by`, Phase 3)                                                        |
| 카드 액션                                | [수정]/[삭제] — Phase 3에서 admin만 표시 (member에게는 보기·사용만)                                                                   |
| 새 지침 추가                             | 우상단 "+" 버튼 → `/guidelines/new` (Phase 3: member도 작성 가능)                                                                     |
| Empty State                              | "첫 번째 AI 지침을 등록해보세요" + 등록 CTA                                                                                           |

### `/history` 생성 이력 목록

| 영역           | 설명                                                                                  |
| -------------- | ------------------------------------------------------------------------------------- |
| 이력 카드 목록 | 카드별: 주제·생성일·지침명·번역 언어 Badge **(Phase 2)**                              |
| 무한스크롤     | 커서 기반 (한 페이지 20개) — 라이브러리/구현은 [TRD §3-1](TRD.md#3-1-프론트엔드) 참조 |
| 카드 클릭      | → `/history/[id]` 이력 상세                                                           |
| Empty State    | "아직 생성한 콘텐츠가 없습니다" + 콘텐츠 생성 CTA                                     |

### `/history/[id]` 이력 상세 **(Phase 2)**

| 영역           | 설명                                                                               |
| -------------- | ---------------------------------------------------------------------------------- |
| 헤더           | 주제·생성일·지침명·원문 언어 Badge                                                 |
| 본문/번역 탭   | "원문 (한국어)" / "영어" 탭 전환 — 번역 없는 언어는 "번역하기" CTA만 표시          |
| 본문 영역      | 마크다운 렌더링 (읽기 전용 미리보기) — 편집은 `/generate/[id]`에서                 |
| 우상단 액션    | [번역 모달 열기] / [버전 이력 보기 → /versions] / [편집 → /generate/[id]] / [복사] |
| 번역 결과 영역 | 번역 본문 + [번역본 복사] [마크다운 다운로드] [다시 번역(force)] [번역 삭제]       |

### `/history/[id]/versions` 버전 목록 **(Phase 2)**

| 영역          | 설명                                                                         |
| ------------- | ---------------------------------------------------------------------------- |
| 헤더          | 콘텐츠 주제 + Breadcrumb (`/history` → 상세 → 버전)                          |
| 버전 타임라인 | 카드별: `v3` Badge·생성일·글자수·직전 대비 ±N자·"현재" Badge (해당 시)       |
| 카드 액션     | [미리보기 Drawer] / [복원] / [비교 대상으로 선택]                            |
| 비교 모드     | 카드 2개 선택 시 하단 floating bar에 [선택 해제] [비교하기 →] 노출           |
| 가상 스크롤   | 50개 이상 시 적용 — 라이브러리/구현은 [TRD §3-1](TRD.md#3-1-프론트엔드) 참조 |
| Empty State   | "아직 저장된 버전이 없습니다. 본문을 편집하면 자동으로 버전이 쌓입니다"      |

### `/history/[id]/versions/compare?from=A&to=B` 버전 비교 **(Phase 2)**

| 영역           | 설명                                                                                                                          |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 헤더           | Breadcrumb + 비교 중인 버전 표시 (`v2 ↔ v5`)                                                                                  |
| 비교 모드 토글 | [Split View / Unified View] — 라이브러리/prop은 [TRD §3-1](TRD.md#3-1-프론트엔드) 참조                                        |
| Diff Viewer    | 좌측 `from` / 우측 `to` 마크다운 line-by-line, 추가·삭제·변경 색상 구분 (라이브러리는 [TRD §3-1](TRD.md#3-1-프론트엔드) 참조) |
| 메타 비교      | 좌우 SEO 메타(title·description·keywords) 카드 비교                                                                           |
| 액션           | [from으로 복원] [to로 복원] [목록으로]                                                                                        |

### `/agents` AI Agent 목록 **(Phase 3)**

| 영역                     | 설명                                                                       |
| ------------------------ | -------------------------------------------------------------------------- |
| 헤더                     | "AI Agent" 타이틀 + 우상단 [+ 새 Agent] (`org:admin`만, member에게는 숨김) |
| Agent 카드               | 이름·cron 한글 해석·다음 실행 시각·활성 토글·최근 실행 상태 뱃지           |
| 카드 액션                | [상세] / [즉시 실행] (member 이상) / [⋯ 수정·삭제] (admin만)               |
| Empty State (Free)       | "AI Agent는 Pro 플랜부터 사용 가능합니다" + [업그레이드] CTA → `/billing`  |
| Empty State (Pro·미생성) | "첫 번째 Agent를 만들어 자동 글쓰기를 시작해보세요" + [+ 새 Agent]         |

### `/agents/new` Agent 생성 **(Phase 3)**

| 영역                             | 설명                                                                                                                                                                               |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 기본 정보                        | 이름 입력                                                                                                                                                                          |
| 주제 공급                        | Tabs(`직접 풀` / `키워드 확장`) — 선택에 따라 입력 영역 전환                                                                                                                       |
| 직접 풀 입력                     | Textarea (줄바꿈 = 주제 1개) + 카운터 (현재 N/100)                                                                                                                                 |
| 키워드 확장 입력                 | TagInput (최대 10개, Enter로 추가)                                                                                                                                                 |
| 적용 지침                        | Dropdown (조직 공용 지침 목록 — BR-34)                                                                                                                                             |
| 출력 언어                        | RadioGroup ko / en                                                                                                                                                                 |
| 실행 주기                        | `react-js-cron` 위젯 + `cronstrue` 한글 해석 출력 + 다음 5회 실행 예정 시각 미리보기                                                                                               |
| **발행 연동 (`publish_target`)** | Accordion (기본 접힘) — "외부 플랫폼 자동 발행" 토글. Phase 3에서는 모든 옵션 disabled + amber 안내 "Phase 3.5에서 출시 예정 · 지금은 dry-run으로만 검증됩니다" (스키마/UI만 노출) |
| **사용 도구 미리보기**           | Read-only 카드 3개 (Topic Picker · Content Writer · Platform Publisher) — Phase 3.5 미출시 도구는 회색. `GET /api/agents/tools` 응답 기반                                          |
| 활성화 토글                      | 기본 ON                                                                                                                                                                            |
| 액션                             | [취소] / [생성] (BR-33 검증 실패 시 비활성)                                                                                                                                        |

### `/agents/[id]` Agent 상세 **(Phase 3)**

| 영역                         | 설명                                                     |
| ---------------------------- | -------------------------------------------------------- |
| 헤더                         | Agent 이름·활성 토글·cron 한글 해석·다음 실행 카운트다운 |
| 우상단 액션                  | [즉시 실행] [수정] [삭제] (수정·삭제는 admin만)          |
| 주제 풀 현황 (manual_pool만) | 전체/소진/남은 주제 수 + [주제 추가] (admin)             |
| 최근 실행 5건                | 미니 카드 — 시각·상태·생성된 콘텐츠 링크                 |
| 액션                         | [전체 실행 이력 보기] → `/agents/[id]/runs`              |

### `/agents/[id]/runs` 실행 이력 **(Phase 3)**

| 영역        | 설명                                                               |
| ----------- | ------------------------------------------------------------------ |
| 헤더        | Breadcrumb (`/agents` → 상세 → 실행 이력)                          |
| 실행 표     | 컬럼: 시각·트리거(수동/스케줄 뱃지)·상태·소요시간·생성 콘텐츠·에러 |
| Polling     | `status='running'` row 1건 이상이면 5초 간격 refetch               |
| 필터        | 상태(전체/성공/실패) + 트리거(전체/수동/스케줄)                    |
| Empty State | "아직 실행된 적이 없습니다. [즉시 실행]으로 테스트해보세요"        |

### `/agents/[id]/runs/[runId]` 실행 단건 상세 **(Phase 3)**

| 영역                          | 설명                                                                                                                                                                                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 메타                          | 시각·트리거·소요시간·상태 뱃지·도구 호출 수 뱃지 (`tool_calls_count`)                                                                                                                                                                                        |
| 선택된 주제                   | `selected_topic` 표시 (topic_picker가 자동 발굴한 경우 도구 호출 트레이스로 추적 가능)                                                                                                                                                                       |
| **Function Calling 트레이스** | 시간 순(`sequence_no` ASC) 카드 목록 — 각 카드: [도구 아이콘] tool_code · 상태 뱃지 · duration · 인자/결과 코드블록 토글 (모노스페이스). 실행 중(`status='running'`)이면 SSE로 새 카드 실시간 append (`GET /api/agents/:id/runs/:runId/tool-calls` 스트리밍) |
| 도구별 시각 표현              | `topic_picker` 🎯 · `content_writer` ✍️ · `platform_publisher` 🚀 (Phase 3.5 비활성 시 회색 + "Phase 3.5 출시 예정" 툴팁)                                                                                                                                    |
| 결과 (성공)                   | 생성된 콘텐츠 미리보기 카드 + [에디터로 열기] → `/generate/[id]`                                                                                                                                                                                             |
| 결과 (실패)                   | error_code 뱃지 + error_message 코드 블록 + [재시도] (다음 스케줄 기다리지 않고 즉시 실행). 실패가 특정 도구 호출에서 발생했다면 해당 트레이스 카드를 빨간 보더로 강조                                                                                       |

### `/org` 조직 목록 **(Phase 3)**

| 영역              | 설명                                                                                                                                                             |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 헤더              | "내 조직" + [+ 새 조직]                                                                                                                                          |
| 조직 카드         | 이름·**`[개인]` 뱃지** (`is_personal=true`)·플랜 뱃지·역할 뱃지(admin/member)·멤버 수·현재 활성 표시·**`[삭제 예정 N일]` amber 뱃지** (`deleted_at IS NOT NULL`) |
| 카드 액션         | [전환] (활성 조직으로 설정) / [관리] (admin만 → `/org/[id]`) / **[복원]** (soft-deleted 상태일 때만 노출, admin)                                                 |
| Personal Org 카드 | [전환]만 노출 — [관리]·[삭제] 비활성 (Personal Org 보호 정책)                                                                                                    |

### `/org/new` 조직 생성 **(Phase 3)**

| 영역           | 설명                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 폼             | 조직명 (필수) + slug (자동 생성, 수정 가능)                                                                              |
| 안내           | "조직은 멤버를 초대해 콘텐츠·지침·Agent를 공유할 수 있는 공간입니다. Free 플랜은 1명까지."                               |
| 자동 생성 안내 | "이미 본인 전용 Personal Org(`{email}'s Workspace`)가 자동 생성되어 있습니다. 팀 협업이 필요할 때만 새 조직을 만드세요." |

### `/org/[id]` 조직 설정 **(Phase 3)**

| 영역              | 설명                                                                                                                                                        |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 탭                | [일반] / [멤버] (→ `/members`) / [구독] (→ `/billing`)                                                                                                      |
| 일반 탭           | 조직명·slug 수정                                                                                                                                            |
| 위험 영역         | [조직 삭제] — 확인 모달 + slug 입력 확인 + **BR-31 30일 grace 안내 강조** ("삭제 후 30일 내에는 복원 가능 · 30일 경과 시 모든 콘텐츠·지침·Agent 영구 삭제") |
| Personal Org 차단 | `is_personal=true`이면 위험 영역 영역 자체가 disabled + 안내 "Personal Org는 삭제할 수 없습니다. 계정 삭제 시 자동 정리됩니다."                             |
| soft-deleted 상태 | `deleted_at IS NOT NULL`이면 페이지 상단 영구 amber 배너 "이 조직은 {date}에 영구 삭제됩니다 (N일 남음) · [복원하기]" + 모든 편집 disabled                  |

### `/org/[id]/members` 멤버 관리 **(Phase 3)**

| 영역         | 설명                                                                                 |
| ------------ | ------------------------------------------------------------------------------------ |
| 헤더         | "멤버 (N/한도M)" + [+ 멤버 초대] (한도 도달 시 비활성 + 툴팁 "플랜 업그레이드 필요") |
| 멤버 표      | 아바타·이메일·역할 Dropdown(admin/member)·가입일·[제거]                              |
| 보류 중 초대 | 초대 발송됨·만료일·[재발송] [취소]                                                   |

### `/billing` 결제·플랜 **(Phase 3, v1.4 갱신)**

| 영역                               | 설명                                                                                                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 현재 플랜 카드                     | 플랜명(Free/Pro)·월 금액(Pro 29,900원)·다음 결제일·등록된 카드 마지막 4자리·**상태 뱃지** (active/past_due/해지 예약/canceled)                                            |
| 결제 수단 영역 (BR-구독결제.md §5) | "등록된 카드: 현대카드 4\*\*\*" + [카드 변경] 버튼 (→ UC-28 결제창 재호출)                                                                                                |
| 해지 예약 amber 카드 **(v1.4)**    | `cancel_scheduled_at IS NOT NULL`일 때 노출 — "{current_period_end}까지 Pro 기능을 사용할 수 있습니다 · 그 이후 무료 플랜으로 전환됩니다" + [해지 예약 취소] 버튼 (UC-38) |
| past_due 빨강 카드 **(BR-36)**     | `status='past_due'`일 때 노출 — "정기결제에 실패했습니다 · {past_due_since + 3일} 이내에 카드를 갱신하지 않으면 무료 플랜으로 전환됩니다" + [지금 결제 →]                 |
| 사용량 차트                        | recharts — 이번 달 일별 생성/번역/Agent 사용량 (전체 한도 대비 progress bar)                                                                                              |
| 플랜 비교 테이블 **(v1.4)**        | Free / Pro 2종 — 기능·한도·가격 비교. 현재 플랜 하이라이트, 상위 플랜에 [업그레이드]                                                                                      |
| 결제 내역 (BR-구독결제.md §5)      | 최근 5건 미니 표 (시각·금액·상태·[영수증]) + [전체 보기 →] `/billing/payments`                                                                                            |
| 액션 (active 상태)                 | [구독 취소] → AlertDialog → POST cancel → 해지 예약 amber 카드로 전환 (UC-31)                                                                                             |
| 액션 (Personal Org Pro)            | 동일 — Personal Org도 Pro 가능하나 멤버 초대 영역만 비활성                                                                                                                |

### `/billing/checkout` 결제 진행 **(Phase 3)**

> toss-quickstart §결제 UI 플로우 — 주문 행 생성 → AUTH_READY → SDK 호출 순서 준수.

| 영역                     | 설명                                                                                                                                                                                                                                          |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 주문 요약 카드           | 플랜명·월 금액·orderId·만료 시각(`expires_at`, +30분 카운트다운)                                                                                                                                                                              |
| 결제창 호출              | 페이지 마운트 시: ① `POST /api/billing/orders` → orderId·customerKey·amount 수신 ② `PATCH .../status` AUTH_READY 전환 ③ `loadTossPayments(TOSS_CLIENT_KEY).payment({ customerKey }).requestPayment({ orderId, amount, successUrl, failUrl })` |
| 로딩 표시                | 결제창 로딩 중 스피너 + "결제창을 불러오는 중입니다"                                                                                                                                                                                          |
| 결제창 이탈 (catch)      | `error.code === 'USER_CANCEL'` → `PATCH .../status` AUTH_CANCEL · 그 외 → AUTH_FAIL · 사용자에게 [다시 시도] 버튼 노출                                                                                                                        |
| [취소] 버튼 (ORDER 상태) | `DELETE /api/billing/orders/:orderId` — 고아 주문 정리                                                                                                                                                                                        |

### `/billing/checkout/result` 결제 결과 (단일 URL) **(Phase 3)**

> Toss successUrl과 failUrl이 동일 URL — toss-quickstart §결제 결과 페이지 권장 패턴.  
> 쿼리 파라미터로 분기: `paymentKey+orderId+amount`(성공) / `code+message+orderId`(실패 또는 취소) / 둘 다 없음(직접 접근).

| 케이스                            | 화면 구성                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **인증 성공** (`paymentKey` 존재) | ① 마운트 시 `PATCH .../status` AUTH_SUCCESS ② `POST .../confirm` 호출 (정확히 1회 — useEffect deps `[]` + ref 가드) ③ 결과 화면: 성공이면 confetti + "Pro 플랜이 활성화되었습니다" + 영수증 요약(결제일·금액·다음 결제일·카드 마지막 4자리·`payments.raw_data.receipt.url`) · 가상계좌면 "입금 대기 중" + 입금 정보 + "입금 확인 시 자동으로 활성화됩니다" |
| **인증 실패/취소** (`code` 존재)  | `code === 'PAY_PROCESS_CANCELED'` → AUTH_CANCEL · 그 외 → AUTH_FAIL. errorCode 한글 매핑(`payment_error_codes`) 표시 + [다시 결제하기] / [주문 내역]                                                                                                                                                                                                       |
| **직접 접근** (둘 다 없음)        | `/billing/payments`로 redirect (안내 토스트 없이)                                                                                                                                                                                                                                                                                                          |
| 액션                              | [대시보드로] / [결제 이력]                                                                                                                                                                                                                                                                                                                                 |

### `/billing/payments` 결제 이력 **(Phase 3)**

| 영역           | 설명                                                                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 결제 표        | 시각·`kind`(신규구독/정기결제/플랜변경)·플랜·금액·11상태 뱃지·orderId·[상세]                                                     |
| 상태 뱃지 색상 | PAY*SUCCESS=Sage Green · PAY_WAITING=amber · PAY_FAIL/EXPIRED=red · PAY_CANCELED/PARTIAL=warm-gray · AUTH*\*=light gray (미완료) |
| 무한스크롤     | 커서 기반 (`?cursor=<last_order_id>`)                                                                                            |
| Empty State    | "아직 결제 이력이 없습니다"                                                                                                      |

### `/billing/payments/[paymentKey]` 결제 단건 상세 **(Phase 3)**

| 영역         | 설명                                                                                                                                                                       |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 헤더         | Breadcrumb (`/billing` → 이력 → 단건) + 상태 뱃지                                                                                                                          |
| 메타         | 결제일·금액·잔액(`balance_amount`)·결제수단·`orderId`·`paymentKey`                                                                                                         |
| 영수증       | `payments.raw_data.receipt.url` 새 창 열기                                                                                                                                 |
| 취소 이력    | `payment_cancels` 목록 — 시각·취소 금액·`transactionKey`                                                                                                                   |
| 환불 요청 폼 | 사유 입력 + 환불 예상액 실시간 표시(`calculateRefundAmount`) + [환불 요청] → `POST .../cancel-request`. 요청 후 "관리자 승인 대기 중" 안내 (Phase 3 셀프 즉시 환불 미지원) |

### `/system/crons` Cron 대시보드 **(Phase 3, v1.4 / UC-39, SystemAdmin 전용)**

| 영역               | 설명                                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| 헤더               | "Cron 운영 콘솔" + 새로고침 버튼 + QStash 무료 한도 위젯 (오늘 사용량 / 500)                             |
| Schedule 목록 카드 | cron 6개 각각 — 이름·cronstrue 한글 해석·다음 실행 예정·최근 실행 상태 뱃지·최근 7일 성공률 progress bar |
| 카드 액션          | [실행 이력 →] → `/system/crons/[code]/runs` (수동 트리거는 v1.4 범위 외 — Phase 4)                       |
| QStash 연결 상태   | 우상단 뱃지 — `GET /api/system/crons/:code/qstash` 응답 기반 (연결됨/장애)                               |
| Empty State        | (없음 — 시드 데이터로 6개 항상 노출)                                                                     |

### `/system/crons/[code]/runs` Cron 실행 이력 **(Phase 3, v1.4)**

| 영역                        | 설명                                                                                                                    |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 헤더                        | Breadcrumb (`/system/crons` → 단건) + cron 이름·cronstrue 한글 해석                                                     |
| 실행 표                     | 컬럼: `started_at`·`triggered_by`(schedule/manual 뱃지)·status·`duration_ms`·`result_summary` JSON 토글·`error_message` |
| 필터                        | 상태(전체/완료/실패/실행 중) + 트리거(schedule/manual) + 기간 (최근 7일/30일/전체)                                      |
| 페이지네이션                | 커서 기반 (`?cursor=<last_run_id>`) — 기본 20건                                                                         |
| status='running' 행 polling | 5초 간격 refetch                                                                                                        |
| Empty State                 | "아직 실행 기록이 없습니다 (cron 등록 직후엔 첫 실행을 대기하세요)"                                                     |

---

## 7. 인터랙션 패턴

### 모달

| 사용 시점                                                    | 내용                                                                                                       | 정의 위치                                                                                                |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 지침 삭제 확인                                               | "이 지침을 삭제하면 해당 지침으로 생성된 이력에 영향을 줄 수 있습니다." + 삭제 / 취소 버튼                 | usecase-지침관리 참조                                                                                    |
| 번역 생성 모달 **(Phase 2)**                                 | 원문/번역 좌·우 2분할, 언어 Dropdown(BR-22), 스트리밍 결과 영역                                            | **[07-usecase-다국어번역 §7](usecase/07-usecase-다국어번역.md#7-uiux-고려사항) 참조** (본문 텍스트 SSOT) |
| 번역 quota 안내 **(Phase 2)**                                | 첫 시도 1회 안내 — BR-21로 동작 정의                                                                       | **[07-usecase-다국어번역 §4-2](usecase/07-usecase-다국어번역.md#4-대안-흐름) 참조**                      |
| 번역 덮어쓰기 확인 **(Phase 2)**                             | BR-23 (`force=true`) 재요청 전 사용자 확인                                                                 | **[07-usecase-다국어번역 §7](usecase/07-usecase-다국어번역.md#7-uiux-고려사항) 참조**                    |
| 번역 삭제 확인 **(Phase 2)**                                 | [usecase-common §4-4](usecase/usecase-common.md#4-4-확인-다이얼로그-alertdialog) 공통 삭제 다이얼로그 패턴 | **[07-usecase-다국어번역 §7](usecase/07-usecase-다국어번역.md#7-uiux-고려사항) 참조**                    |
| 버전 복원 확인 **(Phase 2)**                                 | BR-19 안전장치(직전 본문 자동 스냅샷) 안내 포함                                                            | **[06-usecase-콘텐츠이력 §7](usecase/06-usecase-콘텐츠이력.md#7-uiux-고려사항) 참조**                    |
| 버전 미리보기 Drawer **(Phase 2)**                           | 우측에서 슬라이드 인 — 본문 마크다운 렌더링 + [복원] [닫기]                                                | **[06-usecase-콘텐츠이력 §7](usecase/06-usecase-콘텐츠이력.md#7-uiux-고려사항) 참조**                    |
| 멤버 초대 모달 **(Phase 3)**                                 | 이메일·역할 입력 + 멤버 한도 안내 (BR-30)                                                                  | 본 IA §6 `/org/[id]/members` 영역 정의                                                                   |
| 멤버 제거 확인 **(Phase 3)**                                 | [usecase-common §4-4](usecase/usecase-common.md#4-4-확인-다이얼로그-alertdialog) 공통 패턴                 | 본 IA                                                                                                    |
| 역할 변경 확인 **(Phase 3)**                                 | admin → member 강등 시에만 노출 (마지막 admin 차단 분기 안내 포함)                                         | 본 IA                                                                                                    |
| 구독 취소 확인 **(Phase 3)**                                 | `current_period_end`까지 사용 가능 안내 + "정말 취소하시겠습니까?"                                         | 본 IA                                                                                                    |
| 조직 삭제 위험 모달 **(Phase 3)**                            | slug 입력 확인 + **BR-31 30일 grace 정책 강조** ("30일 내 복원 가능 · 경과 시 영구 삭제")                  | 본 IA §6 `/org/[id]`                                                                                     |
| 조직 복원 모달 **(Phase 3)**                                 | "{조직명}을(를) 복원하시겠습니까? · 모든 데이터가 즉시 복구됩니다" + [복원하기]                            | 본 IA                                                                                                    |
| Personal Org 보호 안내 토스트 **(Phase 3)**                  | 삭제·멤버 초대 시도 시: "Personal Org는 보호된 공간입니다 — 본인 전용 작업 공간입니다"                     | 본 IA                                                                                                    |
| 결제 단일 result URL — confirm 처리 중 **(Phase 3)**         | 페이지 로딩 스피너 + "결제를 확인하고 있습니다... · 이 페이지를 닫지 마세요"                               | 본 IA §6 `/billing/checkout/result`                                                                      |
| 가상계좌 입금 대기 안내 **(Phase 3)**                        | 가상계좌번호·은행·입금 마감일 + "입금이 확인되면 자동으로 활성화됩니다 · 이메일로도 안내드립니다"          | 본 IA                                                                                                    |
| 환불 요청 모달 **(Phase 3)**                                 | 환불 예상액 실시간 표시(`calculateRefundAmount`) + 사유 입력 + "관리자 승인 후 환불이 진행됩니다"          | 본 IA §6 `/billing/payments/[paymentKey]`                                                                |
| Agent 도구 호출 트레이스 (모달 X, 페이지 영역) **(Phase 3)** | `/agents/[id]/runs/[runId]` 페이지 내 트레이스 카드 — 인자/결과 코드블록 토글                              | 본 IA §6                                                                                                 |
| Agent 즉시 실행 확인 **(Phase 3)**                           | quota 차감 안내 + "이번 달 N회 남음" 표시                                                                  | 본 IA                                                                                                    |
| Agent 삭제 확인 **(Phase 3)**                                | 실행 이력 보존 여부 안내 (이력은 30일 보관 후 자동 삭제)                                                   | 본 IA                                                                                                    |
| 플랜 한도 초과 안내 **(Phase 3)**                            | 토스트 대신 모달 — 사용량 차트 + [업그레이드 →] CTA                                                        | 본 IA (BR-32)                                                                                            |

> **SSOT 원칙**: 모달 본문 문구·버튼 라벨 등 실제 노출 텍스트는 각 usecase 문서의 §7 단독 정의. IA는 모달의 **존재·구조·진입 조건**만 기술한다.

### 토스트 (우하단, 5초 자동 닫힘)

> 토스트 메시지 전체 정의 → **[usecase-common.md §4-3](usecase/usecase-common.md#4-3-성공-피드백)·[§4](usecase/usecase-common.md#4-공통-ui-패턴-common-ui-patterns) 참조** (SSOT 원칙 — IA에서 중복 정의 금지)

### 스켈레톤 로딩

| 페이지                   | 적용 대상                                                  |
| ------------------------ | ---------------------------------------------------------- |
| 대시보드                 | 최근 생성 카드 목록                                        |
| 지침 목록                | 지침 카드 목록                                             |
| 생성 이력                | 이력 카드 목록                                             |
| 이력 상세 **(Phase 2)**  | 본문 라인 8줄·메타 카드·액션 버튼 영역                     |
| 버전 목록 **(Phase 2)**  | 버전 카드 5개 (`Skeleton` 높이 80px)                       |
| 버전 비교 **(Phase 2)**  | 좌·우 Diff 영역 각 12줄                                    |
| Agent 목록 **(Phase 3)** | Agent 카드 4개 (각 높이 120px)                             |
| Agent 상세 **(Phase 3)** | 카운트다운 영역·최근 실행 5건 미니 카드                    |
| 실행 이력 **(Phase 3)**  | 표 행 10개 (각 높이 56px)                                  |
| 결제·플랜 **(Phase 3)**  | 현재 플랜 카드 + 사용량 차트 placeholder + 플랜 비교 3컬럼 |
| 결제 이력 **(Phase 3)**  | 표 행 10개                                                 |
| 멤버 관리 **(Phase 3)**  | 표 행 8개 (아바타 원형 포함)                               |

### AI 생성 스트리밍

- 생성 버튼 클릭 → 로딩 스피너 + "AI가 초안을 작성하고 있습니다..." 텍스트
- 스트리밍 시작 → 텍스트 실시간 append (청크 단위)
- 생성 완료 → 에디터 모드 전환 + "초안 생성 완료" 토스트

### AI 번역 스트리밍 **(Phase 2)**

구조·UX 진행 순서만 정의 — 실제 텍스트(토스트·에러 메시지)는 **[07-usecase-다국어번역 §3](usecase/07-usecase-다국어번역.md#3-정상-흐름)·[§5](usecase/07-usecase-다국어번역.md#5-예외-흐름)** 참조.

- 번역 모달 오픈 → 언어 선택 → [번역 시작]
- 스트리밍: 좌측 원문 고정, 우측 영역에 청크 append (모션 정의는 아래 Framer Motion 표)
- 마지막 청크 `[DONE]{...}` ([TRD §3-4](TRD.md#3-4-api-설계) 마지막 청크 형식 참조) → 캐시 invalidate
- 성공: 토스트([usecase-common §4-3](usecase/usecase-common.md#4-3-성공-피드백)) + 모달 자동 닫힘 (3초)
- 실패: 모달 내부 에러 영역 + [다시 번역] (BR-23 `force=true`)

### 버전 Diff Viewer 표현 **(Phase 2)**

| 모드               | 시각 표현                                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------- |
| Split View (기본)  | 좌측: `from` (붉은 배경=삭제 라인) / 우측: `to` (녹색 배경=추가 라인)                                |
| Unified View       | 단일 컬럼에 `-` 삭제 라인, `+` 추가 라인 인라인 표시                                                 |
| 색상               | 삭제: `bg-red-50/text-red-900` · 추가: `bg-emerald-50/text-emerald-900` (Notion 톤에 맞게 채도 낮춤) |
| 변경 없는 컨텍스트 | `text-warm-gray-500` 회색 처리                                                                       |

### Framer Motion 전환

| 전환                                | 설정                                                                                                 |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 페이지 전환                         | `opacity: 0→1, y: 8→0`, `duration: 0.2`, `ease: easeOut`                                             |
| 카드 등장                           | `opacity: 0→1`, `duration: 0.15`, `staggerChildren: 0.05`                                            |
| 사이드바 드로어                     | `x: -100%→0`, `duration: 0.22`, `ease: cubic-bezier(0.2,0.6,0.25,1)`                                 |
| 번역 모달 등장 **(Phase 2)**        | `opacity: 0→1, scale: 0.96→1`, `duration: 0.18`, `ease: easeOut`                                     |
| 버전 미리보기 Drawer **(Phase 2)**  | `x: 100%→0`, `duration: 0.22`, 우측에서 슬라이드 인                                                  |
| Diff Viewer 등장 **(Phase 2)**      | `opacity: 0→1`, `duration: 0.25` (대용량 본문 렌더 후 페이드인)                                      |
| 본문/번역 탭 전환 **(Phase 2)**     | `opacity: 0→1, y: 4→0`, `duration: 0.15`                                                             |
| 결제 성공 confetti **(Phase 3)**    | `canvas-confetti` 라이브러리 0.8초 burst + 성공 카드 `scale: 0.96→1, opacity: 0→1`, `duration: 0.25` |
| 사용량 progress bar **(Phase 3)**   | `width: 0→N%`, `duration: 0.6`, `ease: easeOut` (페이지 진입 시 1회만)                               |
| Agent 카운트다운 펄스 **(Phase 3)** | 다음 실행 30초 전부터 `scale: 1↔1.03`, `duration: 1.2`, `repeat: Infinity`, `ease: easeInOut`        |
| 조직 스위처 드롭다운 **(Phase 3)**  | Clerk 기본 모션 사용 (커스텀 없음)                                                                   |
| 멤버 초대 모달 **(Phase 3)**        | `opacity: 0→1, scale: 0.96→1`, `duration: 0.18` (번역 모달과 동일)                                   |

---

## 8. 디자인 방향 명세 (Notion 스타일 기준)

| 항목             | 값                                                            |
| ---------------- | ------------------------------------------------------------- |
| 배경             | Pure White `#ffffff` / Alt `#f6f5f4` (Warm White)             |
| 주요 텍스트      | `rgba(0,0,0,0.95)` (Near-Black)                               |
| 보조 텍스트      | `#615d59` (Warm Gray 500)                                     |
| Muted 텍스트     | `#a39e98` (Warm Gray 300)                                     |
| Primary CTA 색상 | Sage Green `#99d1aa`                                          |
| 보더             | `1px solid rgba(0,0,0,0.1)` (Whisper Border)                  |
| 카드 Shadow      | 4-layer stack, 최대 opacity 0.04                              |
| 버튼 Radius      | 4px                                                           |
| 카드 Radius      | 8px (Standard) / 12px (Featured)                              |
| 폰트             | Inter (variable), 디스플레이 헤드라인 -2.125px letter-spacing |
| scrollbar-gutter | `stable` (모달 오픈 시 레이아웃 흔들림 방지)                  |

---

## 9. IA 검토 체크리스트

- [x] PRD의 모든 핵심 기능이 페이지 구조에 반영되어 있는가?
  - F1 콘텐츠 자동 작성 → `/generate`, `/generate/[id]`
  - F2 AI 지침 관리 → `/guidelines`, `/guidelines/new`, `/guidelines/[id]`
  - F3 SEO 최적화 → `/generate` 생성 시 자동 적용 (별도 페이지 불필요)
- [x] 인증 전/후 접근 가능 페이지가 구분되어 있는가?
- [x] 각 페이지의 URL 구조가 정의되어 있는가?
- [x] 주요 사용자 플로우(Happy Path)가 그려져 있는가?
- [x] 공통 레이아웃 컴포넌트가 명시되어 있는가? (PublicLayout, AuthLayout, DashboardLayout)
- [x] TRD 컴포넌트 라이브러리 제약(shadcn/ui → Magic UI·Aceternity UI 사용 가능)이 준수되었는가?
- [x] 인증 방식이 [TRD §3-5](TRD.md#3-5-인증-및-권한-관리) 기준(이메일+비밀번호, 소셜 로그인 미지원)으로 플로우에 반영되어 있는가?
- [x] 404·500 시스템 페이지(not-found.tsx, error.tsx)가 사이트맵에 포함되어 있는가?
- [x] 개발자 전용 페이지(/design-system)가 사이트맵에 포함되고 프로덕션 비공개로 명시되어 있는가?
- [x] /history 페이지네이션 방식(무한스크롤, 커서 기반)이 명시되어 있는가?
- [x] **(Phase 2)** 콘텐츠 이력 관리 페이지 구조(`/history/[id]`, `/history/[id]/versions`, `/history/[id]/versions/compare`)가 사이트맵·계층표·접근권한표에 모두 반영되어 있는가?
- [x] **(Phase 2)** 다국어 번역 모달 구조와 스트리밍 인터랙션이 정의되어 있는가? (지원 언어: 한국어·영어 두 가지로 제한)
- [x] **(Phase 2)** 버전 복원 안전장치(복원 직전 본문 자동 스냅샷)가 사용자 플로우와 모달 메시지에 반영되어 있는가?
- [x] **(Phase 2)** Diff Viewer 모드(Split/Unified)와 색상 규칙이 Notion 톤(채도 낮춤)에 맞게 정의되어 있는가?
- [x] **(Phase 2)** 타인 콘텐츠 접근 시 404 분기가 명시되어 있는가? (소유자 검증)
- [x] **(Phase 2)** 번역 데이터 quota 안내 모달의 노출 정책이 정의되어 있는가? (메시지·LocalStorage 키는 [usecase-common.md BR-21](usecase/usecase-common.md#2-공통-비즈니스-규칙-common-business-rules) 단독 정의)
- [x] **(Phase 3)** 조직(`/org/**`)·결제(`/billing/**`)·Agent(`/agents/**`) 15개 신규 페이지가 사이트맵·계층표·접근권한표에 모두 반영되어 있는가?
- [x] **(Phase 3)** Sidebar에 Clerk `<OrganizationSwitcher>` 진입점과 admin 전용 메뉴 가시성 규칙이 정의되어 있는가?
- [x] **(Phase 3)** 플로우 E(조직)·F(결제)·G(Agent)가 그려져 있고 분기점이 §2 분기 테이블에 반영되어 있는가?
- [x] **(Phase 3)** `org:admin` / `org:member` 권한 분리가 페이지·메뉴·모달·액션 버튼 수준에서 일관되게 적용되어 있는가?
- [x] **(Phase 3)** Free 플랜에서 Agent 페이지 접근 시 업그레이드 유도가 명시되어 있는가? (BR-32 max_agents=0)
- [x] **(Phase 3)** 결제 성공/실패 콜백 페이지(`/billing/checkout/success`·`/fail`)가 별도 페이지로 분리되어 있는가?
- [x] **(Phase 3)** 정기결제 실패(`past_due`) 시 대시보드 배너 노출과 3일 grace 정책이 분기에 반영되어 있는가?
- [x] **(Phase 3)** Agent 실행 이력 페이지의 `status='running'` polling 정책이 명시되어 있는가?
- [x] **(Phase 3)** 플랜 한도 초과 시 토스트가 아닌 모달로 업그레이드 CTA를 노출하는 정책이 §7 모달 표에 반영되어 있는가?
- [x] **(Phase 3)** 마지막 admin 강등·조직 삭제·구독 취소 등 위험 작업의 확인 모달이 정의되어 있는가?
- [x] **(Phase 3)** 대시보드에 사용량 위젯·Agent 요약·결제 알림 배너가 추가되어 있는가?
- [x] **(v1.3 / SRS)** 지침이 조직 공용으로 전환되었고(BR-34) `/guidelines` 페이지에 공용 안내 배너·작성자 표시·admin/member 액션 분리가 반영되었는가?
- [x] **(v1.3 / SRS)** Personal Org 자동 생성 흐름이 플로우 E에 포함되어 있고, `/org` 카드의 `[개인]` 뱃지·삭제 차단·`/org/[id]` 위험 영역 disabled가 반영되었는가?
- [x] **(v1.3 / SRS)** 조직 삭제 30일 grace + 복원 흐름(플로우 E-2) + `/api/cron/org/purge` 완전 삭제 정책이 §2 분기 테이블에 추가되었는가?
- [x] **(v1.3 / Toss)** 결제 페이지가 `/billing/checkout/success`·`/fail` 분리에서 **`/billing/checkout/result` 단일 URL + 쿼리 분기**로 통합되었는가? (toss-quickstart §결제 결과 페이지)
- [x] **(v1.3 / Toss)** 결제 플로우 F가 toss-quickstart §결제 UI 플로우(주문 행 선행 생성 → AUTH_READY → SDK 호출 → result에서 confirm 정확히 1회)와 100% 일치하는가?
- [x] **(v1.3 / Toss)** 정기결제 cron 흐름(플로우 F-2)이 빌링키 결제 API 호출 + past_due 3일 grace + 자동 free 강등 분기까지 정의되어 있는가?
- [x] **(v1.3 / Toss)** 환불 흐름(플로우 F-3)이 사용자 요청 → 관리자 승인 → Toss cancel API → 단일 트랜잭션 DB 업데이트까지 정의되어 있는가? `calculateRefundAmount` 실시간 표시가 UI에 명시되어 있는가?
- [x] **(v1.3 / Toss)** 가상계좌 입금 대기(PAY_WAITING) UI와 Webhook 비동기 활성화 흐름이 반영되어 있는가?
- [x] **(v1.3 / Toss)** 11상태 뱃지 색상 매핑이 `/billing/payments` 결제 표에 정의되어 있는가?
- [x] **(v1.3 / Toss)** confirm 누락 시 sync 폴백, 30분 만료 cron, Webhook 중복 멱등성 처리가 §2 분기 테이블에 모두 반영되어 있는가?
- [x] **(v1.3 / Agent)** Agent 실행 단건 상세에 Function Calling 트레이스 영역(시각 표현·SSE 실시간 append·실패 강조)이 정의되어 있는가?
- [x] **(v1.3 / Agent)** Agent 생성 페이지에 `publish_target` Accordion·`사용 도구 미리보기` 카드가 추가되었고 Phase 3.5 분리가 명시되어 있는가?
- [x] **(v1.3 / Agent)** Agent cron 실행 플로우 G-2가 Function Calling 루프·도구 호출 한도·타임아웃·PII 마스킹까지 포함하여 정의되어 있는가?
- [x] **(v1.3 슬림화 / SSOT)** 플로우 F-2(정기결제 cron)·G-2(Agent cron) 등 서버 내부 동작이 IA에서 제거되고 Usecase 참조로 이관되었는가? (UC-29·UC-36 SSOT)
- [x] **(v1.3 슬림화 / SSOT)** 플로우 F·G·E·E-2에서 코드/SQL/환경변수가 제거되고 사용자 화면 전환만 남아 있는가?
- [x] **(v1.3 슬림화 / SSOT)** 분기 테이블의 비즈니스 예외(Personal Org 보호·confirm 가드·Webhook 멱등성 등)가 Usecase §5 예외 흐름 참조로 단순화되었는가?
- [x] **(v1.4 / BR-02)** Team 플랜이 모든 플랜 비교 테이블·뱃지·드롭다운에서 제거되었고 Free/Pro 2종으로 정리되었는가?
- [x] **(v1.4 / BR-02)** Sidebar 하단 잔여 사용량 위젯(BR-구독결제.md §5)이 정의되었고, `/generate` 진입 시 상단 잔여 표시·한도 0회 시 차단 카드가 정의되어 있는가?
- [x] **(v1.4)** `/billing` 페이지에 해지 예약 amber 카드·past_due 빨강 카드·결제 수단 카드 변경·결제 내역 미니 표가 추가되었는가?
- [x] **(v1.4 / UC-31·38)** 플로우 F-4 (해지 예약 + 해지 취소)가 정의되었고, AlertDialog·amber 카드 전환·복원 흐름이 명시되어 있는가?
- [x] **(v1.4 / UC-39)** `/system/crons`·`/system/crons/[code]/runs` 페이지가 SystemAdmin 전용으로 정의되었고, 접근 권한 표·페이지 계층 표에 모두 반영되어 있는가?
