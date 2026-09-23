from services.messaging import SqliteReliableMessageStore


def test_outbox_publish_is_idempotent_and_leaseable(tmp_path):
    store = SqliteReliableMessageStore(tmp_path / "messages.db")
    first = store.publish("strategy", "rotation", "strategy.promoted", {"version": "v1"}, "rotation:v1")
    second = store.publish("strategy", "rotation", "strategy.promoted", {"version": "v1"}, "rotation:v1")
    assert first == second
    message = store.claim_outbox("publisher-1", lease_seconds=30)
    assert message and message.id == first and message.attempts == 1
    store.mark_published(first, "publisher-1")


def test_inbox_deduplicates_and_allows_failed_redelivery(tmp_path):
    store = SqliteReliableMessageStore(tmp_path / "messages.db")
    message_id = store.publish("order", "o1", "order.created", {}, "order:o1")
    claim = store.begin_consume("risk-service", message_id)
    assert claim.is_new is True
    duplicate = store.begin_consume("risk-service", message_id)
    assert duplicate.is_new is False
    store.mark_consume_failed("risk-service", message_id, "temporary database outage")
    retry = store.begin_consume("risk-service", message_id)
    assert retry.is_new is True
    store.mark_processed("risk-service", message_id)
    processed_duplicate = store.begin_consume("risk-service", message_id)
    assert processed_duplicate.is_new is False
