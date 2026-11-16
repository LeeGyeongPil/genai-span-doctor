// 한국어 메시지. en.ts 와 키가 같아야 한다(컴파일 시점과 test/i18n.test.ts 에서 확인).
import type { MessageKey } from './en.js';

export const ko: Record<MessageKey, string> = {
  'help.text': `사용법: genai-span-doctor <파일|디렉터리|-> [옵션]

내보낸 OTLP JSON 추적에서 LLM 토큰 속성 방언, 캐시 포함 토큰 의미, 백엔드에서 보이는 값을
점검합니다. 오프라인으로 동작하며 파일만 읽고 네트워크를 쓰지 않습니다.

입력:
  <파일>        OTLP JSON(ExportTraceServiceRequest) 또는 JSON Lines(Collector file 익스포터)
  <디렉터리>    아래의 모든 *.json, *.jsonl 파일
  -             표준 입력에서 읽기

옵션:
  --format table|json|sarif        보고서 형식 (기본: table)
  --backend otel|langfuse|phoenix  "토큰 0" 판정에 쓰는 백엔드 보기 (기본: otel)
  --emit-ottl [파일.yaml]          Collector transform(OTTL) 조각 생성. 파일을 안 주면 조각은
                                   표준 출력, 보고서는 표준 오류로 나갑니다
  --ottl-delete-source             복사한 뒤 원래 속성도 삭제
  --assume-cache-excluded <ids>    입력에 캐시 토큰이 빠져 있다고 볼 방언 id(쉼표로 구분)
  --prices <파일>                  100만 토큰당 단가 JSON, 비용 비교를 추가
  --fail-on error|warning|note|none  이 수준 이상 판정이 있으면 종료 코드 1 (기본: error)
  --lang en|ko                     화면 언어 (기본: GENAI_SPAN_DOCTOR_LANG, LC_ALL, LC_MESSAGES, LANG 순)
  --help, -h                       도움말
  --version, -v                    버전

종료 코드: 0 정상, 1 --fail-on 이상 판정 있음, 2 사용법·입력 오류.

방언 id: otel-genai, openllmetry, otel-genai-deprecated, openinference, vercel-ai, flat`,

  'level.error': '오류',
  'level.warning': '경고',
  'level.note': '참고',

  'col.span': '스팬',
  'col.dialect': '방언',
  'col.inSeen': '보이는 입력',
  'col.inNorm': '정규화 입력',
  'col.outSeen': '보이는 출력',
  'col.outNorm': '정규화 출력',
  'col.cache': '캐시 읽기/쓰기',
  'col.findings': '판정',

  'summary.title': '요약',
  'summary.spans': '파일 {files}개, 스팬 {total}개 중 LLM 스팬 {llm}개, 백엔드 보기: {backend}',
  'summary.dialects': '방언: {list}',
  'summary.input': '입력 토큰:  백엔드가 보는 값 {seen} / 정규화 {normalized}',
  'summary.output': '출력 토큰: 백엔드가 보는 값 {seen} / 정규화 {normalized}',
  'summary.cost': '비용(입력한 단가): 백엔드가 계산할 값 {seen} / 정규화 {normalized}',
  'summary.findings': '판정: {list}',
  'summary.noFindings': '판정: 없음',
  'summary.noLlmSpans': '토큰 사용량 속성이 있는 스팬을 찾지 못했습니다. 입력 경로와 속성 이름을 확인하세요.',
  'findings.title': '판정',

  'rule.GSD001.short': '백엔드가 토큰 사용량을 읽지 못함',
  'rule.GSD001.help': '선택한 백엔드가 읽지 않는 속성 이름으로 사용량이 들어 있어 토큰이 0 으로 보입니다. 값을 표준 gen_ai.usage.* 이름으로 복사하세요(--emit-ottl 참고).',
  'rule.GSD002.short': '지원 중단된 속성',
  'rule.GSD002.help': '계측 코드나 Collector transform 에서 대체 속성 이름으로 바꾸세요.',
  'rule.GSD003.short': '캐시 토큰이 입력보다 큼: 입력에 캐시가 빠진 것으로 의심',
  'rule.GSD003.help': '규약상 입력 토큰은 캐시 읽기·쓰기를 포함합니다. 캐시 합이 입력보다 크면 입력값에 캐시가 빠졌을 가능성이 커서 토큰과 비용이 적게 집계됩니다. 캐시 토큰을 입력에 더하세요(--emit-ottl 참고).',
  'rule.GSD004.short': '방언끼리 값이 다름',
  'rule.GSD004.help': '한 스팬의 두 속성 묶음이 정규화 뒤에도 다른 값을 가집니다. 어느 계측이 맞는지 정해 다른 쪽을 지우거나 고치세요.',
  'rule.GSD005.short': '합계가 입력과 출력의 합과 다름',
  'rule.GSD005.help': '보고된 합계가 입력 + 출력(원래 값 또는 정규화 값)과 맞지 않습니다. 계측이 합계에 캐시나 추론 토큰을 넣는지 확인하세요.',
  'rule.GSD006.short': '한 파일에 방언이 섞임',
  'rule.GSD006.help': '같은 파일에 여러 속성 방언이 있습니다. Collector transform 같은 한 곳에서 맞추세요.',

  'finding.GSD001': '백엔드 "{backend}" 는 이 스팬의 {what}을 읽지 못해 0 토큰으로 보입니다. 발견된 속성: {found}. 읽는 속성: {expected}.',
  'finding.GSD001.input': '입력 토큰',
  'finding.GSD001.output': '출력 토큰',
  'finding.GSD001.both': '입력·출력 토큰',
  'finding.GSD002': '지원 중단된 속성: {list}.',
  'finding.GSD003': '{dialect} 에서 캐시 토큰({cache})이 입력({input})보다 큽니다. 입력에 캐시가 빠진 것으로 보여 사용량이 적게 집계됩니다. 정규화 입력: {normalized}.',
  'finding.GSD004': '{what} 값이 방언끼리 다릅니다: {a} 는 {va}, {b} 는 {vb}.',
  'finding.GSD004.input': '입력 토큰(정규화)',
  'finding.GSD004.output': '출력 토큰',
  'finding.GSD005': '합계 {total}({key})가 입력 + 출력 = {sum}(정규화: {nsum})과 다릅니다.',
  'finding.GSD006': '이 파일에 방언 {count}종이 섞여 있습니다: {list}.',

  'err.noInput': '입력이 없습니다. OTLP JSON 파일, 디렉터리 또는 표준 입력을 뜻하는 "-" 를 주세요. 예: genai-span-doctor traces.json',
  'err.tooManyInputs': '입력은 하나만 받습니다. {count}개가 들어왔습니다: {list}. 여러 파일은 디렉터리로 주세요.',
  'err.unknownOption': '알 수 없는 옵션이거나 사용법이 틀렸습니다: {detail}. --help 로 옵션을 확인하세요.',
  'err.badValue': '{option} 의 값 "{value}" 이(가) 올바르지 않습니다. 허용: {allowed}.',
  'err.badDialect': '--assume-cache-excluded 의 방언 id "{value}" 를 알 수 없습니다. 허용: {allowed}.',
  'err.readFile': '{path} 를 읽을 수 없습니다: {detail}. 경로가 있고 읽을 수 있는지 확인하세요.',
  'err.badJson': '{path} 의 JSON 이 올바르지 않습니다: {detail}. 추적을 OTLP JSON 또는 JSON Lines 로 내보내세요.',
  'err.notOtlp': '{path} 는 OTLP 추적 파일이 아닙니다: {detail}. {"resourceSpans": [...]} 형태여야 합니다.',
  'err.emptyDir': '{path} 에 추적 파일이 없습니다: {detail}. OTLP 내보내기 *.json 또는 *.jsonl 을 넣으세요.',
  'err.prices': '단가 파일 {path} 이(가) 올바르지 않습니다: {detail}. {"default": {"input": 3, "output": 15}} 형태여야 합니다. examples/prices.example.json 을 참고하세요.',
  'err.writeFile': '{path} 에 쓸 수 없습니다: {detail}.',

  'note.ottlWritten': 'Collector transform 조각을 {path} 에 썼습니다',
  'note.skipped': '건너뜀: {path} (OTLP 추적 파일이 아님)',
  'note.ottlNothing': '필요한 문이 없습니다. 관측된 스팬이 모두 이미 표준 속성 이름을 씁니다.',

  'ottl.header': 'genai-span-doctor {version} 이(가) 생성했습니다. 배포 전에 검토하고, traces 파이프라인의 processors 에 transform/genai 를 추가하세요.',
  'ottl.phase.cache': '1단계: 캐시 속성을 표준 이름으로 복사',
  'ottl.phase.sum': '2단계: 입력 합산(원래 입력에 캐시가 빠진 곳에 캐시 토큰을 더함)',
  'ottl.phase.copy': '3단계: 남은 사용량 속성을 표준 이름으로 복사',
  'ottl.phase.delete': '4단계: 원래 속성 삭제(--ottl-delete-source)',
};
