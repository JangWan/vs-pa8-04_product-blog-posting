/**
 * Clerk 백엔드 API는 error.message를 항상 영어로 반환합니다.
 * 커스텀 플로우(useSignIn, useSignUp 훅)에서는 localization prop이 적용되지 않으므로
 * error.code를 기준으로 한글 메시지를 매핑합니다.
 *
 * 참고: https://clerk.com/docs/reference/types/clerk-error
 */

const CLERK_ERROR_MAP: Record<string, string> = {
  /* ── 인증 (로그인) ── */
  form_identifier_not_found:        "등록되지 않은 이메일입니다.",
  form_password_incorrect:          "비밀번호가 올바르지 않습니다.",
  session_exists:                   "이미 로그인된 상태입니다.",
  identifier_already_signed_in:     "이미 로그인된 상태입니다.",
  strategy_for_user_invalid:        "이 계정은 해당 로그인 방식을 지원하지 않습니다.",
  not_allowed_access:               "접근이 허용되지 않은 계정입니다.",

  /* ── 회원가입 ── */
  form_identifier_exists:           "이미 사용 중인 이메일입니다.",
  form_username_invalid_length:     "사용자명 길이가 올바르지 않습니다.",
  form_username_invalid_character:  "사용자명에 허용되지 않는 문자가 포함되어 있습니다.",
  form_param_format_invalid:        "입력 형식이 올바르지 않습니다.",
  form_param_nil:                   "필수 항목이 입력되지 않았습니다.",

  /* ── 비밀번호 규칙 ── */
  form_password_length_too_short:       "비밀번호는 8자 이상이어야 합니다.",
  form_password_size_in_bytes_exceeded: "비밀번호가 너무 깁니다.",
  form_password_no_uppercase:           "비밀번호에 대문자를 포함해야 합니다.",
  form_password_no_lowercase:           "비밀번호에 소문자를 포함해야 합니다.",
  form_password_no_numbers:             "비밀번호에 숫자를 포함해야 합니다.",
  form_password_not_strong_enough:      "비밀번호가 너무 단순합니다. 더 강력한 비밀번호를 사용해주세요.",
  form_password_pwned:                  "유출된 비밀번호입니다. 다른 비밀번호를 사용해주세요.",
  form_password_validation_failed:      "비밀번호가 조건을 충족하지 않습니다.",
  password_incorrect:                   "현재 비밀번호가 올바르지 않습니다.",

  /* ── 인증 코드 (OTP / 이메일 코드) ── */
  form_code_incorrect:    "인증 코드가 올바르지 않습니다.",
  verification_failed:    "인증에 실패했습니다. 코드를 다시 확인해주세요.",
  verification_expired:   "인증 코드가 만료되었습니다. 코드를 다시 받아주세요.",

  /* ── 요청 제한 ── */
  too_many_requests: "시도 횟수를 초과했습니다. 잠시 후 다시 시도해주세요.",

  /* ── 세션 / 클라이언트 ── */
  client_not_found:    "클라이언트 정보를 찾을 수 없습니다. 페이지를 새로고침해주세요.",
  session_not_found:   "세션이 만료되었습니다. 다시 로그인해주세요.",

  /* ── 계정 ── */
  user_not_found: "사용자를 찾을 수 없습니다.",
  user_locked:    "계정이 잠겼습니다. 잠시 후 다시 시도해주세요.",
};

/**
 * Clerk error.code를 한글 메시지로 변환합니다.
 * 매핑되지 않은 코드는 fallback 메시지를 반환합니다.
 */
export function clerkErrorToKorean(
  code: string,
  fallback = "오류가 발생했습니다. 다시 시도해주세요."
): string {
  return CLERK_ERROR_MAP[code] ?? fallback;
}
