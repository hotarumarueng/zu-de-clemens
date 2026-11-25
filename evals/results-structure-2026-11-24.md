# 評価の結果

- 実行日時：2026-11-24T09:02:06.191Z
- モデル：jev-latest
- 件数：62 件（want 42・no 17・Jev が答えなかった 3）
- 正解の種類が上位 3 つに入った割合：88%（15/17）
- 期待の種類が 1 位：表 68%（25/37）・選択式 84%（31/37）
- 期待の種類が上位 3：表 86%（32/37）・選択式 100%（37/37）
- 既定のしきい値：0.45

| しきい値 | 見逃し率 | 空振り率 |
| --- | --- | --- |
| 0.30 | 0%（0/42） | 6%（1/17） |
| 0.35 | 0%（0/42） | 6%（1/17） |
| 0.40 | 0%（0/42） | 6%（1/17） |
| 0.45 | 0%（0/42） | 0%（0/17） |
| 0.50 | 2%（1/42） | 0%（0/17） |
| 0.55 | 2%（1/42） | 0%（0/17） |
| 0.60 | 5%（2/42） | 0%（0/17） |
| 0.65 | 10%（4/42） | 0%（0/17） |
| 0.70 | 10%（4/42） | 0%（0/17） |
| 0.75 | 19%（8/42） | 0%（0/17） |
| 0.80 | 29%（12/42） | 0%（0/17） |
| 0.85 | 43%（18/42） | 0%（0/17） |
| 0.90 | 67%（28/42） | 0%（0/17） |

## 1 件ごと

| id | ラベル | 確率 | 正解の種類 | Jev の上位 3 つ |
| --- | --- | --- | --- | --- |
| c01 | want | 失敗 | comparison |  |
| c02 | no | 失敗 |  |  |
| c03 | want | 失敗 | comparison |  |
| c04 | no | 0.06 |  | hub, decision, sequence |
| c05 | want | 0.76 | comparison | containment, hub, relations |
| c06 | no | 0.07 |  | timeline, hub, sequence |
| c07 | want | 0.84 | comparison | containment, hub, comparison |
| c08 | want | 0.84 | decision | decision, hub, fishbone |
| c09 | no | 0.05 |  | sequence, hub, relations |
| c10 | want | 0.91 | flow | decision, sequence, flow |
| c11 | no | 0.41 |  | decision, hub, swimlane |
| c12 | want | 0.76 | hub | hub, relations, containment |
| c13 | want | 0.92 | containment | containment, hub, tree |
| c14 | no | 0.12 |  | decision, hub, steps |
| c15 | want | 0.89 | status | status |
| c16 | want | 0.91 | status | status |
| c17 | no | 0.02 |  | status |
| c18 | no | 0.03 |  | status |
| c19 | want | 0.80 | status | status |
| c20 | no | 0.03 |  | status |
| c21 | want | 0.77 | comparison | hub, sequence, comparison |
| c22 | no | 0.06 |  | timeline, hub, relations |
| c23 | want | 0.90 | flow | decision, hub, sequence |
| c24 | no | 0.08 |  | steps, hub, state_machine |
| c25 | want | 0.92 | containment | containment, tree, layers |
| c26 | no | 0.19 |  | timeline, decision, hub |
| c27 | want | 0.89 | status | status |
| c28 | no | 0.02 |  | status |
| c29 | want | 0.92 | status | status |
| c30 | no | 0.03 |  | status |
| c31 | want | 0.93 |  | state_machine, decision, kanban |
| c32 | want | 0.92 |  | state_machine, decision, kanban |
| c33 | want | 0.91 |  | state_machine, decision, flow |
| c34 | want | 0.90 |  | timeline, hub, state_machine |
| c35 | want | 0.92 |  | timeline, tree, hub |
| c36 | want | 0.89 |  | timeline, containment, hub |
| c37 | want | 0.84 |  | kanban, tree, hub |
| c38 | want | 0.83 |  | timeline, kanban, checklist |
| c39 | want | 0.72 |  | logic_tree, fishbone, checklist |
| c40 | want | 0.63 |  | fishbone, hub, containment |
| c41 | want | 0.64 |  | fishbone, hub, logic_tree |
| c42 | want | 0.71 |  | procon, hub, fishbone |
| c43 | want | 0.71 |  | procon, hub, relations |
| c44 | want | 0.72 |  | procon, fishbone, decision |
| c45 | want | 0.90 |  | cycle, timeline, hub |
| c46 | want | 0.92 |  | cycle, hub, relations |
| c47 | want | 0.87 |  | cycle, hub, relations |
| c48 | want | 0.47 |  | checklist, containment, kanban |
| c49 | want | 0.77 |  | checklist, procon, kanban |
| c50 | want | 0.56 |  | checklist, containment, decision |
| c51 | want | 0.88 |  | logic_tree, hub, relations |
| c52 | want | 0.85 |  | tree, hub, containment |
| c53 | want | 0.87 |  | tree, hub, containment |
| c54 | want | 0.83 |  | containment, checklist, fishbone |
| c55 | want | 0.88 |  | steps, hub, decision |
| c56 | want | 0.89 | flow | decision, sequence, flow |
| c57 | want | 0.91 | containment | containment, tree, hub |
| c58 | want | 0.89 | layers | layers, hub, relations |
| c59 | no | 0.05 |  | sequence, hub, steps |
| c60 | no | 0.05 |  | state_machine, hub, timeline |
| c61 | no | 0.11 |  | timeline, hub, relations |
| c62 | no | 0.06 |  | steps, swimlane, cycle |
