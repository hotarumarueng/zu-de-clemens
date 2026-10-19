# zu-de-clemens 実装計画

> **実装する人へ:** superpowers:subagent-driven-development（推奨）または superpowers:executing-plans で、タスクを 1 つずつ実装する。進み具合はチェックボックス（`- [ ]`）で付ける。
>
> この計画には実装コードを書かない（作者の作業規約）。各タスクは、ファイル・責務・インターフェース・受け入れ条件（テスト名と確かめる内容）・確かめ方だけを示す。本文は実装する人が書く。

**目的:** 会話の内容に合う図を Jev の判定で提案し、利用者が求めたときだけ Claude（fork）に D2 で描かせてサイドペインに出す Claude Code の MOD を作る。

**構成:** function hooks の MOD 1 つ。`register.tsx` がきっかけを振り分け、`jev.ts` が判定、`pane.tsx` が提案と図の表示、`draw.ts` が fork と D2 による作図、`log.ts` が回答ログを担う。外部（Jev API・fork・D2）はすべて `$` 経由で呼び、テストではプラグインの下に置いたフックで偽物に差し替える。

**技術:** Claude Code function hooks（TypeScript、JSX）、D2 0.9.0（ELK レイアウト）、TypeSafe Jev（HTTP API、`jev-latest`）、`claude plugin test`、Node 24（評価スクリプトのみ）。

**仕様:** [要件](../requirements.md)、[設計](../design.md)、[ADR](../adr/)、[用語](../../CONTEXT.md)。実装する人は計画と一緒にこれらを読む。

## 全体の制約

- Claude Code 2.1.301 以上（試験で動作を確認した版）。function hooks は early access で、版によって API が変わりうる
- D2 0.9.0 以上。レイアウトは `elk`。SVG は `--theme 0 --dark-theme 200 --scale 1 --pad 20`
- MOD 本体に npm の依存を入れない。外部とのやりとりは `$.http.fetch`・`$.model.fork`・`$.process.run`・`$.fs` だけで行う
- Jev：`POST https://api.typesafe.ai/v1/systemone`、モデル `jev-latest`、打ち切り 10 秒、再試行しない
- D2 の実行の打ち切り：10 秒
- fork の書き直しは 1 回まで
- API キーの値を、ペイン・回答ログ・デバッグログ・エラー文・テストの出力のどこにも出さない
- プラグイン名・マーケットプレイス名は `zu-de-clemens`。コマンドは `/zu-de-clemens:<名前>`
- 画面に出す文言は日本語と英語の両方を用意する（R14）
- ライセンスは MIT
- コミットは作者が承認したときだけ、1 行の日本語で行う

## レビューで特に見る点

仕様は書いていないが、利用者が実際に出会い、壊れると困る入力・状態。上ほど起きやすい。各行のテストは、その行の「担当」タスクに入れてある。

1. **とても長い文**（数万文字の応答・質問）：Jev の上限（材料と最長の質問で 32k トークン）を超えて失敗する。対象の文と直近の入力は、送る前に決まった長さに切り詰める（担当: タスク 3）
2. **fork が D2 に危険な指示を書いた**：D2 には手元のファイルを読み込む `@import`（`...@path`）と、外部の URL を読む `icon:` がある。fork の返事は信頼の境界の外とみなし、これらを含む D2 は描かずに失敗扱いにする（担当: タスク 4）
3. **fork の返事が形を守っていない**：D2 のコードブロックがない・2 つある・`KIND` の行がない・カタログにない ID。どれも書き直し 1 回の対象にし、それでもだめなら失敗を表示する（担当: タスク 4）
4. **Jev の返事が想定外**：200 なのに JSON が壊れている、`answers` に質問 ID がない、確率が 0〜1 の外。どれも「判定なし」として扱い、例外を外に漏らさない（担当: タスク 3）
5. **画面がつながっていない**（`$.session.surfaces()` が空。Remote Control だけで操作しているときなど）：提案が誰にも見えず、トーストも出せない。このときは Jev に聞かず（無駄な通信をしない）、回答ログに「表示されなかった」と残すだけにする。画面はあるがペインが置かれない（`isPlaced: false`）場合はトーストで知らせる（担当: タスク 6）

---

### タスク 0: 実装前の確認試験

設計 14 章の 5 項目を、使い捨ての試験用 MOD（`~/.claude/dev-mods/` 配下の `zdc-spike`）で確かめる。ここで分かったことによっては、後のタスクの方針が変わる。

