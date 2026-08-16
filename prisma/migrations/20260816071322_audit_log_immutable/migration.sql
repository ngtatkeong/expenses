-- Enforce the audit trail's append-only guarantee at the database level,
-- not just by omitting UPDATE/DELETE routes in the API. Even a direct DB
-- query (or a future bug in application code) cannot alter or remove a
-- past audit entry.

CREATE TRIGGER audit_log_no_update
BEFORE UPDATE ON "AuditLog"
BEGIN
  SELECT RAISE(ABORT, 'AuditLog rows are append-only and cannot be updated');
END;

CREATE TRIGGER audit_log_no_delete
BEFORE DELETE ON "AuditLog"
BEGIN
  SELECT RAISE(ABORT, 'AuditLog rows are append-only and cannot be deleted');
END;