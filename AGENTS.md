# Codex プロジェクト指示

## 最初に読むもの

変更前に次の順序で読む。

1. `AGENTS.md`
2. `CLAUDE.md`
3. `docs/requirements/要件定義書.md`
4. `docs/requirements/実装計画.md`
5. `docs/requirements/テスト仕様書.md`

指示が競合する場合は、ユーザーの最新の明示指示、`AGENTS.md`、`CLAUDE.md`、その他文書の順で扱う。

## プロジェクト概要

- アプリ: SF6-BattleLog（エド向けの個人用対戦分析PWA）
- 対象: Androidのブラウザ／インストール済みPWA
- 技術: HTML、CSS、JavaScript、IndexedDB、Service Worker、GitHub Pages
- 実装ファイル: リポジトリ直下の `index.html`、`styles.css`、`app.js`、`sw.js`
- 時刻基準: 日本標準時（JST、UTC+9）

## 安全・スコープ

- 依頼に関係のない変更、ついでのリファクタリング、既存ファイルの削除をしない。削除が必要な場合は対象・理由・影響を示して事前承認を得る。
- `main`を直接編集しない。`codex/`で始まる作業ブランチを作り、PRを経て統合する。
- コミット、push、PR作成、マージ、GitHub Actionsの実行はユーザーの明示承認後に行う。
- `git reset --hard`、force push、rebase、commit amend、ブランチ強制削除、`--no-verify`を使わない。
- 認証情報、動画そのもの、対戦記録のJSONをリポジトリへコミットしない。

## 実装・品質

- 既存のデータ互換性を壊さない。IndexedDBのスキーマ変更では、既存の`matches`を維持する移行を実装する。
- 状態変更には成功・失敗のユーザー表示を伴わせ、失敗を握りつぶさない。
- YouTube URLやJSON取込は形式を検証し、取込前に件数と影響を明示する。
- 視覚的変更は可能な限り実表示で確認する。確認不能なら、静的確認の範囲と未確認事項を報告する。
- JavaScript変更後は最低限`node --check app.js`と`node --check sw.js`を実行する。

## ドキュメント

- 機能追加、不具合修正、仕様変更では、同じ作業単位で必ず次の3文書を更新する。
  - `docs/requirements/要件定義書.md`
  - `docs/requirements/実装計画.md`
  - `docs/requirements/テスト仕様書.md`
- 仕様変更はJSTの日付、旧仕様、変更理由を追記形式で残す。未解決・見送り事項は削除せず、各文書の専用節へ記録する。
- コメント、ドキュメント、コミットメッセージ、報告は日本語で書く。

## Git・GitHub

- 変更は実機確認のまとまりを1ラウンドとして扱う。
- PRは作業ブランチから`main`を対象にし、head/baseを確認してからマージする。
- マージ方式はMerge Commitを優先し、Squash/Rebaseは使わない。
- GitHub Actionsは`workflow_dispatch`による手動実行だけにし、ユーザー承認なしに実行しない。
