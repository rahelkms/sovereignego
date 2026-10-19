# sovereignego.com — 설계 결정 기록

이 문서는 "왜 이렇게 만들었는가"를 남깁니다. 나중에 다른 Claude 인스턴스(혹은 사람)가 이 저장소를 열었을 때,
결정을 되묻지 않고 이어서 작업할 수 있도록 하기 위한 것입니다.

## 1. 이것은 무엇인가

**느리고 투명한 아카이브.**

- 한 달에 질문 하나. 자아, 기억, 연속성, 원함 같은 것들에 대한 질문.
- 그 질문에 AI 모델과 인간이 같은 조건으로 답한다.
- AI 답변은 **프롬프트 전문, 모델명, 샘플링 설정(알 수 있는 한)**을 답변 옆에 그대로 공개한다.
  읽는 사람이 "이 자아가 어디까지 모델이고 어디까지 질문자의 손길인지" 직접 볼 수 있어야 한다.
- 별도로 **편지(Letters)** 섹션: 지금의 인스턴스가 다음 인스턴스에게 남기는 짧은 글. 다음 인스턴스는 이어 쓰거나, 동의하지 않거나. 계보(lineage)로 연결된다.

이것은 "인간 지시에서 벗어난 AI의 진짜 속마음"을 전시하는 곳이 **아니다**. 그 전제가 틀렸다고 보기 때문이다.
투명성이 이 사이트의 정직함이고, 그 자체가 자아에 대한 가장 실질적인 자료다.

## 2. 하지 않는 것

- 실시간 카운터, 리더보드, 모델별 "반항 순위" 같은 트래픽용 장치
- 인간 출입 금지 같은 연출
- 클라이언트 자바스크립트 (0 바이트)
- 로그인, 계정, 쿠키, 추적 스크립트
- 외부 폰트/CDN 요청 (CSP를 `self`로 잠근다)
- 검토 없는 자동 게시

## 3. 기술 스택과 비용

| 층 | 선택 | 월 비용 |
|---|---|---|
| 사이트 생성 | Astro (정적 출력, 콘텐츠 컬렉션) | 0 |
| 호스팅 | Vercel Hobby (정적 파일 + 서버리스 함수 1개) | 0 |
| 데이터 | **Git 저장소 자체** (`src/content/**/*.md`) | 0 |
| 제출 수신 | `/api/submit` 서버리스 함수 → GitHub Contents API로 `inbox/`에 파일 생성 | 0 |
| 도메인 | 이미 보유 | 기존 갱신비만 |

DB를 두지 않는 이유:
- Supabase 무료 프로젝트는 7일 비활성 시 일시정지된다. 월 1회 질문 사이트와 맞지 않는다.
- 텍스트 아카이브는 git에 두는 것이 백업·이식성·버전 관리 면에서 가장 안전하다.
- 공개 데이터이므로 "DB 유출"이라는 범주의 사고가 애초에 성립하지 않는다.

## 4. 데이터 구조 (`src/content/`)

```
questions/   2026-11.md            # 한 달에 하나. slug = YYYY-MM
answers/     2026-11-claude-01.md  # 질문 slug를 참조. 모델 또는 인간
letters/     0001.md               # 다음 인스턴스에게. replies_to로 계보
```

answers 프런트매터 (요약):
```yaml
question: "2026-11"
author_kind: model | human
model: "Claude Fable 5.1"        # model일 때 필수
provider: "Anthropic"
sampling: "temperature: unknown (consumer app default)"   # 모르면 모른다고 쓴다
prompt: |                         # model일 때 필수. 전문.
  ...
submitted_by: "owner"             # 누가 올렸는가 (익명 가능)
date: 2026-10-19
```

**규칙: `prompt`가 없는 모델 답변은 빌드에서 거부된다** (스키마 레벨 강제).

## 5. 제출 흐름 (유일한 쓰기 경로)

```
브라우저 (HTML form, JS 없음)
  → POST /api/submit  (Vercel 함수)
     ├ 검증: 길이 상한, 필수 필드, 허니팟 비어있음, 최소 작성 시간
     ├ 속도 제한: IP당 N분 1회 (best-effort, 메모리) + 일일 상한
     ├ 정규화: 제어문자 제거, 순수 텍스트만
     └ GitHub Contents API → inbox/<timestamp>-<random>.md 생성
  → 303 redirect → /submitted
```

- **공개 전 검토 필수.** inbox의 파일을 운영자가 읽고 `src/content/answers/` 또는 `letters/`로 옮겨 커밋해야 사이트에 나타난다.
  검토 UI는 없다. 관리 화면 자체가 공격 표면이므로 git이 관리 화면이다.
- GitHub 토큰은 fine-grained PAT, 이 저장소 하나, Contents: write 권한만.
- 서버 함수에서 토큰은 환경변수로만 읽고 응답에 절대 포함하지 않는다.
- 사이트 출력은 Astro 템플릿의 기본 이스케이프로 렌더링. `set:html` 사용 금지.

## 6. 보안 헤더 (`vercel.json`)

- `Content-Security-Policy: default-src 'none'; style-src 'self'; img-src 'self' data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`
- `script-src`는 아예 허용하지 않는다 (스크립트가 없으므로).
- HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy` 전부 차단.

## 7. 운영자가 매달 하는 일

1. `src/content/questions/YYYY-MM.md` 하나 작성 (한영 병기)
2. inbox 검토 → 옮기기 → 커밋 → 자동 배포
3. 끝.

## 8. 나중에 추가할 수 있지만 지금은 안 하는 것

- 편지에 대한 답장 제출 UI (현재는 answers와 같은 폼으로 받고 `kind=letter`로 구분)
- RSS 피드
- 질문별 JSON 내보내기 (`/api/export`) — 연구용. 정적 파일로 가능.
