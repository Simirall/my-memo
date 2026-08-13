import { createRoute } from "honox/factory";
import { LEGAL_EFFECTIVE_DATE_LABEL } from "@/features/legal/consent";

export default createRoute((c) =>
  c.render(
    <article className="mx-auto max-w-3xl space-y-8 py-6 leading-7">
      <title>プライバシーポリシー | My Memo</title>
      <header className="space-y-2">
        <h1 className="font-bold text-3xl">プライバシーポリシー</h1>
        <p className="text-base-content/70">
          発効日：{LEGAL_EFFECTIVE_DATE_LABEL}
        </p>
      </header>

      <p>
        本サービスの管理者は、「My
        Memo」の提供に必要な範囲で利用者の情報を取り扱います。
      </p>

      <section className="space-y-3">
        <h2 className="font-bold text-xl">1. 取り扱う情報</h2>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            GitHubから取得する名前、メールアドレス、プロフィール画像などのアカウント情報
          </li>
          <li>
            メモ、カテゴリー、タグ、添付ファイル、共有機能から取り込んだデータ
          </li>
          <li>AI要約の対象URL、取得したWebページの内容、生成された要約</li>
          <li>
            機能の利用状況、認証情報、障害調査やセキュリティ確保に必要な運用ログ
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-bold text-xl">2. 利用目的</h2>
        <ul className="list-disc space-y-2 pl-6">
          <li>利用者の認証とアカウント管理</li>
          <li>メモや添付ファイルなどの保存、表示、編集、削除</li>
          <li>Webページの取得とAI要約の生成</li>
          <li>利用上限の管理、障害調査、セキュリティ確保</li>
          <li>サービスの管理とモデレーション</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-bold text-xl">3. 外部サービス</h2>
        <p>
          本サービスは、認証にGitHubを利用し、実行基盤、データベース、ファイル保存、AI要約などにCloudflareのサービスを利用します。これらの処理に必要な情報は、各サービス提供者の環境で処理または保存されることがあります。
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-bold text-xl">4. 管理者による取り扱い</h2>
        <p>
          管理者は、サービスの運用、障害調査、安全確保、規約違反への対応に必要な範囲で、利用者情報や保存データを閲覧、削除し、利用を制限することがあります。
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-bold text-xl">5. 保存と削除</h2>
        <p>
          情報はサービスの提供に必要な期間保存します。利用者が機能上で削除したデータや、管理者が不要と判断したデータは削除されます。ただし、障害対応やシステム上の都合により、削除が反映されるまで時間がかかる場合があります。
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-bold text-xl">6. 安全管理</h2>
        <p>
          管理者は、不正アクセスや漏えいを防ぐために合理的な対策を行います。ただし、情報の完全な安全性を保証するものではありません。
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-bold text-xl">7. ポリシーの変更</h2>
        <p>
          データの取り扱いを実質的に変更した場合は、サービス上で改定を案内し、利用規約への再同意と本ポリシーの再確認を求めます。
        </p>
      </section>

      <footer className="border-base-300 border-t pt-6 text-base-content/70 text-sm">
        <p>運営者：本サービスの管理者</p>
      </footer>
    </article>,
  ),
);
