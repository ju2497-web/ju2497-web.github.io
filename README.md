# 임상병리 학습실 (ju2497-web.github.io)

임상병리사 국가고시 퀴즈 게임 + 임상검사 단위 환산기. 순수 HTML/CSS/JS, 빌드 불필요.

## 수익화 마무리 체크리스트
1. **GitHub Pages 활성화**: Settings → Pages → Source: `main` 브랜치 / root
2. **구글 서치 콘솔**: 속성 추가 → `sitemap.xml` 제출
3. **네이버 서치어드바이저**: 사이트 등록 → 소유 확인 메타태그를 `index.html` `<head>`에 추가 → 사이트맵 제출
4. **구글 애드센스**: 승인 후 `index.html`의 주석 처리된 스크립트를 해제하고 게시자 ID 입력, 루트에 `ads.txt` 추가,
   각 페이지의 `<div class="ad-slot">` 위치에 광고 단위 삽입
5. **콘텐츠 확장**: `quiz.html`의 `Q` 배열에 문제를 추가하면 바로 반영 (과목 칩 자동 생성)
