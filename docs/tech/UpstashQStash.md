# Upstash QStash

**Upstash QStash**는 서버리스 환경(Vercel, Next.js)에 특화된 HTTP 기반의 **메시징 및 스케줄링 서비스**입니다.

## 2.1 핵심 특징
1.  **서버리스 최적화:** 서버를 항상 띄워둘 필요 없이, 정해진 시간에 우리 API로 HTTP 요청을 던져줍니다.
2.  **자동 재시도(Dead Letter Queue):** 우리 서버(Vercel)가 잠시 응답하지 않더라도 QStash가 지수 백오프(Exponential Backoff) 방식으로 성공할 때까지 다시 시도합니다. (결제 로직에 필수)
3.  **암호화 서명 검증:** `upstash-signature` 헤더를 통해 요청이 조작되지 않았음을 보장합니다.
4.  **복수 스케줄링:** Vercel Hobby 플랜은 Cron이 1개로 제한되나, QStash는 무료 플랜에서도 여러 개의 스케줄(결제용, Agent용 등)을 각각 관리할 수 있습니다.

## 2.2 무료 플랜(Free Tier) 명세
*   **요청 한도:** 하루 최대 **50건** (IndiePost AI의 결제 1건 + 에이전트 24건 운영 시 충분)
*   **재시도:** 실패 시 최대 3회 재시도 포함
*   **지연 시간:** 스케줄링 정확도 높음
*   **비용:** $0 (하루 50건 초과 시 차단되나, 우리 규모에서는 안전함)

## 2.3 보안 아키텍처
*   **QStash** $\rightarrow$ **Vercel API**: 요청 전송 시 비대칭 암호화 서명 포함.
*   **Vercel API (Hono)**: `Receiver` 라이브러리로 서명 검증 후 로직 실행.
