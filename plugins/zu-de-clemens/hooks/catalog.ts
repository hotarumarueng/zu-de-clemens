export type DiagramKind =
  | 'decision' | 'comparison' | 'matrix' | 'layers' | 'containment' | 'hub' | 'flow'
  | 'swimlane' | 'sequence' | 'tree' | 'relations' | 'steps' | 'er' | 'status'

export type KindInfo = {
  id: DiagramKind
  name: { ja: string; en: string }
  when: { ja: string; en: string }
  /** fork に渡す D2 の型の見本。色や装飾は付けない（テーマに任せる） */
  sample: string
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
]

export function kindById(id: string): KindInfo | undefined {
  return KINDS.find(kind => kind.id === id)
}
