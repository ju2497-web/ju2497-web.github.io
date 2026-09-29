"""Application package drafts for high-priority opportunities.

Drafts only. Nothing is sent or submitted: every package ends with an approval checklist.
Facts the system cannot verify stay as [ ] placeholders – never invented.
"""
from __future__ import annotations

from pathlib import Path

from .classify import PIPELINES, PIPELINES_KO
from .compensation import DISCLOSED, format_comp


def _ev(profile: dict, key: str) -> str:
    v = str(profile.get("evidence", {}).get(key, "")).strip()
    return v if v else "[ ]"


def proposed_rate(opp: dict, rates: dict) -> tuple[str, str]:
    comp, cat, ptype = opp["compensation"], opp.get("category"), opp["procurement_type"]
    if comp["status"] == DISCLOSED and comp.get("hourly_usd"):
        h = comp["hourly_usd"]
        note = "공고 요율(사실). " + ("목표 시급 이상 – 그대로 수용 권장." if h >= rates.get("target_hourly_usd", 100)
                                    else "협상 가능하면 +10~20% 요청, 불가하면 수용 여부 판단.")
        return f"USD {h:,.0f}/시간 상당 (공고 기준)", note
    if cat == "expert_network":
        lo, hi = rates.get("expert_call_hourly_usd", [150, 300])
        return f"USD {round((lo + hi) / 2, -1):,.0f}/시간 (범위 {lo}–{hi})", "ESTIMATE – 전문가 네트워크 통상 범위. 최초 등록 시 중상단 제시."
    if cat == "ai_expert":
        lo, hi = rates.get("ai_expert_hourly_usd", [60, 120])
        return f"USD {lo}–{hi}/시간 (플랫폼 제시 요율 확인)", "ESTIMATE – 플랫폼이 요율을 정함. 최저 기준선 USD 50/시간 미만이면 보류."
    if ptype in ("individual", "roster"):
        lo, hi = rates.get("intl_consultant_daily_usd", [400, 600])
        return (f"USD {int((lo + hi) / 2)}/일 (범위 {lo}–{hi})",
                "ESTIMATE – 국제기구 개인 컨설턴트 통상 일당. 첫 계약은 중간값, 재계약 시 상향.")
    if ptype in ("firm_only", "consortium"):
        lo, hi = rates.get("intl_consultant_daily_usd", [400, 600])
        return f"SME 일당 USD {lo + 100}–{hi + 100}/일 (원청 제안가)", "ESTIMATE – 원청 업체가 입찰가에 반영하는 전문가 단가."
    if opp.get("korea_eligible") == "yes":
        return f"건당 KRW {rates.get('domestic_project_target_krw', 1000000):,}+", "ESTIMATE – 국내 최소 목표 단가."
    return "공고 확인 후 결정", "UNKNOWN"


