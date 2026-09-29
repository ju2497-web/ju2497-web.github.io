"""Rule-based classification: pipelines, procurement type, eligibility, filters.

Every derived attribute carries a basis:
  fact     – stated in the source text / structured field
  estimate – inferred by a rule (type of source, typical practice)
  unknown  – nothing found
"""
from __future__ import annotations

import re

PIPELINES = {
    "A": "GLOBAL HIGH-TICKET LEARNING",
    "B": "AI EXPERT / MODEL TRAINING",
    "C": "MEDICAL / BIOMEDICAL SME",
    "D": "EXPERT NETWORK CONSULTING",
    "E": "E-LEARNING / CURRICULUM DEVELOPMENT",
    "F": "ACADEMIC EDITING / RESEARCH CONSULTING",
    "G": "GOVERNMENT / PUBLIC EVALUATOR & REVIEWER",
    "H": "CORPORATE TRAINING / B2B EDUCATION",
    "I": "MEDICAL AI / BIOTECH ADVISORY",
    "J": "FREELANCE PROFESSIONAL SERVICES",
}
PIPELINES_KO = {
    "A": "글로벌 고단가 러닝", "B": "AI 전문가·모델 학습", "C": "의생명 SME", "D": "전문가 네트워크 자문",
    "E": "이러닝·커리큘럼", "F": "학술 편집·연구 컨설팅", "G": "공공 평가·심사위원", "H": "기업교육 B2B",
    "I": "의료AI·바이오 자문", "J": "프리랜서 전문서비스",
}

INTL_ORGS = re.compile(
    r"\b(who|world health organi[sz]ation|who academy|aslm|african society for laboratory medicine|africa cdc|afenet|acbf|"
    r"african capacity building|afdb|african development bank|unitar|unicef|unesco|fao|ungm|undp|unops|unhcr|unfpa|unaids|iom|"
    r"world bank|hadea|european commission|europeaid|global fund|gavi|usaid|giz|jica|koica|fhi 360|jhpiego|path|msh|apHL)\b",
    re.I,
)
LEARNING = re.compile(r"e-?learning|learning and development|learning providers?|training providers?|learning programme|online (?:course|learning|training)|course development|curricul|instructional|capacity[- ]building|training (?:module|material|programme|program|consult)|learning (?:consult|solution|design|module)|mooc|lms|scorm|digital learning|이러닝|교육과정|콘텐츠 개발|교재", re.I)
AI_WORK = re.compile(r"\bai (?:trainer|tutor|training|evaluat|model|data)|rlhf|model evaluation|annotation|label(?:l)?ing|llm|large language model|red[- ]team|prompt|frontier ai|generative ai|ai research dataset|ai expert", re.I)
EXPERT_NET = re.compile(r"expert network|paid (?:expert )?consultation|expert call|network member|advisor (?:network|call)|survey(?:s)? for experts|specialist interview|expert interview", re.I)
BIOMED = re.compile(r"laborator|diagnos|genom|genetic|cytogenet|hematolog|haematolog|oncolog|cancer|pathology|histolog|biomedical|molecular|biosafety|life science|clinical|medical|health|임상|진단|유전|병리|의료|보건|바이오", re.I)
EDITING = re.compile(r"editing|editor|proofread|manuscript|scientific writ|medical writ|peer review|research consult|statistic|thesis|dissertation|논문|교정|편집|통계|연구 ?설계", re.I)
GOV_EVAL = re.compile(r"evaluator|evaluation panel|review panel|grant review|proposal review|assessor|평가위원|심사위원|전문위원|자문위원|연구용역|용역", re.I)
CORP = re.compile(r"corporate training|기업교육|b2b|workshop facilitat|facilitator|전문강사|강사 모집|특강|multicampus|멀티캠퍼스", re.I)
ADVISORY = re.compile(r"advisory board|scientific advis|medical advis|kol|key opinion|biotech consult|diagnostics company|digital pathology|medical ai|health ai|ai in (?:healthcare|laboratory)|clinical advis|의료 ?ai|자문", re.I)
FREELANCE = re.compile(r"freelanc|kmong|크몽|soomgo|숨고|talentbank|탤런트뱅크|gig|upwork|프리랜서", re.I)