**ファイル:**
- 変更: `~/.claude/dev-mods/<セッション>/zdc-spike/`（試験用。リポジトリには入れない）
- 変更: `docs/requirements.md` の「検証済み」「未検証」

**確かめること（それぞれ結果を 1 行で記録する）:**
- [ ] `userConfig` に `sensitive: true` の項目を置き、作者が設定画面で値を入れたとき、MOD の `options` で値が読めるか（値そのものは出さず、読めたかどうかだけを記録する）
- [ ] Claude が AskUserQuestion のダイアログを出しているあいだに、ペインの Button をクリックして `onPress` が動くか
- [ ] `--dark-theme 200` を付けた SVG を `Svg` で出したとき、デスクトップアプリをダークにすると配色が切り替わるか
- [ ] `claude plugin test` で、テスト側の `on('http.fetch')`・`on('model.fork')`・`on('process.run')` がプラグインの呼び出しに偽の答えを返せるか
- [ ] `d2 ... --stdout-format png` が、追加のダウンロードなしで PNG を出せるか（R8 用）

**受け入れ条件:** 5 項目すべてに結果が記録され、だめだった項目について、設計 14 章の代わりの案のどれを採るかを作者が決めている。試験用 MOD は削除している。

---

### タスク 1: リポジトリの土台

**ファイル:**
- 作成: `.claude-plugin/marketplace.json`、`plugins/zu-de-clemens/.claude-plugin/plugin.json`、`plugins/zu-de-clemens/hooks/hooks.json`、`plugins/zu-de-clemens/hooks/register.tsx`（中身は空の `register`）、`plugins/zu-de-clemens/types/index.d.ts`、`plugins/zu-de-clemens/hooks/register.test.ts`、`LICENSE`、`.gitignore`、`.github/workflows/ci.yml`

**決めてあること:**
- `plugin.json` の `userConfig`：設計 8 章の 5 項目（`typesafe_api_key` は `sensitive: true`・`required: true`、`threshold` は 0〜1 で既定値は仮に 0.5（タスク 9 で確定）、`auto_mode` と `image_check` は既定 `false`、`language` は `auto`/`ja`/`en`）
- `.gitignore`：Claude Code が書き出す `plugins/zu-de-clemens/.claude-plugin/types/`
- CI：`claude plugin validate .` と `claude plugin validate plugins/zu-de-clemens`、型チェック、`claude plugin test plugins/zu-de-clemens`、カタログの D2 の検査（タスク 2 で追加）。Claude Code を CI で動かす方法はこのタスクで確かめ、動かせない部分は手元での確認手順として README の開発の節に書く

- [ ] **手順 1: 失敗するテストを書く** — `register.test.ts` に「読み込むと例外なく登録が終わる」テストを 1 つ
- [ ] **手順 2: 土台のファイルを置き、テストを通す**
- [ ] **手順 3: 確かめる** — `claude plugin validate plugins/zu-de-clemens` が `passed`、`claude plugin test plugins/zu-de-clemens` が成功
- [ ] **手順 4: 作者の承認を得てコミットする**

**受け入れ条件:** 上の 2 つのコマンドが通る。`--plugin-dir plugins/zu-de-clemens` で起動したセッションで、エラーなく読み込まれる。

---

### タスク 2: 図の種類カタログ（R13）

**ファイル:**
- 作成: `plugins/zu-de-clemens/hooks/catalog.ts`、`plugins/zu-de-clemens/catalog/<ID>.d2`（14 ファイル）、`plugins/zu-de-clemens/hooks/catalog.test.ts`、`scripts/check-catalog.sh`

**インターフェース:**
- 提供: `type DiagramKind`（設計 5 章の 14 個の ID の文字列リテラル型）、`KINDS: readonly KindInfo[]`、`KindInfo = { id: DiagramKind; name: { ja: string; en: string }; when: { ja: string; en: string } }`、`kindById(id: string): KindInfo | undefined`、`sampleFor($, id: DiagramKind): Promise<string>`（`${$.plugin.root}/catalog/<id>.d2` を読む）

**決めてあること:** ID・名前・使う場面は設計 5 章の表のとおり。見本の D2 は、各種類の典型を箱 4〜8 個で示し、色や装飾を付けない。

