# 評価の結果

- 実行日時：2026-11-24T11:08:07.001Z
- モデル：jev-latest
- 件数：62 件（want 44・no 18・Jev が答えなかった 0）
- 正解の種類が上位 3 つに入った割合：100%（19/19）
- 期待の種類が 1 位：84%（37/44）
- 期待の種類が上位 3：100%（44/44）
- 応答時間：中央 0.2 秒・最長 0.5 秒
- 既定のしきい値：0.45

| しきい値 | 見逃し率 | 空振り率 |
| --- | --- | --- |
| 0.30 | 0%（0/44） | 6%（1/18） |
| 0.35 | 0%（0/44） | 6%（1/18） |
| 0.40 | 0%（0/44） | 6%（1/18） |
| 0.45 | 0%（0/44） | 0%（0/18） |
| 0.50 | 2%（1/44） | 0%（0/18） |
| 0.55 | 2%（1/44） | 0%（0/18） |
| 0.60 | 5%（2/44） | 0%（0/18） |
| 0.65 | 9%（4/44） | 0%（0/18） |
| 0.70 | 14%（6/44） | 0%（0/18） |
| 0.75 | 20%（9/44） | 0%（0/18） |
| 0.80 | 34%（15/44） | 0%（0/18） |
| 0.85 | 43%（19/44） | 0%（0/18） |
| 0.90 | 61%（27/44） | 0%（0/18） |

## 1 件ごと

| id | ラベル | 確率 | 正解の種類 | Jev の上位 3 つ |
| --- | --- | --- | --- | --- |
| c01 | want | 0.74 | comparison | comparison, decision, matrix |
| c02 | no | 0.14 |  | decision, comparison, checklist |
| c03 | want | 0.68 | comparison | decision, comparison, procon |
| c04 | no | 0.06 |  | decision, checklist, comparison |
| c05 | want | 0.77 | comparison | decision, comparison, flow |
| c06 | no | 0.08 |  | decision, checklist, tree |
| c07 | want | 0.83 | comparison | decision, comparison, procon |
| c08 | want | 0.85 | decision | decision, layers, logic_tree |
| c09 | no | 0.05 |  | checklist, decision, procon |
| c10 | want | 0.92 | flow | flow, decision, sequence |
| c11 | no | 0.41 |  | flow, relations, er |
| c12 | want | 0.77 | hub | hub, sequence, flow |
| c13 | want | 0.92 | containment | containment, flow, relations |
| c14 | no | 0.13 |  | logic_tree, fishbone, steps |
| c15 | want | 0.90 | status | status |
| c16 | want | 0.92 | status | status |
| c17 | no | 0.02 |  | status |
| c18 | no | 0.03 |  | status |
| c19 | want | 0.79 | status | status |
| c20 | no | 0.03 |  | status |
| c21 | want | 0.76 | comparison | decision, comparison, matrix |
| c22 | no | 0.06 |  | decision, procon, checklist |
| c23 | want | 0.91 | flow | flow, sequence, relations |
| c24 | no | 0.07 |  | checklist, kanban, steps |
| c25 | want | 0.92 | containment | containment, tree, flow |
| c26 | no | 0.20 |  | fishbone, logic_tree, timeline |
| c27 | want | 0.90 | status | status |
| c28 | no | 0.02 |  | status |
| c29 | want | 0.92 | status | status |
| c30 | no | 0.03 |  | status |
| c31 | want | 0.93 |  | state_machine, decision, comparison |
| c32 | want | 0.91 |  | state_machine, decision, comparison |
| c33 | want | 0.92 |  | state_machine, decision, comparison |
| c34 | want | 0.91 |  | timeline, decision, comparison |
| c35 | want | 0.92 |  | timeline, steps, flow |
| c36 | want | 0.90 |  | timeline, decision, comparison |
| c37 | want | 0.84 |  | kanban, checklist, decision |
| c38 | want | 0.83 |  | kanban, timeline, decision |
| c39 | want | 0.72 |  | fishbone, logic_tree, tree |
| c40 | want | 0.60 |  | fishbone, logic_tree, tree |
| c41 | want | 0.62 |  | fishbone, logic_tree, tree |
| c42 | want | 0.68 |  | procon, decision, comparison |
| c43 | want | 0.75 |  | procon, decision, comparison |
| c44 | want | 0.73 |  | procon, decision, comparison |
| c45 | want | 0.91 |  | cycle, decision, comparison |
| c46 | want | 0.92 |  | cycle, decision, comparison |
| c47 | want | 0.87 |  | cycle, decision, comparison |
| c48 | want | 0.47 |  | checklist, decision, comparison |
| c49 | want | 0.76 |  | checklist, kanban, decision |
| c50 | want | 0.56 |  | checklist, flow, logic_tree |
| c51 | want | 0.88 |  | logic_tree, fishbone, tree |
| c52 | want | 0.85 |  | logic_tree, tree, fishbone |
| c53 | want | 0.86 |  | tree, logic_tree, hub |
| c54 | want | 0.84 |  | checklist, steps, flow |
| c55 | want | 0.88 |  | steps, flow, checklist |
| c56 | want | 0.89 | flow | sequence, swimlane, flow |
| c57 | want | 0.91 | containment | containment, tree, decision |
| c58 | want | 0.89 | layers | layers, decision, comparison |
| c59 | no | 0.05 |  | state_machine, flow, decision |
| c60 | no | 0.06 |  | state_machine, timeline, checklist |
| c61 | no | 0.12 |  | timeline, comparison, containment |
| c62 | no | 0.06 |  | fishbone, steps, logic_tree |
