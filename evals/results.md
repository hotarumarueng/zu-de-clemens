# 評価の結果

- 実行日時：2026-10-19T09:23:46.421Z
- モデル：jev-latest
- 件数：30 件（want 16・no 14・Jev が答えなかった 0）
- 正解の種類が上位 3 つに入った割合：100%（16/16）
- 既定のしきい値：0.60

| しきい値 | 見逃し率 | 空振り率 |
| --- | --- | --- |
| 0.30 | 0%（0/16） | 7%（1/14） |
| 0.35 | 0%（0/16） | 7%（1/14） |
| 0.40 | 0%（0/16） | 7%（1/14） |
| 0.45 | 0%（0/16） | 7%（1/14） |
| 0.50 | 0%（0/16） | 7%（1/14） |
| 0.55 | 0%（0/16） | 7%（1/14） |
| 0.60 | 0%（0/16） | 0%（0/14） |
| 0.65 | 6%（1/16） | 0%（0/14） |
| 0.70 | 6%（1/16） | 0%（0/14） |
| 0.75 | 25%（4/16） | 0%（0/14） |
| 0.80 | 31%（5/16） | 0%（0/14） |
| 0.85 | 44%（7/16） | 0%（0/14） |
| 0.90 | 56%（9/16） | 0%（0/14） |

## 1 件ごと

| id | ラベル | 確率 | 正解の種類 | Jev の上位 3 つ |
| --- | --- | --- | --- | --- |
| c01 | want | 0.71 | comparison | comparison, decision, matrix |
| c02 | no | 0.13 |  | decision, comparison, tree |
| c03 | want | 0.63 | comparison | decision, comparison, tree |
| c04 | no | 0.05 |  | decision, comparison, matrix |
| c05 | want | 0.74 | comparison | decision, comparison, flow |
| c06 | no | 0.09 |  | decision, tree, comparison |
| c07 | want | 0.83 | comparison | decision, comparison, containment |
| c08 | want | 0.87 | decision | decision, layers, relations |
| c09 | no | 0.04 |  | status, decision, comparison |
| c10 | want | 0.91 | flow | flow, sequence, decision |
| c11 | no | 0.55 |  | flow, relations, er |
| c12 | want | 0.75 | hub | hub, sequence, relations |
| c13 | want | 0.92 | containment | containment, decision, comparison |
| c14 | no | 0.12 |  | steps, comparison, status |
| c15 | want | 0.88 | status | status |
| c16 | want | 0.90 | status | status |
| c17 | no | 0.02 |  | status |
| c18 | no | 0.02 |  | status |
| c19 | want | 0.83 | status | status |
| c20 | no | 0.02 |  | status |
| c21 | want | 0.74 | comparison | decision, comparison, matrix |
| c22 | no | 0.06 |  | decision, comparison, matrix |
| c23 | want | 0.92 | flow | flow, sequence, relations |
| c24 | no | 0.06 |  | status, steps, flow |
| c25 | want | 0.93 | containment | containment, tree, flow |
| c26 | no | 0.10 |  | decision, flow, status |
| c27 | want | 0.90 | status | status |
| c28 | no | 0.01 |  | status |
| c29 | want | 0.93 | status | status |
| c30 | no | 0.02 |  | status |
