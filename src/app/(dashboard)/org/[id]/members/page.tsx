import { redirect } from "next/navigation";

type Props = { params: Promise<{ id: string }> };

/**
 * /org/[id]/members 직접 접근 시 탭이 통합된 설정 페이지로 리다이렉트.
 * 멤버 탭 UI는 /org/[id] 페이지의 "members" 탭에서 렌더링됩니다.
 */
export default async function OrgMembersRedirectPage({ params }: Props) {
  const { id } = await params;
  redirect(`/org/${id}?tab=members`);
}