# ── procurement type ──
FIRM_ONLY = re.compile(r"\b(firms?|companies|consulting firms?|service providers?|providers|vendors?|bidders?|legal entit(?:y|ies)|consortium|consortia|joint venture|pre-?qualification of)\b.*?\b(invited|eligible|shall|should|required|may|to)\b|framework (?:agreement|contract)|request for proposals? from (?:firms|companies)|\bfirm\b|consulting services \(firm\)|법인|업체", re.I)
INDIVIDUAL = re.compile(r"individual consultan|individual contractor|\bIC\b|national consultant|international consultant|personal service|consultancy services for [a-z ]*consultant|개인", re.I)
ROSTER = re.compile(r"roster|talent pool|expert pool|database of experts|expression of interest to be|register (?:as|your) (?:an )?expert|professionals database|전문가 ?풀|인력풀", re.I)
CONSORTIUM = re.compile(r"consorti|joint venture|sub-?contract|partner(?:ship)? with (?:firms|organi[sz]ations)", re.I)

# ── critical decision filter ──
NR_RULES: list[tuple[str, re.Pattern, str]] = [
    ("us_only", re.compile(r"(must|need to) (?:be )?(?:located|based|resid\w+|live) in the (?:us|u\.s\.|united states)|u\.?s\.? citizens? only|(?:authori[sz]ed|eligible) to work in the (?:us|u\.s\.|united states)|us-based only|us residents only|security clearance|green card", re.I),
     "미국 거주·취업자격 필수라 한국에서 지원할 수 없습니다."),
    ("eu_only", re.compile(r"(?:eu|european union|eea) (?:citizens?|nationals?|residents?) only|must (?:be )?(?:based|located|resident) in the (?:eu|uk|european union)|right to work in the (?:uk|eu)", re.I),
     "EU/영국 거주·취업자격이 필요합니다."),
    ("national_only", re.compile(r"\bnational consultant|(?:citizens?|nationals?) of [A-Z][a-z]+(?: [A-Z][a-z]+)? only|only (?:citizens?|nationals?) of|must be a (?:national|citizen) of|open to (?!all\b|any\b|international\b)[A-Z][a-z]+ nationals", re.I),
     "해당 국가 국적자만 지원 가능한 '국내(National) 컨설턴트' 공고입니다."),
    ("physician_license", re.compile(r"(?:md|m\.d\.|medical doctor|physician|doctor of medicine)(?: degree| license| licensure)? (?:is )?(?:required|mandatory)|licensed physician|board[- ]certified|active (?:medical|physician) licen[sc]e|must hold a (?:valid )?medical licen[sc]e|의사 ?면허 ?(?:필수|소지자)", re.I),
     "의사면허 필수 요건이 있습니다."),
    ("relocation", re.compile(r"relocation (?:is )?required|must relocate|willing(?:ness)? to relocate|on-?site only|onsite only|fully on-?site|must work from (?:our|the) office|상주 ?근무 ?필수", re.I),
     "현지 이주 또는 상주 근무가 필수입니다."),
    ("full_time_employment", re.compile(r"full[- ]time (?:permanent|employee|staff|position|role|employment)|permanent (?:position|contract|role)|fixed[- ]term appointment|staff position|\bP-?[2-5]\b|\bD-?[12]\b grade|정규직|상근직", re.I),
     "상근·정규직 고용 형태라 교수직과 병행이 어렵습니다."),
    ("unpaid", re.compile(r"\b(unpaid|volunteer(?:ing)? (?:role|position|opportunity)|no compensation|pro bono|internship)\b|무보수|자원봉사", re.I),
     "무보수·자원봉사·인턴 형태입니다."),
    ("commission_only", re.compile(r"commission[- ]only|commission based|성과급만", re.I),
     "커미션만 지급되는 영업직입니다."),
    ("travel", re.compile(r"(?:extensive|frequent) travel|travel (?:up to )?(?:[5-9]\d|100) ?%|constant travel", re.I),
     "잦은 출장이 필수입니다."),
]
SKILL_MISMATCH = re.compile(r"programming skills|python|tensorflow|pytorch|keras|software development|full[- ]stack|articulate storyline developer|graphic design(?:er)?|video editing|animator", re.I)
COST_TO_APPLY = re.compile(r"비용 발생|견적 발송 비용|application fee|registration fee|membership fee|paid membership", re.I)
PROGRAMMING = re.compile(r"\b(software|frontend|front-end|backend|back-end|full[- ]stack|devops|sre|site reliability|data engineer|ml engineer|machine learning engineer|mobile developer|ios|android|web developer|programmer|qa engineer|account executive|sales|recruiter|marketing manager)\b", re.I)

