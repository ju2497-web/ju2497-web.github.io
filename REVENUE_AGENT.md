# Revenue Agent – 고단가 수익 기회 엔진

> 목표는 공고를 많이 모으는 것이 아닙니다.
> **실제로 따낼 수 있고 현금으로 바뀌는, 적지만 더 좋은 고단가 기회**를 매일 골라 드리는 것입니다.

포지셔닝: **Biomedical / Laboratory Medicine SME + Academic Course Architect + Medical AI / Scientific Content Expert**

---

## 1. 60초 사용법

1. 대시보드를 엽니다.
   - 공개판: `https://ju2497-web.github.io/revenue/` (main 브랜치 병합 후 활성화)
   - 로컬판: `output/dashboard.html`
2. 맨 위 **"오늘 지원할 TOP 기회"** 카드 최대 5개만 봅니다. 각 카드에는 우선순위, 보수, 마감, 한국 지원 가능 여부, 원격 여부, 면접, 예상 지원 시간, 적합 이유, **다음 행동**, 지원 링크가 있습니다.
3. 지원했으면 카드의 **상태 선택**을 `APPLIED`로 바꿉니다. 팔로업 날짜는 +10일로 자동 설정됩니다.
4. 돈이 들어오면 **₩ 입금 기록**을 누릅니다. 월 목표(1,000만원) 대비 달성률이 자동으로 갱신됩니다.

배지는 이렇게 읽습니다.
- `사실`: 공고나 API에 명시된 내용
- `추정`: 규칙에 따른 추정 (환율, 업계 통상 요율, 지원 시간 등)
- `미확인`: 정보 없음

보수가 공개되지 않은 공고는 `COMPENSATION NOT DISCLOSED`로, 지원자가 요율을 제안하는 공고는 `APPLICANT-PROPOSED RATE`로 표시합니다. **숫자를 지어내지 않습니다.**

---

## 2. 구조

```
config/profile.toml        전문분야 키워드, 요율 기준, 월 목표, 환율(추정)
config/sources.toml        수집 소스 (켜기/끄기, 검색어)
data/seeds/*.json          사람이 검증한 공고·플랫폼 (항상 포함)
data/opportunities.json    수집·점수화된 기회 DB (중복 제거·변경 이력)
data/run_log.json          소스별 수집 상태
data/private/tracker.json  ★ 개인 지원·수익 기록 (git 제외)
revenue/index.html         공개 대시보드 (개인 기록 없음)
output/dashboard.html      로컬 대시보드 (개인 기록 포함, git 제외)
output/packages/<id>.md    S/A 기회 지원 패키지 초안 (git 제외)
revenue_agent/             엔진 (Python 표준 라이브러리만 사용, 설치 불필요)
tests/                     오프라인 테스트 (fixture)
.github/workflows/         매일 06:07 KST 자동 수집 + 테스트
```

처리 순서: **수집 → 정규화 → 분류 → 보수 파싱 → 점수 → 저장/중복 제거 → 지원 패키지 → 대시보드**

| 모듈 | 역할 |
|---|---|
| `adapters/` | seeds · ReliefWeb API · World Bank 조달 API · 나라장터(data.go.kr) · Greenhouse/Lever/Ashby 채용 API · RSS(Google Alerts) · 공식 공고 페이지 감시(pagewatch) |
| `classify.py` | 파이프라인 A~J, 계약 유형(개인·업체 전용·컨소시엄·로스터·플랫폼), 원격 여부, 한국 지원 가능 여부, 면접, 비추천 필터 |
| `compensation.py` | USD/EUR/KRW, 시간·일·월·건 단위 파싱 → 시급 환산. 원래 통화 유지, 원화는 추정치로 병기 |
| `scoring.py` | 0~100점, S/A/B/C 등급, 추정치, 다음 행동 |
| `store.py` | 기관+정규화 제목, URL, 유사 제목으로 중복 제거. 마감·상태 변경은 이력으로 남김. 재공고는 새 회차로 기록 |
| `tracker.py` | FOUND → … → PAID → REPEAT CLIENT 단계, 수익 지표 |
| `packages.py` | 지원 패키지 초안 (자동 제출 없음) |
| `dashboard.py` | 한국어 단일 HTML 대시보드 |

