export async function cleanupExpiredUploads(
  env: CloudflareBindings,
  now = new Date(),
): Promise<void> {
  const nowIso = now.toISOString();
  await env.MY_MEMO_D1.prepare(
    `UPDATE attachment_upload_reservations
     SET status = 'cleaning'
     WHERE status = 'pending' AND expires_at <= ?`,
  )
    .bind(nowIso)
    .run();

  const claimed = await env.MY_MEMO_D1.prepare(
    `SELECT id, r2_key, thumbnail_r2_key
     FROM attachment_upload_reservations
     WHERE status = 'cleaning' AND expires_at <= ?`,
  )
    .bind(nowIso)
    .all<{ id: string; r2_key: string; thumbnail_r2_key: string | null }>();

  for (const reservation of claimed.results) {
    try {
      await env.MY_MEMO_FILES.delete(
        [reservation.r2_key, reservation.thumbnail_r2_key].filter(
          (key): key is string => Boolean(key),
        ),
      );
      await env.MY_MEMO_D1.prepare(
        "DELETE FROM attachment_upload_reservations WHERE id = ? AND status = 'cleaning'",
      )
        .bind(reservation.id)
        .run();
    } catch (error) {
      await env.MY_MEMO_D1.prepare(
        `UPDATE attachment_upload_reservations
         SET status = 'pending'
         WHERE id = ? AND status = 'cleaning'`,
      )
        .bind(reservation.id)
        .run();
      console.error(
        JSON.stringify({
          event: "expired_attachment_cleanup_failed",
          reservationId: reservation.id,
          errorType: error instanceof Error ? error.name : "UnknownError",
        }),
      );
    }
  }

  await env.MY_MEMO_D1.prepare(
    `DELETE FROM share_intakes
     WHERE expires_at <= ?
       AND NOT EXISTS (
         SELECT 1 FROM attachment_upload_reservations
         WHERE share_intake_id = share_intakes.id
       )`,
  )
    .bind(nowIso)
    .run();
}
