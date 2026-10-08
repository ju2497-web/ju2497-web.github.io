# 판매 테스트 실험실 (가짜 문 테스트)

앱 15개의 판매 페이지. 실제 앱을 만들기 전에 **가격을 보고도 버튼을 누르는 사람이 있는지** 측정한다. 결제는 받지 않는다.

| 앱 | 주소 | 가격 |
|---|---|---|
| 무지개다리 반려동물 다시 만나기 | `/lab/pet-reunion/` | 14,900원 |
| 우리 강아지·고양이가 사람이라면 | `/lab/pet-human/` | 4,900원 |
| 입양 전 아기 시절 만나기 | `/lab/pet-baby/` | 9,900원 |
| 사주로 그린 미래 배우자 얼굴 | `/lab/future-spouse/` | 9,900원 |
| 응답하라 1994, 내 졸업앨범 사진 | `/lab/yearbook-90s/` | 6,900원 |
| 결혼사진에 돌아가신 부모님 모시기 | `/lab/wedding-parent/` | 19,900원 |
| 부모님 이름으로 만든 생신 트로트 | `/lab/trot-song/` | 14,900원 |
| 초음파 사진 속 아기 실제 얼굴 | `/lab/ultrasound-baby/` | 9,900원 |
| 내가 주인공인 K-드라마 포스터 | `/lab/drama-poster/` | 4,900원 |
| 50년 뒤 노부부가 된 우리 | `/lab/old-couple/` | 7,900원 |
| 내 땅에 집 짓기 타임랩스 | `/lab/my-land-house/` | 19,900원 |
| 우리 집 리모델링 미리 보기 | `/lab/room-makeover/` | 9,900원 |
| 내 방 꾸미기 미리 보기 | `/lab/my-room/` | 4,900원 |
| 내 사무실 바꿔 보기 | `/lab/my-office/` | 9,900원 |
| 내 연구실 바꿔 보기 | `/lab/my-lab/` | 9,900원 |

## 시작 전 준비 (교수님)
1. 이 브랜치를 `main`에 합치고 GitHub 설정 → Pages에서 공개
2. 구글 애널리틱스 4 측정 ID, 메타 픽셀 ID를 `lab/config.js`에 입력
3. (선택) 알림 신청 연락처를 모으려면 구글 Apps Script 웹앱 URL을 `WAITLIST_URL`에 입력
4. 광고용 예시 이미지: 이미지 생성 AI로 앱별 전·후 예시 2장을 만들어 `lab/<앱>/before.jpg`, `after.jpg`로 넣고
   `apps.mjs`의 해당 앱에 `images: ["before.jpg", "after.jpg"]` 추가 → `node lab/build.mjs`

## 측정하는 것
- `cta_click`: 가격이 적힌 버튼 클릭 (= 돈 낼 의향)
- `waitlist_submit`: 연락처까지 남김 (= 강한 의향)

## 테스트 규칙
- 앱마다 메타 광고 3만~5만 원, 3일. 광고 문구는 `lab/ads.csv` (메타 일괄 업로드용)
- 판정 지표: **방문자 대비 `cta_click` 비율**, 그다음 `waitlist_submit` 비율
- 상위 1~2개만 실제 앱으로 개발, 나머지는 문구를 한 번 바꿔 재시험 후 폐기
- 실제 결제를 받지 않으므로, 알림 신청자에게는 오픈 시 약속한 50% 할인을 반드시 지킬 것

## 수정 방법
문구·가격은 `lab/apps.mjs`만 고치고 `node lab/build.mjs` 실행.
