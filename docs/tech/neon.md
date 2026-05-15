---
description: Neon Serverless Postgres Migration SQL Guideline
globs: neon/migrations/*.sql
---

# Neon Serverless Postgres Migration SQL Guideline

> 기준: 2026년 5월 / Neon Serverless Postgres

## Must

- Each migration file must have a unique name with number prefix (e.g., `0001_create_users_table.sql`)
- Each migration must be idempotent (can be run multiple times without error)
- Use `CREATE TABLE IF NOT EXISTS` instead of just `CREATE TABLE`
- Use `CREATE INDEX IF NOT EXISTS` instead of just `CREATE INDEX`
- Include proper error handling with `BEGIN` and `EXCEPTION` blocks
- Add comments for complex operations
- Always specify column types explicitly
- Include proper constraints (NOT NULL, UNIQUE, etc.) where appropriate
- Add `updated_at` column to all tables, and use trigger to update it
- Always check other migrations to avoid conflicts
- Always use `sslmode=require` in connection strings
- Use `-pooler` suffix in endpoint for connection pooling (e.g., `ep-xxx-pooler.region.aws.neon.tech`)
- Disable RLS for all tables (`ALTER TABLE ... DISABLE ROW LEVEL SECURITY`)

## Should

- Keep migrations small and focused on a single concern
- Use consistent naming conventions for tables and columns
- Use `snake_case` for all identifiers
- Document breaking changes
- Test migrations on a Neon branch before applying to production
- Use Neon branching for dev / staging / preview environments
- Use Schema Diff GitHub Action to review schema changes in pull requests

## Migration File Template

```sql
-- migrations/0001_create_users_table.sql

BEGIN;

-- ============================================================
-- updated_at 자동 갱신 트리거 함수 (최초 1회만 생성)
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = current_timestamp(3);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 테이블 생성
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT        NOT NULL UNIQUE,
  name        TEXT        NOT NULL,
  role        TEXT        NOT NULL DEFAULT 'user',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS 비활성화
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- updated_at 트리거
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_users_updated_at'
  ) THEN
    CREATE TRIGGER set_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  END IF;
END;
$$;

COMMIT;
```

## Recommended Patterns

### Enum 사용

```sql
-- 고정 값 목록은 enum으로 정의
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'member', 'guest');
EXCEPTION
  WHEN duplicate_object THEN NULL; -- 이미 존재하면 무시
END $$;

CREATE TABLE IF NOT EXISTS members (
  id    UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  role  user_role NOT NULL DEFAULT 'member'
);
```

### 외래키 + 인덱스

```sql
CREATE TABLE IF NOT EXISTS posts (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 외래키 컬럼에는 반드시 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts (user_id);
```

### Postgres Extensions

```sql
-- AI / 벡터 검색
CREATE EXTENSION IF NOT EXISTS vector;

-- GraphQL API 레이어
CREATE EXTENSION IF NOT EXISTS pg_graphql;

-- ULID 기본키
CREATE EXTENSION IF NOT EXISTS pgx_ulid;

-- 컴퓨트 재시작 후 인덱스 메모리 프리로드
CREATE EXTENSION IF NOT EXISTS pg_prewarm;
SELECT pg_prewarm('idx_posts_user_id');
```

## Neon Specific

### Branching Workflow

- `production` branch: main branch, auto-created by Neon, connects to your live app
- `dev` / `staging` / `preview` branches: copy-on-write clones for isolated testing
- Always run and verify migrations on a branch before applying to production
- Branches are ideal for CI/CD pipelines and PR previews

```bash
# Neon CLI — 브랜치 생성 및 관리
neon auth                                          # CLI 인증
neon branches create --name dev                    # 개발 브랜치 생성
neon branches create --name preview/pr-42 \
  --parent dev                                     # PR 전용 임시 브랜치
neon branches create --name feature-test \
  --expires-at "2026-06-30T00:00:00Z"              # 만료일 설정
neon branches delete preview/pr-42                 # 브랜치 삭제
```

### Connection Strings

```ini
# Standard connection (direct)
DATABASE_URL="postgresql://user:password@ep-xxx.region.aws.neon.tech/dbname?sslmode=require&channel_binding=require"

# Pooled connection (recommended for serverless / high-concurrency)
DATABASE_URL="postgresql://user:password@ep-xxx-pooler.region.aws.neon.tech/dbname?sslmode=require&channel_binding=require"
```

### Environment Variables

```env
# .env.local

# 서버리스 / 고동시성 — pooler 사용 권장
DATABASE_URL="postgresql://user:password@ep-xxx-pooler.region.aws.neon.tech/dbname?sslmode=require&channel_binding=require"

# Neon API 키 (CLI / GitHub Actions 자동화용)
NEON_API_KEY="your_neon_api_key"

# Neon 프로젝트 ID (GitHub Actions에서 브랜치 생성 시 필요)
NEON_PROJECT_ID="your_project_id"
```

### Serverless Driver

Edge / serverless 환경에서는 `@neondatabase/serverless` 드라이버를 사용합니다 (HTTP/WebSocket 기반).

```typescript
// HTTP 쿼리 (Edge Runtime, Vercel Edge Functions)
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL!);
const rows = await sql`SELECT * FROM users WHERE id = ${userId}`;

// Pool 기반 (Drizzle ORM 연동)
import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

// 사용 후 반드시 pool 종료
ctx.waitUntil(pool.end());
```

### Migration Tools

| 도구 | 명령어 | 비고 |
|---|---|---|
| **Drizzle Kit** | `npx drizzle-kit generate` → `npx drizzle-kit push` | 스키마 기반 자동 생성 |
| **Prisma** | `prisma migrate dev` → `prisma migrate deploy` | 모델 기반 마이그레이션 |
| **Flyway** | `flyway migrate` | SQL 파일 기반 |
| **Liquibase** | `liquibase update` | Changelog XML/YAML 기반 |

### GitHub Actions — PR 브랜치 자동화

PR이 열릴 때 Neon 브랜치를 자동 생성하고, 닫힐 때 삭제하는 패턴입니다.

```yaml
# .github/workflows/preview-db.yml
name: Neon Branch Preview

on:
  pull_request:
    types: [opened, reopened, synchronize, closed]

jobs:
  create_branch:
    if: github.event.action != 'closed'
    runs-on: ubuntu-latest
    steps:
      - name: Create Neon Branch
        id: create_branch
        uses: neondatabase/create-branch-action@v5
        with:
          project_id: ${{ vars.NEON_PROJECT_ID }}
          branch_name: preview/pr-${{ github.event.number }}
          api_key: ${{ secrets.NEON_API_KEY }}

      - name: Run Migrations
        run: npx drizzle-kit push
        env:
          DATABASE_URL: ${{ steps.create_branch.outputs.db_url_with_pooler }}

      # 스키마 변경사항을 PR 코멘트로 자동 게시
      - name: Post Schema Diff
        uses: neondatabase/schema-diff-action@v1
        with:
          project_id: ${{ vars.NEON_PROJECT_ID }}
          compare_branch: preview/pr-${{ github.event.number }}
          api_key: ${{ secrets.NEON_API_KEY }}

  delete_branch:
    if: github.event.action == 'closed'
    runs-on: ubuntu-latest
    steps:
      - name: Delete Neon Branch
        uses: neondatabase/delete-branch-action@v3
        with:
          project_id: ${{ vars.NEON_PROJECT_ID }}
          branch: preview/pr-${{ github.event.number }}
          api_key: ${{ secrets.NEON_API_KEY }}
```

### Neon Authorize (JWT 기반 인증 연동)

Clerk / Auth0 등 JWT 기반 인증 제공자와 연동하여 DB 수준 권한을 관리합니다.

```typescript
// JWT 검증 (jose 라이브러리)
import { jwtVerify, createRemoteJWKSet } from 'jose';

const JWKS = createRemoteJWKSet(
  new URL(`${process.env.NEON_AUTH_BASE_URL}/.well-known/jwks.json`)
);

export async function validateNeonToken(token: string) {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: new URL(process.env.NEON_AUTH_BASE_URL!).origin,
  });
  return payload;
}
```

## Schema Organization

- Group related tables together
- Use `snake_case` for schemas, tables, and columns
- Keep authentication-related tables in a dedicated schema (e.g., `auth`)
- Consider Postgres schemas for multi-tenant applications

```
migrations/
├── 0001_create_users_table.sql
├── 0002_create_posts_table.sql
├── 0003_add_tags_to_posts.sql      # 작은 단위로 유지
└── 0004_create_comments_table.sql
```

## Performance Considerations

- Neon computes auto-suspend — use connection pooling (`-pooler`) to minimize cold start impact
- Avoid adding/removing columns from large tables in production
- Use appropriate data types to minimize storage
- Add indexes strategically (not excessively)
- Use `pg_prewarm` to reload indexes into memory after compute restarts
- Prefer `JSONB` over `JSON` for better indexing and performance
- Prefer `TIMESTAMPTZ` over `TIMESTAMP` for timezone-aware 시간 저장

## Security Best Practices

- Never store plaintext passwords
- Sanitize and validate all user inputs at the application layer
- Always set `sslmode=require` (and `channel_binding=require` when supported)
- Do not expose `DATABASE_URL` or credentials in client-side code
- Use Neon roles with least-privilege access for different services
- `NEON_API_KEY`는 GitHub Secrets에만 저장, 코드에 절대 하드코딩 금지

---

## References

| 문서 | URL |
|---|---|
| Neon 공식 문서 | https://neon.com/docs |
| 빠른 시작 | https://neon.com/docs/get-started-with-neon/signing-up |
| Neon CLI 레퍼런스 | https://neon.com/docs/reference/neon-cli |
| Serverless Driver | https://neon.com/docs/serverless/serverless-driver |
| Branching 가이드 | https://neon.com/docs/introduction/branching |
| 브랜치 만료 설정 | https://neon.com/docs/guides/branch-expiration |
| GitHub 통합 | https://neon.com/docs/guides/neon-github-integration |
| Schema Diff Action | https://neon.com/docs/guides/schema-diff |
| Neon Authorize | https://neon.com/docs/guides/neon-authorize |
| Postgres Extensions | https://neon.com/docs/extensions/pg-extensions |
| Drizzle + Neon | https://neon.com/docs/guides/drizzle |
| Prisma + Neon | https://neon.com/docs/guides/prisma |
| Vercel 통합 | https://neon.com/docs/guides/neon-managed-vercel-integration |
