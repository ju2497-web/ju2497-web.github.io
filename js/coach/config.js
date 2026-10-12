// 운영 설정. 이 파일만 고치면 가격·서버 주소·검수 연락처·차단 대학·이용 코드가 바뀝니다.
export const CONFIG = {
  serviceName: "AI 면접 코치",
  // AI 심층형 서버 주소(server/README.md 대로 배포한 Cloudflare Worker URL). 비우면 기본형만 동작합니다.
  aiEndpoint: "",
  // 무료 베타 종료(2026-10-12). true로 바꾸면 결제 없이 모든 기능이 열립니다.
  beta: false,
  // 앱 가격(원). 기본형=앱 이용 코드, AI 심층형=기본형+서버 10단계 분석, 교수 검수형=AI 심층형+검수(review)
  prices: { basic: 19900, deep: 39000, review: 30000 },
  // 하드 페이월: 결제한 학생에게 보내는 이용 코드. 코드 원문이 아니라 SHA-256 해시만 둡니다(코드는 coach-admin.html의 [이용 코드 만들기]로 생성).
  // 코드 1개를 여러 학생에게 돌려 쓰지 말고, 결제 1건마다 1개를 만들어 보내고 면접이 끝나면 지웁니다.
  access: {
    hashes: [
      "12e82be0cb108f6fab87e7315a0cb5e7a6d5e8ce2fda124b43dd308ca884a643", // 초기 코드(README 참고). 첫 판매 전에 새 코드로 교체하세요.
    ],
    // 결제 안내: 숨고·크몽 상품 주소(비우면 문구만 표시). 결제 확인 후 이용 코드를 문자·채팅으로 보냅니다.
    payLinks: { soomgo: "", kmong: "" },
    payNote: "숨고 또는 크몽에서 결제하시면 확인 후 이용 코드를 채팅·문자로 보내 드립니다. 코드 1개로 면접일까지 모든 문항을 횟수 제한 없이 분석할 수 있습니다.",
  },
  // 교수 최종검수 신청을 받을 이메일(비우면 신청서를 복사해 직접 보내도록 안내)
  reviewContact: "",
  // 이해충돌 방지: 교수 본인 소속 대학 등 유료 서비스를 막을 대학명(문항 DB의 university 값과 같게)
  blockedUniversities: [],
  // 문항 DB 파일
  questionBankUrl: "data/questions.json",
  // 숨고·크몽 판매 상품(숨고 응답기 soomgo.html 견적 문안에 들어갑니다).
  // 가격 구조: 간편형은 기준점(앵커), 패키지가 추천 상품. 무료 샘플·맛보기는 제공하지 않습니다.
  soomgo: {
    plans: [
      { key: "simple", name: "간편형", price: 29000, desc: "공개문항 전체 답변 + 문항별 질문 의도 + 예상 꼬리질문 3개 + 앱 이용 코드" },
      { key: "precise", name: "정밀형", price: 49000, desc: "간편형 + 학생부 반영 + 말하기 대본·연습 포인트 + 교수 총평" },
      { key: "package", name: "합격 패키지", price: 79000, recommended: true, includesZoom: true, desc: "정밀형 + 줌 모의면접 30분(따로 하면 89,000원)" },
    ],
    zoom: { name: "줌 모의면접(선택)", price: 40000, minutes: 30, desc: "실제 면접처럼 질문·꼬리질문 후 바로 피드백" },
    deliveryHours: 48,          // 자료를 받은 뒤 답변 전달까지
    quoteCash: 5090,            // 견적 1건 발송 캐시(2026-09 실측)
    minDaysBeforeInterview: 2,  // 면접까지 이보다 적게 남으면 '보류'로 판정
  },
};
