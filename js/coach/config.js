// 운영 설정. 이 파일만 고치면 가격·서버 주소·검수 연락처·차단 대학이 바뀝니다.
export const CONFIG = {
  serviceName: "AI 면접 코치",
  // AI 심층형 서버 주소(server/README.md 대로 배포한 Cloudflare Worker URL). 비우면 기본형만 동작합니다.
  aiEndpoint: "",
  // 베타 기간: 결제 없이 무료로 테스트
  beta: true,
  prices: { basic: 19900, deep: 49000, review: 69000 },
  // 교수 최종검수 신청을 받을 이메일(비우면 신청서를 복사해 직접 보내도록 안내)
  reviewContact: "",
  // 이해충돌 방지: 교수 본인 소속 대학 등 유료 서비스를 막을 대학명(문항 DB의 university 값과 같게)
  blockedUniversities: [],
  // 문항 DB 파일
  questionBankUrl: "data/questions.json",
};