REMOTE = re.compile(r"\bremote\b|home[- ]based|off[- ]?site|work from home|virtual(?:ly)?|anywhere|원격|재택|비대면|온라인 근무", re.I)
HYBRID = re.compile(r"\bhybrid\b|하이브리드", re.I)
ONSITE = re.compile(r"on-?site|in[- ]person|office-based|duty station:? (?!home)|상주|출근", re.I)

KOREA_YES = re.compile(r"south korea|republic of korea|\bkorea\b|seoul|한국|국내|worldwide|global(?:ly)? remote|any country|all nationalities|open to (?:all|international)|international consultant|anywhere in the world|all countries", re.I)
INTERVIEW_LIVE = re.compile(r"(?<!ai )(?<!ai-)interview|video call|zoom|teams call|panel discussion|면접|인터뷰", re.I)
NO_INTERVIEW = re.compile(r"no (?:live |video )?interviews?|without (?:an? )?interview|interview[- ]free|면접 없음", re.I)
AI_INTERVIEW = re.compile(r"ai interview|ai-led interview|ai interviewer|asynchronous interview|recorded video", re.I)
ASSESSMENT = re.compile(r"assessment|skills? test|qualification (?:test|exam)|written test|screening test|coding test|평가 ?시험|필기", re.I)
TRAVEL_ANY = re.compile(r"travel (?:to|is|will|may|required)|mission to|field visit|출장", re.I)
LICENSE = re.compile(r"licen[sc]e|licensure|certified|면허|자격증", re.I)
LANG = re.compile(r"(english|french|portuguese|spanish|arabic|korean|한국어|영어|불어)", re.I)
DEGREE = re.compile(r"(ph\.?d|doctorate|master'?s|advanced (?:university )?degree|bachelor'?s|md\b|박사|석사|학사)", re.I)
EXPERIENCE = re.compile(r"(?:minimum|at least|min\.)?\s*(\d{1,2})\+?\s*years?(?: of)?(?: relevant| professional)? experience|(\d{1,2})년 ?이상", re.I)
DURATION = re.compile(r"(\d{1,3})\s*(working days|days|weeks|months|month|years|일|개월|주)", re.I)
RETAINER = re.compile(r"retainer|framework|long[- ]term agreement|\bLTA\b|roster|ongoing|recurring|multi-?year|multi-?month|continuous|상시", re.I)

LIKELY_PRIMES = {
    "health": ["Jhpiego", "FHI 360", "PATH", "Management Sciences for Health (MSH)", "JSI", "IntraHealth International", "APHL (Association of Public Health Laboratories)"],
    "development": ["Chemonics", "DAI Global", "Abt Global", "Palladium", "Tetra Tech", "RTI International"],
    "eu": ["GOPA", "Particip", "AESA", "B&S Europe"],
    "bank": ["Deloitte", "PwC", "KPMG", "EY"],
    "elearning": ["Kineo", "LEO Learning"],
}


def _hits(pattern: re.Pattern, text: str) -> list[str]:
    return sorted({m.group(0).lower() for m in pattern.finditer(text)})


