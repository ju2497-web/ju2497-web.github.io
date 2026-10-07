# AI 심층형 서버 (Cloudflare Workers)

학생 화면(`coach.html`)의 **[AI 심층 분석]** 버튼이 호출하는 서버입니다. Claude API 키는 이 서버의 비밀 변수에만 보관되어 학생 브라우저에 노출되지 않습니다. 프롬프트·채점 기준은 `js/coach/prompt.js`, `js/coach/framework.js`를 학생 화면과 함께 씁니다.

## 배포 (10분)
1. Cloudflare 계정을 만들고 Node.js를 설치합니다.
2. 이 폴더에서:
   ```bash
   npm install
   npx wrangler login
   npx wrangler secret put ANTHROPIC_API_KEY     # Claude API 키 입력
   ```
3. `wrangler.toml`의 값을 채웁니다.
   - `ACCESS_CODES`: 베타 학생에게 나눠 줄 접근 코드(쉼표 구분). **비워 두면 누구나 호출해 비용이 나갈 수 있습니다.**
   - `BLOCKED_UNIVERSITIES`: 이해충돌 방지로 막을 대학명(교수님 소속 대학 등)
   - `ALLOWED_ORIGINS`: 학생 화면 주소(기본 `https://ju2497-web.github.io`)
4. `npx wrangler deploy` → 출력된 `https://interview-coach-api.<계정>.workers.dev` 주소를
   `js/coach/config.js`의 `aiEndpoint`에 넣고 커밋합니다.

## 비용 감각
요청 1건(문항 1개 분석)마다 Claude API 사용료가 발생합니다. 베타 기간에는 접근 코드로 사용자를 제한하고, Anthropic 콘솔에서 월 사용 한도를 설정해 두세요.

## 다음 단계(정식 판매 전)
- 결제(토스페이먼츠 등) 확인 후에만 심층형 호출을 허용하는 검증 추가
- IP·코드별 호출 횟수 제한(Cloudflare KV 또는 Rate Limiting)
- 검수 신청을 이메일 대신 DB(예: Cloudflare D1)에 저장
