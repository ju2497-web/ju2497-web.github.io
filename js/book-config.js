// 전자책 판매 설정. 이 파일만 고치면 가격·판매 수량·구매 링크가 바뀝니다.
export const BOOK = {
  title: "면접관은 이렇게 듣는다",
  subtitle: "현직 입학처장이 공개하는 수시 면접 답변의 구조",
  pages: 24,
  // 가격 규칙: 초판 가격에서 시작해 1권 팔릴 때마다 step만큼 오릅니다. 공지한 대로 반드시 지키세요.
  basePrice: 19000,
  step: 1000,
  // 지금까지 팔린 권수. 판매 플랫폼의 실제 주문 수와 같게 손으로 갱신합니다(허위 기재 금지).
  sold: 0,
  // 초판 한정 수량. 이 수량이 다 팔리면 가격 인상을 멈추고 2판 가격을 따로 정합니다.
  limit: 100,
  // 구매 링크(크몽·래피드 등 전자책 상품 URL). 비우면 "준비 중"으로 표시되고 문의 버튼만 나옵니다.
  buyUrl: "",
  // 구매 전 문의를 받을 곳(이메일 또는 오픈채팅 URL). 비우면 문의 버튼을 숨깁니다.
  contact: "",
  // 판매 시작일(표시용)
  launchDate: "2026-10-10",
};

export function currentPrice(b = BOOK) {
  const sold = Math.min(Math.max(0, b.sold), b.limit);
  return b.basePrice + sold * b.step;
}
export function nextPrice(b = BOOK) {
  return currentPrice(b) + (b.sold + 1 <= b.limit ? b.step : 0);
}
export const won = (n) => n.toLocaleString("ko-KR") + "원";