- [ ] **手順 1: 失敗するテストを書く** — `catalog.test.ts`：ID が 14 個で重複しない、すべての種類に日英の名前と使う場面がある、`kindById('nope')` が `undefined`、`sampleFor` が各 ID のファイルを読む（`fs.read` をテスト側で差し替え、読まれたパスを確かめる）
- [ ] **手順 2: 実装してテストを通す**
- [ ] **手順 3: `scripts/check-catalog.sh` を書く** — `catalog/*.d2` を 1 つずつ `d2 validate` に通し、1 つでも失敗したら終了コード 1。CI に追加する
- [ ] **手順 4: 確かめる** — テストが成功、`scripts/check-catalog.sh` が終了コード 0
- [ ] **手順 5: 作者の承認を得てコミットする**

---

### タスク 3: Jev の判定（R1〜R3）

**ファイル:**
- 作成: `plugins/zu-de-clemens/hooks/jev.ts`、`plugins/zu-de-clemens/hooks/jev.test.ts`

**インターフェース:**
- 使う: `DiagramKind`、`KINDS`（タスク 2）
- 提供:
  - `type TriggerKind = 'question' | 'answer' | 'prompt'`
  - `type Judgement = { ok: true; needsDiagram?: number; kinds?: { id: DiagramKind; p: number }[]; sessionSummary?: number } | { ok: false; reason: 'unauthorized' | 'unavailable' | 'malformed' }`
  - `judge($, input: { key: string; trigger: TriggerKind; text: string; recentPrompts: string[] }): Promise<Judgement>`（`kinds` は確率の高い順、`none` は除く）

**決めてあること:**
- 材料・質問 ID・判定条件は設計 4 章のとおり。`question`/`answer` では `needs_diagram` と `diagram_kind`、`prompt` では `session_summary` だけを聞く
- 切り詰め：対象の文は末尾を残して 6,000 文字、直近の入力は 1 件 600 文字・3 件まで（レビュー 1）
- 401/403 → `unauthorized`。429/529/5xx、通信の失敗、10 秒の打ち切り → `unavailable`。200 で形が違う → `malformed`（レビュー 4）

- [ ] **手順 1: 失敗するテストを書く** — `jev.test.ts`（`http.fetch` はテスト側のフックで偽物にし、送られた本文を記録する）：
  - `question` のとき、本文の `questions` が `needs_diagram`（noul）と `diagram_kind`（choice、選択肢が 14 種＋`none`）で、`model` が `jev-latest`
  - `prompt` のとき、`questions` が `session_summary` だけ
  - 返事 `{"answers":{"needs_diagram":{"noul":0.76},"diagram_kind":{"probabilities":{"flow":0.6,"none":0.1,"layers":0.3}}}}` から `needsDiagram: 0.76`、`kinds` が `flow`→`layers` の順で、`none` を含まない
  - 401 → `{ ok: false, reason: 'unauthorized' }`、503 → `unavailable`、JSON が壊れている → `malformed`、確率 1.4 → `malformed`
  - 応答が返らない偽物と、時計の差し替えで 10 秒進めたとき → `unavailable`
  - 20,000 文字の文を渡すと、送られた `target.text` が 6,000 文字以下で、末尾が元の文の末尾と一致する
  - どの失敗のときも、結果とデバッグログにキーの値が含まれない
- [ ] **手順 2: テストが失敗することを確かめる**
- [ ] **手順 3: 実装してテストを通す**
- [ ] **手順 4: 作者の承認を得てコミットする**

---

### タスク 4: 図を作る（R5、R13）

**ファイル:**
- 作成: `plugins/zu-de-clemens/hooks/draw.ts`、`plugins/zu-de-clemens/hooks/draw.test.ts`

**インターフェース:**
- 使う: `DiagramKind`、`kindById`、`sampleFor`（タスク 2）、`TriggerKind`（タスク 3）
- 提供:
  - `type Figure = { kind: DiagramKind; title: string; recommend?: string; svg: string; ascii: string; d2: string }`
  - `type DrawResult = { ok: true; figure: Figure } | { ok: false; reason: 'nothing-to-fork' | 'fork-failed' | 'invalid-reply' | 'unsafe-d2' | 'd2-failed' | 'd2-missing' }`
  - `draw($, input: { trigger: TriggerKind; text: string; candidates: { id: DiagramKind; p: number }[]; lang: 'ja' | 'en' }): Promise<DrawResult>`
  - `parseReply(text: string): { d2: string; kind: string; title: string; recommend?: string } | undefined`
  - `isSafeD2(d2: string): boolean`

