ALTER TABLE call_records
  DROP CONSTRAINT IF EXISTS call_records_result_check;

UPDATE call_records
SET result = CASE
  WHEN result LIKE '%鏈嫧%' THEN '未拨打'
  WHEN result LIKE '%宸叉帴%' THEN '已接通'
  WHEN result LIKE '%鏈帴%' THEN '未接'
  WHEN result LIKE '%鎷掔粷%' THEN '拒绝'
  WHEN result LIKE '%鏈夋晥%' THEN '有效通话'
  WHEN result LIKE '%井%' THEN '加微信'
  WHEN result LIKE '%绾%' THEN '约见'
  WHEN result LIKE '%鍥炴嫧%' THEN '回拨'
  ELSE result
END
WHERE result NOT IN ('未拨打', '已接通', '未接', '拒绝', '有效通话', '加微信', '约见', '回拨');

ALTER TABLE call_records
  ADD CONSTRAINT call_records_result_check
  CHECK (result IN ('未拨打', '已接通', '未接', '拒绝', '有效通话', '加微信', '约见', '回拨'));

CREATE INDEX IF NOT EXISTS idx_users_org_role_status
  ON users (organization_id, role, status);

CREATE INDEX IF NOT EXISTS idx_upload_batches_org_created
  ON upload_batches (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_enterprises_org_credit
  ON enterprises (organization_id, unified_credit_code)
  WHERE unified_credit_code IS NOT NULL AND unified_credit_code <> '';