def classify(opp: dict, profile: dict) -> dict:
    title = opp.get("title", "")
    org = opp.get("organization", "")
    body = opp.get("description", "")
    blob = f"{title}\n{org}\n{body}\n{opp.get('location_text', '')}"
    low = blob.lower()
    category = opp.get("category")  # seed hint: expert_network, ai_expert, freelance, corporate_training

    # ── expertise fit ──
    exp = profile.get("expertise", {})
    core_hits = [_word(low, k) for k in exp.get("core", []) if k in low]
    adj_hits = [k.strip() for k in exp.get("adjacent", []) if k in low]
    role_hits = [k for k in exp.get("sme_roles", []) if re.search(r"\b" + re.escape(k) + r"\b", low)]
    title_core = [k.strip() for k in exp.get("core", []) if k in title.lower()]

    # ── pipelines ──
    pipes: list[str] = []
    intl = bool(INTL_ORGS.search(f"{org} {opp.get('source', '')}"))
    if intl and (LEARNING.search(blob) or ROSTER.search(blob) or "subject matter" in low):
        pipes.append("A")
    if category == "ai_expert" or AI_WORK.search(blob):
        pipes.append("B")
    if BIOMED.search(title) and (role_hits or "subject matter" in low) or (core_hits and ("subject matter" in low or "sme" in low)):
        pipes.append("C")
    if category == "expert_network" or EXPERT_NET.search(blob):
        pipes.append("D")
    if LEARNING.search(blob):
        pipes.append("E")
    if EDITING.search(title) or (EDITING.search(body) and "editing" in low):
        pipes.append("F")
    if GOV_EVAL.search(title) or opp.get("source_type") == "g2b":
        pipes.append("G")
    if category == "corporate_training" or CORP.search(blob):
        pipes.append("H")
    if ADVISORY.search(title) or (ADVISORY.search(body) and core_hits):
        pipes.append("I")
    if category == "freelance" or FREELANCE.search(f"{org} {title}"):
        pipes.append("J")
    pipes = list(dict.fromkeys(pipes)) or (["C"] if core_hits else ["J"])

    # ── procurement type ──
    ptype = opp.get("procurement_type")
    ptype_basis = "fact" if ptype else "estimate"
    if not ptype:
        if category in ("expert_network", "ai_expert", "freelance", "corporate_training"):
            ptype = "platform"
        elif ROSTER.search(blob):
            ptype = "roster"
        elif INDIVIDUAL.search(blob):
            ptype = "individual"
        elif opp.get("source_type") in ("worldbank", "g2b") or FIRM_ONLY.search(blob):
            ptype = "firm_only"
        elif opp.get("source_type") in ("greenhouse", "lever", "ashby"):
            ptype = "job"
        elif re.search(r"consultan", low):
            ptype = "individual"
        else:
            ptype = "unknown"
    if ptype == "firm_only" and CONSORTIUM.search(blob):
        ptype = "consortium"
    subcontract = None
    if ptype in ("firm_only", "consortium"):
        subcontract = {
            "label": "POTENTIAL SME SUBCONTRACTING LEAD",
            "likely_primes": _likely_primes(blob),
            "basis": "estimate",
            "note": "원청 후보는 발주 분야 기준 추정입니다. 과거 낙찰 공고(Contract Award)로 확인하세요.",
        }

    # ── remote ──
    remote, remote_basis = opp.get("remote"), opp.get("remote_basis", "fact") if opp.get("remote") else "unknown"
    if not remote:
        if REMOTE.search(blob):
            remote, remote_basis = "remote", "fact"
        elif HYBRID.search(blob):
            remote, remote_basis = "hybrid", "fact"
        elif ONSITE.search(blob):
            remote, remote_basis = "onsite", "fact"
        elif ptype in ("platform", "roster") or category:
            remote, remote_basis = "remote", "estimate"
        else:
            remote = "unknown"

    # ── not-recommended filter ──
    flags, reasons = [], []
    for code, pat, reason in NR_RULES:
        if pat.search(blob):
            if code == "full_time_employment" and ptype in ("individual", "roster", "platform") and remote == "remote":
                continue  # 원격 컨설턴시의 'full-time' 표기는 감점만
            flags.append(code)
            reasons.append(reason)
    if PROGRAMMING.search(title) and not core_hits:
        flags.append("unrelated")
        reasons.append("전공과 무관한 개발·영업 직무입니다.")

    # ── Korea eligibility ──
    korea, korea_basis, korea_evidence = opp.get("korea_eligible"), "fact" if opp.get("korea_eligible") else "unknown", ""
    if not korea:
        if {"us_only", "eu_only", "national_only"} & set(flags):
            korea, korea_basis, korea_evidence = "no", "fact", reasons[0]
        elif (m := KOREA_YES.search(blob)):
            korea, korea_basis, korea_evidence = "yes", "fact", m.group(0)
        elif opp.get("source_type") == "g2b":
            korea, korea_basis = "yes", "fact"
        elif ptype == "platform" or intl:
            korea, korea_basis = "unknown", "unknown"
        else:
            korea = "unknown"

    # ── interview / assessment / travel ──
    if AI_INTERVIEW.search(blob):
        interview, interview_basis = "ai_or_async", "fact"
    elif NO_INTERVIEW.search(blob):
        interview, interview_basis = "none", "fact"
    elif INTERVIEW_LIVE.search(blob):
        interview, interview_basis = "live", "fact"
    elif category == "expert_network":
        interview, interview_basis = "screening_call", "estimate"
    elif ptype in ("individual", "roster", "firm_only", "consortium"):
        interview, interview_basis = "possible", "estimate"
    else:
        interview, interview_basis = "unknown", "unknown"
    assessment = "yes" if ASSESSMENT.search(blob) else "unknown"
    travel = "yes" if TRAVEL_ANY.search(blob) else ("no" if remote == "remote" else "unknown")

    requirements = {
        "degree": sorted({m.group(0) for m in DEGREE.finditer(blob)})[:3],
        "experience_years": _first_int(EXPERIENCE, blob),
        "license": bool(LICENSE.search(blob)),
        "languages": sorted({m.group(1).capitalize() for m in LANG.finditer(blob)})[:4],
    }
    dm = DURATION.search(body)
    duration = dm.group(0) if dm else opp.get("duration")

    return {
        "pipelines": pipes,
        "primary_pipeline": pipes[0],
        "procurement_type": ptype,
        "procurement_type_basis": ptype_basis,
        "subcontract": subcontract,
        "remote": remote,
        "remote_basis": remote_basis,
        "korea_eligible": korea,
        "korea_basis": korea_basis,
        "korea_evidence": korea_evidence,
        "interview": interview,
        "interview_basis": interview_basis,
        "assessment": assessment,
        "travel": travel,
        "requirements": requirements,
        "duration": duration,
        "skill_mismatch": sorted({m.group(0).lower() for m in SKILL_MISMATCH.finditer(blob)})[:4],
        "cost_to_apply": bool(COST_TO_APPLY.search(blob)),
        "recurring": bool(RETAINER.search(blob)) or ptype in ("platform", "roster"),
        "flags": flags,
        "not_recommended_reason": reasons[0] if reasons else "",
        "fit_terms": {"core": core_hits[:12], "adjacent": adj_hits[:12], "roles": role_hits[:8], "title_core": title_core},
        "roles_for_me": _roles_for_me(blob, ptype),
    }