### 점수 (100점)

| 항목 | 배점 |
|---|---|
| 전문성 적합도 | 25 |
| 보수 잠재력 | 20 |
| 한국 지원 가능 | 10 |
| 원격·비동기 | 10 |
| 유료 전환 확률 | 10 |
| 첫 입금 속도 | 10 |
| 지원 부담 낮음 | 5 |
| 면접 부담 낮음 | 5 |
| 반복·리테이너 | 5 |

등급 기준
- **S** (75점 이상): 즉시 지원
- **A** (62점 이상): 곧 지원 준비
- **B** (48점 이상): 선택적으로 지원하거나 관찰
- **C**: 낮은 우선순위
- **X = NOT RECOMMENDED**: 한 줄 사유를 함께 표시

**비추천(X) 필터**
- 미국·EU 거주자 한정
- 해당국 국적자 한정 (National Consultant)
- 의사면허 필수
- 이주·상주 근무 필수
- 상근·정규직
- 무보수·인턴
- 커미션만 지급
- 잦은 출장
- 전공과 무관한 개발·영업 직무

**버리지 않는 공고**
- 이러닝, SCORM, Articulate 제작을 요구하는 공고는 **탈락시키지 않습니다.** 교수님은 SME, Course Author, Assessment Designer로 참여합니다.
- 업체 전용 입찰은 **POTENTIAL SME SUBCONTRACTING LEAD**로 분류하고, 원청 후보 업체(추정)와 협력 제안 메일 초안을 만듭니다.

---

## 3. 명령어

```bash
python -m revenue_agent run                     # 전체 실행 (수집→점수→패키지→대시보드)
python -m revenue_agent run --only seeds        # 특정 소스만
python -m revenue_agent list --priority S,A     # 목록
python -m revenue_agent show <id>               # 상세 (id 앞 몇 글자만 써도 됨)
python -m revenue_agent add --org "ASLM" --title "SME – Genomics course" \
    --url https://... --deadline 2026-10-31 --pay "USD 450 per day" --type individual --remote remote
python -m revenue_agent track <id> APPLIED --note "제출 완료"
python -m revenue_agent expect <id> 3000000     # 예상 수입 (KRW)
python -m revenue_agent earn <id> 1500 --currency USD --hours 12
python -m revenue_agent metrics                 # 수익 지표
python -m revenue_agent import-tracker revenue-tracker-2026-09-29.json   # 대시보드에서 내보낸 기록 병합
python -m revenue_agent packages --id <id>      # 특정 기회 지원 패키지
python -m revenue_agent rescore                 # profile.toml 수정 후 전체 재채점
python -m revenue_agent economics               # 채널별 실효 시급 + 월 1,000만원 시나리오
python -m unittest discover -s tests -t .       # 테스트
```

### 수입 구조 (실효 시급)
- 채널별 단가를 **준비·제작 시간까지 포함한 실효 시급**으로 바꿔 비교합니다.
  - 예: 25분짜리 차시 단가를 녹화 시간으로만 나누면 시급이 크게 부풀려 보입니다. 원고·촬영·수정까지 5~11시간이 들면 실효 시급은 그 몇 분의 1로 줄어듭니다.
- 개인 계약 단가는 `data/private/profile.local.toml`(git 제외)에 둡니다. 양식은 `config/profile.local.example.toml`입니다.
- 로컬 대시보드의 "수입 구조" 탭과 `economics` 명령에서만 보입니다. 공개 대시보드에는 들어가지 않습니다.

Python 3.11 이상이면 되고, 외부 패키지는 필요 없습니다.

---

## 4. 자동화 (GitHub Actions)

