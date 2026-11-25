# 評価の結果

- 実行日時：2026-11-24T03:37:05.164Z
- モデル：jev-latest
- 件数：62 件（want 44・no 18・Jev が答えなかった 0）
- 正解の種類が上位 3 つに入った割合：100%（19/19）
- 既定のしきい値：0.30

| しきい値 | 見逃し率 | 空振り率 |
| --- | --- | --- |
| 0.30 | 2%（1/44） | 6%（1/18） |
| 0.35 | 5%（2/44） | 6%（1/18） |
| 0.40 | 5%（2/44） | 6%（1/18） |
| 0.45 | 7%（3/44） | 6%（1/18） |
| 0.50 | 7%（3/44） | 6%（1/18） |
| 0.55 | 9%（4/44） | 0%（0/18） |
| 0.60 | 14%（6/44） | 0%（0/18） |
| 0.65 | 16%（7/44） | 0%（0/18） |
| 0.70 | 16%（7/44） | 0%（0/18） |
| 0.75 | 30%（13/44） | 0%（0/18） |
| 0.80 | 39%（17/44） | 0%（0/18） |
| 0.85 | 48%（21/44） | 0%（0/18） |
| 0.90 | 75%（33/44） | 0%（0/18） |

## 1 件ごと

| id | ラベル | 確率 | 正解の種類 | Jev の上位 3 つ |
| --- | --- | --- | --- | --- |
| c01 | want | 0.75 | comparison | comparison, decision, matrix |
| c02 | no | 0.14 |  | decision, comparison, tree |
| c03 | want | 0.71 | comparison | decision, comparison, tree |
| c04 | no | 0.06 |  | decision, comparison, flow |
| c05 | want | 0.77 | comparison | decision, comparison, flow |
| c06 | no | 0.07 |  | decision, flow, tree |
| c07 | want | 0.84 | comparison | decision, comparison, containment |
| c08 | want | 0.85 | decision | decision, layers, relations |
| c09 | no | 0.05 |  | decision, flow, comparison |
| c10 | want | 0.90 | flow | flow, decision, sequence |
| c11 | no | 0.52 |  | flow, relations, er |
| c12 | want | 0.77 | hub | hub, sequence, relations |
| c13 | want | 0.91 | containment | containment, flow, relations |
| c14 | no | 0.14 |  | steps, comparison, flow |
| c15 | want | 0.90 | status | status |
| c16 | want | 0.91 | status | status |
| c17 | no | 0.02 |  | status |
| c18 | no | 0.03 |  | status |
| c19 | want | 0.80 | status | status |
| c20 | no | 0.03 |  | status |
| c21 | want | 0.77 | comparison | decision, comparison, matrix |
| c22 | no | 0.06 |  | decision, comparison, flow |
| c23 | want | 0.91 | flow | flow, sequence, relations |
| c24 | no | 0.08 |  | steps, flow, sequence |
| c25 | want | 0.92 | containment | containment, tree, flow |
| c26 | no | 0.11 |  | decision, flow, tree |
| c27 | want | 0.91 | status | status |
| c28 | no | 0.02 |  | status |
| c29 | want | 0.93 | status | status |
| c30 | no | 0.02 |  | status |
| c31 | want | 0.91 |  | flow, steps, decision |
| c32 | want | 0.89 |  | flow, steps, decision |
| c33 | want | 0.89 |  | steps, flow, sequence |
| c34 | want | 0.83 |  | flow, steps, sequence |
| c35 | want | 0.88 |  | steps, flow, decision |
| c36 | want | 0.81 |  | steps, flow, sequence |
| c37 | want | 0.43 |  | steps, tree, flow |
| c38 | want | 0.61 |  | tree, steps, flow |
| c39 | want | 0.71 |  | tree, hub, comparison |
| c40 | want | 0.58 |  | tree, hub, decision |
| c41 | want | 0.55 |  | tree, hub, comparison |
| c42 | want | 0.71 |  | comparison, tree, matrix |
| c43 | want | 0.74 |  | comparison, matrix, tree |
| c44 | want | 0.74 |  | comparison, decision, matrix |
| c45 | want | 0.89 |  | steps, flow, decision |
| c46 | want | 0.91 |  | flow, steps, decision |
| c47 | want | 0.86 |  | steps, flow, sequence |
| c48 | want | 0.23 |  | tree, comparison, steps |
| c49 | want | 0.32 |  | steps, flow, comparison |
| c50 | want | 0.50 |  | flow, decision, tree |
| c51 | want | 0.88 |  | tree, hub, matrix |
| c52 | want | 0.85 |  | tree, hub, decision |
| c53 | want | 0.87 |  | tree, containment, hub |
| c54 | want | 0.72 |  | steps, flow, layers |
| c55 | want | 0.85 |  | steps, flow, decision |
| c56 | want | 0.89 | flow | sequence, flow, swimlane |
| c57 | want | 0.91 | containment | containment, tree, decision |
| c58 | want | 0.88 | layers | layers, decision, comparison |
| c59 | no | 0.05 |  | flow, steps, sequence |
| c60 | no | 0.06 |  | flow, sequence, steps |
| c61 | no | 0.12 |  | flow, comparison, containment |
| c62 | no | 0.06 |  | steps, flow, sequence |
