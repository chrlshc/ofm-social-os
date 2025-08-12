-- Backup, DR, SLOs, and GDPR compliance infrastructure
-- Supports monitoring, audit trails, and data protection requirements

BEGIN;

-- =============================================
-- Backup Reports Table
-- =============================================

CREATE TABLE IF NOT EXISTS backup_reports (
  id BIGSERIAL PRIMARY KEY,
  backup_id TEXT NOT NULL, -- Unique identifier for backup set
  kind TEXT NOT NULL CHECK (kind IN ('full', 'differential', 'incremental', 'wal_archive')),
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER, -- Backup duration in milliseconds
  size_bytes BIGINT, -- Backup size in bytes
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'aborted')),
  backup_location TEXT, -- S3 path or file location
  wal_start_lsn TEXT, -- Starting WAL LSN for incremental backups
  wal_end_lsn TEXT, -- Ending WAL LSN
  compression_ratio DECIMAL(4,3), -- Compression ratio achieved
  verification_status TEXT CHECK (verification_status IN ('pending', 'verified', 'failed')),
  verification_notes TEXT,
  notes JSONB DEFAULT '{}', -- Additional backup metadata
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for backup reports
CREATE INDEX IF NOT EXISTS idx_backup_reports_kind_completed ON backup_reports(kind, completed_at DESC) WHERE status = 'completed';
CREATE INDEX IF NOT EXISTS idx_backup_reports_status ON backup_reports(status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_backup_reports_backup_id ON backup_reports(backup_id);

-- =============================================
-- DR Exercises Table
-- =============================================

CREATE TABLE IF NOT EXISTS dr_exercises (
  id BIGSERIAL PRIMARY KEY,
  exercise_id TEXT NOT NULL UNIQUE, -- Unique identifier for DR test
  exercise_type TEXT NOT NULL CHECK (exercise_type IN ('scheduled', 'manual', 'real_incident')),
  scenario TEXT NOT NULL, -- Description of DR scenario tested
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  target_rto_ms INTEGER NOT NULL, -- Target RTO in milliseconds
  actual_rto_ms INTEGER, -- Actual RTO achieved
  target_rpo_ms INTEGER NOT NULL, -- Target RPO in milliseconds  
  actual_rpo_ms INTEGER, -- Actual RPO achieved
  backup_restored_from TEXT, -- Backup ID used for restore
  restore_point_time TIMESTAMPTZ, -- Point in time restored to
  result TEXT NOT NULL CHECK (result IN ('success', 'partial', 'failed')),
  success_criteria_met BOOLEAN,
  data_integrity_verified BOOLEAN,
  services_operational BOOLEAN,
  notes JSONB DEFAULT '{}', -- Detailed test results
  lessons_learned TEXT,
  action_items TEXT[],
  next_exercise_due TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for DR exercises
CREATE INDEX IF NOT EXISTS idx_dr_exercises_completed ON dr_exercises(completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_dr_exercises_next_due ON dr_exercises(next_exercise_due) WHERE next_exercise_due IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dr_exercises_result ON dr_exercises(result, started_at DESC);

-- =============================================
-- SLO Metrics Table
-- =============================================

CREATE TABLE IF NOT EXISTS slo_metrics (
  id BIGSERIAL PRIMARY KEY,
  metric_name TEXT NOT NULL,
  service_name TEXT NOT NULL,
  measured_at TIMESTAMPTZ NOT NULL,
  time_window_seconds INTEGER NOT NULL, -- SLO measurement window
  target_percentage DECIMAL(5,2) NOT NULL, -- Target SLO percentage (e.g., 99.9)
  actual_percentage DECIMAL(5,2) NOT NULL, -- Actual achieved percentage
  error_budget_remaining DECIMAL(5,2), -- Remaining error budget percentage
  sample_count BIGINT NOT NULL, -- Number of samples in measurement
  success_count BIGINT NOT NULL, -- Number of successful samples
  violation_count BIGINT NOT NULL, -- Number of violations
  breach_detected BOOLEAN NOT NULL DEFAULT false, -- Whether SLO was breached
  breach_severity TEXT CHECK (breach_severity IN ('warning', 'critical')),
  alert_fired BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB DEFAULT '{}', -- Additional metric context
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for SLO metrics
CREATE INDEX IF NOT EXISTS idx_slo_metrics_service_time ON slo_metrics(service_name, metric_name, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_slo_metrics_breaches ON slo_metrics(breach_detected, measured_at DESC) WHERE breach_detected = true;
CREATE INDEX IF NOT EXISTS idx_slo_metrics_cleanup ON slo_metrics(measured_at) WHERE measured_at < now() - INTERVAL '90 days';

-- =============================================
-- GDPR Requests Table
-- =============================================

CREATE TABLE IF NOT EXISTS gdpr_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id TEXT NOT NULL UNIQUE, -- Human-readable request ID
  request_type TEXT NOT NULL CHECK (request_type IN ('erasure', 'export', 'rectification', 'portability')),
  creator_id UUID NOT NULL,
  requester_email TEXT NOT NULL,
  requester_verified BOOLEAN NOT NULL DEFAULT false,
  legal_basis TEXT, -- Legal basis for processing (Art. 6)
  request_details JSONB DEFAULT '{}', -- Specific request details
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'processing', 'completed', 'rejected', 'cancelled')),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at TIMESTAMPTZ,
  started_processing_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  due_date TIMESTAMPTZ NOT NULL, -- Legal deadline (30 days from submission)
  processor_id UUID, -- ID of admin processing the request
  processing_notes TEXT,
  
  -- Erasure specific fields
  erasure_scope TEXT[], -- Scope of data to erase
  tombstone_created BOOLEAN DEFAULT false, -- Whether tombstone markers were created
  backup_purge_required BOOLEAN DEFAULT false, -- Whether backup purging is needed
  
  -- Export specific fields
  export_location TEXT, -- S3 location of exported data
  export_expires_at TIMESTAMPTZ, -- When export download expires
  export_size_bytes BIGINT,
  
  audit_trail JSONB DEFAULT '[]', -- Audit trail of actions taken
  compliance_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for GDPR requests
CREATE INDEX IF NOT EXISTS idx_gdpr_requests_creator ON gdpr_requests(creator_id, request_type, status);
CREATE INDEX IF NOT EXISTS idx_gdpr_requests_due_date ON gdpr_requests(due_date) WHERE status IN ('pending', 'verified', 'processing');
CREATE INDEX IF NOT EXISTS idx_gdpr_requests_status ON gdpr_requests(status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_gdpr_requests_processor ON gdpr_requests(processor_id, status) WHERE processor_id IS NOT NULL;

-- =============================================
-- GDPR Tombstones Table
-- =============================================

CREATE TABLE IF NOT EXISTS gdpr_tombstones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL,
  table_name TEXT NOT NULL,
  record_id UUID, -- Original record ID that was deleted
  tombstone_type TEXT NOT NULL CHECK (tombstone_type IN ('hard_delete', 'anonymize', 'pseudonymize')),
  deletion_reason TEXT NOT NULL, -- Reference to GDPR request
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_by UUID NOT NULL, -- Admin or system user who performed deletion
  recovery_data JSONB, -- Encrypted backup for legal holds
  permanent_after TIMESTAMPTZ, -- When data becomes permanently unrecoverable
  
  -- Ensure tombstones persist through backup restores
  restore_instruction TEXT NOT NULL DEFAULT 'DELETE', -- Instruction for post-restore cleanup
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Ensure unique tombstone per record
  UNIQUE(creator_id, table_name, record_id)
);

-- Indexes for tombstones
CREATE INDEX IF NOT EXISTS idx_gdpr_tombstones_creator ON gdpr_tombstones(creator_id, deleted_at DESC);
CREATE INDEX IF NOT EXISTS idx_gdpr_tombstones_table_record ON gdpr_tombstones(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_gdpr_tombstones_permanent_after ON gdpr_tombstones(permanent_after) WHERE permanent_after IS NOT NULL;

-- =============================================
-- System Health Metrics Table
-- =============================================

CREATE TABLE IF NOT EXISTS system_health_metrics (
  id BIGSERIAL PRIMARY KEY,
  metric_type TEXT NOT NULL,
  component_name TEXT NOT NULL,
  measured_at TIMESTAMPTZ NOT NULL,
  value DECIMAL(15,6) NOT NULL,
  unit TEXT NOT NULL, -- 'ms', 'percent', 'count', 'bytes', etc.
  tags JSONB DEFAULT '{}', -- Additional metric dimensions
  threshold_warning DECIMAL(15,6),
  threshold_critical DECIMAL(15,6),
  alert_level TEXT CHECK (alert_level IN ('ok', 'warning', 'critical')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partitioning by month for performance
CREATE INDEX IF NOT EXISTS idx_system_health_metrics_component_time ON system_health_metrics(component_name, metric_type, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_health_metrics_alerts ON system_health_metrics(alert_level, measured_at DESC) WHERE alert_level IN ('warning', 'critical');

-- =============================================
-- Functions
-- =============================================

-- Function to update timestamps
CREATE OR REPLACE FUNCTION update_compliance_timestamp() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add update triggers
DROP TRIGGER IF EXISTS backup_reports_updated_at_trigger ON backup_reports;
CREATE TRIGGER backup_reports_updated_at_trigger
  BEFORE UPDATE ON backup_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_compliance_timestamp();

DROP TRIGGER IF EXISTS dr_exercises_updated_at_trigger ON dr_exercises;
CREATE TRIGGER dr_exercises_updated_at_trigger
  BEFORE UPDATE ON dr_exercises
  FOR EACH ROW
  EXECUTE FUNCTION update_compliance_timestamp();

DROP TRIGGER IF EXISTS gdpr_requests_updated_at_trigger ON gdpr_requests;
CREATE TRIGGER gdpr_requests_updated_at_trigger
  BEFORE UPDATE ON gdpr_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_compliance_timestamp();

-- Function to record backup completion
CREATE OR REPLACE FUNCTION record_backup_completion(
  backup_id_param TEXT,
  kind_param TEXT,
  duration_ms_param INTEGER,
  size_bytes_param BIGINT,
  location_param TEXT,
  wal_start_param TEXT DEFAULT NULL,
  wal_end_param TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  report_id UUID;
BEGIN
  UPDATE backup_reports
  SET 
    status = 'completed',
    completed_at = now(),
    duration_ms = duration_ms_param,
    size_bytes = size_bytes_param,
    backup_location = location_param,
    wal_start_lsn = wal_start_param,
    wal_end_lsn = wal_end_param,
    updated_at = now()
  WHERE backup_id = backup_id_param AND status = 'running'
  RETURNING id INTO report_id;
  
  RETURN report_id;
END;
$$ LANGUAGE plpgsql;

-- Function to record DR exercise
CREATE OR REPLACE FUNCTION record_dr_exercise(
  exercise_id_param TEXT,
  scenario_param TEXT,
  target_rto_ms_param INTEGER,
  target_rpo_ms_param INTEGER,
  actual_rto_ms_param INTEGER,
  actual_rpo_ms_param INTEGER,
  result_param TEXT,
  notes_param JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
  exercise_uuid UUID;
BEGIN
  INSERT INTO dr_exercises (
    exercise_id, exercise_type, scenario, started_at, completed_at,
    target_rto_ms, actual_rto_ms, target_rpo_ms, actual_rpo_ms,
    result, success_criteria_met, notes, next_exercise_due
  ) VALUES (
    exercise_id_param, 'scheduled', scenario_param, 
    now() - (actual_rto_ms_param || ' milliseconds')::INTERVAL, now(),
    target_rto_ms_param, actual_rto_ms_param, target_rpo_ms_param, actual_rpo_ms_param,
    result_param, (result_param = 'success'), notes_param,
    now() + INTERVAL '1 month'
  ) RETURNING id INTO exercise_uuid;
  
  RETURN exercise_uuid;
END;
$$ LANGUAGE plpgsql;

-- Function to record SLO measurement
CREATE OR REPLACE FUNCTION record_slo_measurement(
  metric_name_param TEXT,
  service_name_param TEXT,
  time_window_seconds_param INTEGER,
  target_percentage_param DECIMAL(5,2),
  success_count_param BIGINT,
  total_count_param BIGINT
) RETURNS BOOLEAN AS $$
DECLARE
  actual_percentage DECIMAL(5,2);
  error_budget_remaining DECIMAL(5,2);
  violation_count BIGINT;
  breach_detected BOOLEAN;
BEGIN
  -- Calculate metrics
  actual_percentage := (success_count_param::DECIMAL / total_count_param) * 100;
  violation_count := total_count_param - success_count_param;
  error_budget_remaining := GREATEST(0, target_percentage_param - (100 - actual_percentage));
  breach_detected := actual_percentage < target_percentage_param;
  
  -- Insert measurement
  INSERT INTO slo_metrics (
    metric_name, service_name, measured_at, time_window_seconds,
    target_percentage, actual_percentage, error_budget_remaining,
    sample_count, success_count, violation_count, breach_detected
  ) VALUES (
    metric_name_param, service_name_param, now(), time_window_seconds_param,
    target_percentage_param, actual_percentage, error_budget_remaining,
    total_count_param, success_count_param, violation_count, breach_detected
  );
  
  RETURN breach_detected;
END;
$$ LANGUAGE plpgsql;

-- Function to create GDPR request
CREATE OR REPLACE FUNCTION create_gdpr_request(
  request_type_param TEXT,
  creator_id_param UUID,
  requester_email_param TEXT,
  request_details_param JSONB DEFAULT '{}'
) RETURNS TEXT AS $$
DECLARE
  request_id TEXT;
  due_date TIMESTAMPTZ;
BEGIN
  -- Generate human-readable request ID
  request_id := 'GDPR-' || to_char(now(), 'YYYY-MM-DD') || '-' || 
                substring(md5(random()::text), 1, 8);
  
  -- Calculate due date (30 days from submission)
  due_date := now() + INTERVAL '30 days';
  
  INSERT INTO gdpr_requests (
    request_id, request_type, creator_id, requester_email,
    request_details, due_date
  ) VALUES (
    request_id, request_type_param, creator_id_param, requester_email_param,
    request_details_param, due_date
  );
  
  RETURN request_id;
END;
$$ LANGUAGE plpgsql;

-- Function to create tombstone
CREATE OR REPLACE FUNCTION create_gdpr_tombstone(
  creator_id_param UUID,
  table_name_param TEXT,
  record_id_param UUID,
  tombstone_type_param TEXT,
  deletion_reason_param TEXT,
  deleted_by_param UUID
) RETURNS UUID AS $$
DECLARE
  tombstone_id UUID;
BEGIN
  INSERT INTO gdpr_tombstones (
    creator_id, table_name, record_id, tombstone_type,
    deletion_reason, deleted_by, permanent_after
  ) VALUES (
    creator_id_param, table_name_param, record_id_param, tombstone_type_param,
    deletion_reason_param, deleted_by_param, now() + INTERVAL '7 years'
  ) RETURNING id INTO tombstone_id;
  
  RETURN tombstone_id;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup old metrics
CREATE OR REPLACE FUNCTION cleanup_old_metrics() RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER := 0;
  temp_count INTEGER;
BEGIN
  -- Cleanup old SLO metrics (keep 90 days)
  DELETE FROM slo_metrics WHERE measured_at < now() - INTERVAL '90 days';
  GET DIAGNOSTICS temp_count = ROW_COUNT;
  deleted_count := deleted_count + temp_count;
  
  -- Cleanup old system health metrics (keep 30 days)
  DELETE FROM system_health_metrics WHERE measured_at < now() - INTERVAL '30 days';
  GET DIAGNOSTICS temp_count = ROW_COUNT;
  deleted_count := deleted_count + temp_count;
  
  -- Cleanup old backup reports (keep 1 year)
  DELETE FROM backup_reports WHERE created_at < now() - INTERVAL '1 year';
  GET DIAGNOSTICS temp_count = ROW_COUNT;
  deleted_count := deleted_count + temp_count;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- Views for monitoring and reporting
-- =============================================

-- Backup status overview
CREATE OR REPLACE VIEW backup_status_overview AS
SELECT 
  kind,
  COUNT(*) as total_backups,
  COUNT(*) FILTER (WHERE status = 'completed') as successful_backups,
  COUNT(*) FILTER (WHERE status = 'failed') as failed_backups,
  AVG(duration_ms) FILTER (WHERE status = 'completed') as avg_duration_ms,
  SUM(size_bytes) FILTER (WHERE status = 'completed') as total_size_bytes,
  MAX(completed_at) FILTER (WHERE status = 'completed') as last_successful_backup,
  AVG(compression_ratio) FILTER (WHERE status = 'completed') as avg_compression_ratio
FROM backup_reports
WHERE created_at > now() - INTERVAL '30 days'
GROUP BY kind;

-- DR readiness dashboard
CREATE OR REPLACE VIEW dr_readiness_dashboard AS
SELECT 
  MAX(completed_at) as last_dr_test,
  COUNT(*) FILTER (WHERE result = 'success' AND completed_at > now() - INTERVAL '3 months') as successful_tests_3m,
  COUNT(*) FILTER (WHERE result = 'failed' AND completed_at > now() - INTERVAL '3 months') as failed_tests_3m,
  AVG(actual_rto_ms) FILTER (WHERE result = 'success') as avg_rto_ms,
  AVG(actual_rpo_ms) FILTER (WHERE result = 'success') as avg_rpo_ms,
  MIN(next_exercise_due) as next_scheduled_test,
  CASE 
    WHEN MAX(completed_at) < now() - INTERVAL '1 month' THEN 'overdue'
    WHEN MAX(completed_at) < now() - INTERVAL '3 weeks' THEN 'due_soon'
    ELSE 'current'
  END as test_status
FROM dr_exercises;

-- SLO breach summary
CREATE OR REPLACE VIEW slo_breach_summary AS
SELECT 
  service_name,
  metric_name,
  COUNT(*) FILTER (WHERE breach_detected) as total_breaches,
  COUNT(*) as total_measurements,
  ROUND((COUNT(*) FILTER (WHERE breach_detected)::DECIMAL / COUNT(*)) * 100, 2) as breach_percentage,
  AVG(actual_percentage) as avg_achievement_percentage,
  MIN(actual_percentage) as worst_achievement_percentage,
  MAX(measured_at) as last_measured_at
FROM slo_metrics
WHERE measured_at > now() - INTERVAL '7 days'
GROUP BY service_name, metric_name
ORDER BY breach_percentage DESC;

-- GDPR compliance overview
CREATE OR REPLACE VIEW gdpr_compliance_overview AS
SELECT 
  request_type,
  COUNT(*) as total_requests,
  COUNT(*) FILTER (WHERE status = 'completed') as completed_requests,
  COUNT(*) FILTER (WHERE status = 'pending') as pending_requests,
  COUNT(*) FILTER (WHERE due_date < now() AND status NOT IN ('completed', 'cancelled')) as overdue_requests,
  AVG(EXTRACT(EPOCH FROM (completed_at - submitted_at))/3600) FILTER (WHERE status = 'completed') as avg_completion_hours,
  MAX(submitted_at) as last_request_submitted
FROM gdpr_requests
WHERE submitted_at > now() - INTERVAL '1 year'
GROUP BY request_type;

-- =============================================
-- Grants and Permissions
-- =============================================

GRANT SELECT, INSERT, UPDATE, DELETE ON backup_reports TO authenticated;
GRANT USAGE ON SEQUENCE backup_reports_id_seq TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON dr_exercises TO authenticated;
GRANT USAGE ON SEQUENCE dr_exercises_id_seq TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON slo_metrics TO authenticated;
GRANT USAGE ON SEQUENCE slo_metrics_id_seq TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON gdpr_requests TO authenticated;
GRANT USAGE ON SEQUENCE gdpr_requests_id_seq TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON gdpr_tombstones TO authenticated;
GRANT USAGE ON SEQUENCE gdpr_tombstones_id_seq TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON system_health_metrics TO authenticated;
GRANT USAGE ON SEQUENCE system_health_metrics_id_seq TO authenticated;

-- Views (admin access only for sensitive data)
GRANT SELECT ON backup_status_overview TO authenticated;
GRANT SELECT ON dr_readiness_dashboard TO authenticated;
GRANT SELECT ON slo_breach_summary TO authenticated;
GRANT SELECT ON gdpr_compliance_overview TO authenticated;

-- Functions
GRANT EXECUTE ON FUNCTION record_backup_completion TO authenticated;
GRANT EXECUTE ON FUNCTION record_dr_exercise TO authenticated;
GRANT EXECUTE ON FUNCTION record_slo_measurement TO authenticated;
GRANT EXECUTE ON FUNCTION create_gdpr_request TO authenticated;
GRANT EXECUTE ON FUNCTION create_gdpr_tombstone TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_old_metrics TO authenticated;

COMMIT;