- `revenue-agent.yml`: 매일 06:07 KST에 테스트를 돌린 뒤 수집과 점수화를 하고, `data/opportunities.json`, `data/run_log.json`, `revenue/index.html`을 커밋합니다. **개인 트래커는 커밋하지 않습니다.**
- `revenue-agent-tests.yml`: 코드를 바꿀 때마다 lint와 테스트를 실행합니다.
- 예약 실행(schedule)은 **기본 브랜치(main)** 에서만 돕니다. 이 브랜치를 main에 병합해야 매일 자동으로 실행됩니다. 수동 실행은 Actions 탭에서 "Run workflow"를 누르면 됩니다.

### 필요한 GitHub Secrets (Settings → Secrets and variables → Actions)

| Secret | 용도 | 발급처 | 없을 때 |
|---|---|---|---|
| `RELIEFWEB_APPNAME` | UN·국제NGO 컨설턴시 공고 (WHO, UNICEF, FAO 등) | https://apidoc.reliefweb.int 에서 appname 사전 승인 신청 | 소스 건너뜀 |
| `DATA_GO_KR_KEY` | 나라장터 용역 입찰공고 (이러닝·교육과정·임상병리) | https://www.data.go.kr → "조달청_나라장터 입찰공고정보서비스" 활용신청 → 인증키(Encoding) | 소스 건너뜀 |

두 키가 없어도 시스템은 동작합니다. 시드, World Bank, 채용 API, 공고 페이지 감시는 키 없이 돌아갑니다.

### 추천: Google Alerts RSS (가장 넓고 안정적인 무료 수집)

1. https://www.google.com/alerts 에서 검색어를 입력합니다. 예시:
   - `"subject matter expert" laboratory consultancy`
   - `"e-learning" laboratory consultant`
   - `임상병리 이러닝`
   - `평가위원 모집 보건의료`
2. 옵션에서 "전송 대상: RSS 피드"를 고르고 피드 URL을 복사합니다.
3. `config/sources.toml`의 `google-alerts-example` 항목에 URL을 붙여 넣고 `enabled = true`로 바꿉니다. 검색어마다 `[[source]]` 항목을 하나씩 만듭니다.

---

## 5. 개인정보 원칙 (이 저장소는 공개입니다)

- 지원 상태, 수익, 팔로업 기록은 **브라우저(localStorage)** 또는 **`data/private/`** 에만 저장되고 git에서 제외됩니다.
- 공개 대시보드 파일에는 트래커 데이터가 들어가지 않습니다. 테스트로 검증했습니다.
- 기기를 옮길 때는 대시보드의 "트래커 내보내기/가져오기"를 쓰십시오.
- 트래커까지 서버에 보관하고 싶으시면, **비공개 저장소**로 옮긴 뒤 `RA_TRACKER_PATH=data/tracker.json`을 설정하십시오.

## 6. 안전 원칙

- 이메일 발송, 지원서 제출, 약관 동의, 유료 업무 수락, 비용 지출은 **자동으로 하지 않습니다.** 초안 작성까지만 자동입니다.
- 수집할 때 지키는 것:
  - robots.txt 준수
  - 호스트별 요청 간격 2초
  - 401/403 접근 제한은 우회하지 않음
  - CAPTCHA와 로그인 페이지는 수집하지 않음 (멀티캠퍼스 등은 시드로만 관리)
- 인증정보는 환경변수나 GitHub Secrets에만 둡니다. 코드에 하드코딩하지 않습니다.

## 7. 알려진 한계

- 공고 페이지 감시(pagewatch)는 링크 제목과 상세 페이지 텍스트를 규칙으로만 분석합니다. 세부 조건은 **원문 확인이 필요**하다고 표시됩니다.
- Greenhouse, Lever, Ashby 게시판 토큰(scaleai, lilt, mercor, micro1)은 회사 사정으로 바뀔 수 있습니다. 404가 나면 대시보드 "소스 상태"에 오류로 표시되니, 토큰만 고치면 됩니다.
- 나라장터 API 경로는 조달청 개편 때 바뀔 수 있습니다. 그때는 `sources.toml`의 `base_url`을 수정하십시오.
- 전문가 네트워크와 AI 플랫폼의 요율은 공개되지 않아서 **추정치**(profile.toml `[rates]`)로 표시합니다.