**決めてあること:**
- fork への指示の中身と返す形は設計 6 章のとおり。候補は上位 3 つ
- 書き直しの指示には、直前の失敗の理由（`d2 validate` のエラー文、または形の違反）を添える
- `isSafeD2`：`@` で始まるインポート、`...@`、`icon:`、`http://`、`https://` を含めば `false`（レビュー 2）
- D2 の実行は `d2` を探し、見つからなければ `/opt/homebrew/bin/d2` と `/usr/local/bin/d2` を試す。どれもなければ `d2-missing`

- [ ] **手順 1: 失敗するテストを書く** — `draw.test.ts`（`model.fork` と `process.run` をテスト側で偽物にする）：
  - `parseReply`：正しい返事から 4 項目が取れる。コードブロックが 0 個・2 個のとき `undefined`。`KIND` 行がないとき `undefined`
  - `isSafeD2`：`a -> b` は `true`、`x: @secrets`・`...@base`・`icon: https://e.com/a.svg` は `false`
  - fork の 1 回目が形の違反、2 回目が正しい → `ok: true`。fork は 2 回だけ呼ばれ、2 回目の指示に違反の理由が含まれる
  - `d2 validate` が 2 回とも失敗 → `d2-failed`。fork は 2 回だけ
  - fork が `nothing-to-fork` → `nothing-to-fork`。fork が `api-error` → `fork-failed`
  - D2 に `@import` を含む返事が 2 回 → `unsafe-d2`。`d2` の SVG・文字の図の変換は呼ばれない
  - カタログにない `KIND` → 書き直しの対象になる
  - 成功時、SVG の変換の引数に `--layout=elk`・`--theme`・`0`・`--dark-theme`・`200`・`--scale`・`1` が含まれ、文字の図の変換に `--stdout-format`・`ascii` が含まれる
- [ ] **手順 2: テストが失敗することを確かめる**
- [ ] **手順 3: 実装してテストを通す**
- [ ] **手順 4: 作者の承認を得てコミットする**

---

### タスク 5: 文言と言語（R14）

**ファイル:**
- 作成: `plugins/zu-de-clemens/hooks/strings.ts`、`plugins/zu-de-clemens/hooks/strings.test.ts`

**インターフェース:**
- 提供: `type Lang = 'ja' | 'en'`、`t(lang: Lang, key: StringKey, values?: Record<string, string | number>): string`、`detectLang(text: string, setting: 'auto' | Lang): Lang`

**決めてあること:** `auto` では、文にひらがな・カタカナがあれば `ja`、なければ `en`。文言のキーは、ペインの状態（設計 7 章）と案内（設計 10 章）の分だけ用意する。

- [ ] **手順 1: 失敗するテストを書く** — `ja` と `en` のキーの集合が一致する、`detectLang('図にして', 'auto')` が `ja`、`detectLang('draw it', 'auto')` が `en`、設定が `en` なら日本語の文でも `en`、`{n}` の差し込みが効く
- [ ] **手順 2: 実装してテストを通す**
- [ ] **手順 3: 作者の承認を得てコミットする**

---

### タスク 6: ペインときっかけの配線（R1〜R3、R6、R9、R15）

**ファイル:**
- 作成: `plugins/zu-de-clemens/hooks/pane.tsx`、`plugins/zu-de-clemens/hooks/pane.test.ts`
- 変更: `plugins/zu-de-clemens/hooks/register.tsx`、`plugins/zu-de-clemens/hooks/register.test.ts`、`plugins/zu-de-clemens/types/index.d.ts`

**インターフェース:**
- 使う: `judge`（タスク 3）、`draw`（タスク 4）、`t`・`detectLang`（タスク 5）、`appendLog`（タスク 7。このタスクでは偽物で足りる）
- 提供: `$.state` の `zu-de-clemens.view`（`{ seq: number; state: 'proposal' | 'drawing' | 'figure' | 'guide' | 'failure'; trigger; lang; probability; candidates; figure?; reason? }`）と `zu-de-clemens.guided`（このセッションで案内を出したか）

**決めてあること:**
- きっかけの拾い方と、`next(e)` を待たせないことは設計 3 章のとおり
- 提案を出す条件：R1・R2 は `needsDiagram >= threshold`、R3 は `sessionSummary >= threshold`
- オートモードでは、提案を出さずに `draw` を始める
- 通し番号 `seq` が今の値と違う結果は、表示しない
- キーが空、または `judge` が `unauthorized`、または `draw` が `d2-missing` → 案内を 1 セッションに 1 回だけ
- 画面がつながっていない（`$.session.surfaces()` が空）ときは、Jev に聞かず `not-shown` を記録する。画面はあるが `$.ui.open` の `isPlaced` が `false` ならトーストで知らせる（レビュー 5）
- `Svg` には `width` を必ず指定する（図の本来の幅とペインの幅の小さい方）。`--scale 1` だけでは拡大が止まらない（タスク 0 で確認）
- デスクトップは `Svg`（幅は図の本来の幅とペインの幅の小さい方）、それ以外の画面は文字の図

