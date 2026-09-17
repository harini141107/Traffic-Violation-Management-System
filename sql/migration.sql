-- Migration for an existing TVMS database created with the older starter files.
USE tvms;

ALTER TABLE users ADD COLUMN IF NOT EXISTS violator_id INT NULL;
ALTER TABLE violators ADD COLUMN IF NOT EXISTS demerit_points INT NOT NULL DEFAULT 0;
ALTER TABLE violators ADD COLUMN IF NOT EXISTS license_status ENUM('Active', 'Flagged for Suspension') NOT NULL DEFAULT 'Active';

-- Add the foreign key only if it is not already present.
SET @fk_exists = (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND CONSTRAINT_NAME = 'fk_users_violator'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql = IF(
  @fk_exists = 0,
  'ALTER TABLE users ADD CONSTRAINT fk_users_violator FOREIGN KEY (violator_id) REFERENCES violators(violator_id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