def _word(low: str, stem: str) -> str:
    """Expand a keyword stem to the word used in the text ('molecular diagnos' → 'molecular diagnostics')."""
    m = re.search(re.escape(stem.strip()) + r"[\w-]*", low)
    return m.group(0) if m else stem.strip()


def _first_int(pattern: re.Pattern, text: str) -> int | None:
    m = pattern.search(text)
    if not m:
        return None
    for g in m.groups():
        if g:
            return int(g)
    return None


def _likely_primes(blob: str) -> list[str]:
    out: list[str] = []
    if BIOMED.search(blob):
        out += LIKELY_PRIMES["health"][:5]
    if re.search(r"afdb|african development bank|world bank|bank", blob, re.I):
        out += LIKELY_PRIMES["bank"]
    if re.search(r"\beu\b|european|hadea|europeaid", blob, re.I):
        out += LIKELY_PRIMES["eu"]
    if LEARNING.search(blob):
        out += LIKELY_PRIMES["elearning"]
    out += LIKELY_PRIMES["development"][:3]
    return list(dict.fromkeys(out))[:8]


def _roles_for_me(blob: str, ptype: str) -> list[str]:
    roles = []
    if LEARNING.search(blob):
        roles += ["Subject Matter Expert", "Course Author", "Curriculum Architect", "Assessment Designer"]
    if BIOMED.search(blob):
        roles += ["Biomedical SME", "Medical Content Reviewer"]
    if EDITING.search(blob) or GOV_EVAL.search(blob):
        roles += ["Scientific Reviewer"]
    if AI_WORK.search(blob):
        roles += ["Domain Expert (AI evaluation)"]
    if ptype in ("firm_only", "consortium"):
        roles += ["SME subcontractor", "Consultant team member"]
    return list(dict.fromkeys(roles))[:6] or ["Subject Matter Expert"]