- [ ] **手順 1: 失敗するテストを書く** — `register.test.ts` と `pane.test.ts`（Jev・fork・D2 は偽物。画面は `terminal` と `desktop` の両方で回す）：
  - R1：AskUserQuestion の `tool.call` で確率 0.8・しきい値 0.5 → 提案が表示され、fork はまだ呼ばれていない。［図にする］を押すと fork が呼ばれ、図が表示される
  - 確率 0.3 → 何も表示されず、fork も呼ばれない
  - ［今回はいらない］を押す → 提案が消え、fork は呼ばれない
  - R2：`turn.complete` で `reason: 'answer'` → 判定される。`reason: 'aborted'`、`agentId` あり、`answer` が空 → 判定されない
  - R3：`prompt.submit` で `session_summary` 0.9 → 提案が表示される
  - オートモード ON → 提案を経ずに fork が呼ばれる
  - 古い `seq` の描画が後から終わっても、表示は新しい方のまま
  - キーが空 → 案内が 1 回だけ表示され、2 回目のきっかけでは出ない
  - Jev が `unavailable` → 何も表示されず、`next(e)` の結果は変わらない
  - `ui.open` が `isPlaced: false` を返す → トーストが出る
  - `session.surfaces` が空 → `http.fetch` が呼ばれず、回答ログに `not-shown` が記録される
  - フックの中で例外が起きても、AskUserQuestion の結果・プロンプトがそのまま通る
  - `desktop` では `Svg`、`terminal` では文字の図が描かれる
- [ ] **手順 2: テストが失敗することを確かめる**
- [ ] **手順 3: 実装してテストを通す**
- [ ] **手順 4: 作者の承認を得てコミットする**

---

### タスク 7: 回答ログ（R7）

**ファイル:**
- 作成: `plugins/zu-de-clemens/hooks/log.ts`、`plugins/zu-de-clemens/hooks/log.test.ts`
- 変更: `plugins/zu-de-clemens/hooks/register.tsx`（偽物を本物に差し替え、R1 の回答を渡す）

**インターフェース:**
- 提供: `type LogEntry = { at: string; trigger: TriggerKind; probability: number; candidates: DiagramKind[]; reaction: 'accepted' | 'dismissed' | 'ignored' | 'auto' | 'not-shown'; figure?: { kind: DiagramKind; title: string }; question?: string; answer?: string }`、`appendLog($, entry: LogEntry): Promise<void>`（失敗しても例外を投げない）

**決めてあること:**
- 置き場所：`<HOME>/.claude/plugins/data/zu-de-clemens/<作業フォルダ名>-<作業フォルダのパスのハッシュ 8 桁>.md`
- 1 件は見出し 1 つと箇条書き。日時は ISO 8601
- 「放置」は、提案が表示されたまま次のきっかけが来たときに記録する

- [ ] **手順 1: 失敗するテストを書く** — 2 件追記すると同じファイルに 2 件並ぶ、作業フォルダが違えば別ファイル、`fs.write` が失敗しても例外が外に出ずデバッグログに 1 行、記録にキーの値が含まれない、提案中に次のきっかけが来ると `ignored` が記録される
- [ ] **手順 2: 実装してテストを通す**
- [ ] **手順 3: 作者の承認を得てコミットする**

---

### タスク 8: 図の検品（R8、実験機能）

タスク 0 で PNG 出力に追加の依存が要ると分かった場合は、作者と相談して見送る。

**ファイル:**
- 作成: `plugins/zu-de-clemens/hooks/check.ts`、`plugins/zu-de-clemens/hooks/check.test.ts`
- 変更: `plugins/zu-de-clemens/hooks/draw.ts`

**インターフェース:**
- 提供: `checkFigure($, input: { key: string; png: string; kind: DiagramKind }): Promise<{ ok: true } | { ok: false; problem: string } | { ok: 'skipped' }>`

**決めてあること:** `image_check` が ON のときだけ動く。ヘッダー `TypeSafe-Danger-Zone-Images: true` を付ける。質問は「文字が重なっていないか」「流れが一方向か」（Noul）と「狙った種類に見えるか」（Choice）。不合格なら、`problem` を添えて fork の書き直しに回す（書き直しの回数は R5 の 1 回と合わせて数える）。Jev が失敗したら `skipped` として図はそのまま出す。PNG の縦横が 280〜1568 ピクセルに収まらない場合も `skipped`。

