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
  // 숨고 판매 상품(숨고 응답기 soomgo.html 견적 문안에 들어갑니다). 금액은 교수님이 정하세요.
  soomgo: {
    plans: [
      { key: "professor", name: "교수 직접 검수", price: 49000, desc: "공개문항 전체 답변 + 문항별 질문 의도 + 예상 꼬리질문 3개 + 말하기 대본 + 교수 총평(학생부 반영 가능)" },
    ],
    zoom: { name: "줌 모의면접(선택)", price: 40000, minutes: 30, desc: "실제 면접처럼 질문·꼬리질문 후 바로 피드백" },
    deliveryHours: 48,          // 자료를 받은 뒤 답변 전달까지
    quoteCash: 5090,            // 견적 1건 발송 비용(원). 교수님 확인: 5,090원
    minDaysBeforeInterview: 2,  // 면접까지 이보다 적게 남으면 '보류'로 판정
  },
};
