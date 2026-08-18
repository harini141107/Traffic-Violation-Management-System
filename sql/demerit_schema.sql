USE tvms;

ALTER TABLE violators ADD COLUMN demerit_points INT NOT NULL DEFAULT 0;
ALTER TABLE violators ADD COLUMN license_status ENUM('Active', 'Flagged for Suspension') NOT NULL DEFAULT 'Active';