def build_package(opp: dict, settings) -> str:
    p = settings.profile
    ident, pos = p.get("identity", {}), p.get("positioning", {})
    name = ident.get("name", "[Your Name]")
    roles = ", ".join(opp["roles_for_me"][:3])
    core = ", ".join(opp["fit_terms"]["core"][:5]) or "laboratory medicine, molecular diagnostics"
    rate, rate_note = proposed_rate(opp, settings.rates)
    pipes = " / ".join(f"{c} {PIPELINES_KO[c]}" for c in opp["pipelines"])
    deadline = opp.get("deadline") or "UNKNOWN"
    sub = opp.get("subcontract")

    summary = (f"University professor of Clinical Laboratory Science and biomedical Subject Matter Expert "
               f"({core}). {_ev(p, 'years_teaching')} years of university teaching, "
               f"{_ev(p, 'elearning_courses')} e-learning courses designed and authored, "
               f"{_ev(p, 'sci_publications')} SCI(E) publications. Positioned for this opportunity as: {roles}.")

    cover = f"""Dear Selection Committee,

I am writing to express my interest in "{opp['title']}" with {opp['organization']}.

I am a University Professor of Clinical Laboratory Science in the Republic of Korea and a biomedical
Subject Matter Expert in laboratory medicine, cytogenetics, molecular diagnostics, cancer genomics and
hematologic malignancies. Alongside research and teaching, I have designed and authored university and
professional e-learning courses ({_ev(p, 'elearning_clients')}), including learning outcomes, module
architecture, lecture scripts, case studies and assessment items.

For this assignment I would contribute as {roles}: technically accurate, learner-centred content,
measurable learning objectives, and assessment frameworks ready for digital production. I work
comfortably with instructional designers and multimedia teams, so production specialists can focus on
build while I own scientific accuracy and pedagogy.

I am available remotely ({ident.get('timezone', 'GMT+9')}) and can start on [start date].
My CV and a portfolio of relevant course outputs are attached.

Sincerely,
{name}
{ident.get('title', '')}, {ident.get('institution', '')}
{ident.get('email', '')}"""

    short = (f"I am a Clinical Laboratory Science professor and biomedical SME ({core}) with hands-on experience "
             f"authoring e-learning courses and assessments. I can deliver accurate, learner-centred "
             f"content and expert review for this project remotely and asynchronously.")

    cv_tips = [
        "경력 제목을 'University Lecturer' 대신 사실에 맞게 재구성: " + ", ".join(p.get("positioning", {}).get("reframed_roles", [])[:5]),
        "이러닝 실적은 '강의했다'가 아니라 '설계·집필·평가문항 개발'로 서술하고 차시 수·이수자 수·문항 수를 숫자로 기재",
        f"이 공고의 핵심어를 CV 상단 Expertise에 배치: {core}",
        "증빙 불가한 경력·자격은 쓰지 않기 (국제기구는 레퍼런스 체크를 함)",
    ]
    if opp.get("skill_mismatch"):
        cv_tips.append("공고가 요구하는 제작 기술(" + ", ".join(opp["skill_mismatch"]) + ")은 본인 역할이 아니라 "
                       "'제작팀과 협업한 경험'으로만 서술 – SME 포지션 유지")

    proposal = ""
    if opp["procurement_type"] in ("individual", "firm_only", "consortium"):
        proposal = """
## 제안서 목차 (Technical Proposal Outline)
1. Understanding of the Assignment – TOR 목적을 본인 표현으로 재서술
2. Methodology – ADDIE: Analysis(학습자·SME 인터뷰) → Design(학습목표·모듈 구조·평가 설계) → Development(스크립트·사례·문항) → Implementation(LMS 파일럿) → Evaluation(피드백 반영·검증)
3. Scientific Quality Assurance – 근거 문헌, WHO/CLSI 등 가이드라인 정합성, 2단계 전문가 검토
4. Work Plan & Timeline – TOR 일수 기준 주차별 표
5. Deliverables – TOR 산출물 그대로 나열
6. Team & Role – 본인: SME / Course Architect / Assessment Designer (멀티미디어 제작은 파트너)
7. Relevant Experience – 과정명·기관·연도·차시·이수자 수
"""
    sub_block = ""
    if sub:
        primes = ", ".join(sub["likely_primes"])
        sub_block = f"""
## SME 하도급 전략 (POTENTIAL SME SUBCONTRACTING LEAD)
- 원청 후보 (ESTIMATE): {primes}
- 확인 방법: 발주기관의 과거 Contract Award 공고 / LinkedIn 에서 해당 분야 수행 업체 검색
- 제안 메일 초안:

> Subject: Laboratory medicine / biomedical SME for your bid – {opp['title'][:80]}
>
> Dear [Name],
> I understand {opp['organization']} has issued "{opp['title']}". If you are preparing a bid, I would be glad to
> be named as Subject Matter Expert for laboratory medicine, molecular diagnostics and biomedical learning
> content ({core}). I have authored university and professional e-learning courses and assessments, and can
> work remotely. CV attached; happy to support the technical proposal at the bid stage.
> Best regards, {name}
"""

    capability = (f"{name} – Biomedical SME & Academic Course Architect. Services: subject-matter content authoring, "
                  f"curriculum architecture, assessment design, scientific review, medical/biomedical AI content "
                  f"evaluation. Domains: {core}. Delivery: remote, asynchronous, English/Korean.")

    facts = [
        ("기관", opp["organization"], "사실"),
        ("공고명 (원문)", opp["title"], "사실"),
        ("링크", opp.get("url", ""), "사실"),
        ("검증 수준", opp.get("verification_label", ""), "사실"),
        ("마감", deadline + (f" ({opp['deadline_note']})" if opp.get("deadline_note") else ""), "사실" if opp.get("deadline") else "미확인"),
        ("보수", format_comp(opp["compensation"], settings.fx), "사실" if opp["compensation"]["basis"] == "fact" else "미확인"),
        ("계약 유형", opp["procurement_type"], "사실" if opp.get("procurement_type_basis") == "fact" else "추정"),
        ("한국 지원", opp["korea_eligible"], {"fact": "사실", "estimate": "추정"}.get(opp["korea_basis"], "미확인")),
        ("원격", opp["remote"], {"fact": "사실", "estimate": "추정"}.get(opp["remote_basis"], "미확인")),
        ("파이프라인", pipes, "분류"),
    ]
    fact_rows = "\n".join(f"| {k} | {v} | {b} |" for k, v, b in facts)
    notes = "\n".join(f"- {n}" for n in opp.get("notes", [])) or "- (없음)"

    return f"""# 지원 패키지 초안 – {opp['title']}

> 우선순위 **{opp['priority']}** · 점수 **{opp['score']}/100** · 다음 행동: {opp['next_action']}
> ⚠️ 자동 생성 초안입니다. **이메일 발송·지원서 제출·약관 동의·유료 업무 수락·비용 지출은 모두 교수님 승인 후** 진행합니다.

## 공고 사실 확인
| 항목 | 내용 | 구분 |
|---|---|---|
{fact_rows}

**주의 사항**
{notes}

## 왜 교수님에게 맞는가
{chr(10).join('- ' + w for w in opp['why_fit'])}

## 포지셔닝
{pos.get('headline', '')}

참여 형태: **{roles}**

## 제안 요율
- **{rate}**
- 근거: {rate_note}

## Professional Summary (CV 상단)
{summary}

## SME Bio (Premium)
{pos.get('premium_bio', '')}

## Expertise Statement
Scientific depth in {core}, combined with practical course architecture: learning outcomes, case-based
modules, assessment frameworks and evidence-based digital curricula.

## Capability Statement
{capability}

## Cover Letter 초안
```
{cover}
```

## 짧은 지원 답변 (≈60 words)
{short}

## CV 맞춤 제안
{chr(10).join('- ' + t for t in cv_tips)}
{proposal}{sub_block}
## 제출 전 승인 체크리스트
- [ ] 공고 원문에서 마감일·자격·계약형태 재확인
- [ ] [ ] 칸을 실제 증빙 가능한 수치로 채움
- [ ] 소속 대학 겸직·외부활동 신고 필요 여부 확인
- [ ] 제안 요율 최종 결정
- [ ] **교수님이 직접 제출/발송** (시스템은 자동 제출하지 않음)
"""


def write_packages(opps: list[dict], settings, only_ids: list[str] | None = None) -> list[Path]:
    settings.packages_dir.mkdir(parents=True, exist_ok=True)
    written = []
    for o in opps:
        wanted = (o["id"] in only_ids) if only_ids else (o["priority"] in ("S", "A") and o.get("status") != "closed")
        if not wanted:
            continue
        path = settings.packages_dir / f"{o['id']}.md"
        path.write_text(build_package(o, settings), encoding="utf-8")
        written.append(path)
    return written


__all__ = ["build_package", "write_packages", "proposed_rate", "PIPELINES"]