- [ ] **手順 1: 失敗するテストを書く** — OFF のとき Jev に画像が送られない、ON で不合格なら fork に書き直しが頼まれ、`problem` が指示に含まれる、Jev が 503 なら図はそのまま表示される、送ったリクエストにヘッダーが付いている
- [ ] **手順 2: 実装してテストを通す**
- [ ] **手順 3: 作者の承認を得てコミットする**

---

### タスク 9: 評価データとしきい値（R11、R12）

**ファイル:**
- 作成: `evals/cases.jsonl`、`evals/results.md`、`plugins/zu-de-clemens/hooks/eval.ts`（と `eval.test.ts`）
- 変更: `plugins/zu-de-clemens/.claude-plugin/plugin.json`（`threshold` の既定値）

**決めてあること:**
- 30 件。各件は `{ id, trigger, text, recent_prompts, label: 'want' | 'no', kind? }`。`want` と `no` をおよそ半々、日本語 20 件・英語 10 件。実際の会話は写さず、場面をもとに書き起こす
- 開発用のコマンド `/zu-de-clemens-eval`：キーは `/plugin configure` の値だけを使う（キーの置き場所を増やさない）。`jev.ts` の `judge` をそのまま使い、質問を二重に書かない。リポジトリの直下で実行し、ラベルのない件があれば Jev に聞かずに止まる
- `results.md`：しきい値 0.30〜0.90（0.05 刻み）ごとの見逃し率と空振り率の表、`want` の件で正解の種類が上位 3 つに入った割合、実行日時、モデル名
- 既定のしきい値：見逃し率 10% 以下の中で、外れ（見逃し＋空振り）が最も少ない値。同じ数なら高いほう（当初は「最も高い値」としていたが、空振りが減らないまま見逃しだけ増える値を選んでしまうため改めた）

- [ ] **手順 1: 作者と評価データを作る** — 作者がラベルを付ける。ラベルは作者が決めるので、実装する人は場面の文案までを用意する
- [ ] **手順 2: `/zu-de-clemens-eval` を作って実行する**（費用の見込み：30 件 × 約 1,000 トークン ＝ 約 0.2 円）
- [ ] **手順 3: 結果から既定のしきい値を決め、`plugin.json` に入れる**
- [ ] **手順 4: 作者の承認を得てコミットする**

**受け入れ条件:** `results.md` に表があり、選んだしきい値で見逃し率が 10% 以下になっている。満たせるしきい値がない場合は、判定条件の書き方を見直すか作者に相談する。

---

### タスク 10: README と実機の確認（R10）

**ファイル:**
- 作成: `README.md`（英語）、`README.ja.md`、`docs/checklist.md`

**決めてあること:**
- README の読み手はエンジニア。Claude がリポジトリの URL を読んで導入を代行できるよう、手順は番号付きで、コマンドはそのまま実行できる形にする
- 導入の手順：D2 の導入 → マーケットプレイスの追加 → プラグインのインストール → API キーの設定（利用者本人が設定画面で入力する。Claude に貼らせない。キーの取得先は TypeSafe の dashboard）
- 書く節：何をするか（スクリーンショット）、必要なもの（Claude Code・D2・Jev のキー）、導入、使い方、設定、外に送るもの（設計 11 章）、費用の目安、既知の制限（ターミナルの日本語の幅、early access の API、実験機能）、開発、クレジット（qa-guide を参考にした）、ライセンス
- `docs/checklist.md`：デスクトップアプリで、R1〜R3・R9・R15 を人が通しで確かめる手順

- [ ] **手順 1: 実機で `docs/checklist.md` を通す** — 作者と一緒に、`--plugin-dir` で読み込んだセッションで確かめ、結果をチェックリストに記録する
- [ ] **手順 2: README を書く**
- [ ] **手順 3: README の導入手順を、新しいセッションの Claude に URL（手元ではファイルのパス）だけ渡して実行させ、手を貸さずに導入まで進むことを確かめる**（キーの入力だけは作者が行う）
- [ ] **手順 4: 作者の承認を得てコミットする**

---

### 段階 ⑤ への引き継ぎ

GitHub への公開リポジトリの作成と送信は、外に見える操作なので、この計画では行わない。タスク 10 まで終わったら、段階 ⑤ として作者に確認してから行う。
