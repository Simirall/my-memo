import { createRoute } from "honox/factory";
import { LEGAL_EFFECTIVE_DATE_LABEL } from "@/features/legal/consent";

export default createRoute((c) =>
  c.render(
    <article className="mx-auto max-w-3xl space-y-8 py-6 leading-7">
      <title>利用規約 | My Memo</title>
      <header className="space-y-2">
        <h1 className="font-bold text-3xl">利用規約</h1>
        <p className="text-base-content/70">
          発効日：{LEGAL_EFFECTIVE_DATE_LABEL}
        </p>
      </header>

      <p>
        この利用規約は、本サービスの管理者が提供する個人向けメモアプリ「My
        Memo」の利用条件を定めるものです。本サービスを利用する場合、本規約に同意したものとします。
      </p>

      <section className="space-y-3">
        <h2 className="font-bold text-xl">1. サービスの内容</h2>
        <p>
          本サービスは、メモ、WebページのAI要約、ファイル添付、カテゴリー、タグ、端末の共有機能からの取り込みなどを提供するサービスです。機能や提供内容は、予告なく変更または終了することがあります。
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-bold text-xl">2. アカウント</h2>
        <p>
          利用にはGitHubアカウントが必要です。利用者は、自身のアカウントを適切に管理し、第三者に不正利用されないようにしてください。
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-bold text-xl">3. 禁止事項</h2>
        <p>利用者は、次の行為を行ってはなりません。</p>
        <ul className="list-disc space-y-2 pl-6">
          <li>法令に違反する行為</li>
          <li>第三者の権利を侵害する行為</li>
          <li>本サービスの運営を妨害する行為</li>
          <li>不正アクセスまたはその試行</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-bold text-xl">4. 管理とモデレーション</h2>
        <p>
          管理者は、サービスの運用、障害調査、安全確保、本規約への違反対応に必要な範囲で、利用者のアカウント情報や保存データを閲覧することがあります。また、必要に応じてデータの削除または利用の制限を行うことがあります。
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-bold text-xl">5. データとサービスの提供</h2>
        <p>
          本サービスは、無停止での稼働、データの永続的な保存、完全なバックアップを保証しません。障害、誤操作、仕様変更、外部サービスの停止などにより、データが失われたり利用できなくなったりする場合があります。必要なデータは利用者自身でも保管してください。
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-bold text-xl">6. 免責</h2>
        <p>
          管理者は、本サービスの利用または利用不能によって生じた損害について、管理者の故意または重過失による場合など、法令上免責が認められない場合を除き、責任を負いません。
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-bold text-xl">7. 規約の変更</h2>
        <p>
          管理者は、必要に応じて本規約を変更できます。利用条件を実質的に変更した場合は、サービス上で改定を案内し、再度の同意を求めます。
        </p>
      </section>

      <footer className="border-base-300 border-t pt-6 text-base-content/70 text-sm">
        <p>運営者：本サービスの管理者</p>
      </footer>
    </article>,
  ),
);
