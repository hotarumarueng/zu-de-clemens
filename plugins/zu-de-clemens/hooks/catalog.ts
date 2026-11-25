export type DiagramKind =
  | 'decision' | 'comparison' | 'matrix' | 'layers' | 'containment' | 'hub' | 'flow'
  | 'swimlane' | 'sequence' | 'tree' | 'relations' | 'steps' | 'er' | 'status'
  | 'state_machine' | 'fishbone' | 'cycle' | 'logic_tree' | 'timeline' | 'kanban' | 'procon' | 'checklist'

export type KindInfo = {
  id: DiagramKind
  name: { ja: string; en: string }
  when: { ja: string; en: string }
  /** fork に渡す型の見本。d2 は D2、md は見出しと箇条書き。色や装飾は付けない（テーマに任せる） */
  sample: string
  /** md: 図にせず、fork が書いた見出しと箇条書きを MOD がペインの部品で組む（列・行に並べる種類）。省略は d2 */
  form?: 'd2' | 'md'
}

export const KINDS: readonly KindInfo[] = [
  {
    id: 'decision',
    name: { ja: '判断の分岐', en: 'Decision tree' },
    when: { ja: '条件によって選ぶものが変わる', en: 'The right choice depends on conditions' },
    sample: `direction: down
start: Start
q: Condition? {shape: diamond}
a: Option A
b: Option B
start -> q
q -> a: yes
q -> b: no`,
  },
  {
    id: 'comparison',
    name: { ja: '比較表', en: 'Comparison table' },
    when: { ja: '選択肢の違いを項目ごとに並べる', en: 'Compare options item by item' },
    sample: `a: Option A {
  shape: sql_table
  cost: low
  effort: high
}
b: Option B {
  shape: sql_table
  cost: high
  effort: low
}`,
  },
  {
    id: 'matrix',
    name: { ja: '2×2 マトリクス', en: '2x2 matrix' },
    when: { ja: '2 つの軸で選択肢を配置し、おすすめの根拠を示す', en: 'Place options on two axes to justify a pick' },
    sample: `grid-columns: 2
q1: High value / low effort
q2: High value / high effort
q3: Low value / low effort
q4: Low value / high effort`,
  },
  {
    id: 'layers',
    name: { ja: '層', en: 'Layers' },
    when: { ja: '画面・処理・データのような重なり', en: 'Stacked layers such as UI, logic and data' },
    sample: `direction: down
ui: Screen
app: Application
data: Data {shape: cylinder}
ui -> app -> data`,
  },
  {
    id: 'containment',
    name: { ja: '入れ子', en: 'Containment' },
    when: { ja: '何が何の中にあるか（IAM の影響範囲、VPC など）', en: 'What lives inside what (IAM scope, VPC, ...)' },
    sample: `account: Account {
  vpc: VPC {
    subnet: Subnet {
      server: Server
    }
  }
  policy: Policy
}
account.policy -> account.vpc.subnet.server: allows`,
  },
  {
    id: 'hub',
    name: { ja: 'ハブ', en: 'Hub' },
    when: { ja: '1 か所に集まり、そこから配られる', en: 'Things gather in one place and fan out' },
    sample: `direction: down
a: Source A
b: Source B
hub: Hub
c: Target C
d: Target D
a -> hub
b -> hub
hub -> c
hub -> d`,
  },
  {
    id: 'flow',
    name: { ja: '流れ（DFD）', en: 'Data flow' },
    when: { ja: 'データや処理が順に渡る', en: 'Data or work passes along in order' },
    sample: `direction: down
input: Input
process: Process
store: Store {shape: cylinder}
output: Output
input -> process -> store -> output`,
  },
  {
    id: 'swimlane',
    name: { ja: 'スイムレーン', en: 'Swimlane' },
    when: { ja: '誰が、どの順で、何をするか', en: 'Who does what, in which order' },
    sample: `direction: down
user: User {
  apply: Apply
}
desk: Desk {
  check: Check
}
staff: Staff {
  handle: Handle
}
user.apply -> desk.check -> staff.handle`,
  },
  {
    id: 'sequence',
    name: { ja: 'シーケンス', en: 'Sequence' },
    when: { ja: '誰が誰に、どの順で呼びかけるか', en: 'Who calls whom, in which order' },
    sample: `shape: sequence_diagram
user: User
api: API
db: DB
user -> api: request
api -> db: query
db -> api: rows
api -> user: response`,
  },
  {
    id: 'tree',
    name: { ja: 'ツリー', en: 'Tree' },
    when: { ja: '親子関係・分類', en: 'Parent-child structure or categories' },
    sample: `direction: down
root: Root
a: Branch A
b: Branch B
a1: Leaf
root -> a
root -> b
a -> a1`,
  },
  {
    id: 'relations',
    name: { ja: '連携', en: 'Relations' },
    when: { ja: '3 者以上の相互のやりとり', en: 'Exchanges among three or more parties' },
    sample: `a: Party A
b: Party B
c: Party C
a -> b: asks
b -> c: supports
c -> a: reports`,
  },
  {
    id: 'steps',
    name: { ja: 'ステップ', en: 'Steps' },
    when: { ja: '段階・手順', en: 'Stages or a procedure' },
    sample: `direction: down
s1: 1. Plan
s2: 2. Build
s3: 3. Check
s4: 4. Ship
s1 -> s2 -> s3 -> s4`,
  },
  {
    id: 'er',
    name: { ja: 'ER 図', en: 'ER diagram' },
    when: { ja: 'データどうしの関係', en: 'How records relate to each other' },
    sample: `user: {
  shape: sql_table
  id: int {constraint: primary_key}
  name: text
}
post: {
  shape: sql_table
  id: int {constraint: primary_key}
  user_id: int {constraint: foreign_key}
}
post.user_id -> user.id`,
  },
  {
    id: 'status',
    name: { ja: '進み具合', en: 'Status' },
    when: { ja: 'セッションの整理（話題ごとに、決まったこと・残っていること）', en: 'Session summary: per topic, what is decided and what is open' },
    // 矢印のない箱は direction に従わず横に並ぶ。grid-columns: 1 で枠の中も外も 1 列にする（issue #1）
    sample: `direction: down
grid-columns: 1
topic_a: Topic A {
  grid-columns: 1
  decided: "Decided: X"
  open: "Open: Y"
}
topic_b: Topic B {
  grid-columns: 1
  decided: "Decided: Z"
}`,
  },
  // 2026-11-24 に足した種類。矢印でつながるものは D2、列や行に並べるものは md（ペインの部品で組む）
  {
    id: 'state_machine',
    name: { ja: '状態遷移', en: 'State machine' },
    when: { ja: '名前の付いた状態のあいだを、きっかけで移り変わる', en: 'Something moves between named states on events' },
    sample: `direction: down
draft: Draft
review: In review
done: Done
draft -> review: request review
review -> draft: changes requested
review -> done: approved`,
  },
  {
    id: 'fishbone',
    name: { ja: '特性要因', en: 'Fishbone' },
    when: { ja: '1つの結果に対する原因を、系統ごとに分ける', en: 'Causes of one result, grouped by kind' },
    // 原因の系統を 1 つの枠に縦に積み、枠から結果へ 1 本だけ矢印を出す。系統ごとに矢印を出すと横一列に並び、幅 1556px になった（2026-11-24）
    sample: `direction: down
causes: Causes {
  grid-columns: 1
  people: People {
    grid-columns: 1
    a1: Cause 1
    a2: Cause 2
  }
  tools: Tools {
    grid-columns: 1
    b1: Cause 3
  }
}
result: "Result: the page is slow"
causes -> result`,
  },
  {
    id: 'cycle',
    name: { ja: '循環', en: 'Cycle' },
    when: { ja: '繰り返して最初に戻る流れ', en: 'A process that repeats and returns to its start' },
    sample: `direction: down
plan: 1. Plan
do: 2. Do
check: 3. Check
act: 4. Act
plan -> do -> check -> act
act -> plan: repeat`,
  },
  {
    id: 'logic_tree',
    name: { ja: 'ロジックツリー', en: 'Logic tree' },
    when: { ja: '結果や目的を、原因や手段に分解していく', en: 'Break a result or goal down into causes or means' },
    sample: `direction: down
goal: Sales fell
a: Fewer customers
b: Lower spend each
a1: Fewer new customers
a2: Fewer returning
goal -> a
goal -> b
a -> a1
a -> a2`,
  },
  {
    id: 'timeline',
    name: { ja: 'タイムライン', en: 'Timeline' },
    when: { ja: '日時と出来事を、時刻の順に並べる', en: 'Events tied to dates or times, in time order' },
    form: 'md',
    sample: `- 10:02 | Deployed
- 10:05 | Error rate rose
- 10:21 | Rolled back
- 10:30 | Back to normal`,
  },
  {
    id: 'kanban',
    name: { ja: 'カンバン', en: 'Kanban' },
    when: { ja: '作業を、未着手・進行中・済みなどの段階の列に分ける', en: 'Tasks sorted into stages such as to do, in progress and done' },
    form: 'md',
    sample: `## Not started
- Admin permissions
## In progress
- Payment API
## Done
- Login fix`,
  },
  {
    id: 'procon',
    name: { ja: '長所と短所', en: 'Pros and cons' },
    when: { ja: '1つの案の良い点と悪い点を並べる', en: 'Advantages and disadvantages of one option' },
    form: 'md',
    sample: `## Pros
- Pay only for use
- Scales by itself
## Cons
- Slow first start
- Hard to run locally`,
  },
  {
    id: 'checklist',
    name: { ja: 'チェックリスト', en: 'Checklist' },
    when: { ja: '確かめた項目と、その状態（済み・要対応・未確認）', en: 'Items checked, each with a state: done, needs action, unchecked' },
    form: 'md',
    sample: `## Security check
- ✓ 29 settings files, no secrets
- ! 2 dependencies need updates
- ? Logs not checked`,
  },
]

/** 整理（R3・prompt）のきっかけ専用の種類。応答・質問に当てると、関係のない箱の羅列になる（#8） */
export const SUMMARY_ONLY: readonly DiagramKind[] = ['status']

export function kindById(id: string): KindInfo | undefined {
  return KINDS.find(kind => kind.id === id)
}
