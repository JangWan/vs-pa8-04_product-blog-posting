import { TaskChooseOrganization } from "@clerk/nextjs";

/**
 * Clerk choose-organization 세션 태스크 처리 페이지.
 * 로그인 후 세션이 pending 상태(조직 미선택)일 때 자동 리다이렉트됨.
 * TaskChooseOrganization이 조직 선택/생성 후 /dashboard로 완료 처리.
 */
export default function SelectOrgPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <TaskChooseOrganization redirectUrlComplete="/dashboard" />
    </div>
  );
}
