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
      "e33392fe5ea3c8f8b3e268c06decaa89c3cb2b1c1fc059cf2165e0bfd94be93c", // 2026-10-12 발급(1호 코드). 첫 결제 학생에게 보내고, 다음 결제부터는 coach-admin에서 새로 만듭니다.
    ],
    // 결제 안내: 숨고·크몽 상품 주소(비우면 문구만 표시). 결제 확인 후 이용 코드를 문자·채팅으로 보냅니다.
    payLinks: { soomgo: "", kmong: "" },
    payNote: "숨고 또는 크몽에서 결제하시면 확인 후 이용 코드를 채팅·문자로 보내 드립니다. 코드 1개로 면접일까지 모든 문항을 분석할 수 있습니다.",
  },
  // 교수 최종검수 신청을 받을 이메일(비우면 신청서를 복사해 직접 보내도록 안내)
  reviewContact: "",
  // 이해충돌 방지: 교수 본인 소속 대학 지원자 차단. 대학명은 적지 않고 정규화한 이름(공백·끝의 대학교/대학/대 제거)의 SHA-256 해시만 둡니다.
  // 해시 만들기: coach-admin.html의 [차단 대학 해시 만들기]. 서버(AI 심층형)는 Cloudflare 비밀 변수 BLOCKED_UNIVERSITIES에 이름을 따로 넣습니다.
  blockedUniversityHashes: [
    "d5ba6c07687553148b74caceac55910a52ccf7f9e744f02d8488cd11619ac8b0", // 2026-10-12 등록
  ],
  // 문항 DB 파일
  questionBankUrl: "data/questions.json",
  // 숨고·크몽 판매 상품(숨고 응답기 soomgo.html 견적 문안에 들어갑니다).
  // 가격 구조(2026-10-13 확정): 교수님이 직접 만드는 상품이므로 시간당 약 4만 5천 원 기준. 셀프 앱 상품(19,900)은 숨고에 올리지 않는다.
  // 정밀형(약 2시간)이 바닥, 실전 패키지(약 3시간)가 추천, 집중 완성형(약 6시간)이 위쪽 기준점. 무료 샘플·맛보기는 제공하지 않는다.
  soomgo: {
    plans: [
      { key: "precise", name: "정밀형", price: 89000, desc: "공개문항 전체 답변 + 질문 의도 + 꼬리질문 3개 + 학생부 반영 + 말하기 대본 + 교수 총평 + 앱 이용 코드" },
      { key: "package", name: "실전 패키지", price: 129000, recommended: true, includesZoom: true, desc: "정밀형 + 줌 모의면접 30분" },
      { key: "intensive", name: "집중 완성형", price: 290000, includesZoom: true, limited: "월 3명", desc: "정밀형 + 줌 모의면접 60분 2회 + 면접 전날 최종 점검 30분 + 수정 무제한" },
    ],
    // 면접 분야 리뷰 0건일 때만: 첫 3명에게 실전 패키지를 정밀형 가격에(리뷰 조건). 3건 차면 null로.
    launchOffer: { count: 3, text: "면접 서비스를 시작한 지 얼마 되지 않아, 첫 3분께는 실전 패키지를 정밀형 가격(89,000원)으로 진행합니다. 면접 뒤 솔직한 리뷰를 남겨 주시는 조건입니다." },
    zoom: { name: "줌 모의면접(선택)", price: 40000, minutes: 30, desc: "실제 면접처럼 질문·꼬리질문 후 바로 피드백" },
    deliveryHours: 48,          // 자료를 받은 뒤 답변 전달까지
    quoteCash: 5090,            // 견적 1건 발송 캐시(2026-09 실측)
    minDaysBeforeInterview: 2,  // 면접까지 이보다 적게 남으면 '보류'로 판정
  },
};
